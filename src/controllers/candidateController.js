const Candidate = require('../models/candidateModel');
const Voter = require('../models/voterModel');
const bcrypt = require('bcrypt');
const sharp = require('sharp');
const jwt = require('jsonwebtoken'); // إضافة JWT
const { uploadToSupabase } = require('../utils/supabaseHelper');

// --- دالة مساعدة لمعالجة الصور وضغطها ---
const processAndUpload = async (fileBuffer, fileName, folder = 'candidates', width = 1000, quality = 80) => {
    try {
        const optimized = await sharp(fileBuffer)
            .resize({ width, withoutEnlargement: true })
            .jpeg({ quality })
            .toBuffer();
            
        return await uploadToSupabase(optimized, fileName, folder);
    } catch (error) {
        console.error(`خطأ في معالجة الملف ${fileName}:`, error);
        throw new Error("فشل في معالجة الصور");
    }
};

// 1. تسجيل مرشح جديد
exports.registerCandidate = async (req, res) => {
    try {
        const { 
            national_id, birth_date, expiry_date, email, password, confirm_password,
            phone_numbers, short_bio, candidate_type, occupation, degree
        } = req.body;

        // 1. التأكد من وجود كل البيانات النصية (Text) - تم إضافة phone_numbers و short_bio
        const requiredTextFields = [
            'national_id', 'birth_date', 'expiry_date', 'email', 
            'password', 'confirm_password', 'candidate_type', 'occupation', 'degree',
            'phone_numbers', 'short_bio'
        ];
        
        for (const field of requiredTextFields) {
            if (!req.body[field]) {
                return res.status(400).json({ 
                    success: false, 
                    message: `الحقل النصي (${field}) مطلوب لإتمام عملية التسجيل` 
                });
            }
        }

        // التأكد من تطابق كلمة المرور
        if (password !== confirm_password) {
            return res.status(400).json({ success: false, message: "كلمات المرور غير متطابقة" });
        }

        // 2. القائمة النهائية للملفات الإجبارية (10 ملفات)
        const mandatoryFiles = [
            'personal_photos_url',     // مصفوفة صور شخصية
            'national_id_card_url',    // صورة البطاقة
            'education_url',           // المؤهل الدراسي
            'military_service_url',    // شهادة الجيش
            'financial_disclosure_url',// إقرار الذمة المالية
            'birth_certificate_url',   // شهادة الميلاد
            'fitness_health_url',      // الكشف الطبي
            'criminal_record_url',     // الفيش والتشبيه
            'deposit_receipt_url',     // إيصال التأمين
            'election_symbol_url'      // رمز المرشح
        ];

        // التحقق إن كل الملفات الإجبارية موجودة في الطلب
        for (const fileKey of mandatoryFiles) {
            if (!req.files || !req.files[fileKey]) {
                return res.status(400).json({ 
                    success: false, 
                    message: `يجب رفع ملف: (${fileKey}) لإتمام طلب الترشح` 
                });
            }
        }

        // 3. التحقق من بيانات الهوية في السجل المدني
        const citizen = await Voter.verifyInRegistry(national_id, birth_date, expiry_date);
        if (!citizen) {
            return res.status(401).json({ success: false, message: "بيانات الهوية غير مطابقة للسجل المدني" });
        }

        // 4. معالجة الصور الشخصية (مصفوفة) - رفع لـ Supabase
        let personalPhotosUrls = [];
        const photos = req.files['personal_photos_url'];
        for (let i = 0; i < photos.length; i++) {
            const url = await processAndUpload(
                photos[i].buffer, 
                `personal_${national_id}_${Date.now()}_${i}.jpg`,
                'candidates', 600, 75
            );
            personalPhotosUrls.push(url);
        }

        // 5. معالجة باقي الملفات (الكل إجباري + الكارنيه الحزبي اختياري)
        const allPossibleFiles = [
            'national_id_card_url', 'education_url', 'military_service_url',
            'financial_disclosure_url', 'birth_certificate_url', 'fitness_health_url',
            'criminal_record_url', 'deposit_receipt_url', 'election_symbol_url',
            'party_card_url' // اختياري: سيبقى null لو لم يتم رفعه
        ];

        let uploadedFiles = {};
        for (const field of allPossibleFiles) {
            if (req.files && req.files[field]) {
                const file = req.files[field][0];
                uploadedFiles[field] = await processAndUpload(
                    file.buffer, 
                    `${field}_${national_id}_${Date.now()}.jpg`
                );
            } else {
                // الكارنيه هو الوحيد الذي يمكن أن يصل هنا ويكون null دون اعتراض الـ Validation
                uploadedFiles[field] = null; 
            }
        }

        // 6. تشفير كلمة المرور وحفظ المرشح في قاعدة البيانات
        const hashedPassword = await bcrypt.hash(password, 10);
        
        const newCandidate = await Candidate.create({
            national_id, 
            email, 
            password: hashedPassword,
            // التأكد أن أرقام الهاتف مصفوفة
            phone_numbers: Array.isArray(phone_numbers) ? phone_numbers : [phone_numbers],
            short_bio, 
            candidate_type, 
            occupation, 
            degree,
            birth_date, 
            expiry_date,
            personal_photos_url: personalPhotosUrls,
            ...uploadedFiles // دمج روابط الملفات المرفوعة
        });

        res.status(201).json({ 
            success: true, 
            message: "تم تقديم طلب الترشح بنجاح وهو الآن قيد المراجعة" 
        });

    } catch (err) {
        console.error("Candidate Registration Error:", err);
        if (err.code === '23505') {
            return res.status(400).json({ success: false, message: "هذا الرقم القومي أو البريد الإلكتروني مسجل كمرشح بالفعل" });
        }
        res.status(500).json({ success: false, message: "حدث خطأ في السيرفر أثناء التسجيل" });
    }
};
// 2. تسجيل الدخول (مع JWT Token)
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

        // توليد التوكن
        const token = jwt.sign(
            { candidate_id: candidate.candidate_id, role: 'candidate' },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.status(200).json({
            success: true,
            token, // إرسال التوكن لـ Postman/Frontend
            message: `أهلاً بك يا ${candidate.full_name.split(' ')[0]}`,
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
        res.status(500).json({ success: false, message: "خطأ أثناء تحميل قائمة المرشحين" });
    }
};