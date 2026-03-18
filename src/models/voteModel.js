const pool = require('../config/db');

const Vote = {
    /**
     * التأكد من حالة تصويت المستخدم (سواء كان مرشح أو ناخب)
     * @param {string} tableName - اسم الجدول (voters أو candidates)
     * @param {string} idColumn - اسم العمود (voter_id أو candidate_id)
     * @param {number} userId - معرف المستخدم
     */
    checkIfVoted: async (tableName, idColumn, userId) => {
        const result = await pool.query(
            `SELECT has_voted FROM ${tableName} WHERE ${idColumn} = $1`, 
            [userId]
        );
        return result.rows[0];
    },

    /**
     * تنفيذ عملية التصويت كـ Transaction لضمان سلامة البيانات
     * @param {string} userRole - دور المستخدم (voter أو candidate)
     * @param {number} userId - معرف الشخص القائم بالتصويت
     * @param {number} candidateId - معرف المرشح المختار
     * @param {string} tableName - الجدول المراد تحديثه
     * @param {string} idColumn - العمود المراد تحديثه
     */
    executeVote: async (userRole, userId, candidateId, tableName, idColumn) => {
        const client = await pool.connect();
        try {
            // بدء الـ Transaction
            await client.query('BEGIN');

            // 1. تسجيل عملية التصويت في جدول الـ votes
            await client.query(
                'INSERT INTO votes (voter_id, voter_role, candidate_id, created_at) VALUES ($1, $2, $3, NOW())',
                [userId, userRole, candidateId]
            );

            // 2. تحديث حالة المستخدم في جدوله الأصلي لمنعه من التصويت مرة أخرى
            await client.query(
                `UPDATE ${tableName} SET has_voted = TRUE WHERE ${idColumn} = $1`,
                [userId]
            );

            // تثبيت العملية في قاعدة البيانات
            await client.query('COMMIT');
            return { success: true };
        } catch (error) {
            // في حالة حدوث أي خطأ، يتم التراجع عن كل ما تم تنفيذه أعلاه
            await client.query('ROLLBACK');
            console.error("Database Transaction Error:", error.message);
            throw error;
        } finally {
            // تحرير العميل للعودة إلى الـ Pool
            client.release();
        }
    }
};

module.exports = Vote;