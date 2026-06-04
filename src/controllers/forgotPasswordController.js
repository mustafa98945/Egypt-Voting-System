const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const { queryWithRetry } = require('../config/db');

// ✅ Gmail Transporter
const gmailTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// ✅ Mailtrap Transporter
const mailtrapTransporter = nodemailer.createTransport({
    host: process.env.MAILTRAP_HOST,
    port: process.env.MAILTRAP_PORT,
    auth: {
        user: process.env.MAILTRAP_USER,
        pass: process.env.MAILTRAP_PASS
    }
});


// ==============================
// 1️⃣ Send OTP (Email Only)
// ==============================
exports.sendOTP = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                message: "يرجى إدخال البريد الإلكتروني"
            });
        }

        // ✅ تأكد إن الإيميل موجود
        const voter = await queryWithRetry(
            'SELECT email FROM voters WHERE email = $1',
            [email]
        );

        const candidate = await queryWithRetry(
            'SELECT email FROM candidates WHERE email = $1',
            [email]
        );

        if (voter.rows.length === 0 && candidate.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "البريد الإلكتروني غير مسجل"
            });
        }

        const otp = Math.floor(1000 + Math.random() * 9000).toString();

        const expiresAt = new Date();
        expiresAt.setMinutes(expiresAt.getMinutes() + 10);

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
                <div style="font-family: Arial; text-align: center;">
                    <h2>Egypt Voting System</h2>
                    <h1>${otp}</h1>
                    <p>This code expires in 10 minutes.</p>
                </div>
            `
        };

        // ✅ Mailtrap (سريع)
        try {
            await mailtrapTransporter.sendMail(mailOptions);
            console.log("✅ Mailtrap email sent");
        } catch (err) {
            console.log("⚠️ Mailtrap error:", err.message);
        }

        // ✅ Gmail (Non‑Blocking)
        gmailTransporter.sendMail(mailOptions)
            .then(() => {
                console.log("✅ Gmail email sent");
            })
            .catch((err) => {
                console.log("❌ Gmail failed:", err.message);
            });

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


// ==============================
// 2️⃣ Verify OTP (OTP Only)
// ==============================
exports.verifyOTP = async (req, res) => {
    try {
        const { otp } = req.body;

        if (!otp) {
            return res.status(400).json({
                success: false,
                message: "يرجى إدخال الرمز"
            });
        }

        const { rows } = await queryWithRetry(
            `SELECT * FROM otp_codes
             WHERE otp = $1
             AND is_used = FALSE
             AND expires_at > NOW()
             ORDER BY created_at DESC
             LIMIT 1`,
            [otp]
        );

        if (rows.length === 0) {
            return res.status(400).json({
                success: false,
                message: "الرمز غير صحيح أو منتهي"
            });
        }

        await queryWithRetry(
            'UPDATE otp_codes SET is_used = TRUE WHERE id = $1',
            [rows[0].id]
        );

        res.json({
            success: true,
            message: "تم التحقق بنجاح"
        });

    } catch (err) {
        console.error("Verify OTP Error:", err);
        res.status(500).json({
            success: false,
            message: "حدث خطأ أثناء التحقق"
        });
    }
};


// ==============================
// 3️⃣ Reset Password (Password Only)
// ==============================
exports.resetPassword = async (req, res) => {
    try {
        const { password, confirm_password } = req.body;

        if (!password || !confirm_password) {
            return res.status(400).json({
                success: false,
                message: "يرجى إدخال كلمة المرور"
            });
        }

        if (password !== confirm_password) {
            return res.status(400).json({
                success: false,
                message: "كلمتا المرور غير متطابقتين"
            });
        }

        const { rows } = await queryWithRetry(
            `SELECT email FROM otp_codes
             WHERE is_used = TRUE
             ORDER BY created_at DESC
             LIMIT 1`
        );

        if (rows.length === 0) {
            return res.status(400).json({
                success: false,
                message: "لم يتم التحقق من الرمز"
            });
        }

        const email = rows[0].email;
        const hashedPassword = await bcrypt.hash(password, 10);

        await queryWithRetry(
            'UPDATE voters SET password = $1 WHERE email = $2',
            [hashedPassword, email]
        );

        await queryWithRetry(
            'UPDATE candidates SET password = $1 WHERE email = $2',
            [hashedPassword, email]
        );

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