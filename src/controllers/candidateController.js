const Candidate = require('../models/candidateModel');
const Voter = require('../models/voterModel');
const bcrypt = require('bcrypt');
const sharp = require('sharp');
const jwt = require('jsonwebtoken');
const { uploadToSupabase } = require('../utils/supabaseHelper');

// --- دالة مساعدة لتحويل Base64 إلى Buffer ومعالجته ---
const processBase64AndUpload = async (base64String, fileName, folder = 'candidates') => {
    try {
        if (!base64String) return null;

        // 1. فك تشفير الـ Base64 وتحويله لـ Buffer
        // نستخدم regex لإزالة الجزء التعريفي مثل data:image/jpeg;base64, لو وجد
        const base64Data = base64String.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, 'base64');

        // 2. معالجة سريعة للتأكد من الصيغة (بما أن الفلاتر قام بالضغط)
        // نقوم فقط بتحويله لـ jpeg لتوحيد الامتدادات
        const optimized = await sharp(buffer)
            .jpeg({ quality: 80 }) 
            .toBuffer();
            
        // 3. الرفع لـ Supabase
        return await uploadToSupabase(optimized, fileName, folder);
    } catch (error) {
        console.error(`خطأ في معالجة الملف Base64 (${fileName}):`, error);
        throw new Error(`فشل في معالجة الملف: ${fileName}`);
    }
};

// 1. تسجيل مرشح جديد (JSON Mode)
exports.registerCandidate = async (req, res) => {
    try {
        const { 
            national_id, birth_date, expiry_date, email, password, confirm_password,
            phone_numbers, short_bio, candidate_type, occupation, degree,
            // استلام الصور كـ Base64 من Body مباشرة
            personal_photos_url, // مصفوفة نصوص base64
            national_id_card_url, education_url, military_service_url,
            financial_disclosure_url, birth_certificate_url, fitness_health_url,
            criminal_record_url, deposit_receipt_url, election_symbol_url,
            party_card_url 
        } = req.body;

        // 1. التحقق من الحقول النصية الأساسية
        const requiredTextFields = [
            'national_id', 'birth_date', 'expiry_date', 'email', 
            'password', 'confirm_password', 'candidate_type', 'occupation', 'degree',
            'phone_numbers', 'short_bio'
        ];
        
        for (const field of requiredTextFields) {
            if (!req.body[field]) {
                return res.status(400).json({ success: false, message: `الحقل (${field}) مطلوب` });
            }
        }

        if (password !== confirm_password) {
            return res.status(400).json({ success: false, message: "كلمات المرور غير متطابقة" });
        }

        // 2. التحقق من وجود الملفات الإجبارية (بصيغة Base64 Strings)
        const mandatoryFiles = [
            'personal_photos_url', 'national_id_card_url', 'education_url', 
            'military_service_url', 'financial_disclosure_url', 'birth_certificate_url', 
            'fitness_health_url', 'criminal_record_url', 'deposit_receipt_url', 'election_symbol_url'
        ];

        for (const fileKey of mandatoryFiles) {
            if (!req.body[fileKey]) {
                return res.status(400).json({ success: false, message: `يجب إرسال بيانات الملف: (${fileKey})` });
            }
        }

        // 3. التحقق من السجل المدني
        const citizen = await Voter.verifyInRegistry(national_id, birth_date, expiry_date);
        if (!citizen) {
            return res.status(401).json({ success: false, message: "بيانات الهوية غير مطابقة للسجل المدني" });
        }

        // 4. معالجة الصور الشخصية (مصفوفة Base64)
        let personalPhotosUrls = [];
        if (Array.isArray(personal_photos_url)) {
            for (let i = 0; i < personal_photos_url.length; i++) {
                const url = await processBase64AndUpload(
                    personal_photos_url[i], 
                    `personal_${national_id}_${Date.now()}_${i}.jpg`
                );
                personalPhotosUrls.push(url);
            }
        }

        // 5. معالجة باقي الملفات
        const fileFields = [
            'national_id_card_url', 'education_url', 'military_service_url',
            'financial_disclosure_url', 'birth_certificate_url', 'fitness_health_url',
            'criminal_record_url', 'deposit_receipt_url', 'election_symbol_url',
            'party_card_url'
        ];

        let uploadedFiles = {};
        for (const field of fileFields) {
            if (req.body[field]) {
                uploadedFiles[field] = await processBase64AndUpload(
                    req.body[field], 
                    `${field}_${national_id}_${Date.now()}.jpg`
                );
            } else {
                uploadedFiles[field] = null;
            }
        }

        // 6. التشفير والحفظ
        const hashedPassword = await bcrypt.hash(password, 10);
        
        const newCandidate = await Candidate.create({
            national_id, 
            email, 
            password: hashedPassword,
            phone_numbers: Array.isArray(phone_numbers) ? phone_numbers : [phone_numbers],
            short_bio, 
            candidate_type, 
            occupation, 
            degree,
            birth_date, 
            expiry_date,
            personal_photos_url: personalPhotosUrls,
            ...uploadedFiles
        });

        res.status(201).json({ 
            success: true, 
            message: "تم تسجيل طلبك بنجاح باستخدام نظام المعالجة السريع" 
        });

    } catch (err) {
        console.error("Registration Error:", err);
        if (err.code === '23505') {
            return res.status(400).json({ success: false, message: "بيانات مسجلة مسبقاً" });
        }
        res.status(500).json({ success: false, message: "خطأ في السيرفر أثناء المعالجة" });
    }
};

// 2. تسجيل الدخول (كما هو)
exports.loginCandidate = async (req, res) => {
    const { loginIdentifier, password } = req.body;
    try {
        let candidate = await Candidate.findByEmail(loginIdentifier) || await Candidate.findByNationalId(loginIdentifier);

        if (!candidate) {
            return res.status(404).json({ success: false, message: "هذا الحساب غير موجود" });
        }

        const isMatch = await bcrypt.compare(password, candidate.password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: "كلمة المرور غير صحيحة" });
        }

        const token = jwt.sign(
            { candidate_id: candidate.candidate_id, role: 'candidate' },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.status(200).json({
            success: true,
            token,
            message: `أهلاً بك يا ${candidate.full_name.split(' ')[0]}`,
            data: {
                id: candidate.candidate_id,
                name: candidate.full_name,
                symbol: candidate.election_symbol_url
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: "خطأ في السيرفر" });
    }
};

// 3. عرض قائمة المرشحين (كما هو)
exports.listCandidates = async (req, res) => {
    const { governorate } = req.query;
    if (!governorate) {
        return res.status(400).json({ success: false, message: "يجب تحديد المحافظة" });
    }
    try {
        const candidates = await Candidate.getAllByGovernorate(governorate);
        res.status(200).json({
            success: true,
            count: candidates.length,
            data: candidates
        });
    } catch (err) {
        res.status(500).json({ success: false, message: "خطأ في تحميل القائمة" });
    }
};