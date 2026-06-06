const { pool } = require('../config/db');

const Vote = {

    /**
     * جلب الانتخاب النشط للمحافظة
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
     * التحقق إذا المستخدم صوّت في انتخاب معين
     */
    checkIfVoted: async (userId, userRole, electionId) => {
        const { rows } = await pool.query(
            `SELECT vote_id
             FROM votes
             WHERE voter_id    = $1
             AND   voter_role  = $2
             AND   election_id = $3
             LIMIT 1`,
            [userId, userRole, electionId]
        );
        return rows.length > 0 ? rows[0] : null;
    },

    /**
     * تنفيذ التصويت مع transaction و double check لمنع race condition
     */
    executeVote: async (userId, userRole, candidateId, electionId) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Double check داخل transaction
            const { rows: existing } = await client.query(
                `SELECT vote_id
                 FROM votes
                 WHERE voter_id    = $1
                 AND   voter_role  = $2
                 AND   election_id = $3
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
     * جلب بطاقة التصويت من جدول votes فقط
     */
    getVoteCard: async (userId, userRole) => {
        const { rows } = await pool.query(
            `SELECT
                v.vote_id,
                v.created_at                    AS "Vote_Date",
                v.election_id,
                cr.full_name                    AS "Name",
                cr.national_id                  AS "National_ID",
                cr.governorate                  AS "Government",
                cr.administrative_unit          AS "Administrative_Unit",
                c.personal_photos_url,
                c.candidate_type
             FROM votes v
             JOIN candidates c  ON v.candidate_id = c.candidate_id
             JOIN civil_registry cr ON TRIM(c.national_id) = TRIM(cr.national_id)
             WHERE v.voter_id   = $1
             AND   v.voter_role = $2
             ORDER BY v.created_at DESC
             LIMIT 1`,
            [userId, userRole]
        );
        return rows.length > 0 ? rows[0] : null;
    },

    /**
     * نتائج الانتخابات من جدول votes
     */
    getResults: async () => {
        const { rows: groupRows } = await pool.query(
            `SELECT group_id
             FROM election_groups
             ORDER BY created_at DESC
             LIMIT 1`
        );

        if (groupRows.length === 0) return null;

        const groupId = groupRows[0].group_id;

        const { rows: totalVotesRows } = await pool.query(
            `SELECT COUNT(v.vote_id)::INT AS total_votes
             FROM votes v
             JOIN elections e ON v.election_id = e.election_id
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
             LEFT JOIN civil_registry cr ON TRIM(c.national_id) = TRIM(cr.national_id)
             LEFT JOIN votes v
               ON c.candidate_id = v.candidate_id
               AND v.election_id IN (
                   SELECT election_id FROM elections WHERE election_group_id = $1
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

        return { groupId, totalVotes, candidates: rows };
    }
};

module.exports = Vote;