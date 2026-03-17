const Candidate = require('../models/candidateModel');
const Voter = require('../models/voterModel');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const sharp = require('sharp');
const { uploadToSupabase } = require('../utils/supabaseHelper');

// --- دالة مساعدة لتحويل الـ Base64 إلى Buffer ورفعه ---
const processBase64AndUpload = async (base64String, fileName, folder = 'candidates') => {
    try {
        if (!base64String) return null;

        // 1. تنظيف نص الـ Base64 (إزالة الجزء التعريفي لو وجد)
        const base64Data = base64String.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, 'base64');

        // 2. معالجة الصورة باستخدام Sharp (تقليل الحجم والجودة لضمان السرعة)
        const optimized = await sharp(buffer)
            .resize({ width: 800, withoutEnlargement: true }) // تقليل العرض لسرعة الرفع
            .jpeg({ quality: 70 }) // جودة متوازنة
            .toBuffer();
            
        // 3. الرفع لـ Supabase
        return await uploadToSupabase(optimized, fileName, folder);
    } catch (error) {
        console.error(`Error processing file ${fileName}:`, error);
        throw new Error(`فشل في معالجة المستند: ${fileName}`);
    }
};

exports.registerCandidate = async (req, res) => {
    try {
        const data = req.body; // البيانات الآن تأتي كلها من الـ Body كـ JSON

        // 1. التحقق من الحقول النصية (11 حقل)
        const requiredTextFields = [
            'national_id', 'birth_date', 'expiry_date', 'email', 
            'password', 'confirm_password', 'candidate_type', 
            'occupation', 'degree', 'phone_numbers', 'short_bio'
        ];
        
        for (const field of requiredTextFields) {
            if (!data[field]) {
                return res.status(400).json({ 
                    success: false, 
                    message: `الحقل (${field}) مطلوب` 
                });
            }
        }

        if (data.password !== data.confirm_password) {
            return res.status(400).json({ success: false, message: "كلمات المرور غير متطابقة" });
        }

        // 2. التحقق من وجود نصوص الصور (Base64 Strings) - الـ 10 مستندات الإجبارية
        const mandatoryFiles = [
            'personal_photos_url', 'national_id_card_url', 'education_url', 
            'military_service_url', 'financial_disclosure_url', 'birth_certificate_url', 
            'fitness_health_url', 'criminal_record_url', 'deposit_receipt_url', 
            'election_symbol_url'
        ];

        for (const field of mandatoryFiles) {
            if (!data[field]) {
                return res.status(400).json({ 
                    success: false, 
                    message: `يجب إرسال صورة: (${field}) بصيغة نصية (Base64)` 
                });
            }
        }

        // 3. التحقق من السجل المدني
        const citizen = await Voter.verifyInRegistry(data.national_id, data.birth_date, data.expiry_date);
        if (!citizen) {
            return res.status(401).json({ success: false, message: "بيانات الهوية غير مطابقة للسجل المدني" });
        }

        // 4. معالجة الصور الشخصية (مصفوفة نصوص Base64)
        let personalPhotosUrls = [];
        const photos = Array.isArray(data.personal_photos_url) ? data.personal_photos_url : [data.personal_photos_url];
        
        for (let i = 0; i < photos.length; i++) {
            const url = await processBase64AndUpload(
                photos[i], 
                `personal_${data.national_id}_${Date.now()}_${i}.jpg`
            );
            personalPhotosUrls.push(url);
        }

        // 5. معالجة باقي المستندات
        const fileFields = [
            'national_id_card_url', 'education_url', 'military_service_url',
            'financial_disclosure_url', 'birth_certificate_url', 'fitness_health_url',
            'criminal_record_url', 'deposit_receipt_url', 'election_symbol_url',
            'party_card_url'
        ];

        let uploadedUrls = {};
        for (const field of fileFields) {
            if (data[field]) {
                uploadedUrls[field] = await processBase64AndUpload(
                    data[field], 
                    `${field}_${data.national_id}_${Date.now()}.jpg`
                );
            } else {
                uploadedUrls[field] = null;
            }
        }

        // 6. تشفير كلمة المرور
        const hashedPassword = await bcrypt.hash(data.password, 10);

        // 7. حفظ البيانات النهائية
        const newCandidate = await Candidate.create({
            ...data,
            password: hashedPassword,
            phone_numbers: Array.isArray(data.phone_numbers) ? data.phone_numbers : [data.phone_numbers],
            personal_photos_url: personalPhotosUrls,
            ...uploadedUrls
        });

        res.status(201).json({ 
            success: true, 
            message: "تم استقبال ومعالجة طلب الترشح بنجاح" 
        });

    } catch (err) {
        console.error("Critical Registration Error:", err);
        if (err.code === '23505') {
            return res.status(400).json({ success: false, message: "البيانات مسجلة مسبقاً" });
        }
        res.status(500).json({ success: false, message: "حدث خطأ فني أثناء الرفع والمعالجة" });
    }
};