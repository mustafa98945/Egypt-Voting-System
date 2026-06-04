const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const { queryWithRetry } = require('../config/db');

////////////////////////////////////////////////////////////
// ✅ Gmail Transporter
////////////////////////////////////////////////////////////

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

////////////////////////////////////////////////////////////
// ✅ Background Send
////////////////////////////////////////////////////////////

const sendInBackground = (mailOptions) => {
    transporter.sendMail(mailOptions)
        .then(() => console.log("✅ Email sent via Gmail"))
        .catch((err) => console.log("❌ Gmail failed:", err.message));
};

////////////////////////////////////////////////////////////
// ✅ 1️⃣ Send OTP
////////////////////////////////////////////////////////////

exports.sendOTP = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                message: "يرجى إدخال البريد الإلكتروني"
            });
        }

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

        // ✅ OTP 4 أرقام
        const otp = Math.floor(1000 + Math.random() * 9000).toString();

        const expiresAt = new Date();
        expiresAt.setMinutes(expiresAt.getMinutes() + 10);

        await queryWithRetry(
            `INSERT INTO otp_codes (email, otp, expires_at, is_used)
             VALUES ($1, $2, $3, FALSE)`,
            [email, otp, expiresAt]
        );

        // ✅ رجّع Response فوراً
        res.json({
            success: true,
            message: "تم إرسال رمز التحقق على بريدك الإلكتروني"
        });

        // ✅ ابعت الـ Email في الـ Background
        const mailOptions = {
            from: `"Egypt Voting System" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: "Egypt Voting System - Reset Password",
            html: `
                <div style="font-family: Arial; text-align: center; padding: 20px;">
                    <h2 style="color: #2563EB;">Egypt Voting System</h2>
                    <p style="color: #374151;">Your verification code is:</p>
                    <h1 style="color: #2563EB; font-size: 48px; letter-spacing: 10px;">
                        ${otp}
                    </h1>
                    <p style="color: #6B7280;">This code expires in 10 minutes.</p>
                </div>
            `
        };

        sendInBackground(mailOptions);

    } catch (err) {
        console.error("Send OTP Error:", err.message);
        return res.status(500).json({
            success: false,
            message: "حدث خطأ أثناء إرسال الرمز"
        });
    }
};

////////////////////////////////////////////////////////////
// ✅ 2️⃣ Verify OTP
////////////////////////////////////////////////////////////

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
                message: "الرمز غير صحيح أو منتهي الصلاحية"
            });
        }

        await queryWithRetry(
            'UPDATE otp_codes SET is_used = TRUE WHERE id = $1',
            [rows[0].id]
        );

        return res.json({
            success: true,
            message: "تم التحقق بنجاح"
        });

    } catch (err) {
        console.error("Verify OTP Error:", err.message);
        return res.status(500).json({
            success: false,
            message: "حدث خطأ أثناء التحقق"
        });
    }
};

////////////////////////////////////////////////////////////
// ✅ 3️⃣ Reset Password
////////////////////////////////////////////////////////////

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

        return res.json({
            success: true,
            message: "تم تغيير كلمة المرور بنجاح"
        });

    } catch (err) {
        console.error("Reset Password Error:", err.message);
        return res.status(500).json({
            success: false,
            message: "حدث خطأ أثناء تغيير كلمة المرور"
        });
    }
};