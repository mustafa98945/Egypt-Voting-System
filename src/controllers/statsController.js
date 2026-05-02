const { pool } = require('../config/db');

// 1. أعلى المرشحين
exports.getTopCandidates = async (req, res) => {
    try {
        const query = `
            SELECT 
                c.candidate_id, 
                cr.full_name, 
                c.candidate_type,
                c.personal_photos_url,
                c.election_symbol_url,
                cr.degree,
                cr.governorate,
                COUNT(v.vote_id)::INT AS total_votes
            FROM candidates c
            JOIN civil_registry cr ON TRIM(c.national_id) = TRIM(cr.national_id)
            LEFT JOIN votes v ON c.candidate_id = v.selected_candidate_id
            GROUP BY 
                c.candidate_id, cr.full_name, c.candidate_type, 
                c.personal_photos_url, c.election_symbol_url, 
                cr.degree, cr.governorate
            ORDER BY total_votes DESC
            LIMIT 5
        `;
        const result = await pool.query(query);
        res.status(200).json({ success: true, data: result.rows });
    } catch (err) {
        console.error("Stats Error:", err.message);
        res.status(500).json({ success: false, message: "خطأ في جلب الإحصائيات" });
    }
};

// 2. ملخص الانتخابات
exports.getElectionSummary = async (req, res) => {
    try {
        const query = `
            SELECT 
                -- إجمالي الأصوات المسجلة (voters + candidates صوتوا)
                (SELECT COUNT(*) FROM votes) AS total_votes_cast,
                
                -- إجمالي المسجلين = voters + candidates (الاتنين مواطنين)
                (
                    SELECT COUNT(*) FROM voters
                ) + (
                    SELECT COUNT(*) FROM candidates
                ) AS total_registered_users,

                -- عدد الناخبين اللي صوتوا فعلاً
                (
                    SELECT COUNT(*) FROM voters WHERE has_voted = TRUE
                ) AS voters_voted,

                -- عدد المرشحين اللي صوتوا فعلاً
                (
                    SELECT COUNT(*) FROM candidates WHERE has_voted = TRUE
                ) AS candidates_voted,

                -- إجمالي اللي صوتوا (voters + candidates)
                (
                    SELECT COUNT(*) FROM voters WHERE has_voted = TRUE
                ) + (
                    SELECT COUNT(*) FROM candidates WHERE has_voted = TRUE
                ) AS total_voted
        `;
        const result = await pool.query(query);
        res.json({ success: true, summary: result.rows[0] });
    } catch (err) {
        console.error("Summary Error:", err.message);
        res.status(500).json({ success: false, message: "خطأ في ملخص البيانات" });
    }
};