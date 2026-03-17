const Candidate = require('../models/candidateModel');
const Voter = require('../models/voterModel');
const bcrypt = require('bcrypt');
const sharp = require('sharp');
const jwt = require('jsonwebtoken');
const { uploadToSupabase } = require('../utils/supabaseHelper');
const pool = require('../config/db'); // تأكد من استيراد اتصال قاعدة البيانات

// --- دالة معالجة الـ Base64 ورفعها ---
const processBase64AndUpload = async (base64String, fileName, folder = 'candidates') => {
    try {
        if (!base64String || typeof base64String !== 'string') return null;
        const base64Parts = base64String.split(';base64,');
        const actualBase64 = base64Parts.length > 1 ? base64Parts[1] : base64Parts[0];
        const buffer = Buffer.from(actualBase64, 'base64');
        if (buffer.length === 0) return null;

        try {
            const optimized = await sharp(buffer)
                .rotate()
                .jpeg({ quality: 75, chromaSubsampling: '4:2:0' }) 
                .toBuffer();
            console.log(`[Success] تم معالجة ورفع: ${fileName}`);
            return await uploadToSupabase(optimized, fileName, folder);
        } catch (sharpError) {
            console.warn(`[Sharp Warning] رفع الأصل لـ ${fileName}`);
            return await uploadToSupabase(buffer, fileName, folder);
        }
    } catch (error) {
        throw new Error(`فشل في معالجة الملف: ${fileName}`);
    }
};

// 1. تسجيل مرشح جديد
exports.registerCandidate = async (req, res) => {
    try {
        const { 
            national_id, birth_date, expiry_date, email, password, confirm_password,
            phone_numbers, short_bio, candidate_type, occupation, degree,
            personal_photos_url, national_id_card_url, education_url, military_service_url,
            financial_disclosure_url, birth_certificate_url, fitness_health_url,
            criminal_record_url, deposit_receipt_url, election_symbol_url, party_card_url 
        } = req.body;

        if (password !== confirm_password) {
            return res.status(400).json({ success: false, message: "كلمات المرور غير متطابقة" });
        }

        const citizen = await Voter.verifyInRegistry(national_id, birth_date, expiry_date);
        if (!citizen) {
            return res.status(401).json({ success: false, message: "بيانات الهوية غير مطابقة للسجل المدني" });
        }

        // معالجة الصور
        let personalPhotosUrls = [];
        if (personal_photos_url) {
            const photosArray = Array.isArray(personal_photos_url) ? personal_photos_url : [personal_photos_url];
            for (let i = 0; i < photosArray.length; i++) {
                const url = await processBase64AndUpload(photosArray[i], `personal_${national_id}_${Date.now()}_${i}.jpg`);
                if (url) personalPhotosUrls.push(url);
            }
        }

        const fileFields = [
            'national_id_card_url', 'education_url', 'military_service_url',
            'financial_disclosure_url', 'birth_certificate_url', 'fitness_health_url',
            'criminal_record_url', 'deposit_receipt_url', 'election_symbol_url', 'party_card_url'
        ];

        let uploadedFiles = {};
        for (const field of fileFields) {
            uploadedFiles[field] = req.body[field] ? await processBase64AndUpload(req.body[field], `${field}_${national_id}_${Date.now()}.jpg`) : null;
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        
        // --- الحل النهائي: إدخال البيانات مباشرة لضمان العمل ---
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

        const values = [
            national_id, email, hashedPassword, 
            Array.isArray(phone_numbers) ? phone_numbers : [phone_numbers],
            short_bio, candidate_type, occupation, degree, birth_date, expiry_date,
            personalPhotosUrls, uploadedFiles.national_id_card_url, uploadedFiles.education_url,
            uploadedFiles.military_service_url, uploadedFiles.financial_disclosure_url,
            uploadedFiles.birth_certificate_url, uploadedFiles.fitness_health_url,
            uploadedFiles.criminal_record_url, uploadedFiles.deposit_receipt_url,
            uploadedFiles.election_symbol_url, uploadedFiles.party_card_url
        ];

        await pool.query(query, values);

        res.status(201).json({ success: true, message: "تم تسجيل طلب الترشح بنجاح" });

    } catch (err) {
        console.error("Final Registration Error:", err);
        res.status(500).json({ success: false, message: "خطأ في السيرفر أثناء حفظ البيانات" });
    }
};

// 2. تسجيل دخول المرشح
exports.loginCandidate = async (req, res) => {
    const { loginIdentifier, password } = req.body;
    try {
        const result = await pool.query(
            'SELECT * FROM candidates WHERE email = $1 OR national_id = $2',
            [loginIdentifier, loginIdentifier]
        );
        const candidate = result.rows[0];

        if (!candidate) return res.status(404).json({ success: false, message: "الحساب غير موجود" });

        const isMatch = await bcrypt.compare(password, candidate.password);
        if (!isMatch) return res.status(401).json({ success: false, message: "كلمة المرور خطأ" });

        const token = jwt.sign({ id: candidate.candidate_id }, process.env.JWT_SECRET, { expiresIn: '24h' });
        res.json({ success: true, token, data: candidate });
    } catch (err) {
        res.status(500).json({ success: false, message: "خطأ في تسجيل الدخول" });
    }
};

// 3. عرض القائمة
exports.listCandidates = async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM candidates');
        res.json({ success: true, data: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, message: "خطأ في تحميل القائمة" });
    }
};