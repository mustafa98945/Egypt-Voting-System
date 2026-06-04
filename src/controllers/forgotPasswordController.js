const bcrypt = require('bcrypt');
const SibApiV3Sdk = require('@getbrevo/brevo');
const { queryWithRetry } = require('../config/db');

////////////////////////////////////////////////////////////
// ✅ Brevo API Config
////////////////////////////////////////////////////////////

const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

apiInstance.setApiKey(
  SibApiV3Sdk.TransactionalEmailsApiApiKeys.apiKey,
  process.env.BREVO_API_KEY
);

////////////////////////////////////////////////////////////
// ✅ Send Email Function (Background)
////////////////////////////////////////////////////////////

const sendEmail = async (email, otp) => {
  try {
    await apiInstance.sendTransacEmail({
      sender: {
        email: process.env.BREVO_SENDER,
        name: "Egypt Voting System"
      },
      to: [{ email }],
      subject: "Egypt Voting System - Reset Password",
      htmlContent: `
        <div style="font-family: Arial; text-align: center;">
          <h2>Egypt Voting System</h2>
          <h1 style="font-size:40px; letter-spacing:5px;">${otp}</h1>
          <p>This code expires in 10 minutes.</p>
        </div>
      `
    });

    console.log("✅ Email sent via Brevo");
  } catch (error) {
    console.log("❌ Brevo Error:", error.message);
  }
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

    const otp = Math.floor(1000 + Math.random() * 9000).toString();

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10);

    await queryWithRetry(
      `INSERT INTO otp_codes (email, otp, expires_at, is_used)
       VALUES ($1, $2, $3, FALSE)`,
      [email, otp, expiresAt]
    );

    res.json({
      success: true,
      message: "تم إرسال رمز التحقق"
    });

    // ✅ إرسال الإيميل في الخلفية
    sendEmail(email, otp);

  } catch (err) {
    console.error("Send OTP Error:", err.message);
    return res.status(500).json({
      success: false,
      message: "حدث خطأ أثناء إرسال الرمز"
    });
  }
};

////////////////////////////////////////////////////////////
// ✅ 2️⃣ Verify OTP (مربوط بالإيميل ✅)
////////////////////////////////////////////////////////////

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
// ✅ 3️⃣ Reset Password (مربوط بنفس الإيميل ✅)
////////////////////////////////////////////////////////////

exports.resetPassword = async (req, res) => {
  try {
    const { email, password, confirm_password } = req.body;

    if (!email || !password || !confirm_password) {
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

    // ✅ تأكد أن الإيميل تم التحقق منه
    const { rows } = await queryWithRetry(
      `SELECT * FROM otp_codes
       WHERE email = $1
       AND is_used = TRUE
       ORDER BY created_at DESC
       LIMIT 1`,
      [email]
    );

    if (rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: "لم يتم التحقق من الرمز لهذا البريد"
      });
    }

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