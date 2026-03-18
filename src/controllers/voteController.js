const Vote = require('../models/voteModel');

/**
 * دالة تنفيذ عملية التصويت
 * تستخدم البيانات القادمة من authMiddleware (req.user)
 */
exports.castVote = async (req, res) => {
    const { candidate_id } = req.body; // معرف المرشح الذي يتم التصويت له
    const { id, role } = req.user;     // معرف الشخص القائم بالتصويت ودوره (voter/candidate)

    try {
        // 1. تحديد الجدول والعمود بناءً على دور المستخدم
        const tableName = role === 'candidate' ? 'candidates' : 'voters';
        const idColumn = role === 'candidate' ? 'candidate_id' : 'voter_id';

        // 2. التحقق مما إذا كان المستخدم قد صوت من قبل
        // يتم استدعاء checkIfVoted من الموديل للتأكد من قيمة has_voted
        const userStatus = await Vote.checkIfVoted(tableName, idColumn, id);

        if (!userStatus) {
            return res.status(404).json({ 
                success: false, 
                message: "المستخدم غير موجود في النظام" 
            });
        }

        if (userStatus.has_voted) {
            return res.status(400).json({ 
                success: false, 
                message: "عذراً، لقد قمت بالتصويت بالفعل سابقاً" 
            });
        }

        // 3. تنفيذ عملية التصويت (Transaction)
        // تشمل: زيادة أصوات المرشح + تغيير حالة has_voted للقائم بالتصويت
        await Vote.executeVote(role, id, candidate_id, tableName, idColumn);

        // 4. رد النجاح
        res.status(200).json({ 
            success: true, 
            message: "تم تسجيل صوتك بنجاح، شكراً لمشاركتك!" 
        });

    } catch (err) {
        console.error("Voting Controller Error:", err.message);
        res.status(500).json({ 
            success: false, 
            message: "حدث خطأ داخلي في السيرفر أثناء محاولة التصويت" 
        });
    }
};