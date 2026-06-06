const { pool } = require('../config/db');
const { uploadToSupabase } = require('../utils/supabaseHelper');
const sharp = require('sharp');

////////////////////////////////////////////////////////////
// ✅ Image Upload Helper
////////////////////////////////////////////////////////////
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

////////////////////////////////////////////////////////////
// ✅ 1. Create Election
////////////////////////////////////////////////////////////
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
                message: "Please provide all required fields"
            });
        }

        const start = new Date(start_date);
        start.setHours(0, 0, 0, 0);

        const end = new Date(end_date);
        end.setHours(23, 59, 59, 999);

        ////////////////////////////////////////////////////////////
        // ✅ 1️⃣ أرشف أي انتخابات approved قديمة
        ////////////////////////////////////////////////////////////
        await pool.query(
            `UPDATE elections
             SET result_status = 'archived',
                 is_active = FALSE
             WHERE result_status = 'approved'`
        );

        ////////////////////////////////////////////////////////////
        // ✅ 2️⃣ احذف الأصوات القديمة
        ////////////////////////////////////////////////////////////
        await pool.query(`DELETE FROM votes`);

        ////////////////////////////////////////////////////////////
        // ✅ 3️⃣ أنشئ group جديد دائمًا
        ////////////////////////////////////////////////////////////
        const { rows: newGroup } = await pool.query(
            `INSERT INTO election_groups DEFAULT VALUES
             RETURNING group_id`
        );

        const groupId = newGroup[0].group_id;

        ////////////////////////////////////////////////////////////
        // ✅ 4️⃣ إنشاء الانتخابات الجديدة
        ////////////////////////////////////////////////////////////
        const { rows } = await pool.query(
            `INSERT INTO elections 
             (election_type, election_name, governorate, logo_url, 
              start_date, end_date, is_active, election_group_id, result_status)
             VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7, 'pending')
             RETURNING *`,
            [
                election_type,
                election_name,
                governorate,
                logo_url || null,
                start,
                end,
                groupId
            ]
        );

        const newElectionId = rows[0].election_id;

        ////////////////////////////////////////////////////////////
        // ✅ 5️⃣ انقل كل المرشحين للانتخابات الجديدة
        ////////////////////////////////////////////////////////////
        await pool.query(
            `UPDATE candidates
             SET election_id = $1`,
            [newElectionId]
        );

        res.status(201).json({
            success: true,
            message: "Election created successfully ✅",
            data: rows[0]
        });

    } catch (err) {
        console.error("Create Election Error:", err);
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};
////////////////////////////////////////////////////////////
// ✅ 2. Edit Election
////////////////////////////////////////////////////////////
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
                message: "Election not found"
            });
        }

        let logoUrl = existing[0].logo_url;
        if (logo_url && logo_url !== existing[0].logo_url) {
            const fileName = `election_logo_${Date.now()}.jpg`;
            logoUrl = await processAndUpload(logo_url, fileName);
        }

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
            message: "Election updated successfully",
            data: rows[0]
        });

    } catch (err) {
        console.error("Edit Election Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

////////////////////////////////////////////////////////////
// ✅ 3. Election Status
////////////////////////////////////////////////////////////
exports.getElectionStatus = async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT 
                e.election_id,
                e.election_type,
                e.election_name,
                e.governorate,
                e.logo_url,
                e.start_date,
                e.end_date,
                CASE 
                    WHEN CURRENT_TIMESTAMP < e.start_date THEN 'not_started'
                    WHEN CURRENT_TIMESTAMP BETWEEN e.start_date AND e.end_date THEN 'active'
                    ELSE 'ended'
                END AS status
             FROM elections e
             JOIN election_groups eg
               ON e.election_group_id = eg.group_id
             WHERE eg.is_closed = FALSE
             ORDER BY e.created_at DESC
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
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};
////////////////////////////////////////////////////////////
// ✅ 4. Get All Elections
////////////////////////////////////////////////////////////
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

////////////////////////////////////////////////////////////
// ✅ 5. Delete Election
////////////////////////////////////////////////////////////
exports.deleteElection = async (req, res) => {
    try {
        const { id } = req.params;

        // ✅ تأكد إن الانتخابات موجودة
        const { rows: electionRows } = await pool.query(
            'SELECT * FROM elections WHERE election_id = $1',
            [id]
        );

        if (electionRows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Election not found"
            });
        }

        const groupId = electionRows[0].election_group_id;

        // ✅ امسح الأصوات المرتبطة
        await pool.query(
            'DELETE FROM votes WHERE election_id = $1',
            [id]
        );

        // ✅ امسح الانتخابات
        await pool.query(
            'DELETE FROM elections WHERE election_id = $1',
            [id]
        );

        // ✅ لو الجروب فاضي امسحه
        const { rows: remaining } = await pool.query(
            'SELECT 1 FROM elections WHERE election_group_id = $1',
            [groupId]
        );

        if (remaining.length === 0) {
            await pool.query(
                'DELETE FROM election_groups WHERE group_id = $1',
                [groupId]
            );
        }

        res.json({
            success: true,
            message: "Election deleted successfully"
        });

    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};
////////////////////////////////////////////////////////////
// ✅ Get Governorates
////////////////////////////////////////////////////////////
exports.getGovernorates = async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT governorate_id, governorate_name
             FROM governorates
             ORDER BY governorate_name ASC`
        );

        res.json({
            success: true,
            count: rows.length,
            data: rows
        });

    } catch (err) {
        console.error("Get Governorates Error:", err.message);
        res.status(500).json({
            success: false,
            message: "An error occurred while fetching governorates"
        });
    }
};