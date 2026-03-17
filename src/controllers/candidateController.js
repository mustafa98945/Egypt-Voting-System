const Candidate = require('../models/candidateModel');
const Voter = require('../models/voterModel');
const bcrypt = require('bcrypt');
const sharp = require('sharp');
const jwt = require('jsonwebtoken');
const { uploadToSupabase } = require('../utils/supabaseHelper');

/**
 * دالة مساعدة مطورة لمعالجة الـ Base64
 * تقوم بتنظيف النص، محاولة ضغطه بـ Sharp، وفي حالة الفشل ترفعه كملف خام
 */
const processBase64AndUpload = async (base64String, fileName, folder = 'candidates') => {
    try {
        if (!base64String || typeof base64String !== 'string') return null;

        // 1. تنظيف الـ Base64 واستخراج البيانات الصافية
        const base64Parts = base64String.split(';base64,');
        const actualBase64 = base64Parts.length > 1 ? base64Parts[1] : base64Parts[0];

        // 2. تحويل النص لـ Buffer
        const buffer = Buffer.from(actualBase64, 'base64');

        if (buffer.length === 0) {
            throw new Error('الـ Buffer الناتج من الصورة فارغ');
        }

        try {
            // 3. محاولة معالجة الصورة باستخدام Sharp
            const optimized = await sharp(buffer)
                .rotate() // تعديل اتجاه الصورة التلقائي
                .jpeg({ quality: 75, chromaSubsampling: '4:2:0' }) 
                .toBuffer();
            
            // 4. الرفع لـ Supabase بعد الضغط
            console.log(`تم ضغط ورفع الملف بنجاح: ${fileName}`);
            return await uploadToSupabase(optimized, fileName, folder);
        } catch (sharpError) {
            // 5. خطة الإنقاذ: لو Sharp فشل (بسبب فورمات غير مدعوم)، ارفع الملف الأصلي مباشرة
            console.error(`[Sharp Warning] فشل الضغط، محاولة رفع الأصل لـ ${fileName}:`, sharpError.message);
            return await uploadToSupabase(buffer, fileName, folder);
        }
    } catch (error) {
        console.error(`[Upload Error] خطأ فادح في ${fileName}:`, error.message);
        throw new Error(`فشل في معالجة الملف: ${fileName} - ${error.message}`);
    }
};

// 1. تسجيل مرشح جديد (JSON Mode)
exports.registerCandidate = async (req, res) => {
    try {
        const { 
            national_id, birth_date, expiry_date, email, password, confirm_password,
            phone_numbers, short_bio, candidate_type, occupation, degree,
            personal_photos_url, 
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

        // 2. التحقق من السجل المدني
        const citizen = await Voter.verifyInRegistry(national_id, birth_date, expiry_date);
        if (!citizen) {
            return res.status(401).json({ success: false, message: "بيانات الهوية غير مطابقة للسجل المدني" });
        }

        // 3. معالجة الصور الشخصية (مصفوفة أو نص واحد)
        let personalPhotosUrls = [];
        if (personal_photos_url) {
            const photosArray = Array.isArray(personal_photos_url) ? personal_photos_url : [personal_photos_url];
            for (let i = 0; i < photosArray.length; i++) {
                const url = await processBase64AndUpload(
                    photosArray[i], 
                    `personal_${national_id}_${Date.now()}_${i}.jpg`
                );
                if (url) personalPhotosUrls.push(url);
            }
        }

        // 4. معالجة باقي الملفات والشهادات
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

        // 5. التشفير والحفظ في قاعدة البيانات
        const hashedPassword = await bcrypt.hash(password, 10);
        
        await Candidate.create({
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
            message: "تم تسجيل طلب الترشح بنجاح، وسيتم مراجعته من قبل اللجنة." 
        });

    } catch (err) {
        console.error("Critical Registration Error:", err);
        if (err.code === '23505') {
            return res.status(400).json({ success: false, message: "هذا الرقم القومي أو البريد الإلكتروني مسجل مسبقاً" });
        }
        res.status(500).json({ 
            success: false, 
            message: err.message.includes("فشل في معالجة الملف") ? err.message : "خطأ في السيرفر أثناء معالجة الطلب" 
        });
    }
};

// 2. تسجيل دخول المرشح
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
            message: `أهلاً بك يا ${candidate.full_name ? candidate.full_name.split(' ')[0] : 'مرشحنا'}`,
            data: {
                id: candidate.candidate_id,
                name: candidate.full_name,
                symbol: candidate.election_symbol_url
            }
        });
    } catch (err) {
        console.error("Login Error:", err);
        res.status(500).json({ success: false, message: "خطأ في السيرفر أثناء تسجيل الدخول" });
    }
};

// 3. عرض قائمة المرشحين بناءً على المحافظة
exports.listCandidates = async (req, res) => {
    const { governorate } = req.query;
    if (!governorate) {
        return res.status(400).json({ success: false, message: "يجب تحديد المحافظة لعرض المرشحين" });
    }
    try {
        const candidates = await Candidate.getAllByGovernorate(governorate);
        res.status(200).json({
            success: true,
            count: candidates.length,
            data: candidates
        });
    } catch (err) {
        console.error("List Candidates Error:", err);
        res.status(500).json({ success: false, message: "خطأ في تحميل قائمة المرشحين" });
    }
};