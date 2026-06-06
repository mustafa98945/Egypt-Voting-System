const { pool } = require('../config/db');

const Vote = {

    // 1️⃣ التحقق من حالة التصويت — من جدول votes مباشرة
    checkIfVoted: async (userId, userRole, electionId) => {
        const query = `
            SELECT vote_id 
            FROM votes 
            WHERE voter_id = $1 
            AND voter_role = $2 
            AND election_id = $3
            LIMIT 1
        `;
        const result = await pool.query(query, [userId, userRole, electionId]);
        return result.rows.length > 0 ? result.rows[0] : null;
    },

    // 2️⃣ تنفيذ التصويت
    executeVote: async (userRole, userId, candidateId, tableName, idColumn, electionId) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // ✅ double-check داخل الـ transaction لتجنب race condition
            const existing = await client.query(
                `SELECT vote_id FROM votes 
                 WHERE voter_id = $1 AND voter_role = $2 AND election_id = $3`,
                [userId, userRole, electionId]
            );

            if (existing.rows.length > 0) {
                await client.query('ROLLBACK');
                return { success: false, alreadyVoted: true };
            }

            await client.query(
                `INSERT INTO votes (voter_id, candidate_id, voter_role, election_id, created_at) 
                 VALUES ($1, $2, $3, $4, NOW())`,
                [userId, candidateId, userRole, electionId]
            );

            await client.query(
                `UPDATE ${tableName} SET has_voted = TRUE WHERE ${idColumn} = $1`,
                [userId]
            );

            await client.query('COMMIT');
            return { success: true, alreadyVoted: false };

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    },

    // 3️⃣ جلب بيانات الـ Vote Card
    getVoteCard: async (userId, role) => {
        if (role === 'voter') {
            const query = `
                SELECT 
                    cr.full_name           AS "Name",
                    vt.vote_id             AS "V_code", 
                    v.national_id          AS "National_ID",
                    cr.governorate         AS "Government",
                    cr.administrative_unit AS "Administrative_Unit"
                FROM voters v
                JOIN civil_registry cr 
                  ON TRIM(v.national_id) = TRIM(cr.national_id)
                JOIN votes vt 
                  ON v.voter_id = vt.voter_id 
                 AND vt.voter_role = 'voter'
                WHERE v.voter_id = $1
                ORDER BY vt.created_at DESC 
                LIMIT 1
            `;
            const { rows } = await pool.query(query, [userId]);
            return rows[0];
        } else {
            const query = `
                SELECT 
                    cr.full_name           AS "Name",
                    vt.vote_id             AS "V_code",
                    c.national_id          AS "National_ID",
                    cr.governorate         AS "Government",
                    cr.administrative_unit AS "Administrative_Unit"
                FROM candidates c
                JOIN civil_registry cr 
                  ON TRIM(c.national_id) = TRIM(cr.national_id)
                JOIN votes vt 
                  ON c.candidate_id = vt.voter_id 
                 AND vt.voter_role = 'candidate'
                WHERE c.candidate_id = $1
                ORDER BY vt.created_at DESC 
                LIMIT 1
            `;
            const { rows } = await pool.query(query, [userId]);
            return rows[0];
        }
    }
};

module.exports = Vote;