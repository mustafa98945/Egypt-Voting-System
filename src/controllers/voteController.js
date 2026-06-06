const Vote = require('../models/voteModel');

////////////////////////////////////////////////////////////
// --- 1. Cast Vote ---
////////////////////////////////////////////////////////////
exports.castVote = async (req, res) => {
    try {
        const { id, role, governorate } = req.user;
        const { candidate_id } = req.body;

        if (!candidate_id) {
            return res.status(400).json({
                success: false,
                message: "Please select a candidate"
            });
        }

        // 1. جلب الانتخاب النشط
        const activeElection = await Vote.getActiveElection(governorate);
        if (!activeElection) {
            return res.status(403).json({
                success: false,
                message: "No active election right now"
            });
        }

        // 2. تنفيذ التصويت (بيعمل double check داخلياً)
        const result = await Vote.executeVote(id, role, candidate_id, activeElection.election_id);

        if (!result.success && result.alreadyVoted) {
            return res.status(400).json({
                success: false,
                message: "You have already voted in this election"
            });
        }

        return res.status(200).json({
            success: true,
            message: "Vote recorded successfully",
            data: {
                vote_id: result.vote_id,
                election_id: activeElection.election_id
            }
        });

    } catch (err) {
        console.error("CastVote Error:", err);
        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};

////////////////////////////////////////////////////////////
// --- 2. Check Voting Status ---
////////////////////////////////////////////////////////////
exports.checkUserVotingStatus = async (req, res) => {
    try {
        const { id, role, governorate } = req.user;

        const activeElection = await Vote.getActiveElection(governorate);
        if (!activeElection) {
            return res.json({
                success: true,
                hasVoted: false,
                voteId: null
            });
        }

        const existingVote = await Vote.checkIfVoted(id, role, activeElection.election_id);

        return res.json({
            success: true,
            hasVoted: !!existingVote,
            voteId: existingVote ? existingVote.vote_id : null
        });

    } catch (err) {
        console.error("CheckStatus Error:", err);
        return res.status(500).json({
            success: false,
            message: "Failed to check voting status"
        });
    }
};

////////////////////////////////////////////////////////////
// --- 3. Get Vote Card ---
////////////////////////////////////////////////////////////
exports.getVoteCard = async (req, res) => {
    try {
        const { id, role } = req.user;

        const voteCard = await Vote.getVoteCard(id, role);
        if (!voteCard) {
            return res.status(404).json({
                success: false,
                message: "No vote found"
            });
        }

        return res.json({
            success: true,
            data: voteCard
        });

    } catch (err) {
        console.error("GetVoteCard Error:", err);
        return res.status(500).json({
            success: false,
            message: "Failed to get vote card"
        });
    }
};

////////////////////////////////////////////////////////////
// --- 4. Election Results ---
////////////////////////////////////////////////////////////
exports.getResults = async (req, res) => {
    try {
        const results = await Vote.getResults();

        if (!results) {
            return res.json({
                success: true,
                summary: { total_votes: 0, total_candidates: 0 },
                data: []
            });
        }

        return res.json({
            success: true,
            summary: {
                total_votes: results.totalVotes,
                total_candidates: results.candidates.length
            },
            data: results.candidates
        });

    } catch (err) {
        console.error("GetResults Error:", err);
        return res.status(500).json({
            success: false,
            message: "Failed to get results"
        });
    }
};