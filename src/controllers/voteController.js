const Vote = require('../models/voteModel');

/**
 * 1. تنفيذ عملية التصويت (Cast Vote)
 * تعتمد على البيانات المستخرجة من التوكن (req.user)
 */
exports.castVote = async (req, res) => {
    try {
        // البيانات المستخرجة من الميدل وير بعد فك التوكن
        const { id, role } = req.user; 
        const { candidate_id } = req.body;

        if (!candidate_id) {
            return res.status(400).json({ success: false, message: "يرجى اختيار مرشح للتصويت له" });
        }

        // تحديد اسم الجدول والعمود ديناميكياً بناءً على نوع المستخدم
        const tableName = role === 'candidate' ? 'candidates' : 'voters';
        const idColumn = role === 'candidate' ? 'candidate_id' : 'id';

        // أ- التحقق من حالة التصويت السابقة
        const status = await Vote.checkIfVoted(tableName, idColumn, id);
        
        if (status && status.has_voted) {
            return res.status(400).json({ 
                success: false, 
                message: "عذراً، لقد قمت بالتصويت بالفعل سابقاً" 
            });
        }

        // ب- تنفيذ عملية التصويت (Transaction)
        await Vote.executeVote(role, id, candidate_id, tableName, idColumn);

        res.status(200).json({ 
            success: true, 
            message: "تم تسجيل صوتك بنجاح! شكراً لمشاركتك في العملية الانتخابية." 
        });

    } catch (err) {
        console.error("Cast Vote Error:", err.message);
        res.status(500).json({ 
            success: false, 
            message: "حدث خطأ داخلي أثناء تسجيل الصوت، يرجى المحاولة لاحقاً" 
        });
    }
};

/**
 * 2. التحقق من حالة التصويت (Check Status)
 * تستخدمها الواجهة الأمامية (Front-end) لمعرفة هل تظهر زر التصويت أم لا
 */
exports.checkUserVotingStatus = async (req, res) => {
    try {
        const { id, role } = req.user;

        const tableName = role === 'candidate' ? 'candidates' : 'voters';
        const idColumn = role === 'candidate' ? 'candidate_id' : 'id';

        const status = await Vote.checkIfVoted(tableName, idColumn, id);
        
        res.status(200).json({ 
            success: true, 
            hasVoted: status ? status.has_voted : false 
        });
    } catch (err) {
        console.error("Check Status Error:", err.message);
        res.status(500).json({ success: false, message: "خطأ في جلب حالة التصويت" });
    }
};