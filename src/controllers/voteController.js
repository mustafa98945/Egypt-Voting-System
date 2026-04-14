const pool = require('../config/db');

class Vote {
    // 1. التحقق من حالة المستخدم (هل صوت قبل كدة؟)
    static async checkIfVoted(tableName, idColumn, userId) {
        const query = `SELECT has_voted FROM ${tableName} WHERE ${idColumn} = $1`;
        const { rows } = await pool.query(query, [userId]);
        return rows[0]; // هيرجع { has_voted: true/false } أو undefined
    }

    // 2. تنفيذ عملية التصويت كـ Transaction واحدة
    static async executeVote(role, userId, candidateId, tableName, idColumn) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN'); // بداية الـ Transaction

            // أ- تسجيل العملية في جدول الـ votes (عشان الإحصائيات)
            const insertVoteQuery = `
                INSERT INTO votes (voter_id, candidate_id, voter_role) 
                VALUES ($1, $2, $3)
            `;
            await client.query(insertVoteQuery, [userId, candidateId, role]);

            // ب- تحديث حالة المستخدم ليكون "تم التصويت"
            const updateStatusQuery = `
                UPDATE ${tableName} 
                SET has_voted = TRUE 
                WHERE ${idColumn} = $1
            `;
            await client.query(updateStatusQuery, [userId]);

            await client.query('COMMIT'); // اعتماد كل التغييرات
        } catch (error) {
            await client.query('ROLLBACK'); // إلغاء كل شيء لو حصل خطأ في أي خطوة
            throw error;
        } finally {
            client.release(); // تحرير الاتصال بقاعدة البيانات
        }
    }
}

module.exports = Vote;