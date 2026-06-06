const { pool } = require('../config/db');

////////////////////////////////////////////////////////////
// ✅ 1. Cast Vote
////////////////////////////////////////////////////////////
exports.castVote = async (req, res) => {
    const client = await pool.connect();

    try {
        const { id, role, governorate } = req.user;
        const { candidate_id } = req.body;

        if (!candidate_id) {
            return res.status(400).json({
                success: false,
                message: "Please select a candidate"
            });
        }

        await client.query('BEGIN');

        ////////////////////////////////////////////////////////////
        // 1️⃣ نجيب الانتخابات النشطة لنفس المحافظة
        ////////////////////////////////////////////////////////////
        const { rows: electionRows } = await client.query(
            `SELECT e.election_id
             FROM elections e
             JOIN election_groups eg ON e.election_group_id = eg.group_id
             WHERE eg.is_closed = FALSE
             AND TRIM(e.governorate) = TRIM($1)
             AND CURRENT_TIMESTAMP BETWEEN e.start_date AND e.end_date
             ORDER BY e.created_at DESC
             LIMIT 1`,
            [governorate]
        );

        if (electionRows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(403).json({
                success: false,
                message: "No active election right now"
            });
        }

        const electionId = electionRows[0].election_id;

        ////////////////////////////////////////////////////////////
        // 2️⃣ نتأكد إنه مصوّتش قبل كده في نفس الانتخابات
        ////////////////////////////////////////////////////////////
        const { rows: existingVote } = await client.query(
            `SELECT vote_id
             FROM votes
             WHERE voter_id = $1
             AND voter_role = $2
             AND election_id = $3
             LIMIT 1`,
            [id, role, electionId]
        );

        if (existingVote.length > 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                success: false,
                message: "You have already voted in this election"
            });
        }

        ////////////////////////////////////////////////////////////
        // 3️⃣ نسجل التصويت
        ////////////////////////////////////////////////////////////
        const { rows: voteRows } = await client.query(
            `INSERT INTO votes (voter_id, voter_role, candidate_id, election_id, created_at)
             VALUES ($1, $2, $3, $4, NOW())
             RETURNING vote_id`,
            [id, role, candidate_id, electionId]
        );

        await client.query('COMMIT');

        return res.status(200).json({
            success: true,
            message: "Vote recorded successfully",
            data: {
                vote_id: voteRows[0].vote_id,
                election_id: electionId
            }
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Cast Vote Error:", err);

        return res.status(500).json({
            success: false,
            message: "Something went wrong"
        });
    } finally {
        client.release();
    }
};


////////////////////////////////////////////////////////////
// ✅ 2. Check Voting Status
////////////////////////////////////////////////////////////
exports.checkUserVotingStatus = async (req, res) => {
    try {
        const { id, role, governorate } = req.user;

        ////////////////////////////////////////////////////////////
        // نفس منطق جلب الانتخابات النشطة
        ////////////////////////////////////////////////////////////
        const { rows: electionRows } = await pool.query(
            `SELECT e.election_id
             FROM elections e
             JOIN election_groups eg ON e.election_group_id = eg.group_id
             WHERE eg.is_closed = FALSE
             AND TRIM(e.governorate) = TRIM($1)
             AND CURRENT_TIMESTAMP BETWEEN e.start_date AND e.end_date
             ORDER BY e.created_at DESC
             LIMIT 1`,
            [governorate]
        );

        if (electionRows.length === 0) {
            return res.json({
                success: true,
                hasVoted: false
            });
        }

        const electionId = electionRows[0].election_id;

        ////////////////////////////////////////////////////////////
        // نشوف هل له vote في نفس الانتخابات دي
        ////////////////////////////////////////////////////////////
        const { rows } = await pool.query(
            `SELECT vote_id
             FROM votes
             WHERE voter_id = $1
             AND voter_role = $2
             AND election_id = $3
             LIMIT 1`,
            [id, role, electionId]
        );

        return res.json({
            success: true,
            hasVoted: rows.length > 0,
            voteId: rows.length > 0 ? rows[0].vote_id : null
        });

    } catch (err) {
        console.error("Check Status Error:", err);
        return res.status(500).json({
            success: false,
            message: "Failed to check voting status"
        });
    }
};


////////////////////////////////////////////////////////////
// ✅ 3. Get Vote Card
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
                message: "No vote found"
            });
        }

        return res.json({
            success: true,
            data: rows[0]
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "Failed to get vote card"
        });
    }
};