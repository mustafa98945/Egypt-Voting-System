const pool = require('../config/db');

const Vote = {
    // التأكد من حالة تصويت المستخدم (مرشح أو ناخب)
    checkIfVoted: async (tableName, idColumn, userId) => {
        const result = await pool.query(
            `SELECT has_voted FROM ${tableName} WHERE ${idColumn} = $1`, 
            [userId]
        );
        return result.rows[0];
    },

    // تنفيذ عملية التصويت كـ Transaction
    executeVote: async (userRole, userId, candidateId, tableName, idColumn) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // 1. تسجيل الصوت
            await client.query(
                'INSERT INTO votes (voter_id, voter_role, candidate_id, created_at) VALUES ($1, $2, $3, NOW())',
                [userId, userRole, candidateId]
            );

            // 2. تحديث حالة المستخدم
            await client.query(
                `UPDATE ${tableName} SET has_voted = TRUE WHERE ${idColumn} = $1`,
                [userId]
            );

            await client.query('COMMIT');
            return { success: true };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }
};

module.exports = Vote;