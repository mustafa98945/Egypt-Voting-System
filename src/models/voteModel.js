const pool = require('../config/db');

const Vote = {
    checkIfVoted: async (tableName, idColumn, userId) => {
        const result = await pool.query(
            `SELECT has_voted FROM ${tableName} WHERE ${idColumn} = $1`, 
            [userId]
        );
        return result.rows[0];
    },

    executeVote: async (userRole, userId, candidateId, tableName, idColumn) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // 1. تسجيل عملية التصويت (بدون عمود voter_role اللي بيعمل مشكلة)
            await client.query(
                'INSERT INTO votes (voter_id, candidate_id, created_at) VALUES ($1, $2, NOW())',
                [userId, candidateId]
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
            console.error("Database Transaction Error:", error.message);
            throw error;
        } finally {
            client.release();
        }
    }
};

module.exports = Vote;