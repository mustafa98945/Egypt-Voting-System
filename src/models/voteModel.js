const pool = require('../config/db');

const Vote = {
    /**
     * التأكد من حالة تصويت المستخدم
     */
    checkIfVoted: async (tableName, idColumn, userId) => {
        const result = await pool.query(
            `SELECT has_voted FROM ${tableName} WHERE ${idColumn} = $1`, 
            [userId]
        );
        // التعديل هنا: نرجع null لو المستخدم مش موجود أصلاً في الجدول
        return result.rows.length > 0 ? result.rows[0] : null;
    },

    /**
     * تنفيذ عملية التصويت كـ Transaction
     */
    executeVote: async (userRole, userId, candidateId, tableName, idColumn) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // 1. تسجيل عملية التصويت (مطابق لجدولك الحالي)
            await client.query(
                'INSERT INTO votes (voter_id, candidate_id, created_at) VALUES ($1, $2, NOW())',
                [userId, candidateId]
            );

            // 2. تحديث حالة المستخدم في جدوله (ناخب أو مرشح)
            const updateResult = await client.query(
                `UPDATE ${tableName} SET has_voted = TRUE WHERE ${idColumn} = $1`,
                [userId]
            );

            // تأمين إضافي: لو مفيش صفوف اتحدثت، نلغي العملية
            if (updateResult.rowCount === 0) {
                throw new Error("فشل تحديث حالة المستخدم - المعرف غير موجود");
            }

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