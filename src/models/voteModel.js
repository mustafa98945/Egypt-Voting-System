const pool = require('../config/db');

const Vote = {

    // 1. التحقق من حالة التصويت
    checkIfVoted: async (tableName, idColumn, userId) => {
        const query = `SELECT has_voted FROM ${tableName} WHERE ${idColumn} = $1`;
        const result = await pool.query(query, [userId]);
        return result.rows.length > 0 ? result.rows[0] : null;
    },

    // 2. تنفيذ التصويت (Transaction)
    executeVote: async (userRole, userId, candidateId, tableName, idColumn) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // تسجيل الصوت في جدول votes
            await client.query(
                `INSERT INTO votes (voter_id, candidate_id, voter_role, created_at) 
                 VALUES ($1, $2, $3, NOW())`,
                [userId, candidateId, userRole]
            );

            // تحديث has_voted
            const updateResult = await client.query(
                `UPDATE ${tableName} SET has_voted = TRUE WHERE ${idColumn} = $1`,
                [userId]
            );

            if (updateResult.rowCount === 0) {
                throw new Error("فشل تحديث حالة المستخدم");
            }

            await client.query('COMMIT');
            return { success: true };

        } catch (error) {
            await client.query('ROLLBACK');
            console.error("Transaction Error:", error.message);
            throw error;
        } finally {
            client.release();
        }
    },

    // 3. جلب بيانات الـ Vote Card
    getVoteCard: async (userId, role) => {
        // لو voter
        if (role === 'voter') {
            const query = `
                SELECT 
                    cr.full_name,
                    cr.username        AS v_code,
                    v.national_id,
                    cr.governorate,
                    cr.administrative_unit,
                    v.has_voted
                FROM voters v
                JOIN civil_registry cr ON TRIM(v.national_id) = TRIM(cr.national_id)
                WHERE v.voter_id = $1
            `;
            const { rows } = await pool.query(query, [userId]);
            return rows[0];
        }
        // لو candidate
        else {
            const query = `
                SELECT 
                    cr.full_name,
                    cr.username        AS v_code,
                    c.national_id,
                    cr.governorate,
                    cr.administrative_unit,
                    c.has_voted
                FROM candidates c
                JOIN civil_registry cr ON TRIM(c.national_id) = TRIM(cr.national_id)
                WHERE c.candidate_id = $1
            `;
            const { rows } = await pool.query(query, [userId]);
            return rows[0];
        }
    }
};

module.exports = Vote;