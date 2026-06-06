const Vote = require('../models/voteModel');
const { pool } = require('../config/db');

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
                message: "Please select a candidate to vote for"
            });
        }

        // ✅ التصويت يحصل فقط في آخر جروب مفتوحة
        const { rows: electionRows } = await pool.query(
            `SELECT e.election_id
             FROM elections e
             JOIN election_groups eg
               ON e.election_group_id = eg.group_id
             WHERE eg.is_closed = FALSE
             AND TRIM(e.governorate) = TRIM($1)
             AND CURRENT_TIMESTAMP BETWEEN e.start_date AND e.end_date
             ORDER BY e.created_at DESC
             LIMIT 1`,
            [governorate]
        );

        if (electionRows.length === 0) {
            return res.status(403).json({
                success: false,
                message: "There is no active election right now"
            });
        }

        const electionId = electionRows[0].election_id;

        // ✅ منع التصويت المكرر لنفس الانتخابات فقط
        const { rows: existingVote } = await pool.query(
            `SELECT 1 FROM votes
             WHERE voter_id = $1
             AND election_id = $2
             LIMIT 1`,
            [id, electionId]
        );

        if (existingVote.length > 0) {
            return res.status(400).json({
                success: false,
                message: "You have already voted in this election"
            });
        }

        await pool.query(
            `INSERT INTO votes (voter_id, voter_role, candidate_id, election_id)
             VALUES ($1, $2, $3, $4)`,
            [id, role, candidate_id, electionId]
        );

        res.json({
            success: true,
            message: "Vote recorded successfully"
        });

    } catch (err) {
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
        res.status(500).json({ 
            success: false, 
            message: "Error retrieving voting status" 
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
                message: "No vote has been recorded yet"
            });
        }

        res.json({ success: true, vote_card: voteCard });

    } catch (err) {
        console.error("Vote Card Error:", err.message);
        res.status(500).json({ 
            success: false, 
            message: "Error retrieving vote card data" 
        });
    }
};

////////////////////////////////////////////////////////////
// --- 4. Election Results ---
////////////////////////////////////////////////////////////
exports.getResults = async (req, res) => {
    try {

        ////////////////////////////////////////////////////////////
        // ✅ 1️⃣ Get latest CLOSED election group only
        ////////////////////////////////////////////////////////////
        const { rows: groupRows } = await pool.query(
            `SELECT group_id
             FROM election_groups
             WHERE is_closed = TRUE
             ORDER BY created_at DESC
             LIMIT 1`
        );

        if (groupRows.length === 0) {
            return res.status(403).json({
                success: false,
                message: "No finalized election results available"
            });
        }

        const groupId = groupRows[0].group_id;

        ////////////////////////////////////////////////////////////
        // ✅ 2️⃣ Check if this group has approved results
        ////////////////////////////////////////////////////////////
        const { rows: approvedCheck } = await pool.query(
            `SELECT 1
             FROM elections
             WHERE election_group_id = $1
             AND result_status = 'approved'
             LIMIT 1`,
            [groupId]
        );

        if (approvedCheck.length === 0) {
            return res.status(403).json({
                success: false,
                message: "Results are still under review"
            });
        }

        ////////////////////////////////////////////////////////////
        // ✅ 3️⃣ Count votes for this group
        ////////////////////////////////////////////////////////////
        const { rows: totalVotesRows } = await pool.query(
            `SELECT COUNT(v.vote_id)::INT AS total_votes
             FROM votes v
             JOIN elections e 
               ON v.election_id = e.election_id
             WHERE e.election_group_id = $1`,
            [groupId]
        );

        const totalVotes = totalVotesRows[0]?.total_votes || 0;

        ////////////////////////////////////////////////////////////
        // ✅ 4️⃣ Get results
        ////////////////////////////////////////////////////////////
        const { rows } = await pool.query(
            `SELECT 
                c.candidate_id,
                cr.full_name,
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
             LEFT JOIN elections e
               ON v.election_id = e.election_id
             WHERE c.is_approved = TRUE
               AND e.election_group_id = $1
             GROUP BY c.candidate_id, cr.full_name
             ORDER BY total_votes DESC`,
            [groupId, totalVotes]
        );

        return res.json({
            success: true,
            group_id: groupId,
            summary: {
                total_votes: totalVotes
            },
            data: rows
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message
        });
    }
};