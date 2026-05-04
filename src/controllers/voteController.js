const Vote = require('../models/voteModel');
const { pool } = require('../config/db');

// --- 1. تنفيذ التصويت ---
exports.castVote = async (req, res) => {
    try {
        const { id, role } = req.user;
        const { candidate_id } = req.body;

        if (!candidate_id) {
            return res.status(400).json({
                success: false, message: "يرجى اختيار مرشح للتصويت له"
            });
        }

        const tableName = role === 'candidate' ? 'candidates' : 'voters';
        const idColumn = role === 'candidate' ? 'candidate_id' : 'voter_id';

        // التحقق من التصويت المسبق
        const status = await Vote.checkIfVoted(tableName, idColumn, id);
        if (status && status.has_voted) {
            return res.status(400).json({
                success: false, message: "عذراً، لقد قمت بالتصويت بالفعل سابقاً"
            });
        }

        // تنفيذ التصويت
        await Vote.executeVote(role, id, candidate_id, tableName, idColumn);

        // جلب بيانات الـ Vote Card
        const voteCard = await Vote.getVoteCard(id, role);

        res.status(200).json({
            success: true,
            message: "تم تسجيل صوتك بنجاح! شكراً لمشاركتك.",
            vote_card: voteCard
        });

    } catch (err) {
        console.error("Cast Vote Error:", err.message);
        res.status(500).json({
            success: false, message: "حدث خطأ داخلي أثناء تسجيل الصوت"
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
        // ✅ التحقق من حالة الانتخابات الأول
        const { rows: electionRows } = await pool.query(
            `SELECT status FROM (
                SELECT 
                    CASE 
                        WHEN CURRENT_DATE < start_date THEN 'not_started'
                        WHEN CURRENT_DATE BETWEEN start_date AND end_date THEN 'active'
                        WHEN CURRENT_DATE > end_date THEN 'ended'
                    END AS status
                FROM elections
                WHERE is_active = TRUE
                ORDER BY created_at DESC
                LIMIT 1
            ) sub`
        );

        // لو مفيش انتخابات أو لسه مش خلصت
        if (electionRows.length === 0) {
            return res.status(403).json({
                success: false,
                message: "لا توجد انتخابات حالياً"
            });
        }

        if (electionRows[0].status !== 'ended') {
            return res.status(403).json({
                success: false,
                message: "النتائج ستظهر بعد انتهاء فترة التصويت"
            });
        }

        // ✅ لو الانتخابات خلصت → ارجع النتايج
        const userUnit = req.user.administrative_unit;

        const { rows } = await pool.query(
            `SELECT 
                c.candidate_id,
                cr.full_name,
                c.personal_photos_url,
                c.candidate_type,
                c.election_symbol_url,
                cr.administrative_unit,
                COUNT(v.vote_id)::INT AS total_votes
            FROM candidates c
            LEFT JOIN civil_registry cr ON TRIM(c.national_id) = TRIM(cr.national_id)
            LEFT JOIN votes v ON c.candidate_id = v.candidate_id
            WHERE TRIM(cr.administrative_unit) = TRIM($1)
            AND c.is_approved = TRUE
            GROUP BY 
                c.candidate_id, cr.full_name, c.personal_photos_url,
                c.candidate_type, c.election_symbol_url, cr.administrative_unit
            ORDER BY total_votes DESC`,
            [userUnit]
        );

        res.json({
            success: true,
            administrative_unit: userUnit,
            data: rows
        });

    } catch (err) {
        console.error("Results Error:", err.message);
        res.status(500).json({ 
            success: false, 
            message: "خطأ في جلب النتائج" 
        });
    }
};