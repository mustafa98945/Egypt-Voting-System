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

        try {
            await pool.query(
                `INSERT INTO votes (voter_id, voter_role, candidate_id, election_id)
                 VALUES ($1, $2, $3, $4)`,
                [id, role, candidate_id, electionId]
            );

            return res.json({
                success: true,
                message: "Vote recorded successfully"
            });

        } catch (err) {
            if (err.code === '23505') {
                return res.status(400).json({
                    success: false,
                    message: "You have already voted in this election"
                });
            }
            throw err;
        }

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

        const { rows } = await pool.query(
            `SELECT 1
             FROM votes v
             JOIN elections e ON v.election_id = e.election_id
             JOIN election_groups eg ON e.election_group_id = eg.group_id
             WHERE v.voter_id = $1
             AND v.voter_role = $2
             AND eg.is_closed = FALSE
             LIMIT 1`,
            [id, role]
        );

        res.json({
            success: true,
            hasVoted: rows.length > 0
        });

    } catch (err) {
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

        const { rows } = await pool.query(
            `SELECT v.vote_id,
                    v.created_at,
                    c.candidate_id,
                    cr.full_name,
                    c.personal_photos_url,
                    c.candidate_type
             FROM votes v
             JOIN candidates c ON v.candidate_id = c.candidate_id
             JOIN civil_registry cr ON TRIM(c.national_id) = TRIM(cr.national_id)
             WHERE v.voter_id = $1
             AND v.voter_role = $2
             ORDER BY v.created_at DESC
             LIMIT 1`,
            [id, role]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "No vote has been recorded yet"
            });
        }

        res.json({
            success: true,
            vote_card: rows[0]
        });

    } catch (err) {
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
            `SELECT group_id
             FROM election_groups
             ORDER BY created_at DESC
             LIMIT 1`
        );

        if (groupRows.length === 0) {
            return res.json({
                success: true,
                election: null,
                voters: 0,
                summary: {
                    total_votes: 0,
                    total_candidates: 0
                },
                data: []
            });
        }

        const groupId = groupRows[0].group_id;

        const { rows: electionRows } = await pool.query(
            `SELECT *
             FROM elections
             WHERE election_group_id = $1
             ORDER BY created_at DESC
             LIMIT 1`,
            [groupId]
        );

        const election = electionRows[0] || null;

        const { rows: totalVotesRows } = await pool.query(
            `SELECT COUNT(v.vote_id)::INT AS total_votes
             FROM votes v
             JOIN elections e
               ON v.election_id = e.election_id
             WHERE e.election_group_id = $1`,
            [groupId]
        );

        const totalVotes = totalVotesRows[0]?.total_votes || 0;

        const { rows } = await pool.query(
            `SELECT 
                c.candidate_id,
                cr.full_name,
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
                c.election_symbol_url
             ORDER BY total_votes DESC`,
            [groupId, totalVotes]
        );

        res.json({
            success: true,
            election: election,
            voters: totalVotes,
            summary: {
                total_votes: totalVotes,
                total_candidates: rows.length
            },
            data: rows
        });

    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};