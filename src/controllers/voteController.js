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

        // ✅ هات الانتخابات pending فقط
        const election = await Vote.getActiveElection(governorate);

        if (!election) {
            return res.status(403).json({
                success: false,
                message: "No active election right now"
            });
        }

        const result = await Vote.executeVote(
            id,
            role,
            candidate_id,
            election.election_id
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
        res.status(500).json({
            success: false,
            message: err.message
        });
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

        const vote = await Vote.checkIfVoted(
            id,
            role,
            election.election_id
        );

        return res.json({
            success: true,
            hasVoted: vote !== null,
            voteId: vote ? vote.vote_id : null,
            electionId: election.election_id
        });

    } catch (err) {
        console.error("CheckStatus Error:", err);
        res.status(500).json({
            success: false,
            message: err.message
        });
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
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};
////////////////////////////////////////////////////////////
// --- 4. Election Results ---
////////////////////////////////////////////////////////////
exports.getResults = async (req, res) => {
    try {
        const { rows: groupRows } = await pool.query(
            `SELECT election_group_id
             FROM elections
             WHERE result_status = 'approved'
             ORDER BY created_at DESC
             LIMIT 1`
        );

        if (groupRows.length === 0) {
            return res.json({
                success: true,
                summary: { total_votes: 0, total_candidates: 0 },
                data: []
            });
        }

        const groupId = groupRows[0].election_group_id;

        const { rows: electionRows } = await pool.query(
            `SELECT election_id
             FROM elections
             WHERE election_group_id = $1`,
            [groupId]
        );

        const ids = electionRows.map(e => e.election_id);

        const { rows: totalVotesRows } = await pool.query(
            `SELECT COUNT(*)::INT AS total_votes
             FROM votes
             WHERE election_id = ANY($1::int[])`,
            [ids]
        );

        const totalVotes = totalVotesRows[0]?.total_votes || 0;

        const { rows } = await pool.query(
            `SELECT 
                c.candidate_id,
                cr.full_name,
                cr.governorate,
                c.personal_photos_url,
                c.candidate_type,
                c.election_symbol_url,
                COUNT(v.vote_id)::INT AS total_votes,
                CASE 
                    WHEN $2 = 0 THEN 0
                    ELSE ROUND((COUNT(v.vote_id) * 100.0) / $2, 2)
                END AS percentage
             FROM candidates c
             LEFT JOIN civil_registry cr 
               ON TRIM(c.national_id) = TRIM(cr.national_id)
             LEFT JOIN votes v 
               ON c.candidate_id = v.candidate_id
               AND v.election_id = ANY($1::int[])
             WHERE c.is_approved = TRUE
             GROUP BY 
                c.candidate_id,
                cr.full_name,
                cr.governorate,
                c.personal_photos_url,
                c.candidate_type,
                c.election_symbol_url
             ORDER BY total_votes DESC`,
            [ids, totalVotes]
        );

        res.json({
            success: true,
            group_id: groupId,
            summary: {
                total_votes: totalVotes,
                total_candidates: rows.length
            },
            data: rows
        });

    } catch (err) {
        console.error("GetResults Error:", err);
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};