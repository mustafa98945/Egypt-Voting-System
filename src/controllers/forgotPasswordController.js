const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const { queryWithRetry } = require('../config/db');

// ✅ Gmail Transporter (الإرسال الحقيقي)
const gmailTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// ✅ Mailtrap Transporter (نسخة احتياطية / تسجيل)
const mailtrapTransporter = nodemailer.createTransport({
    host: process.env.MAILTRAP_HOST,
    port: process.env.MAILTRAP_PORT,
    auth: {
        user: process.env.MAILTRAP_USER,
        pass: process.env.MAILTRAP_PASS
    }
});

// --- 1. إرسال OTP ---
exports.sendOTP = async (req, res) => {
    try {
        const { email, role } = req.body;

        if (!email || !role) {
            return res.status(400).json({
                success: false,
                message: "يرجى إدخال البريد الإلكتروني ونوع المستخدم"
            });
        }

        let user;

        if (role === 'voter') {
            const { rows } = await queryWithRetry(
                'SELECT * FROM voters WHERE email = $1',
                [email]
            );
            user = rows[0];
        } else if (role === 'candidate') {
            const { rows } = await queryWithRetry(
                'SELECT * FROM candidates WHERE email = $1',
                [email]
            );
            user = rows[0];
        } else {
            return res.status(400).json({
                success: false,
                message: "نوع المستخدم غير صحيح"
            });
        }

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "البريد الإلكتروني غير مسجل"
            });
        }

        // ✅ توليد OTP عشوائي
        const otp = Math.floor(1000 + Math.random() * 9000).toString();

        // ✅ وقت الانتهاء
        const expiresAt = new Date();
        expiresAt.setMinutes(expiresAt.getMinutes() + 10);

        // ✅ حفظ في DB
        await queryWithRetry(
            `INSERT INTO otp_codes (email, otp, expires_at)
             VALUES ($1, $2, $3)`,
            [email, otp, expiresAt]
        );

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Egypt Voting System - Reset Password',
            html: `
                <div style="font-family: Arial; text-align: center; padding: 20px;">
                    <h2 style="color: #2563EB;">Egypt Voting System</h2>
                    <p>Your verification code is:</p>
                    <h1 style="color: #2563EB; font-size: 48px; letter-spacing: 10px;">
                        ${otp}
                    </h1>
                    <p>This code expires in 10 minutes.</p>
                </div>
            `
        };

        // ✅ 1) ابعت نسخة على Mailtrap دايمًا
        try {
            await mailtrapTransporter.sendMail(mailOptions);
            console.log("✅ Mailtrap email sent");
        } catch (err) {
            console.log("⚠️ Mailtrap failed:", err.message);
        }

        // ✅ 2) حاول تبعت على Gmail
        try {
            await gmailTransporter.sendMail(mailOptions);
            console.log("✅ Gmail email sent");
        } catch (err) {
            console.log("❌ Gmail failed (likely fake email):", err.message);
        }

        res.json({
            success: true,
            message: "تم إرسال رمز التحقق"
        });

    } catch (err) {
        console.error("Send OTP Error:", err);
        res.status(500).json({
            success: false,
            message: "حدث خطأ أثناء إرسال الرمز"
        });
    }
};

// --- 2. التحقق من OTP ---
exports.verifyOTP = async (req, res) => {
    try {
        const { email, otp } = req.body;

        if (!email || !otp) {
            return res.status(400).json({
                success: false,
                message: "يرجى إدخال البريد الإلكتروني والرمز"
            });
        }

        const { rows } = await queryWithRetry(
            `SELECT * FROM otp_codes
             WHERE email = $1
             AND otp = $2
             AND is_used = FALSE
             AND expires_at > NOW()
             ORDER BY created_at DESC
             LIMIT 1`,
            [email, otp]
        );

        if (rows.length === 0) {
            return res.status(400).json({
                success: false,
                message: "الرمز غير صحيح أو منتهي الصلاحية"
            });
        }

        await queryWithRetry(
            'UPDATE otp_codes SET is_used = TRUE WHERE id = $1',
            [rows[0].id]
        );

        res.json({
            success: true,
            message: "تم التحقق بنجاح، يمكنك تغيير كلمة المرور"
        });

    } catch (err) {
        console.error("Verify OTP Error:", err);
        res.status(500).json({
            success: false,
            message: "حدث خطأ أثناء التحقق"
        });
    }
};

// --- 3. تغيير الباسورد ---
exports.resetPassword = async (req, res) => {
    try {
        const { email, password, confirm_password, role } = req.body;

        if (!email || !password || !confirm_password || !role) {
            return res.status(400).json({
                success: false,
                message: "يرجى إدخال جميع البيانات"
            });
        }

        if (password !== confirm_password) {
            return res.status(400).json({
                success: false,
                message: "كلمتا المرور غير متطابقتين"
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        if (role === 'voter') {
            await queryWithRetry(
                'UPDATE voters SET password = $1 WHERE email = $2',
                [hashedPassword, email]
            );
        } else if (role === 'candidate') {
            await queryWithRetry(
                'UPDATE candidates SET password = $1 WHERE email = $2',
                [hashedPassword, email]
            );
        }

        res.json({
            success: true,
            message: "تم تغيير كلمة المرور بنجاح"
        });

    } catch (err) {
        console.error("Reset Password Error:", err);
        res.status(500).json({
            success: false,
            message: "حدث خطأ أثناء تغيير كلمة المرور"
        });
    }
};