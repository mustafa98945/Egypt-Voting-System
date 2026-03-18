const pool = require('../config/db');

exports.getTopCandidates = async (req, res) => {
    try {
        const query = `
            SELECT 
                c.candidate_id, 
                cr.full_name, 
                c.candidate_type,
                COUNT(v.voter_id) AS total_votes
            FROM candidates c
            JOIN civil_registry cr ON c.national_id = cr.national_id
            LEFT JOIN votes v ON c.candidate_id = v.candidate_id
            GROUP BY c.candidate_id, cr.full_name, c.candidate_type
            ORDER BY total_votes DESC
            LIMIT 5;
        `;

        const result = await pool.query(query);

        res.status(200).json({
            success: true,
            data: result.rows
        });
    } catch (err) {
        console.error("Stats Error Details:", err.message);
        res.status(500).json({ 
            success: false, 
            message: "حدث خطأ أثناء جلب إحصائيات المرشحين" 
        });
    }
};

exports.getElectionSummary = async (req, res) => {
    try {
        const summaryQuery = `
            SELECT 
                (SELECT COUNT(*) FROM votes) as total_votes_cast,
                (SELECT COUNT(*) FROM voters) as total_registered_voters;
        `;
        const result = await pool.query(summaryQuery);
        res.json({ success: true, summary: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, message: "خطأ في ملخص البيانات" });
    }
};