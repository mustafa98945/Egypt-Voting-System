const bcrypt = require("bcrypt");
const nodemailer = require("nodemailer");
const { queryWithRetry } = require("../config/db");

//////////////////////////////////////////////////////////
// ✅ Transporters
//////////////////////////////////////////////////////////

const gmailTransporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

const mailtrapTransporter = nodemailer.createTransport({
    host: process.env.MAILTRAP_HOST,
    port: Number(process.env.MAILTRAP_PORT),
    secure: false,
    auth: {
        user: process.env.MAILTRAP_USER,
        pass: process.env.MAILTRAP_PASS
    }
});

//////////////////////////////////////////////////////////
// ✅ Email Sender with Fallback
//////////////////////////////////////////////////////////

const sendEmailWithFallback = async (mailOptions) => {
    let sent = false;

    try {
        await gmailTransporter.sendMail(mailOptions);
        console.log("✅ Sent via Gmail");
        sent = true;
    } catch (err) {
        console.log("⚠️ Gmail failed:", err.message);
    }

    if (!sent) {
        try {
            await mailtrapTransporter.sendMail(mailOptions);
            console.log("✅ Sent via Mailtrap (fallback)");
            sent = true;
        } catch (err) {
            console.log("❌ Mailtrap failed:", err.message);
        }
    }

    if (!sent) {
        throw new Error("All email providers failed");
    }
};

//////////////////////////////////////////////////////////
// ✅ 1️⃣ Send OTP
//////////////////////////////////////////////////////////

exports.sendOTP = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                message: "يرجى إدخال البريد الإلكتروني"
            });
        }

        // ✅ تحقق إن الإيميل موجود
        const voter = await queryWithRetry(
            "SELECT email FROM voters WHERE email = $1",
            [email]
        );

        const candidate = await queryWithRetry(
            "SELECT email FROM candidates WHERE email = $1",
            [email]
        );

        if (voter.rows.length === 0 && candidate.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "البريد الإلكتروني غير مسجل"
            });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        const expiresAt = new Date();
        expiresAt.setMinutes(expiresAt.getMinutes() + 10);

        await queryWithRetry(
            `INSERT INTO otp_codes (email, otp, expires_at, is_used)
             VALUES ($1, $2, $3, FALSE)`,
            [email, otp, expiresAt]
        );

        const mailOptions = {
            from: `"Egypt Voting System" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: "Egypt Voting System - Reset Password",
            html: `
                <div style="font-family: Arial; text-align: center;">
                    <h2>Egypt Voting System</h2>
                    <h1>${otp}</h1>
                    <p>This code expires in 10 minutes.</p>
                </div>
            `
        };

        await sendEmailWithFallback(mailOptions);

        res.json({
            success: true,
            message: "تم إرسال رمز التحقق"
        });

    } catch (err) {
        console.error("Send OTP Error:", err.message);
        res.status(500).json({
            success: false,
            message: "فشل إرسال البريد الإلكتروني"
        });
    }
};

//////////////////////////////////////////////////////////
// ✅ 2️⃣ Verify OTP
//////////////////////////////////////////////////////////

exports.verifyOTP = async (req, res) => {
    try {
        const { email, otp } = req.body;

        if (!email || !otp) {
            return res.status(400).json({
                success: false,
                message: "يرجى إدخال البريد والرمز"
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
                message: "الرمز غير صحيح أو منتهي"
            });
        }

        await queryWithRetry(
            `UPDATE otp_codes SET is_used = TRUE WHERE id = $1`,
            [rows[0].id]
        );

        res.json({
            success: true,
            message: "تم التحقق بنجاح"
        });

    } catch (err) {
        console.error("Verify OTP Error:", err.message);
        res.status(500).json({
            success: false,
            message: "حدث خطأ أثناء التحقق"
        });
    }
};

//////////////////////////////////////////////////////////
// ✅ 3️⃣ Reset Password
//////////////////////////////////////////////////////////

exports.resetPassword = async (req, res) => {
    try {
        const { email, password, confirm_password } = req.body;

        if (!email || !password || !confirm_password) {
            return res.status(400).json({
                success: false,
                message: "يرجى إدخال البيانات كاملة"
            });
        }

        if (password !== confirm_password) {
            return res.status(400).json({
                success: false,
                message: "كلمتا المرور غير متطابقتين"
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        await queryWithRetry(
            "UPDATE voters SET password = $1 WHERE email = $2",
            [hashedPassword, email]
        );

        await queryWithRetry(
            "UPDATE candidates SET password = $1 WHERE email = $2",
            [hashedPassword, email]
        );

        res.json({
            success: true,
            message: "تم تغيير كلمة المرور بنجاح"
        });

    } catch (err) {
        console.error("Reset Password Error:", err.message);
        res.status(500).json({
            success: false,
            message: "حدث خطأ أثناء تغيير كلمة المرور"
        });
    }
};