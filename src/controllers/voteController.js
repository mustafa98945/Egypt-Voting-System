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

        // ✅ Check for active election
        const { rows: electionRows } = await pool.query(
            `SELECT election_id
             FROM elections
             WHERE is_active = TRUE
             AND TRIM(governorate) = TRIM($1)
             AND CURRENT_TIMESTAMP >= start_date
             AND CURRENT_TIMESTAMP <= end_date
             ORDER BY created_at DESC
             LIMIT 1`,
            [governorate]
        );

        if (electionRows.length === 0) {
            return res.status(403).json({
                success: false,
                message: "There are no active elections at the moment"
            });
        }

        const electionId = electionRows[0].election_id;

        const tableName = role === 'candidate' ? 'candidates' : 'voters';
        const idColumn = role === 'candidate' ? 'candidate_id' : 'voter_id';

        const status = await Vote.checkIfVoted(tableName, idColumn, id);
        if (status && status.has_voted) {
            return res.status(400).json({
                success: false,
                message: "You have already voted previously"
            });
        }

        await Vote.executeVote(
            role,
            id,
            candidate_id,
            tableName,
            idColumn,
            electionId
        );

        const voteCard = await Vote.getVoteCard(id, role);

        res.status(200).json({
            success: true,
            message: "Your vote has been successfully recorded. Thank you for participating.",
            vote_card: voteCard
        });

    } catch (err) {
        console.error("Cast Vote Error:", err.message);
        res.status(500).json({
            success: false,
            message: "An internal error occurred while recording your vote"
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
        // ✅ 1️⃣ Get latest approved election group
        ////////////////////////////////////////////////////////////
        const { rows: groupRows } = await pool.query(
            `SELECT eg.group_id
             FROM election_groups eg
             JOIN elections e 
               ON e.election_group_id = eg.group_id
             WHERE e.result_status = 'approved'
             ORDER BY eg.created_at DESC
             LIMIT 1`
        );

        if (groupRows.length === 0) {
            return res.status(403).json({
                success: false,
                message: "Results are currently under review by the election committee"
            });
        }

        const groupId = groupRows[0].group_id;

        ////////////////////////////////////////////////////////////
        // ✅ 2️⃣ Total votes for this election group
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
        // ✅ 3️⃣ Total approved candidates
        ////////////////////////////////////////////////////////////
        const { rows: candidatesCountRows } = await pool.query(
            `SELECT COUNT(*)::INT AS total_candidates
             FROM candidates
             WHERE is_approved = TRUE`
        );

        const totalCandidates = candidatesCountRows[0]?.total_candidates || 0;

        ////////////////////////////////////////////////////////////
        // ✅ 4️⃣ Final Results
        ////////////////////////////////////////////////////////////
        const { rows } = await pool.query(
            `SELECT 
                c.candidate_id,
                cr.full_name,
                c.personal_photos_url,
                c.candidate_type,
                c.election_symbol_url,
                cr.administrative_unit,
                cr.governorate,
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
              AND v.election_id IN (
                    SELECT election_id
                    FROM elections
                    WHERE election_group_id = $1
              )
            WHERE c.is_approved = TRUE
            GROUP BY 
                c.candidate_id, 
                cr.full_name, 
                c.personal_photos_url,
                c.candidate_type, 
                c.election_symbol_url,
                cr.administrative_unit, 
                cr.governorate
            ORDER BY total_votes DESC`,
            [groupId, totalVotes]
        );

        ////////////////////////////////////////////////////////////
        // ✅ 5️⃣ Determine Winner
        ////////////////////////////////////////////////////////////
        const winner = rows.length > 0 ? rows[0] : null;

        ////////////////////////////////////////////////////////////
        // ✅ 6️⃣ Response
        ////////////////////////////////////////////////////////////
        return res.json({
            success: true,
            group_id: groupId,
            summary: {
                total_votes: totalVotes,
                total_candidates: totalCandidates,
                winner: winner ? {
                    candidate_id: winner.candidate_id,
                    full_name: winner.full_name,
                    total_votes: winner.total_votes,
                    percentage: winner.percentage
                } : null
            },
            data: rows
        });

    } catch (err) {
        console.error("Results Error:", err.message);
        return res.status(500).json({
            success: false,
            message: "Error retrieving election results"
        });
    }
};