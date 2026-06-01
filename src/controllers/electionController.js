const { pool } = require('../config/db');
const { uploadToSupabase } = require('../utils/supabaseHelper');
const sharp = require('sharp');


// ✅ دالة رفع الصور
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



// ===============================
// ✅ 1. إنشاء انتخابات
// ===============================
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

        // ✅ تحويل التاريخ لبداية ونهاية اليوم
        const start = new Date(start_date);
        start.setHours(0, 0, 0, 0);

        const end = new Date(end_date);
        end.setHours(23, 59, 59, 999);

        // ✅ الحصول على الجروب المفتوح
        let { rows: groupRows } = await pool.query(
            `SELECT group_id 
             FROM election_groups 
             WHERE is_closed = FALSE 
             ORDER BY created_at DESC 
             LIMIT 1`
        );

        let groupId;

        if (groupRows.length === 0) {
            const { rows: newGroup } = await pool.query(
                `INSERT INTO election_groups DEFAULT VALUES
                 RETURNING group_id`
            );
            groupId = newGroup[0].group_id;
        } else {
            groupId = groupRows[0].group_id;
        }

        let logoUrl = null;
        if (logo_url) {
            const fileName = `election_logo_${Date.now()}.jpg`;
            logoUrl = await processAndUpload(logo_url, fileName);
        }

        const { rows } = await pool.query(
            `INSERT INTO elections 
             (election_type, election_name, governorate, logo_url, 
              start_date, end_date, is_active, election_group_id)
             VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7)
             RETURNING *`,
            [
                election_type,
                election_name,
                governorate,
                logoUrl,
                start,
                end,
                groupId
            ]
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



// ===============================
// ✅ 2. تعديل انتخابات
// ===============================
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

        let logoUrl = existing[0].logo_url;
        if (logo_url && logo_url !== existing[0].logo_url) {
            const fileName = `election_logo_${Date.now()}.jpg`;
            logoUrl = await processAndUpload(logo_url, fileName);
        }

        // ✅ تحويل التاريخ لو تم إرساله
        let start = existing[0].start_date;
        let end = existing[0].end_date;

        if (start_date) {
            start = new Date(start_date);
            start.setHours(0, 0, 0, 0);
        }

        if (end_date) {
            end = new Date(end_date);
            end.setHours(23, 59, 59, 999);
        }

        const { rows } = await pool.query(
            `UPDATE elections SET
                election_type = COALESCE($1, election_type),
                election_name = COALESCE($2, election_name),
                governorate   = COALESCE($3, governorate),
                logo_url      = $4,
                start_date    = $5,
                end_date      = $6
             WHERE election_id = $7
             RETURNING *`,
            [
                election_type,
                election_name,
                governorate,
                logoUrl,
                start,
                end,
                id
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



// ===============================
// ✅ 3. حالة الانتخابات (بالساعة)
// ===============================
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
                    WHEN CURRENT_TIMESTAMP < start_date THEN 'not_started'
                    WHEN CURRENT_TIMESTAMP >= start_date 
                         AND CURRENT_TIMESTAMP <= end_date THEN 'active'
                    ELSE 'ended'
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
                status: 'no_election'
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
            show_voting: election.status === 'active',
            show_results: election.status === 'ended'
        });

    } catch (err) {
        console.error("Election Status Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// ===============================
// ✅ 4. جلب كل الانتخابات (للأدمن)
// ===============================
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
        console.error("Get All Elections Error:", err);
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

// ===============================
// ✅ 4. حذف انتخابات
// ===============================
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