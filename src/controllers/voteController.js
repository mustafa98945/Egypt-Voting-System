const Vote = require('../models/voteModel');

/**
 * 1. تنفيذ عملية التصويت (Cast Vote)
 */
exports.castVote = async (req, res) => {
    try {
        // البيانات المستخرجة من الميدل وير (Auth)
        const { id, role } = req.user; 
        const { candidate_id } = req.body;

        if (!candidate_id) {
            return res.status(400).json({ success: false, message: "يرجى اختيار مرشح للتصويت له" });
        }

        // تحديد اسم الجدول والعمود ديناميكياً
        // التعديل هنا: خليناه voter_id بدلاً من id عشان يطابق جدولك في Supabase
        const tableName = role === 'candidate' ? 'candidates' : 'voters';
        const idColumn = role === 'candidate' ? 'candidate_id' : 'voter_id';

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
            message: "تم تسجيل صوتك بنجاح! شكراً لمشاركتك." 
        });

    } catch (err) {
        console.error("Cast Vote Error:", err.message);
        res.status(500).json({ 
            success: false, 
            message: "حدث خطأ داخلي أثناء تسجيل الصوت" 
        });
    }
};

/**
 * 2. التحقق من حالة التصويت (Check Status)
 */
exports.checkUserVotingStatus = async (req, res) => {
    try {
        const { id, role } = req.user;

        const tableName = role === 'candidate' ? 'candidates' : 'voters';
        const idColumn = role === 'candidate' ? 'candidate_id' : 'voter_id';

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