const Candidate = require('../models/candidateModel');
const Voter = require('../models/voterModel');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const sharp = require('sharp');
const { uploadToSupabase } = require('../utils/supabaseHelper');

// دالة المعالجة والرفع
const processAndUpload = async (fileBuffer, fileName, folder = 'candidates') => {
    const optimized = await sharp(fileBuffer)
        .resize({ width: 1000, withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();
    return await uploadToSupabase(optimized, fileName, folder);
};

exports.registerCandidate = async (req, res) => {
    try {
        const data = req.body;

        // 1. التحقق من وجود كل البيانات النصية الإجبارية (11 حقل)
        const requiredTextFields = [
            'national_id', 'birth_date', 'expiry_date', 'email', 
            'password', 'confirm_password', 'candidate_type', 
            'occupation', 'degree', 'phone_numbers', 'short_bio'
        ];
        
        for (const field of requiredTextFields) {
            if (!data[field]) {
                return res.status(400).json({ 
                    success: false, 
                    message: `الحقل النصي (${field}) مطلوب لإتمام الطلب` 
                });
            }
        }

        // 2. التحقق من تطابق كلمة المرور
        if (data.password !== data.confirm_password) {
            return res.status(400).json({ success: false, message: "كلمات المرور غير متطابقة" });
        }

        // 3. التحقق من وجود الـ 10 ملفات الإجبارية
        const mandatoryFiles = [
            'personal_photos_url', 'national_id_card_url', 'education_url', 
            'military_service_url', 'financial_disclosure_url', 'birth_certificate_url', 
            'fitness_health_url', 'criminal_record_url', 'deposit_receipt_url', 
            'election_symbol_url'
        ];

        for (const field of mandatoryFiles) {
            if (!req.files || !req.files[field]) {
                return res.status(400).json({ 
                    success: false, 
                    message: `يجب رفع مستند: (${field}) لإتمام عملية الترشح` 
                });
            }
        }

        // 4. التحقق من السجل المدني (قبل البدء في عمليات الرفع المكلفة)
        const citizen = await Voter.verifyInRegistry(data.national_id, data.birth_date, data.expiry_date);
        if (!citizen) {
            return res.status(401).json({ success: false, message: "بيانات الهوية غير مطابقة للسجل المدني" });
        }

        // 5. معالجة الصور الشخصية (مصفوفة)
        let personalPhotosUrls = [];
        const photos = req.files['personal_photos_url'];
        for (let i = 0; i < photos.length; i++) {
            const url = await processAndUpload(
                photos[i].buffer, 
                `personal_${data.national_id}_${Date.now()}_${i}.jpg`
            );
            personalPhotosUrls.push(url);
        }

        // 6. معالجة باقي الملفات (الإجبارية + الكارنيه الاختياري)
        const fileFields = [
            'national_id_card_url', 'education_url', 'military_service_url',
            'financial_disclosure_url', 'birth_certificate_url', 'fitness_health_url',
            'criminal_record_url', 'deposit_receipt_url', 'election_symbol_url',
            'party_card_url' // سيبقى null لو لم يرفع (اختياري)
        ];

        let uploadedUrls = {};
        for (const field of fileFields) {
            if (req.files[field]) {
                const file = req.files[field][0];
                uploadedUrls[field] = await processAndUpload(
                    file.buffer, 
                    `${field}_${data.national_id}_${Date.now()}.jpg`
                );
            } else {
                uploadedUrls[field] = null;
            }
        }

        // 7. تشفير كلمة المرور
        const hashedPassword = await bcrypt.hash(data.password, 10);

        // 8. استدعاء الـ Model وحفظ البيانات
        const newCandidate = await Candidate.create({
            ...data,
            password: hashedPassword,
            // التأكد من تحويل أرقام الهاتف لمصفوفة
            phone_numbers: Array.isArray(data.phone_numbers) ? data.phone_numbers : [data.phone_numbers],
            personal_photos_url: personalPhotosUrls,
            ...uploadedUrls
        });

        res.status(201).json({ 
            success: true, 
            message: "تم تسجيل طلب الترشح بنجاح وهو الآن قيد المراجعة",
            candidate_id: newCandidate.candidate_id 
        });

    } catch (err) {
        console.error("Candidate Registration Error:", err);
        // التعامل مع تكرار الرقم القومي أو الإيميل
        if (err.code === '23505') {
            return res.status(400).json({ success: false, message: "الرقم القومي أو البريد الإلكتروني مسجل مسبقاً" });
        }
        res.status(500).json({ success: false, message: "حدث خطأ في السيرفر أثناء معالجة الطلب" });
    }
};