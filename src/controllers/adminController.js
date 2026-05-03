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