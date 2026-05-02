const { pool } = require('../config/db');
const { uploadToSupabase } = require('../utils/supabaseHelper');
const sharp = require('sharp');

// دالة رفع الصور
const processAndUpload = async (base64String, fileName) => {
    try {
        if (!base64String) return null;
        if (base64String.startsWith('http')) return base64String;

        const base64Data = base64String.split(';base64,').pop();
        const buffer = Buffer.from(base64Data, 'base64');

        const optimized = await sharp(buffer)
            .rotate()
            .resize({ width: 500 })
            .jpeg({ quality: 70 })
            .toBuffer();

        return await uploadToSupabase(optimized, fileName, 'elections');
    } catch (err) {
        console.error("Upload Error:", err.message);
        return null;
    }
};

// --- 1. إنشاء انتخابات ---
exports.createElection = async (req, res) => {
    try {
        const {
            election_type,
            election_name,
            governorate,
            logo_url,
            start_date,
            end_date
        } = req.body;

        if (!election_type || !election_name || !start_date || !end_date) {
            return res.status(400).json({
                success: false,
                message: "يرجى إدخال جميع البيانات المطلوبة"
            });
        }

        // التحقق من التواريخ
        if (new Date(start_date) >= new Date(end_date)) {
            return res.status(400).json({
                success: false,
                message: "تاريخ البداية يجب أن يكون قبل تاريخ النهاية"
            });
        }

        // رفع الشعار
        let logoUrl = null;
        if (logo_url) {
            const fileName = `election_logo_${Date.now()}.jpg`;
            logoUrl = await processAndUpload(logo_url, fileName);
        }

        const { rows } = await pool.query(
            `INSERT INTO elections 
             (election_type, election_name, governorate, logo_url, start_date, end_date)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [election_type, election_name, governorate, logoUrl, start_date, end_date]
        );

        res.status(201).json({
            success: true,
            message: "تم إنشاء الانتخابات بنجاح",
            data: rows[0]
        });

    } catch (err) {
        console.error("Create Election Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// --- 2. تعديل انتخابات ---
exports.editElection = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            election_type,
            election_name,
            governorate,
            logo_url,
            start_date,
            end_date
        } = req.body;

        // التحقق من وجود الانتخابات
        const { rows: existing } = await pool.query(
            'SELECT * FROM elections WHERE election_id = $1',
            [id]
        );
        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: "الانتخابات غير موجودة"
            });
        }

        // رفع الشعار لو اتغير
        let logoUrl = existing[0].logo_url;
        if (logo_url && logo_url !== existing[0].logo_url) {
            const fileName = `election_logo_${Date.now()}.jpg`;
            logoUrl = await processAndUpload(logo_url, fileName);
        }

        const { rows } = await pool.query(
            `UPDATE elections SET
                election_type = COALESCE($1, election_type),
                election_name = COALESCE($2, election_name),
                governorate   = COALESCE($3, governorate),
                logo_url      = COALESCE($4, logo_url),
                start_date    = COALESCE($5, start_date),
                end_date      = COALESCE($6, end_date)
             WHERE election_id = $7
             RETURNING *`,
            [
                election_type, election_name, governorate,
                logoUrl, start_date, end_date, id
            ]
        );

        res.json({
            success: true,
            message: "تم تعديل الانتخابات بنجاح",
            data: rows[0]
        });

    } catch (err) {
        console.error("Edit Election Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// --- 3. جلب كل الانتخابات (للـ Admin) ---
exports.getAllElections = async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT * FROM elections ORDER BY created_at DESC`
        );

        res.json({
            success: true,
            count: rows.length,
            data: rows
        });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// --- 4. حالة الانتخابات (للـ Flutter) ---
exports.getElectionStatus = async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT 
                election_id,
                election_type,
                election_name,
                governorate,
                logo_url,
                start_date,
                end_date,
                CASE 
                    WHEN CURRENT_DATE < start_date THEN 'not_started'
                    WHEN CURRENT_DATE BETWEEN start_date AND end_date THEN 'active'
                    WHEN CURRENT_DATE > end_date THEN 'ended'
                END AS status
             FROM elections
             WHERE is_active = TRUE
             ORDER BY created_at DESC
             LIMIT 1`
        );

        if (rows.length === 0) {
            return res.json({
                success: true,
                election: null,
                status: 'no_election',
                message: "لا توجد انتخابات حالياً"
            });
        }

        const election = rows[0];

        res.json({
            success: true,
            status: election.status,
            election: {
                id: election.election_id,
                type: election.election_type,
                name: election.election_name,
                governorate: election.governorate,
                logo_url: election.logo_url,
                start_date: election.start_date,
                end_date: election.end_date
            },
            // للـ Flutter عشان يعرف يعمل إيه
            show_voting: election.status === 'active',
            show_results: election.status === 'ended'
        });

    } catch (err) {
        console.error("Election Status Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// --- 5. حذف انتخابات ---
exports.deleteElection = async (req, res) => {
    try {
        const { id } = req.params;

        await pool.query(
            'DELETE FROM elections WHERE election_id = $1',
            [id]
        );

        res.json({
            success: true,
            message: "تم حذف الانتخابات بنجاح"
        });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};