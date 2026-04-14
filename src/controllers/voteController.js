const Vote = require('../models/voteModel');

// تأكد إن اسم الدالة castVote ومسبوق بكلمة exports
exports.castVote = async (req, res) => {
    try {
        const { id, role } = req.user;
        const { candidate_id } = req.body;

        const tableName = role === 'candidate' ? 'candidates' : 'voters';
        const idColumn = role === 'candidate' ? 'candidate_id' : 'id';

        // التحقق من التصويت السابق
        const status = await Vote.checkIfVoted(tableName, idColumn, id);
        if (status && status.has_voted) {
            return res.status(400).json({ success: false, message: "لقد قمت بالتصويت بالفعل" });
        }

        await Vote.executeVote(role, id, candidate_id, tableName, idColumn);
        res.json({ success: true, message: "تم التصويت بنجاح" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "خطأ داخلي" });
    }
};

// لازم تضيف دي كمان عشان الـ Router بينادي عليها
exports.checkUserVotingStatus = async (req, res) => {
    const { id, role } = req.user;
    const tableName = role === 'candidate' ? 'candidates' : 'voters';
    const idColumn = role === 'candidate' ? 'candidate_id' : 'id';
    const status = await Vote.checkIfVoted(tableName, idColumn, id);
    res.json({ success: true, hasVoted: status ? status.has_voted : false });
};