const Vote = require('../models/voteModel');
const { pool } = require('../config/db');

// --- 1. تنفيذ التصويت ---
exports.castVote = async (req, res) => {
    try {
        const { id, role, governorate } = req.user;
        const { candidate_id } = req.body;

        if (!candidate_id) {
            return res.status(400).json({
                success: false,
                message: "يرجى اختيار مرشح للتصويت له"
            });
        }

        // ✅ 1. التحقق من وجود انتخابات نشطة بالساعة
        const { rows: electionRows } = await pool.query(
            `SELECT election_id
             FROM elections
             WHERE is_active = TRUE
             AND TRIM(governorate) = TRIM($1)
             AND CURRENT_TIMESTAMP >= start_date
             AND CURRENT_TIMESTAMP <= end_date
             ORDER BY created_at DESC
             LIMIT 1`,
            [governorate]
        );

        if (electionRows.length === 0) {
            return res.status(403).json({
                success: false,
                message: "لا توجد انتخابات نشطة حالياً"
            });
        }

        const electionId = electionRows[0].election_id;

        const tableName = role === 'candidate' ? 'candidates' : 'voters';
        const idColumn = role === 'candidate' ? 'candidate_id' : 'voter_id';

        // ✅ 2. التحقق من التصويت المسبق
        const status = await Vote.checkIfVoted(tableName, idColumn, id);
        if (status && status.has_voted) {
            return res.status(400).json({
                success: false,
                message: "عذراً، لقد قمت بالتصويت بالفعل سابقاً"
            });
        }

        // ✅ 3. تنفيذ التصويت (مع تمرير electionId)
        await Vote.executeVote(
            role,
            id,
            candidate_id,
            tableName,
            idColumn,
            electionId   // ✅ أضفناها هنا
        );

        // ✅ 4. جلب بيانات الـ Vote Card
        const voteCard = await Vote.getVoteCard(id, role);

        res.status(200).json({
            success: true,
            message: "تم تسجيل صوتك بنجاح! شكراً لمشاركتك.",
            vote_card: voteCard
        });

    } catch (err) {
        console.error("Cast Vote Error:", err.message);
        res.status(500).json({
            success: false,
            message: "حدث خطأ داخلي أثناء تسجيل الصوت"
        });
    }
};
// --- 2. التحقق من حالة التصويت ---
exports.checkUserVotingStatus = async (req, res) => {
    try {
        const { id, role } = req.user;
        const tableName = role === 'candidate' ? 'candidates' : 'voters';
        const idColumn = role === 'candidate' ? 'candidate_id' : 'voter_id';

        const status = await Vote.checkIfVoted(tableName, idColumn, id);

        res.status(200).json({
            success: true,
            hasVoted: status ? status.has_voted : false
        });
    } catch (err) {
        console.error("Check Status Error:", err.message);
        res.status(500).json({ success: false, message: "خطأ في جلب حالة التصويت" });
    }
};

// --- 3. جلب الـ Vote Card بعد التصويت ---
exports.getVoteCard = async (req, res) => {
    try {
        const { id, role } = req.user;
        const voteCard = await Vote.getVoteCard(id, role);

        if (!voteCard) {
            return res.status(404).json({
                success: false, message: "لم يتم التصويت بعد"
            });
        }

        res.json({ success: true, vote_card: voteCard });
    } catch (err) {
        console.error("Vote Card Error:", err.message);
        res.status(500).json({ success: false, message: "خطأ في جلب بيانات الكارت" });
    }
};

// --- 4. نتائج الانتخابات (كل المرشحين بأصواتهم وصورهم) ---
 exports.getResults = async (req, res) => {
    try {

        ////////////////////////////////////////////////////////////
        // ✅ 1️⃣ هات آخر دورة انتخابية approved
        ////////////////////////////////////////////////////////////
        const { rows: groupRows } = await pool.query(
            `SELECT eg.group_id
             FROM election_groups eg
             JOIN elections e 
               ON e.election_group_id = eg.group_id
             WHERE e.result_status = 'approved'
             ORDER BY eg.created_at DESC
             LIMIT 1`
        );

        if (groupRows.length === 0) {
            return res.status(403).json({
                success: false,
                message: "النتائج قيد المراجعة من قِبل اللجنة الانتخابية"
            });
        }

        const groupId = groupRows[0].group_id;

        ////////////////////////////////////////////////////////////
        // ✅ 2️⃣ إجمالي عدد الأصوات في الدورة
        ////////////////////////////////////////////////////////////
        const { rows: totalVotesRows } = await pool.query(
            `SELECT COUNT(v.vote_id)::INT AS total_votes
             FROM votes v
             JOIN elections e 
               ON v.election_id = e.election_id
             WHERE e.election_group_id = $1`,
            [groupId]
        );

        const totalVotes = totalVotesRows[0]?.total_votes || 0;

        ////////////////////////////////////////////////////////////
        // ✅ 3️⃣ عدد المرشحين المعتمدين
        ////////////////////////////////////////////////////////////
        const { rows: candidatesCountRows } = await pool.query(
            `SELECT COUNT(*)::INT AS total_candidates
             FROM candidates
             WHERE is_approved = TRUE`
        );

        const totalCandidates = candidatesCountRows[0]?.total_candidates || 0;

        ////////////////////////////////////////////////////////////
        // ✅ 4️⃣ النتائج مجمعة + نسبة التصويت (التعديل الصحيح هنا)
        ////////////////////////////////////////////////////////////
        const { rows } = await pool.query(
            `SELECT 
                c.candidate_id,
                cr.full_name,
                c.personal_photos_url,
                c.candidate_type,
                c.election_symbol_url,
                cr.administrative_unit,
                cr.governorate,
                COUNT(v.vote_id)::INT AS total_votes,
                CASE 
                    WHEN $2 = 0 THEN 0
                    ELSE ROUND((COUNT(v.vote_id) * 100.0) / $2, 2)
                END AS percentage
            FROM candidates c
            LEFT JOIN civil_registry cr 
              ON TRIM(c.national_id) = TRIM(cr.national_id)
            LEFT JOIN votes v 
              ON c.candidate_id = v.candidate_id
            LEFT JOIN elections e 
              ON v.election_id = e.election_id
              AND e.election_group_id = $1   -- ✅ اتحرك الشرط هنا
            WHERE 
                c.is_approved = TRUE
            GROUP BY 
                c.candidate_id, 
                cr.full_name, 
                c.personal_photos_url,
                c.candidate_type, 
                c.election_symbol_url,
                cr.administrative_unit, 
                cr.governorate
            ORDER BY total_votes DESC`,
            [groupId, totalVotes]
        );

        ////////////////////////////////////////////////////////////
        // ✅ 5️⃣ تحديد الفائز
        ////////////////////////////////////////////////////////////
        const winner = rows.length > 0 ? rows[0] : null;

        ////////////////////////////////////////////////////////////
        // ✅ 6️⃣ Response النهائي
        ////////////////////////////////////////////////////////////
        return res.json({
            success: true,
            group_id: groupId,
            summary: {
                total_votes: totalVotes,
                total_candidates: totalCandidates,
                winner: winner ? {
                    candidate_id: winner.candidate_id,
                    full_name: winner.full_name,
                    total_votes: winner.total_votes,
                    percentage: winner.percentage
                } : null
            },
            data: rows
        });

    } catch (err) {
        console.error("Results Error:", err.message);
        return res.status(500).json({
            success: false,
            message: "خطأ في جلب النتائج"
        });
    }
};