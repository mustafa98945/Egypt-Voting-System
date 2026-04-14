const pool = require('../config/db');

class Vote {
    /**
     * 1. التحقق من حالة المستخدم (ناخب أو مرشح)
     * @returns {Object|null} { has_voted: boolean } أو null لو المستخدم مش موجود
     */
    static async checkIfVoted(tableName, idColumn, userId) {
        const query = `SELECT has_voted FROM ${tableName} WHERE ${idColumn} = $1`;
        const { rows } = await pool.query(query, [userId]);
        
        // نرجع null لو الصف مش موجود أصلاً في الداتا بيز
        return rows.length > 0 ? rows[0] : null;
    }

    /**
     * 2. تنفيذ عملية التصويت كـ Transaction واحدة
     * تضمن تسجيل الصوت وتحديث حالة المستخدم في خطوة واحدة
     */
    static async executeVote(role, userId, candidateId, tableName, idColumn) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN'); // بداية الـ Transaction

            // أ- تسجيل العملية في جدول الـ votes
            // ملحوظة: تأكد أن جدول votes يحتوي على عمود voter_role
            const insertVoteQuery = `
                INSERT INTO votes (voter_id, candidate_id, voter_role, created_at) 
                VALUES ($1, $2, $3, NOW())
            `;
            await client.query(insertVoteQuery, [userId, candidateId, role]);

            // ب- تحديث حالة المستخدم (ناخب أو مرشح) ليكون "تم التصويت"
            const updateStatusQuery = `
                UPDATE ${tableName} 
                SET has_voted = TRUE 
                WHERE ${idColumn} = $1
            `;
            const updateResult = await client.query(updateStatusQuery, [userId]);

            // تأمين إضافي: لو مفيش صفوف اتحدثت (ID غلط مثلاً)، نلغي العملية
            if (updateResult.rowCount === 0) {
                throw new Error("فشل تحديث الحالة - المستخدم غير موجود");
            }

            await client.query('COMMIT'); // اعتماد كل التغييرات
            return { success: true };
            
        } catch (error) {
            await client.query('ROLLBACK'); // إلغاء كل شيء لو حصل أي خطأ
            console.error("Database Transaction Error:", error.message);
            throw error;
        } finally {
            client.release(); // تحرير الاتصال بقاعدة البيانات
        }
    }
}

module.exports = Vote;