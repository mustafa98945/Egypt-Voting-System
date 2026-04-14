const pool = require('../config/db');

const Vote = {
    /**
     * التأكد من حالة تصويت المستخدم (ناخب أو مرشح)
     * @returns {Object|null} نرجع null لو المستخدم غير موجود لضمان دقة الـ Controller
     */
    checkIfVoted: async (tableName, idColumn, userId) => {
        const query = `SELECT has_voted FROM ${tableName} WHERE ${idColumn} = $1`;
        const result = await pool.query(query, [userId]);
        
        return result.rows.length > 0 ? result.rows[0] : null;
    },

    /**
     * تنفيذ عملية التصويت كـ Transaction
     * تضمن تسجيل الصوت في جدول votes وتحديث حالة has_voted في الجدول الأصلي
     */
    executeVote: async (userRole, userId, candidateId, tableName, idColumn) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // 1. تسجيل عملية التصويت
            // أضفنا voter_role عشان نعرف لو اللي صوت ده مرشح ولا ناخب (إحصائيات أدق)
            const insertQuery = `
                INSERT INTO votes (voter_id, candidate_id, voter_role, created_at) 
                VALUES ($1, $2, $3, NOW())
            `;
            await client.query(insertQuery, [userId, candidateId, userRole]);

            // 2. تحديث حالة المستخدم في جدوله (سواء كان candidates أو voters)
            const updateQuery = `
                UPDATE ${tableName} 
                SET has_voted = TRUE 
                WHERE ${idColumn} = $1
            `;
            const updateResult = await client.query(updateQuery, [userId]);

            // تأمين إضافي: لو مفيش صفوف اتحدثت (المعرف غير صحيح)، نلغي العملية فوراً
            if (updateResult.rowCount === 0) {
                throw new Error("فشل تحديث حالة المستخدم - المعرف غير موجود في جدول " + tableName);
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