const pool = require('../config/db');

exports.castVote = async (req, res) => {
    // 1. استلام البيانات
    // candidate_id يرسل في Body عادي لأن العملية JSON
    const { candidate_id } = req.body;
    
    // voter_id بنجيبه من التوكن (req.user) اللي فكه الـ authMiddleware
    const voter_id = req.user.voter_id; 

    // التأكد من إرسال ID المرشح
    if (!candidate_id) {
        return res.status(400).json({ 
            success: false, 
            message: "برجاء اختيار مرشح لإتمام عملية التصويت" 
        });
    }

    try {
        // 2. التحقق من حالة الناخب (هل صوت قبل كدة؟)
        const voterResult = await pool.query(
            'SELECT has_voted FROM voters WHERE voter_id = $1', 
            [voter_id]
        );
        
        if (voterResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: "بيانات الناخب غير موجودة" });
        }

        if (voterResult.rows[0].has_voted) {
            return res.status(400).json({ 
                success: false, 
                message: "لقد قمت بالتصويت بالفعل، لا يمكن التصويت أكثر من مرة" 
            });
        }

        // 3. التأكد إن المرشح موجود ومسجل (اختياري لزيادة الأمان)
        const candidateCheck = await pool.query('SELECT candidate_id FROM candidates WHERE candidate_id = $1', [candidate_id]);
        if (candidateCheck.rows.length === 0) {
            return res.status(404).json({ success: false, message: "المرشح المختار غير موجود في القوائم" });
        }

        // 4. عملية التصويت (Transaction)
        await pool.query('BEGIN');

        try {
            // أ- تسجيل الصوت في جدول الـ votes
            await pool.query(
                'INSERT INTO votes (voter_id, candidate_id, created_at) VALUES ($1, $2, NOW())',
                [voter_id, candidate_id]
            );

            // ب- تحديث حالة الناخب في جدول الـ voters لمنع التكرار
            await pool.query(
                'UPDATE voters SET has_voted = TRUE WHERE voter_id = $1',
                [voter_id]
            );

            await pool.query('COMMIT');

            res.status(200).json({ 
                success: true, 
                message: "تم تسجيل صوتك بنجاح. شكراً لمشاركتك الوطنية!" 
            });

        } catch (innerErr) {
            await pool.query('ROLLBACK'); // كنسل العملية لو الـ Insert أو الـ Update فشلوا
            throw innerErr; // ارمي الخطأ للـ Catch الخارجي
        }

    } catch (err) {
        console.error("Voting Error:", err.message);
        res.status(500).json({ 
            success: false, 
            message: "حدث خطأ فني أثناء تسجيل الصوت، يرجى المحاولة مرة أخرى" 
        });
    }
};