const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const sharp = require('sharp');
const { uploadToSupabase } = require('../utils/supabaseHelper');
const Voter = require('../models/voterModel');
const pool = require('../config/db');

// --- دالة مساعدة لمعالجة الـ Base64 ورفعها ---
const processBase64AndUpload = async (base64String, fileName, folder = 'candidates') => {
    try {
        if (!base64String || typeof base64String !== 'string') return null;
        const base64Data = base64String.split(';base64,').pop();
        const buffer = Buffer.from(base64Data, 'base64');
        if (buffer.length === 0) return null;

        try {
            const optimized = await sharp(buffer)
                .rotate()
                .resize({ width: 1000, withoutEnlargement: true })
                .jpeg({ quality: 70, chromaSubsampling: '4:2:0' }) 
                .toBuffer();
            return await uploadToSupabase(optimized, fileName, folder);
        } catch (sharpError) {
            return await uploadToSupabase(buffer, fileName, folder);
        }
    } catch (error) {
        throw new Error(`فشل في معالجة المستند: ${fileName}`);
    }
};

// --- تسجيل مرشح جديد ---
exports.registerCandidate = async (req, res) => {
    try {
        const data = req.body;
        if (data.password !== data.confirm_password) {
            return res.status(400).json({ success: false, message: "كلمات المرور غير متطابقة" });
        }

        const citizen = await Voter.verifyInRegistry(data.national_id, data.birth_date, data.expiry_date);
        if (!citizen) {
            return res.status(401).json({ success: false, message: "بيانات الهوية غير مطابقة للسجل المدني" });
        }

        let personalPhotosUrls = [];
        const photos = Array.isArray(data.personal_photos_url) ? data.personal_photos_url : [data.personal_photos_url];
        for (let i = 0; i < photos.length; i++) {
            const url = await processBase64AndUpload(photos[i], `personal_${data.national_id}_${Date.now()}_${i}.jpg`);
            if (url) personalPhotosUrls.push(url);
        }

        const fileFields = ['national_id_card_url', 'education_url', 'military_service_url', 'financial_disclosure_url', 'birth_certificate_url', 'fitness_health_url', 'criminal_record_url', 'deposit_receipt_url', 'election_symbol_url', 'party_card_url'];
        let uploadedUrls = {};
        for (const field of fileFields) {
            uploadedUrls[field] = data[field] ? await processBase64AndUpload(data[field], `${field}_${data.national_id}_${Date.now()}.jpg`) : null;
        }

        const hashedPassword = await bcrypt.hash(data.password, 10);
        
        const query = `
            INSERT INTO candidates (
                national_id, email, password, phone_numbers, short_bio, 
                candidate_type, occupation, degree, birth_date, expiry_date,
                personal_photos_url, national_id_card_url, education_url, 
                military_service_url, financial_disclosure_url, birth_certificate_url, 
                fitness_health_url, criminal_record_url, deposit_receipt_url, 
                election_symbol_url, party_card_url
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
        `;

        await pool.query(query, [
            data.national_id, data.email, hashedPassword, 
            Array.isArray(data.phone_numbers) ? data.phone_numbers : [data.phone_numbers],
            data.short_bio, data.candidate_type, data.occupation, data.degree, data.birth_date, data.expiry_date,
            personalPhotosUrls, uploadedUrls.national_id_card_url, uploadedUrls.education_url,
            uploadedUrls.military_service_url, uploadedUrls.financial_disclosure_url,
            uploadedUrls.birth_certificate_url, uploadedUrls.fitness_health_url,
            uploadedUrls.criminal_record_url, uploadedUrls.deposit_receipt_url,
            uploadedUrls.election_symbol_url, uploadedUrls.party_card_url
        ]);

        res.status(201).json({ success: true, message: "تم تسجيل طلب الترشح بنجاح" });
    } catch (err) {
        console.error("Reg Error:", err);
        res.status(500).json({ success: false, message: `خطأ فني: ${err.message}` });
    }
};

// --- تسجيل دخول المرشح ---
// --- تسجيل دخول المرشح (دعم National ID أو Email) ---
// --- تسجيل دخول المرشح (دعم Face ID أو Email/Password) ---
exports.loginCandidate = async (req, res) => {
    try {
        const { national_id, email, password, isFaceAuth } = req.body;
        let candidate;

        // 1. الدخول عبر التعرف على الوجه (يتم إرسال national_id و flag التأكيد)
        if (isFaceAuth && national_id) {
            const result = await pool.query('SELECT * FROM candidates WHERE national_id = $1', [national_id]);
            candidate = result.rows[0];
            
            if (!candidate) {
                return res.status(404).json({ success: false, message: "الرقم القومي غير مسجل كمرشح" });
            }
            // في حالة Face ID، نعتبر التحقق تم بنجاح من جهة الموبايل
        } 
        
        // 2. الدخول التقليدي (Email + Password)
        else if (email && password) {
            const result = await pool.query('SELECT * FROM candidates WHERE email = $1', [email]);
            candidate = result.rows[0];

            if (!candidate || !(await bcrypt.compare(password, candidate.password))) {
                return res.status(401).json({ success: false, message: "بيانات الدخول غير صحيحة" });
            }
        }

        // 3. الدخول التقليدي (National ID + Password)
        else if (national_id && password) {
            const result = await pool.query('SELECT * FROM candidates WHERE national_id = $1', [national_id]);
            candidate = result.rows[0];

            if (!candidate || !(await bcrypt.compare(password, candidate.password))) {
                return res.status(401).json({ success: false, message: "بيانات الدخول غير صحيحة" });
            }
        } 
        
        else {
            return res.status(400).json({ success: false, message: "يرجى تقديم بيانات تسجيل دخول كاملة" });
        }

        // إنشاء التوكن (JWT)
        const token = jwt.sign(
            { id: candidate.candidate_id, role: 'candidate' }, 
            process.env.JWT_SECRET, 
            { expiresIn: '24h' }
        );

        res.status(200).json({ 
            success: true, 
            token, 
            data: { 
                id: candidate.candidate_id, 
                email: candidate.email,
                national_id: candidate.national_id
            } 
        });

    } catch (err) {
        console.error("Login Error:", err);
        res.status(500).json({ success: false, message: "خطأ في السيرفر أثناء تسجيل الدخول" });
    }
};
// --- عرض القائمة ---
exports.listCandidates = async (req, res) => {
    try {
        const result = await pool.query('SELECT candidate_id, national_id, email, occupation FROM candidates');
        res.json({ success: true, data: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, message: "خطأ في تحميل القائمة" });
    }
};