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
        
        // تنظيف نص الـ Base64 واستخراج البيانات الصافية
        const base64Data = base64String.split(';base64,').pop();
        const buffer = Buffer.from(base64Data, 'base64');
        if (buffer.length === 0) return null;

        try {
            // تحسين الصورة (تصغير الحجم وتعديل الدوران)
            const optimized = await sharp(buffer)
                .rotate()
                .resize({ width: 1000, withoutEnlargement: true })
                .jpeg({ quality: 70, chromaSubsampling: '4:2:0' }) 
                .toBuffer();
            return await uploadToSupabase(optimized, fileName, folder);
        } catch (sharpError) {
            // رفع الملف الأصلي في حال فشل Sharp
            return await uploadToSupabase(buffer, fileName, folder);
        }
    } catch (error) {
        throw new Error(`فشل في معالجة المستند: ${fileName}`);
    }
};

// --- 1. تسجيل مرشح جديد ---
exports.registerCandidate = async (req, res) => {
    try {
        const data = req.body;

        // التحقق من تطابق كلمة المرور
        if (data.password !== data.confirm_password) {
            return res.status(400).json({ success: false, message: "كلمات المرور غير متطابقة" });
        }

        // التحقق من السجل المدني (Voter Registry)
        const citizen = await Voter.verifyInRegistry(data.national_id, data.birth_date, data.expiry_date);
        if (!citizen) {
            return res.status(401).json({ success: false, message: "بيانات الهوية غير مطابقة للسجل المدني" });
        }

        // معالجة الصور الشخصية (Array)
        let personalPhotosUrls = [];
        const photos = Array.isArray(data.personal_photos_url) ? data.personal_photos_url : [data.personal_photos_url];
        for (let i = 0; i < photos.length; i++) {
            const url = await processBase64AndUpload(photos[i], `personal_${data.national_id}_${Date.now()}_${i}.jpg`);
            if (url) personalPhotosUrls.push(url);
        }

        // معالجة باقي المستندات الإلزامية والاختيارية
        const fileFields = [
            'national_id_card_url', 'education_url', 'military_service_url', 
            'financial_disclosure_url', 'birth_certificate_url', 'fitness_health_url', 
            'criminal_record_url', 'deposit_receipt_url', 'election_symbol_url', 'party_card_url'
        ];
        
        let uploadedUrls = {};
        for (const field of fileFields) {
            uploadedUrls[field] = data[field] ? await processBase64AndUpload(data[field], `${field}_${data.national_id}_${Date.now()}.jpg`) : null;
        }

        const hashedPassword = await bcrypt.hash(data.password, 10);
        
        // استعلام الإدخال المباشر (21 حقل)
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
        console.error("Registration Error:", err);
        if (err.code === '23505') return res.status(400).json({ success: false, message: "هذا الرقم القومي أو البريد مسجل مسبقاً" });
        res.status(500).json({ success: false, message: `خطأ فني: ${err.message}` });
    }
};

// --- 2. تسجيل دخول المرشح (دعم Face ID أو Email/Password) ---
// --- تسجيل دخول المرشح (وجه أو إيميل وباسورد) ---
exports.loginCandidate = async (req, res) => {
    try {
        const { national_id, email, password } = req.body;
        let candidate;

        // 1. جلب بيانات المرشح (سواء بالوجه أو الإيميل)
        if (national_id && !password) {
            const result = await pool.query('SELECT * FROM candidates WHERE national_id = $1', [national_id]);
            candidate = result.rows[0];
            if (!candidate) return res.status(404).json({ success: false, message: "الرقم القومي غير مسجل" });
        } 
        else if (email && password) {
            const result = await pool.query('SELECT * FROM candidates WHERE email = $1', [email]);
            candidate = result.rows[0];
            if (!candidate || !(await bcrypt.compare(password, candidate.password))) {
                return res.status(401).json({ success: false, message: "بيانات الدخول غير صحيحة" });
            }
        } 
        else {
            return res.status(400).json({ success: false, message: "يرجى تقديم بيانات الدخول" });
        }

        // 2. حساب العمر (Age) من تاريخ الميلاد
        const birthDate = new Date(candidate.birth_date);
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }

        // 3. إنشاء التوكن
        const token = jwt.sign(
            { id: candidate.candidate_id, role: 'candidate' }, 
            process.env.JWT_SECRET, 
            { expiresIn: '24h' }
        );

        // 4. إرسال الاستجابة بالشكل المطلوب
        res.status(200).json({ 
            success: true, 
            token: token, 
            user_data: { 
                candidate_id: candidate.candidate_id, 
                full_name: candidate.occupation, // أو الحقل الذي يخزن الاسم الكامل عندك
                national_id: candidate.national_id,
                email: candidate.email,
                age: age, // العمر المحسوب
                election_symbol: candidate.election_symbol_url, // رابط الرمز الانتخابي
                candidate_type: candidate.candidate_type,
                short_bio: candidate.short_bio
            } 
        });

    } catch (err) {
        console.error("Login Error:", err);
        res.status(500).json({ success: false, message: "خطأ في السيرفر" });
    }
};
// --- 3. عرض قائمة المرشحين ---
exports.listCandidates = async (req, res) => {
    try {
        const result = await pool.query('SELECT candidate_id, national_id, email, occupation, candidate_type FROM candidates ORDER BY created_at DESC');
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error("List Error:", err);
        res.status(500).json({ success: false, message: "خطأ في تحميل القائمة" });
    }
};