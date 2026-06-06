const { pool } = require('../config/db');

////////////////////////////////////////////////////////////
// --- 1. Cast Vote ---
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

        const { rows: existingVote } = await client.query(
            `SELECT vote_id
             FROM votes
             WHERE voter_id = $1
             AND voter_role = $2
             AND election_id = $3
             LIMIT 1
             FOR UPDATE`,
            [id, role, electionId]
        );

        if (existingVote.length > 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                success: false,
                message: "You have already voted in this election"
            });
        }

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
        console.error("CastVote Error:", err);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
            error: err.message
        });
    } finally {
        client.release();
    }
};

////////////////////////////////////////////////////////////
// --- 2. Check Voting Status ---
////////////////////////////////////////////////////////////
exports.checkUserVotingStatus = async (req, res) => {
    try {
        const { id, role, governorate } = req.user;

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
                hasVoted: false,
                voteId: null
            });
        }

        const electionId = electionRows[0].election_id;

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
            voteId: rows.length > 0 ? rows[0].vote_id : null,
            electionId: electionId
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

        // ✅ بنجيب أحدث صوت للمستخدم
        const { rows } = await pool.query(
            `SELECT 
                v.vote_id,
                v.created_at,
                v.election_id,
                c.candidate_id,
                cr.full_name,
                c.personal_photos_url,
                c.candidate_type,
                e.governorate,
                e.election_name
             FROM votes v
             JOIN candidates c 
               ON v.candidate_id = c.candidate_id
             JOIN civil_registry cr 
               ON TRIM(c.national_id) = TRIM(cr.national_id)
             JOIN elections e 
               ON v.election_id = e.election_id
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

        ////////////////////////////////////////////////////////////
        // ✅ 1️⃣ هات آخر جروب فيه انتخابات approved فقط
        ////////////////////////////////////////////////////////////
        const { rows: groupRows } = await pool.query(
            `SELECT election_group_id
             FROM elections
             WHERE result_status = 'approved'
             ORDER BY created_at DESC
             LIMIT 1`
        );

        // ✅ لو مفيش approved → مش هنرجع نتائج
        if (groupRows.length === 0) {
            return res.json({
                success: true,
                summary: {
                    total_votes: 0,
                    total_candidates: 0
                },
                data: []
            });
        }

        const groupId = groupRows[0].election_group_id;

        ////////////////////////////////////////////////////////////
        // ✅ 2️⃣ كل election_ids داخل الجروب ده
        ////////////////////////////////////////////////////////////
        const { rows: electionIds } = await pool.query(
            `SELECT election_id
             FROM elections
             WHERE election_group_id = $1`,
            [groupId]
        );

        const ids = electionIds.map(e => e.election_id);

        ////////////////////////////////////////////////////////////
        // ✅ 3️⃣ إجمالي الأصوات داخل الجروب بس
        ////////////////////////////////////////////////////////////
        const { rows: totalVotesRows } = await pool.query(
            `SELECT COUNT(*)::INT AS total_votes
             FROM votes
             WHERE election_id = ANY($1::int[])`,
            [ids]
        );

        const totalVotes = totalVotesRows[0]?.total_votes || 0;

        ////////////////////////////////////////////////////////////
        // ✅ 4️⃣ جلب المرشحين وأصواتهم داخل الجروب بس
        ////////////////////////////////////////////////////////////
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

        return res.json({
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
        return res.status(500).json({
            success: false,
            message: err.message
        });
    }
};