const Candidate = require('../models/candidateModel');
const Voter = require('../models/voterModel');
const bcrypt = require('bcrypt');
const sharp = require('sharp');
const jwt = require('jsonwebtoken');
const { uploadToSupabase } = require('../utils/supabaseHelper');

// --- دالة مساعدة لمعالجة الـ Base64 ورفعها ---
const processBase64AndUpload = async (base64String, fileName, folder = 'candidates') => {
    try {
        if (!base64String || typeof base64String !== 'string') return null;

        // 1. تنظيف الـ Base64 واستخراج البيانات الصافية
        const base64Parts = base64String.split(';base64,');
        const actualBase64 = base64Parts.length > 1 ? base64Parts[1] : base64Parts[0];

        // 2. تحويل النص لـ Buffer
        const buffer = Buffer.from(actualBase64, 'base64');

        if (buffer.length === 0) return null;

        try {
            // 3. محاولة ضغط الصورة باستخدام Sharp لتقليل الحجم
            const optimized = await sharp(buffer)
                .rotate() // تعديل الاتجاه تلقائياً
                .jpeg({ quality: 75, chromaSubsampling: '4:2:0' }) 
                .toBuffer();
            
            console.log(`[Success] تم معالجة ورفع: ${fileName}`);
            return await uploadToSupabase(optimized, fileName, folder);
        } catch (sharpError) {
            // 4. خطة بديلة: لو Sharp فشل، ارفع الملف الأصلي كما هو
            console.warn(`[Sharp Warning] فشل الضغط، يتم رفع الأصل لـ ${fileName}:`, sharpError.message);
            return await uploadToSupabase(buffer, fileName, folder);
        }
    } catch (error) {
        console.error(`[Upload Error] خطأ فادح في ${fileName}:`, error.message);
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

        // التحقق من كلمة المرور
        if (password !== confirm_password) {
            return res.status(400).json({ success: false, message: "كلمات المرور غير متطابقة" });
        }

        // التحقق من السجل المدني (Voter Registry)
        const citizen = await Voter.verifyInRegistry(national_id, birth_date, expiry_date);
        if (!citizen) {
            return res.status(401).json({ success: false, message: "بيانات الهوية غير مطابقة للسجل المدني" });
        }

        // معالجة الصور الشخصية
        let personalPhotosUrls = [];
        if (personal_photos_url) {
            const photosArray = Array.isArray(personal_photos_url) ? personal_photos_url : [personal_photos_url];
            for (let i = 0; i < photosArray.length; i++) {
                const url = await processBase64AndUpload(photosArray[i], `personal_${national_id}_${i}_${Date.now()}.jpg`);
                if (url) personalPhotosUrls.push(url);
            }
        }

        // معالجة باقي الملفات والشهادات
        const fileFields = [
            'national_id_card_url', 'education_url', 'military_service_url',
            'financial_disclosure_url', 'birth_certificate_url', 'fitness_health_url',
            'criminal_record_url', 'deposit_receipt_url', 'election_symbol_url', 'party_card_url'
        ];

        let uploadedFiles = {};
        for (const field of fileFields) {
            if (req.body[field]) {
                uploadedFiles[field] = await processBase64AndUpload(req.body[field], `${field}_${national_id}_${Date.now()}.jpg`);
            } else {
                uploadedFiles[field] = null;
            }
        }

        // تشفير كلمة المرور
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // تجميع بيانات المرشح
        const candidateData = {
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
        };

        // --- التعديل الجوهري: استخدام register بدلاً من create ---
        await Candidate.register(candidateData); 

        res.status(201).json({ 
            success: true, 
            message: "تم تسجيل طلب الترشح بنجاح، سيتم مراجعته قريباً." 
        });

    } catch (err) {
        console.error("Registration Error:", err);
        if (err.code === '23505') {
            return res.status(400).json({ success: false, message: "هذا الرقم القومي أو البريد الإلكتروني مسجل مسبقاً" });
        }
        res.status(500).json({ success: false, message: "خطأ في السيرفر أثناء معالجة الطلب" });
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
        res.status(500).json({ success: false, message: "خطأ في السيرفر أثناء تسجيل الدخول" });
    }
};

// 3. عرض قائمة المرشحين
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
        res.status(500).json({ success: false, message: "خطأ في تحميل قائمة المرشحين" });
    }
};