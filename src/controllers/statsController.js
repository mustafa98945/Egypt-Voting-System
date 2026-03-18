const pool = require('../config/db');

exports.getTopCandidates = async (req, res) => {
    try {
        const query = `
            SELECT 
                c.candidate_id, 
                c.full_name, 
                c.party_name, 
                c.image_url,
                COUNT(v.id) AS total_votes
            FROM candidates c
            LEFT JOIN votes v ON c.candidate_id = v.candidate_id
            GROUP BY c.candidate_id
            ORDER BY total_votes DESC
            LIMIT 5;
        `;

        const result = await pool.query(query);

        res.status(200).json({
            success: true,
            data: result.rows
        });
    } catch (err) {
        console.error("Stats Error:", err.message);
        res.status(500).json({ success: false, message: "خطأ في جلب الإحصائيات" });
    }
};

exports.getElectionSummary = async (req, res) => {
    try {
        // إحصائيات سريعة: إجمالي الأصوات، إجمالي الناخبين، ونسبة المشاركة
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