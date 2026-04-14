const pool = require('../config/db');

const Vote = {
    /**
     * التأكد من حالة تصويت المستخدم (ناخب أو مرشح)
     */
    checkIfVoted: async (tableName, idColumn, userId) => {
        // بنستخدم idColumn عشان لو الجدول voters يبقى voter_id ولو candidates يبقى candidate_id
        const query = `SELECT has_voted FROM ${tableName} WHERE ${idColumn} = $1`;
        const result = await pool.query(query, [userId]);
        
        return result.rows.length > 0 ? result.rows[0] : null;
    },

    /**
     * تنفيذ عملية التصويت كـ Transaction
     */
    executeVote: async (userRole, userId, candidateId, tableName, idColumn) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // 1. تسجيل عملية التصويت
            // ملاحظة: تأكد إن جدول votes في Supabase فيه عمود اسمه voter_role
            const insertQuery = `
                INSERT INTO votes (voter_id, candidate_id, voter_role, created_at) 
                VALUES ($1, $2, $3, NOW())
            `;
            await client.query(insertQuery, [userId, candidateId, userRole]);

            // 2. تحديث حالة المستخدم (has_voted = TRUE)
            const updateQuery = `
                UPDATE ${tableName} 
                SET has_voted = TRUE 
                WHERE ${idColumn} = $1
            `;
            const updateResult = await client.query(updateQuery, [userId]);

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