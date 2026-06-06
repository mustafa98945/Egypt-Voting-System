const { pool } = require('../config/db');

const Vote = {

    /**
     * 1️⃣ التحقق من حالة التصويت لانتخابات معينة (بواسطة ID الانتخابات)
     */
    checkIfVoted: async (userId, userRole, electionId) => {
        const { rows } = await pool.query(
            `SELECT vote_id 
             FROM votes 
             WHERE voter_id    = $1 
             AND   voter_role  = $2 
             AND   election_id = $3
             LIMIT 1`,
            [userId, userRole, electionId]
        );
        return rows.length > 0 ? rows[0] : null;
    },

    /**
     * 2️⃣ تنفيذ عملية التصويت
     * تعتمد كلياً على جدول votes ولا تحدث جداول أخرى
     */
    executeVote: async (userId, userRole, candidateId, electionId) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // ✅ التأكد المزدوج (Double Check) داخل Transaction لمنع Race Condition
            const { rows: existing } = await client.query(
                `SELECT vote_id FROM votes 
                 WHERE voter_id = $1 AND voter_role = $2 AND election_id = $3
                 FOR UPDATE`, // قفل السجل لضمان عدم حدوث تصويت مزدوج في نفس اللحظة
                [userId, userRole, electionId]
            );

            if (existing.length > 0) {
                await client.query('ROLLBACK');
                return { success: false, alreadyVoted: true };
            }

            // ✅ الإدراج في جدول votes مع إضافة تاريخ العملية
            const { rows: voteRows } = await client.query(
                `INSERT INTO votes (voter_id, voter_role, candidate_id, election_id, created_at)
                 VALUES ($1, $2, $3, $4, NOW())
                 RETURNING vote_id`,
                [userId, userRole, candidateId, electionId]
            );

            await client.query('COMMIT');
            
            return { 
                success: true, 
                alreadyVoted: false,
                vote_id: voteRows[0].vote_id
            };

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    },

    /**
     * 3️⃣ جلب بيانات بطاقة التصويت (Vote Card)
     */
    getVoteCard: async (userId, role) => {
        const query = `
            SELECT 
                cr.full_name           AS "Name",
                vt.vote_id             AS "V_code",
                cr.national_id         AS "National_ID",
                cr.governorate         AS "Government",
                cr.administrative_unit AS "Administrative_Unit",
                vt.created_at          AS "Vote_Date"
            FROM votes vt
            JOIN civil_registry cr ON (
                CASE 
                    WHEN vt.voter_role = 'voter' THEN (
                        SELECT national_id FROM voters WHERE voter_id = vt.voter_id
                    )
                    ELSE (
                        SELECT national_id FROM candidates WHERE candidate_id = vt.voter_id
                    )
                END = TRIM(cr.national_id)
            )
            WHERE vt.voter_id   = $1
            AND   vt.voter_role = $2
            ORDER BY vt.created_at DESC
            LIMIT 1
        `;
        const { rows } = await pool.query(query, [userId, role]);
        return rows[0] || null;
    },

    /**
     * 4️⃣ جلب الانتخابات النشطة حالياً للمحافظة
     */
    getActiveElection: async (governorate) => {
        const { rows } = await pool.query(
            `SELECT e.election_id
             FROM elections e
             JOIN election_groups eg ON e.election_group_id = eg.group_id
             WHERE eg.is_closed = FALSE
             AND   TRIM(e.governorate) = TRIM($1)
             AND   CURRENT_TIMESTAMP BETWEEN e.start_date AND e.end_date
             ORDER BY e.created_at DESC
             LIMIT 1`,
            [governorate]
        );
        return rows.length > 0 ? rows[0] : null;
    },

    /**
     * 5️⃣ التحقق من حالة التصويت حسب المحافظة
     * تم تعديل المنطق ليفحص أحدث مجموعة انتخابات مرتبطة بمحافظة المستخدم
     */
    checkIfVotedByGovernorate: async (userId, userRole, governorate) => {
        const { rows } = await pool.query(
            `SELECT v.vote_id
             FROM votes v
             JOIN elections e ON v.election_id = e.election_id
             WHERE v.voter_id   = $1
             AND   v.voter_role = $2
             AND   TRIM(e.governorate) = TRIM($3)
             -- نربط الفحص بأحدث مجموعة انتخابات تم إنشاؤها لهذه المحافظة
             AND   e.election_group_id = (
                 SELECT eg.group_id 
                 FROM election_groups eg
                 JOIN elections e2 ON eg.group_id = e2.election_group_id
                 WHERE TRIM(e2.governorate) = TRIM($3)
                 ORDER BY eg.created_at DESC
                 LIMIT 1
             )
             LIMIT 1`,
            [userId, userRole, governorate]
        );
        return rows.length > 0 ? rows[0] : null;
    }
};

module.exports = Vote;