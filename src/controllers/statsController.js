const pool = require('../config/db');

// 1. جلب ترتيب جميع المرشحين (الاسم، الصورة، وعدد الأصوات) من الأعلى للأقل
exports.getTopCandidates = async (req, res) => {
    try {
        const query = `
            SELECT 
                cr.full_name, 
                c.personal_photos_url,
                COUNT(v.vote_id)::INT AS total_votes
            FROM candidates c
            JOIN civil_registry cr ON TRIM(c.national_id) = TRIM(cr.national_id)
            LEFT JOIN votes v ON c.candidate_id = v.candidate_id
            GROUP BY 
                c.candidate_id, 
                cr.full_name, 
                c.personal_photos_url
            ORDER BY total_votes DESC;
        `;

        const result = await pool.query(query);

        res.status(200).json({
            success: true,
            data: result.rows
        });
    } catch (err) {
        console.error("Stats Error:", err.message);
        res.status(500).json({ 
            success: false, 
            message: "حدث خطأ أثناء جلب إحصائيات المرشحين" 
        });
    }
};

// 2. ملخص الانتخابات (عدد الأصوات الكلي والناخبين المسجلين)
exports.getElectionSummary = async (req, res) => {
    try {
        const summaryQuery = `
            SELECT 
                (SELECT COUNT(*) FROM votes) as total_votes_cast,
                (SELECT COUNT(*) FROM voters) as total_registered_voters;
        `;
        const result = await pool.query(summaryQuery);
        res.json({ 
            success: true, 
            summary: result.rows[0] 
        });
    } catch (err) {
        console.error("Summary Error:", err.message);
        res.status(500).json({ success: false, message: "خطأ في ملخص البيانات" });
    }
};