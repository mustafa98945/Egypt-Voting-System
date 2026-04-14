const pool = require('../config/db');

class Vote {
    /**
     * 1. التحقق من حالة المستخدم (ناخب أو مرشح)
     * @param {string} tableName - 'voters' أو 'candidates'
     * @param {string} idColumn - 'id' أو 'candidate_id'
     * @param {number|string} userId - معرف المستخدم من التوكن
     * @returns {Object|null} { has_voted: boolean } أو null لو المستخدم غير موجود
     */
    static async checkIfVoted(tableName, idColumn, userId) {
        try {
            const query = `SELECT has_voted FROM ${tableName} WHERE ${idColumn} = $1`;
            const { rows } = await pool.query(query, [userId]);
            
            // نرجع null لو الصف مش موجود أصلاً في الداتا بيز عشان الـ Controller يعرف يتصرف
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            console.error(`Error in checkIfVoted (${tableName}):`, error.message);
            throw error;
        }
    }

    /**
     * 2. تنفيذ عملية التصويت كـ Transaction واحدة
     * تضمن تسجيل الصوت في جدول votes وتحديث حالة المستخدم في خطوة واحدة لا تقبل التجزئة
     */
    static async executeVote(role, userId, candidateId, tableName, idColumn) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN'); // بداية الـ Transaction

            // أ- تسجيل العملية في جدول الـ votes
            // نستخدم NOW() لضمان دقة وقت التصويت من سيرفر الداتا بيز نفسه
            const insertVoteQuery = `
                INSERT INTO votes (voter_id, candidate_id, voter_role, created_at) 
                VALUES ($1, $2, $3, NOW())
            `;
            await client.query(insertVoteQuery, [userId, candidateId, role]);

            // ب- تحديث حالة المستخدم (ناخب أو مرشح) في جدوله الخاص
            const updateStatusQuery = `
                UPDATE ${tableName} 
                SET has_voted = TRUE 
                WHERE ${idColumn} = $1
            `;
            const updateResult = await client.query(updateStatusQuery, [userId]);

            // ج- تأمين إضافي: لو مفيش صفوف اتحدثت (المعرف غير موجود بالخطأ)، نلغي العملية فوراً
            if (updateResult.rowCount === 0) {
                throw new Error(`فشل تحديث الحالة - المستخدم غير موجود في جدول ${tableName}`);
            }

            await client.query('COMMIT'); // اعتماد التغييرات بشكل نهائي
            return { success: true };
            
        } catch (error) {
            await client.query('ROLLBACK'); // إلغاء كل العمليات السابقة لو حصل أي خطأ (أمان البيانات)
            console.error("Database Transaction Error:", error.message);
            throw error;
        } finally {
            client.release(); // تحرير الاتصال ليكون متاحاً لطلبات أخرى (Performance)
        }
    }
}

module.exports = Vote;