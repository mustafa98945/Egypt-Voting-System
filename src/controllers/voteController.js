const { pool } = require('../config/db');

////////////////////////////////////////////////////////////
// --- 1. Cast Vote (إدراج الصوت) ---
////////////////////////////////////////////////////////////
exports.castVote = async (req, res) => {
    const client = await pool.connect();
    
    try {
        const { id, role, governorate } = req.user;
        const { candidate_id } = req.body;

        if (!candidate_id) {
            return res.status(400).json({
                success: false,
                message: "Please select a candidate to vote for"
            });
        }

        // 1️⃣ البحث عن الانتخابات النشطة حالياً لهذه المحافظة
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
            return res.status(403).json({
                success: false,
                message: "There is no active election right now for your governorate"
            });
        }

        const electionId = electionRows[0].election_id;

        await client.query('BEGIN');

        // 2️⃣ التحقق من عدم وجود تصويت مسبق (داخل الـ Transaction لضمان الدقة)
        const { rows: existingVote } = await client.query(
            `SELECT vote_id 
             FROM votes
             WHERE voter_id    = $1
             AND   voter_role  = $2
             AND   election_id = $3
             FOR UPDATE`, // قفل السطر لمنع التصويت المزدوج في نفس اللحظة
            [id, role, electionId]
        );

        if (existingVote.length > 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                success: false,
                message: "You have already voted in this election"
            });
        }

        // 3️⃣ إدراج الصوت في جدول votes
        const { rows: voteRows } = await client.query(
            `INSERT INTO votes (voter_id, voter_role, candidate_id, election_id, created_at)
             VALUES ($1, $2, $3, $4, NOW())
             RETURNING vote_id`,
            [id, role, candidate_id, electionId]
        );

        await client.query('COMMIT');

        return res.json({
            success: true,
            message: "Vote recorded successfully",
            vote_id: voteRows[0].vote_id
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Cast Vote Error:", err);
        
        if (err.code === '23505') {
            return res.status(400).json({
                success: false,
                message: "You have already voted in this election"
            });
        }
        
        res.status(500).json({
            success: false,
            message: "Internal server error during voting"
        });
        
    } finally {
        client.release();
    }
};

////////////////////////////////////////////////////////////
// --- 2. Check Voting Status (التحقق من حالة التصويت) ---
////////////////////////////////////////////////////////////
exports.checkUserVotingStatus = async (req, res) => {
    try {
        const { id, role, governorate } = req.user;

        // التحقق من وجود أي صوت للمستخدم في "أحدث مجموعة انتخابات" لمحافظته
        // هذا يضمن أنه حتى لو انتهت الانتخابات للتو، ستظهر الحالة "مصوت"
        const { rows } = await pool.query(
            `SELECT v.vote_id
             FROM votes v
             JOIN elections e ON v.election_id = e.election_id
             WHERE v.voter_id   = $1
             AND   v.voter_role = $2
             AND   TRIM(e.governorate) = TRIM($3)
             AND   e.election_group_id = (
                 SELECT eg.group_id 
                 FROM election_groups eg
                 JOIN elections e2 ON eg.group_id = e2.election_group_id
                 WHERE TRIM(e2.governorate) = TRIM($3)
                 ORDER BY eg.created_at DESC
                 LIMIT 1
             )
             LIMIT 1`,
            [id, role, governorate]
        );

        return res.json({
            success: true,
            hasVoted: rows.length > 0,
            voteId: rows.length > 0 ? rows[0].vote_id : null
        });

    } catch (err) {
        console.error("Check Status Error:", err);
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

////////////////////////////////////////////////////////////
// --- 3. Get Vote Card (جلب تفاصيل الصوت) ---
////////////////////////////////////////////////////////////
exports.getVoteCard = async (req, res) => {
    try {
        const { id, role } = req.user;

        const { rows } = await pool.query(
            `SELECT v.vote_id,
                    v.created_at,
                    c.candidate_id,
                    cr.full_name as candidate_name,
                    c.personal_photos_url,
                    c.candidate_type,
                    e.governorate
             FROM votes v
             JOIN candidates c ON v.candidate_id = c.candidate_id
             JOIN civil_registry cr ON TRIM(c.national_id) = TRIM(cr.national_id)
             JOIN elections e ON v.election_id = e.election_id
             WHERE v.voter_id   = $1
             AND   v.voter_role = $2
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
// --- 4. Election Results (نتائج الانتخابات) ---
////////////////////////////////////////////////////////////
exports.getResults = async (req, res) => {
    try {
        // جلب أحدث مجموعة انتخابات
        const { rows: groupRows } = await pool.query(
            `SELECT group_id FROM election_groups ORDER BY created_at DESC LIMIT 1`
        );

        if (groupRows.length === 0) {
            return res.json({ success: true, election: null, data: [] });
        }

        const groupId = groupRows[0].group_id;

        // إجمالي الأصوات في هذه المجموعة
        const { rows: totalVotesRows } = await pool.query(
            `SELECT COUNT(v.vote_id)::INT AS total_votes
             FROM votes v
             JOIN elections e ON v.election_id = e.election_id
             WHERE e.election_group_id = $1`,
            [groupId]
        );

        const totalVotes = totalVotesRows[0]?.total_votes || 0;

        // تفاصيل المرشحين وعدد الأصوات لكل منهم
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
             LEFT JOIN civil_registry cr ON TRIM(c.national_id) = TRIM(cr.national_id)
             LEFT JOIN votes v ON c.candidate_id = v.candidate_id
               AND v.election_id IN (SELECT election_id FROM elections WHERE election_group_id = $1)
             WHERE c.is_approved = TRUE
             GROUP BY c.candidate_id, cr.full_name, c.personal_photos_url, c.candidate_type, c.election_symbol_url
             ORDER BY total_votes DESC`,
            [groupId, totalVotes]
        );

        res.json({
            success: true,
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