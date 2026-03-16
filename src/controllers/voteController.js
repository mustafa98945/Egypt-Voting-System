const pool = require('../config/db');
const Voter = require('../models/voterModel');

exports.castVote = async (req, res) => {
    const { candidate_id } = req.body;
    const voter_id = req.user.voter_id; // بناخده من التوكن اللي فكه الـ authMiddleware

    try {
        // 1. التأكد إن الناخب مصوتش قبل كدة (Double Check)
        const voterStatus = await pool.query('SELECT has_voted FROM voters WHERE voter_id = $1', [voter_id]);
        
        if (voterStatus.rows[0].has_voted) {
            return res.status(400).json({ 
                success: false, 
                message: "لقد قمت بالتصويت بالفعل، لا يمكن التصويت أكثر من مرة" 
            });
        }

        // 2. عملية التصويت (Transaction عشان نضمن إن الخطوتين يتموا مع بعض أو لا)
        await pool.query('BEGIN');

        // أ- تسجيل الصوت في جدول الـ votes
        await pool.query(
            'INSERT INTO votes (voter_id, candidate_id) VALUES ($1, $2)',
            [voter_id, candidate_id]
        );

        // ب- تحديث حالة الناخب في جدول الـ voters
        await pool.query(
            'UPDATE voters SET has_voted = TRUE WHERE voter_id = $1',
            [voter_id]
        );

        await pool.query('COMMIT');

        res.status(200).json({ 
            success: true, 
            message: "تم تسجيل صوتك بنجاح. شكراً لمشاركتك الوطنية!" 
        });

    } catch (err) {
        await pool.query('ROLLBACK'); // لو حصل أي غلط في النص، كنسل كل حاجة
        console.error("Voting Error:", err.message);
        res.status(500).json({ success: false, message: "حدث خطأ أثناء تسجيل الصوت" });
    }
};