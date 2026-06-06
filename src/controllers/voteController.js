const { pool } = require('../config/db');
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

        // ✅ هات الانتخابات النشطة
        const election = await Vote.getActiveElection(governorate);

        if (!election) {
            return res.status(403).json({
                success: false,
                message: "No active election right now"
            });
        }

        // ✅ صوّت
        const result = await Vote.executeVote(
            id, role, candidate_id, election.election_id
        );

        if (result.alreadyVoted) {
            return res.status(400).json({
                success: false,
                message: "You have already voted"
            });
        }

        return res.json({
            success: true,
            message: "Vote recorded successfully",
            data: {
                vote_id: result.vote_id,
                election_id: election.election_id
            }
        });

    } catch (err) {
        console.error("CastVote Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

////////////////////////////////////////////////////////////
// --- 2. Check Voting Status ---
////////////////////////////////////////////////////////////
exports.checkUserVotingStatus = async (req, res) => {
    try {
        const { id, role, governorate } = req.user;

        const election = await Vote.getActiveElection(governorate);

        if (!election) {
            return res.json({
                success: true,
                hasVoted: false,
                voteId: null
            });
        }

        const vote = await Vote.checkIfVoted(id, role, election.election_id);

        return res.json({
            success: true,
            hasVoted: vote !== null,
            voteId: vote ? vote.vote_id : null,
            electionId: election.election_id
        });

    } catch (err) {
        console.error("CheckStatus Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

////////////////////////////////////////////////////////////
// --- 3. Get Vote Card ---
////////////////////////////////////////////////////////////
exports.getVoteCard = async (req, res) => {
    try {
        const { id, role } = req.user;

        const card = await Vote.getVoteCard(id, role);

        if (!card) {
            return res.status(404).json({
                success: false,
                message: "No vote found"
            });
        }

        return res.json({
            success: true,
            data: card
        });

    } catch (err) {
        console.error("GetVoteCard Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

////////////////////////////////////////////////////////////
// --- 4. Election Results ---
////////////////////////////////////////////////////////////
exports.getResults = async (req, res) => {
    try {

        const results = await Vote.getResults();

        // ✅ لو مفيش approved → مش هنرجع نتائج
        if (!results) {
            return res.json({
                success: true,
                summary: {
                    total_votes: 0,
                    total_candidates: 0
                },
                data: []
            });
        }

        return res.json({
            success: true,
            group_id: results.groupId,
            summary: {
                total_votes: results.totalVotes,
                total_candidates: results.candidates.length
            },
            data: results.candidates
        });

    } catch (err) {
        console.error("GetResults Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};