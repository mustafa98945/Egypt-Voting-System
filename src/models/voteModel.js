const { pool } = require('../config/db');

const Vote = {

    /**
     * 1️⃣ جلب الانتخابات النشطة للمحافظة
     */
    getActiveElection: async (governorate) => {
        const { rows } = await pool.query(
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
        return rows.length > 0 ? rows[0] : null;
    },

    /**
     * 2️⃣ التحقق من التصويت المسبق
     */
    checkIfVoted: async (userId, userRole, electionId) => {
        const { rows } = await pool.query(
            `SELECT vote_id 
             FROM votes 
             WHERE voter_id   = $1 
             AND voter_role   = $2 
             AND election_id  = $3
             LIMIT 1`,
            [userId, userRole, electionId]
        );
        return rows.length > 0 ? rows[0] : null;
    },

    /**
     * 3️⃣ تنفيذ التصويت
     */
    executeVote: async (userId, userRole, candidateId, electionId) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const { rows: existing } = await client.query(
                `SELECT vote_id FROM votes 
                 WHERE voter_id   = $1 
                 AND voter_role   = $2 
                 AND election_id  = $3
                 FOR UPDATE`,
                [userId, userRole, electionId]
            );

            if (existing.length > 0) {
                await client.query('ROLLBACK');
                return { success: false, alreadyVoted: true };
            }

            const { rows: voteRows } = await client.query(
                `INSERT INTO votes (voter_id, voter_role, candidate_id, election_id, created_at)
                 VALUES ($1, $2, $3, $4, NOW())
                 RETURNING vote_id`,
                [userId, userRole, candidateId, electionId]
            );

            await client.query('COMMIT');
            
            return { 
                success: true, 
                alreadyVoted: false,
                vote_id: voteRows[0].vote_id
            };

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    },

    /**
     * 4️⃣ جلب بطاقة التصويت
     */
    getVoteCard: async (userId, role) => {
        const { rows } = await pool.query(
            `SELECT 
                vt.vote_id        AS "V_code",
                vt.created_at     AS "Vote_Date",
                cr.full_name      AS "Name",
                cr.national_id    AS "National_ID",
                cr.governorate    AS "Government",
                cr.administrative_unit AS "Administrative_Unit"
             FROM votes vt
             JOIN civil_registry cr ON (
                 CASE 
                     WHEN vt.voter_role = 'voter' THEN (
                         SELECT national_id FROM voters 
                         WHERE voter_id = vt.voter_id
                     )
                     ELSE (
                         SELECT national_id FROM candidates 
                         WHERE candidate_id = vt.voter_id
                     )
                 END = TRIM(cr.national_id)
             )
             WHERE vt.voter_id  = $1
             AND vt.voter_role  = $2
             ORDER BY vt.created_at DESC
             LIMIT 1`,
            [userId, role]
        );
        return rows[0] || null;
    },

    /**
     * 5️⃣ جلب نتائج آخر جروب approved
     */
    getResults: async () => {
        // ✅ هات آخر جروب approved
        const { rows: groupRows } = await pool.query(
            `SELECT election_group_id
             FROM elections
             WHERE result_status = 'approved'
             ORDER BY created_at DESC
             LIMIT 1`
        );

        if (groupRows.length === 0) return null;

        const groupId = groupRows[0].election_group_id;

        // ✅ كل elections في الجروب
        const { rows: electionRows } = await pool.query(
            `SELECT election_id
             FROM elections
             WHERE election_group_id = $1`,
            [groupId]
        );

        const ids = electionRows.map(e => e.election_id);

        // ✅ إجمالي الأصوات داخل الجروب فقط
        const { rows: totalVotesRows } = await pool.query(
            `SELECT COUNT(*)::INT AS total_votes
             FROM votes
             WHERE election_id = ANY($1::int[])`,
            [ids]
        );

        const totalVotes = totalVotesRows[0]?.total_votes || 0;

        // ✅ المرشحين وأصواتهم داخل الجروب فقط
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

        return { groupId, totalVotes, candidates: rows };
    }
};

module.exports = Vote;