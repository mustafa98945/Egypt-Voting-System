const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { pool, queryWithRetry } = require('../config/db');

// --- 1. Login ---
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "يرجى إدخال البيانات"
            });
        }

        const { rows } = await queryWithRetry(
            'SELECT * FROM admins WHERE email = $1',
            [email]
        );
        const admin = rows[0];

        if (!admin) {
            return res.status(404).json({
                success: false,
                message: "الحساب غير موجود"
            });
        }

        const isMatch = await bcrypt.compare(password, admin.password);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: "كلمة المرور غير صحيحة"
            });
        }

        // حساب وقت انتهاء التوكن (12 ساعة)
        const logoutTime = new Date();
        logoutTime.setHours(logoutTime.getHours() + 12);
        const logoutTimeStr = logoutTime.toTimeString().split(' ')[0];

        // التحقق من وجود session لنفس اليوم
        const { rows: existingSession } = await queryWithRetry(
            `SELECT session_id FROM admin_sessions
             WHERE admin_id = $1
             AND session_date = CURRENT_DATE`,
            [admin.admin_id]
        );

        if (existingSession.length > 0) {
            // عمل login قبل كده النهارده → UPDATE
            await queryWithRetry(
                `UPDATE admin_sessions
                 SET login_time = CURRENT_TIME,
                     logout_time = $1::time
                 WHERE admin_id = $2
                 AND session_date = CURRENT_DATE`,
                [logoutTimeStr, admin.admin_id]
            );
        } else {
            // أول login النهارده → INSERT
            await queryWithRetry(
                `INSERT INTO admin_sessions 
                 (admin_id, email, login_time, logout_time, session_date)
                 VALUES ($1, $2, CURRENT_TIME, $3::time, CURRENT_DATE)`,
                [admin.admin_id, admin.email, logoutTimeStr]
            );
        }

        const token = jwt.sign(
            {
                id: admin.admin_id,
                email: admin.email,
                role: 'admin'
            },
            process.env.JWT_SECRET,
            { expiresIn: '12h' }
        );

        res.json({
            success: true,
            token,
            admin_data: {
                id: admin.admin_id,
                email: admin.email,
                role: 'admin'
            }
        });

    } catch (err) {
        console.error("Admin Login Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// --- 2. Logout ---
exports.logout = async (req, res) => {
    try {
        await queryWithRetry(
            `UPDATE admin_sessions 
             SET logout_time = CURRENT_TIME
             WHERE admin_id = $1
             AND session_date = CURRENT_DATE`,
            [req.user.id]
        );

        res.json({
            success: true,
            message: "تم تسجيل الخروج بنجاح"
        });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// --- 3. Add Admin ---
exports.addAdmin = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "يرجى إدخال البيانات"
            });
        }

        const { rows: existing } = await queryWithRetry(
            'SELECT 1 FROM admins WHERE email = $1',
            [email]
        );
        if (existing.length > 0) {
            return res.status(400).json({
                success: false,
                message: "البريد الإلكتروني مسجل مسبقاً"
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const { rows } = await queryWithRetry(
            `INSERT INTO admins (email, password)
             VALUES ($1, $2)
             RETURNING admin_id, email, created_at`,
            [email, hashedPassword]
        );

        res.status(201).json({
            success: true,
            message: "تم إضافة الأدمن بنجاح",
            data: rows[0]
        });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// --- 4. Get All Admins ---
exports.getAllAdmins = async (req, res) => {
    try {
        const { rows } = await queryWithRetry(
            `SELECT DISTINCT ON (a.admin_id)
                a.admin_id,
                a.email,
                s.login_time  AS "from",
                s.logout_time AS "to",
                s.session_date AS "date"
             FROM admins a
             LEFT JOIN admin_sessions s 
               ON a.admin_id = s.admin_id
             ORDER BY a.admin_id, s.session_date DESC, s.login_time DESC`
        );

        res.json({
            success: true,
            count: rows.length,
            data: rows
        });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// --- 5. Delete Admin ---
exports.deleteAdmin = async (req, res) => {
    try {
        const { id } = req.params;

        if (parseInt(id) === req.user.id) {
            return res.status(400).json({
                success: false,
                message: "لا يمكنك حذف حسابك الخاص"
            });
        }

        await queryWithRetry(
            'DELETE FROM admins WHERE admin_id = $1',
            [id]
        );

        res.json({
            success: true,
            message: "تم حذف الأدمن بنجاح"
        });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// --- 6. Edit Admin ---
exports.editAdmin = async (req, res) => {
    try {
        const { id } = req.params;
        const { email, password } = req.body;

        // التحقق من وجود الـ Admin
        const { rows: existing } = await queryWithRetry(
            'SELECT * FROM admins WHERE admin_id = $1',
            [id]
        );
        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: "الأدمن غير موجود"
            });
        }

        // لو في باسورد جديد → هاشه
        let hashedPassword = existing[0].password;
        if (password) {
            hashedPassword = await bcrypt.hash(password, 10);
        }

        const { rows } = await queryWithRetry(
            `UPDATE admins 
             SET email = COALESCE($1, email),
                 password = $2
             WHERE admin_id = $3
             RETURNING admin_id, email`,
            [email, hashedPassword, id]
        );

        res.json({
            success: true,
            message: "تم تعديل الأدمن بنجاح",
            data: rows[0]
        });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// --- جلب المرشحين المنتظرين ---
exports.getPendingCandidates = async (req, res) => {
    try {
        const { rows } = await queryWithRetry(
            `SELECT 
                c.candidate_id,
                c.email,
                c.candidate_type,
                c.personal_photos_url,
                c.is_approved,
                cr.full_name
             FROM candidates c
             LEFT JOIN civil_registry cr 
               ON TRIM(c.national_id) = TRIM(cr.national_id)
             WHERE c.is_approved IS NULL
             ORDER BY c.created_at DESC`
        );

        res.json({
            success: true,
            count: rows.length,
            data: rows
        });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// --- جلب تفاصيل مرشح كامل ---
exports.getCandidateDetails = async (req, res) => {
    try {
        const { id } = req.params;

        const { rows } = await queryWithRetry(
            `SELECT 
                c.candidate_id,
                c.email,
                c.password,
                c.phone_number,
                c.occupation,
                c.candidate_type,
                c.short_bio,
                c.election_symbol_url,
                c.financial_disclosure_url,
                c.personal_photos_url,
                c.fitness_health_url,
                c.deposit_receipt_url,
                c.is_approved,
                c.created_at,
                cr.full_name,
                cr.national_id,
                cr.birth_date,
                cr.username,
                cr.governorate,
                cr.address,
                cr.administrative_unit,
                cr.degree,
                cr.age,
                cr.gender,
                cr.military_service_url,
                cr.education_qualification_url,
                cr.birth_certificate_url,
                cr.criminal_record_url,
                cr.national_id_front_url,
                cr.national_id_back_url
             FROM candidates c
             LEFT JOIN civil_registry cr 
               ON TRIM(c.national_id) = TRIM(cr.national_id)
             WHERE c.candidate_id = $1`,
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "المرشح غير موجود"
            });
        }

        res.json({
            success: true,
            data: rows[0]
        });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// --- قبول أو رفض مرشح ---
exports.decideCandidateApproval = async (req, res) => {
    try {
        const { id } = req.params;
        const { decision } = req.body;

        if (!decision || !['accepted', 'refused'].includes(decision)) {
            return res.status(400).json({
                success: false,
                message: "يرجى إدخال القرار: accepted أو refused"
            });
        }

        const isApproved = decision === 'accepted';

        const { rows } = await queryWithRetry(
            `UPDATE candidates 
             SET is_approved = $1
             WHERE candidate_id = $2
             RETURNING candidate_id, email, is_approved`,
            [isApproved, id]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "المرشح غير موجود"
            });
        }

        res.json({
            success: true,
            message: decision === 'accepted' 
                ? "تم قبول المرشح بنجاح" 
                : "تم رفض المرشح",
            data: rows[0]
        });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// في adminController.js أضف:
exports.getAcceptedCandidates = async (req, res) => {
    try {
        const { rows } = await queryWithRetry(
            `SELECT 
                c.candidate_id,
                c.candidate_type,
                c.personal_photos_url,
                cr.full_name
             FROM candidates c
             LEFT JOIN civil_registry cr 
               ON TRIM(c.national_id) = TRIM(cr.national_id)
             WHERE c.is_approved = TRUE
             ORDER BY c.created_at DESC`
        );

        res.json({
            success: true,
            count: rows.length,
            data: rows
        });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.deleteCandidate = async (req, res) => {
    try {
        const { id } = req.params;

        await queryWithRetry(
            'DELETE FROM candidates WHERE candidate_id = $1',
            [id]
        );

        res.json({
            success: true,
            message: "تم حذف المرشح بنجاح"
        });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.getDashboardStats = async (req, res) => {
    try {
        const { rows } = await queryWithRetry(
            `SELECT 
                (SELECT COUNT(*) FROM voters) AS total_voters,
                (SELECT COUNT(*) FROM candidates WHERE is_approved = TRUE) AS total_candidates,
                (SELECT COUNT(*) FROM votes) AS total_voted,
                (SELECT COUNT(*) FROM voters WHERE has_voted = TRUE) +
                (SELECT COUNT(*) FROM candidates WHERE has_voted = TRUE) AS total_completed
             `
        );

        res.json({
            success: true,
            data: {
                voters: rows[0].total_voters,
                candidates: rows[0].total_candidates,
                completed: rows[0].total_completed,
                total_votes: rows[0].total_voted
            }
        });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.getElectoralDistricts = async (req, res) => {
    try {
        const { rows } = await queryWithRetry(
            `SELECT 
                ed.district_id,
                ed.district_name,
                ed.governorate,
                ed.district_code,

                -- ✅ عدد المواطنين 18+ من السجل المدني
                (
                    SELECT COUNT(*)
                    FROM civil_registry cr
                    WHERE TRIM(cr.administrative_unit) = TRIM(ed.district_name)
                    AND DATE_PART('year', AGE(CURRENT_DATE, cr.birth_date)) >= 18
                ) AS register_voter_count

             FROM electoral_districts ed
             ORDER BY ed.district_name ASC`
        );

        res.json({
            success: true,
            count: rows.length,
            data: rows
        });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// --- جلب كل الأحزاب ---
exports.getAllParties = async (req, res) => {
    try {
        const { rows } = await queryWithRetry(
            `SELECT * FROM political_parties 
             ORDER BY party_number ASC`
        );

        res.json({
            success: true,
            count: rows.length,
            data: rows
        });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// --- إضافة حزب ---
exports.addParty = async (req, res) => {
    try {
        const { 
            party_name, leader_name, ideology, 
            found_date, symbol, governorate, party_number 
        } = req.body;

        if (!party_name || !leader_name) {
            return res.status(400).json({
                success: false,
                message: "اسم الحزب واسم الزعيم مطلوبان"
            });
        }

        const { rows } = await queryWithRetry(
            `INSERT INTO political_parties 
             (party_name, leader_name, ideology, found_date, symbol, governorate, party_number)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [party_name, leader_name, ideology, found_date, symbol, governorate, party_number]
        );

        res.status(201).json({
            success: true,
            message: "تم إضافة الحزب بنجاح",
            data: rows[0]
        });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// --- تعديل حزب ---
exports.editParty = async (req, res) => {
    try {
        const { id } = req.params;
        const { 
            party_name, leader_name, ideology, 
            found_date, symbol, governorate, party_number 
        } = req.body;

        const { rows } = await queryWithRetry(
            `UPDATE political_parties SET
                party_name   = COALESCE($1, party_name),
                leader_name  = COALESCE($2, leader_name),
                ideology     = COALESCE($3, ideology),
                found_date   = COALESCE($4, found_date),
                symbol       = COALESCE($5, symbol),
                governorate  = COALESCE($6, governorate),
                party_number = COALESCE($7, party_number)
             WHERE party_id = $8
             RETURNING *`,
            [party_name, leader_name, ideology, found_date, symbol, governorate, party_number, id]
        );

        res.json({
            success: true,
            message: "تم تعديل الحزب بنجاح",
            data: rows[0]
        });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// --- حذف حزب ---
exports.deleteParty = async (req, res) => {
    try {
        const { id } = req.params;

        await queryWithRetry(
            'DELETE FROM political_parties WHERE party_id = $1',
            [id]
        );

        res.json({
            success: true,
            message: "تم حذف الحزب بنجاح"
        });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// --- 1. نتايج الانتخابات للـ Admin ---
exports.getElectionResults = async (req, res) => {
    try {
        // جلب آخر انتخابات
        const { rows: electionRows } = await queryWithRetry(
            `SELECT * FROM elections 
             ORDER BY created_at DESC 
             LIMIT 1`
        );

        if (electionRows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "لا توجد انتخابات"
            });
        }

        const election = electionRows[0];

        // جلب النتايج مرتبة من الأعلى تصويتاً
        const { rows } = await queryWithRetry(
            `SELECT 
                c.candidate_id,
                cr.full_name,
                c.personal_photos_url,
                c.candidate_type,
                COUNT(v.vote_id)::INT AS total_votes
             FROM candidates c
             LEFT JOIN civil_registry cr 
               ON TRIM(c.national_id) = TRIM(cr.national_id)
             LEFT JOIN votes v 
               ON c.candidate_id = v.candidate_id
             WHERE c.is_approved = TRUE
             GROUP BY 
                c.candidate_id, cr.full_name, 
                c.personal_photos_url, c.candidate_type
             ORDER BY total_votes DESC`
        );

        res.json({
            success: true,
            election: {
                id: election.election_id,
                name: election.election_name,
                start_date: election.start_date,
                end_date: election.end_date,
                result_status: election.result_status
            },
            data: rows
        });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// --- 2. اعتماد أو إبطال النتيجة ---
exports.decideElectionGroup = async (req, res) => {
    try {
        const { decision } = req.body;

        if (!decision || !['approved', 'refused'].includes(decision)) {
            return res.status(400).json({
                success: false,
                message: "يرجى إدخال القرار: approved أو refused"
            });
        }

        // ✅ هات آخر group مفتوح
        const { rows: groupRows } = await pool.query(
            `SELECT group_id
             FROM election_groups
             WHERE is_closed = FALSE
             ORDER BY created_at DESC
             LIMIT 1`
        );

        if (groupRows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "لا توجد دورة انتخابية مفتوحة حالياً"
            });
        }

        const groupId = groupRows[0].group_id;

        // ✅ حدّث كل الانتخابات داخل الجروب
        await pool.query(
            `UPDATE elections
             SET result_status = $1
             WHERE election_group_id = $2`,
            [decision, groupId]
        );

        // ✅ اقفل الجروب
        await pool.query(
            `UPDATE election_groups
             SET is_closed = TRUE
             WHERE group_id = $1`,
            [groupId]
        );

        res.json({
            success: true,
            message:
                decision === 'approved'
                    ? "تم اعتماد نتيجة الدورة الانتخابية ✅"
                    : "تم رفض الدورة الانتخابية ❌ ويمكن بدء دورة جديدة"
        });

    } catch (err) {
        console.error("Decision Error:", err.message);
        res.status(500).json({
            success: false,
            message: "حدث خطأ أثناء تحديث حالة الدورة"
        });
    }
};
exports.getVotesData = async (req, res) => {
    try {
        const { rows } = await queryWithRetry(
            `SELECT 
                v.vote_id AS v_code,
                v.created_at::TIME       AS time,
                v.created_at::DATE       AS data,
                COALESCE(
                    cr_voter.national_id, 
                    cr_candidate_voter.national_id
                ) AS v_national_id,
                COALESCE(
                    cr_voter.full_name, 
                    cr_candidate_voter.full_name
                ) AS voter_name,
                e.election_name          AS election_name,
                cr_candidate.national_id AS c_national_id,
                cr_candidate.full_name   AS candidate_name
             FROM votes v
             -- لو voter
             LEFT JOIN voters vt 
               ON v.voter_id = vt.voter_id 
               AND v.voter_role = 'voter'
             LEFT JOIN civil_registry cr_voter 
               ON TRIM(vt.national_id) = TRIM(cr_voter.national_id)
             -- لو candidate بيصوت
             LEFT JOIN candidates cd_voter
               ON v.voter_id = cd_voter.candidate_id 
               AND v.voter_role = 'candidate'
             LEFT JOIN civil_registry cr_candidate_voter 
               ON TRIM(cd_voter.national_id) = TRIM(cr_candidate_voter.national_id)
             -- بيانات المرشح المصوت له
             LEFT JOIN candidates c 
               ON v.candidate_id = c.candidate_id
             LEFT JOIN civil_registry cr_candidate 
               ON TRIM(c.national_id) = TRIM(cr_candidate.national_id)
             -- بيانات الانتخابات
             LEFT JOIN elections e 
               ON e.election_id = (
                   SELECT election_id FROM elections 
                   ORDER BY created_at DESC LIMIT 1
               )
             WHERE cr_candidate.national_id IS NOT NULL
             AND COALESCE(
                 cr_voter.national_id, 
                 cr_candidate_voter.national_id
             ) IS NOT NULL
             ORDER BY v.created_at DESC`
        );

        res.json({
            success: true,
            count: rows.length,
            data: rows
        });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.getVotersStatus = async (req, res) => {
    try {
        const { rows } = await queryWithRetry(
            `-- Voters
             SELECT 
                ROW_NUMBER() OVER (ORDER BY vt.voter_id) AS voter_number,
                vt.national_id                           AS v_national_id,
                cr_voter.full_name                       AS v_name,
                'voter'                                  AS role,
                CASE 
                    WHEN vt.has_voted = TRUE THEN cr_candidate.full_name
                    ELSE 'Has Not Voted Yet'
                END AS voted_for,
                CASE 
                    WHEN vt.has_voted = TRUE THEN 'Voted'
                    ELSE 'Not Voted Yet'
                END AS status
             FROM voters vt
             LEFT JOIN civil_registry cr_voter 
               ON TRIM(vt.national_id) = TRIM(cr_voter.national_id)
             LEFT JOIN votes v 
               ON vt.voter_id = v.voter_id
             LEFT JOIN candidates c 
               ON v.candidate_id = c.candidate_id
             LEFT JOIN civil_registry cr_candidate 
               ON TRIM(c.national_id) = TRIM(cr_candidate.national_id)

             UNION ALL

             -- Candidates
             SELECT 
                ROW_NUMBER() OVER (ORDER BY cd.candidate_id) AS voter_number,
                cd.national_id                               AS v_national_id,
                cr_candidate.full_name                       AS v_name,
                'candidate'                                  AS role,
                CASE 
                    WHEN cd.has_voted = TRUE THEN cr_voted_for.full_name
                    ELSE 'Has Not Voted Yet'
                END AS voted_for,
                CASE 
                    WHEN cd.has_voted = TRUE THEN 'Voted'
                    ELSE 'Not Voted Yet'
                END AS status
             FROM candidates cd
             LEFT JOIN civil_registry cr_candidate 
               ON TRIM(cd.national_id) = TRIM(cr_candidate.national_id)
             LEFT JOIN votes v 
               ON cd.candidate_id = v.candidate_id 
               AND v.voter_role = 'candidate'
             LEFT JOIN candidates c_voted 
               ON v.candidate_id = c_voted.candidate_id
             LEFT JOIN civil_registry cr_voted_for 
               ON TRIM(c_voted.national_id) = TRIM(cr_voted_for.national_id)
             WHERE cd.is_approved = TRUE

             ORDER BY role, voter_number ASC`
        );

        res.json({
            success: true,
            count: rows.length,
            data: rows
        });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};