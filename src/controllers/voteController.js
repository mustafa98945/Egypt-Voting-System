const Vote = require('../models/voteModel');

exports.castVote = async (req, res) => {
    const { candidate_id } = req.body;
    const { id, role } = req.user;

    try {
        const tableName = role === 'candidate' ? 'candidates' : 'voters';
        const idColumn = role === 'candidate' ? 'candidate_id' : 'voter_id';

        const userStatus = await Vote.checkIfVoted(tableName, idColumn, id);
        if (!userStatus || userStatus.has_voted) {
            return res.status(400).json({ success: false, message: "لا يمكن التصويت" });
        }

        await Vote.executeVote(role, id, candidate_id, tableName, idColumn);
        res.json({ success: true, message: "تم التصويت بنجاح" });
    } catch (err) {
        res.status(500).json({ success: false, message: "خطأ في السيرفر" });
    }
};