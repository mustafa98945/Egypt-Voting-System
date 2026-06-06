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

        // ✅ جلب الانتخابات النشطة لنفس المحافظة
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

        // 🔴 IMPORTANT: Double-check داخل Transaction لمنع Race Condition
        const { rows: existingVote } = await client.query(
            `SELECT vote_id
             FROM votes
             WHERE voter_id = $1
             AND voter_role = $2
             AND election_id = $3
             LIMIT 1
             FOR UPDATE`,  // 🔒 قفل السجل!
            [id, role, electionId]
        );

        if (existingVote.length > 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                success: false,
                message: "You have already voted in this election"
            });
        }

        // ✅ تسجيل التصويت
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
// --- 2. Check Voting Status (المهم جداً!)
////////////////////////////////////////////////////////////
exports.checkUserVotingStatus = async (req, res) => {
    try {
        const { id, role, governorate } = req.user;

        // ✅ جلب الانتخابات النشطة لنفس المحافظة
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

        // لو ما فيش انتخابات نشطة
        if (electionRows.length === 0) {
            return res.json({
                success: true,
                hasVoted: false,
                voteId: null,
                message: "No active election"
            });
        }

        const electionId = electionRows[0].election_id;

        // ✅ البحث بـ election_id بالظبط (مش عام!)
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
            message: "Failed to check voting status",
            error: err.message
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
            message: "Failed to get vote card",
            error: err.message
        });
    }
};

////////////////////////////////////////////////////////////
// --- 4. Election Results ---
////////////////////////////////////////////////////////////
exports.getResults = async (req, res) => {
    try {
        const { governorate } = req.user;

        ////////////////////////////////////////////////////////////
        // ✅ 1️⃣ هات آخر انتخابات اتعملت للمحافظة (مش شرط تكون نشطة)
        ////////////////////////////////////////////////////////////
        const { rows: electionRows } = await pool.query(
            `SELECT e.election_id, e.election_group_id
             FROM elections e
             JOIN election_groups eg 
               ON e.election_group_id = eg.group_id
             WHERE TRIM(e.governorate) = TRIM($1)
             ORDER BY eg.created_at DESC, e.created_at DESC
             LIMIT 1`,
            [governorate]
        );

        if (electionRows.length === 0) {
            return res.json({
                success: true,
                election_id: null,
                summary: {
                    total_votes: 0,
                    total_candidates: 0
                },
                data: []
            });
        }

        const electionId = electionRows[0].election_id;

        ////////////////////////////////////////////////////////////
        // ✅ 2️⃣ إجمالي الأصوات للانتخابات دي
        ////////////////////////////////////////////////////////////
        const { rows: totalVotesRows } = await pool.query(
            `SELECT COUNT(vote_id)::INT AS total_votes
             FROM votes
             WHERE election_id = $1`,
            [electionId]
        );

        const totalVotes = totalVotesRows[0]?.total_votes || 0;

        ////////////////////////////////////////////////////////////
        // ✅ 3️⃣ جلب المرشحين وأصواتهم
        ////////////////////////////////////////////////////////////
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
               AND v.election_id = $1
             WHERE c.is_approved = TRUE
             AND c.election_id = $1   -- ✅ مهم جداً
             GROUP BY 
                c.candidate_id,
                cr.full_name,
                c.personal_photos_url,
                c.candidate_type,
                c.election_symbol_url
             ORDER BY total_votes DESC`,
            [electionId, totalVotes]
        );

        ////////////////////////////////////////////////////////////
        // ✅ 4️⃣ رجع النتيجة
        ////////////////////////////////////////////////////////////
        return res.json({
            success: true,
            election_id: electionId,
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
            message: "Failed to get results",
            error: err.message
        });
    }
};