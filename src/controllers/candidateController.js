const Candidate = require('../models/candidateModel');
const Voter = require('../models/voterModel');
const bcrypt = require('bcrypt');
const sharp = require('sharp');
const { uploadToSupabase } = require('../utils/supabaseHelper'); 

// 1. تسجيل مرشح جديد
exports.registerCandidate = async (req, res) => {
    try {
        const { 
            national_id, birth_date, expiry_date, email, password, confirm_password,
            phone_numbers, short_bio, candidate_type, occupation, degree
        } = req.body;

        if (password !== confirm_password) {
            return res.status(400).json({ success: false, message: "كلمات المرور غير متطابقة" });
        }

        const citizen = await Voter.verifyInRegistry(national_id, birth_date);
        if (!citizen) {
            return res.status(401).json({ success: false, message: "بيانات الهوية غير مطابقة للسجل المدني" });
        }

        // --- التعديل هنا: وظيفة داخلية لرفع الصور مع تحديد فولدر candidates ---
        const processAndUpload = async (fileBuffer, fileName, width = 800, quality = 70) => {
            const optimized = await sharp(fileBuffer)
                .resize(width) 
                .jpeg({ quality })
                .toBuffer();
            // بنبعت 'candidates' كبارامتر تالت للدالة الجديدة
            return await uploadToSupabase(optimized, fileName, 'candidates');
        };

        // معالجة الصور الشخصية المتعددة
        let personalPhotosUrls = [];
        if (req.files && req.files['personal_photos_url']) {
            const photos = req.files['personal_photos_url'];
            for (let i = 0; i < photos.length; i++) {
                const url = await processAndUpload(
                    photos[i].buffer, 
                    `personal_${national_id}_${Date.now()}_${i}.jpg`,
                    600, 70
                );
                personalPhotosUrls.push(url);
            }
        }

        // معالجة باقي المستندات الرسمية
        const fileFields = [
    'national_id_card_url', 'education_url', 'military_service_url',
    'financial_disclosure_url', 'birth_certificate_url', 'fitness_health_url',
    'criminal_record_url', 'deposit_receipt_url', 'election_symbol_url',
    'party_card_url' // <--- إضافة كارنيه الحزب هنا
];

        let uploadedFiles = {};
        for (const field of fileFields) {
            if (req.files && req.files[field]) {
                const file = req.files[field][0];
                uploadedFiles[field] = await processAndUpload(
                    file.buffer, 
                    `${field}_${national_id}_${Date.now()}.jpg`,
                    1000, 80 
                );
            } else {
                uploadedFiles[field] = req.body[field] || null;
            }
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const finalPhones = Array.isArray(phone_numbers) ? phone_numbers.slice(0, 3) : [];

        const newCandidate = await Candidate.create({
            national_id, email, password: hashedPassword,
            phone_numbers: finalPhones,
            short_bio, candidate_type, occupation, degree,
            birth_date, expiry_date,
            personal_photos_url: personalPhotosUrls,
            ...uploadedFiles
        });

        res.status(201).json({ 
            success: true, 
            message: "تم تقديم طلب الترشح بنجاح، ورمزك الانتخابي قيد المراجعة",
            data: { candidate_id: newCandidate.candidate_id, age: newCandidate.calculated_age }
        });

    } catch (err) {
        if (err.code === '23505') {
            return res.status(400).json({ success: false, message: "هذا الرقم القومي أو الإيميل مسجل كمرشح بالفعل" });
        }
        res.status(500).json({ success: false, message: "حدث خطأ في السيرفر أثناء المعالجة" });
    }
};

// 2. تسجيل الدخول الذكي
exports.loginCandidate = async (req, res) => {
    const { loginIdentifier, password } = req.body;
    try {
        let candidate = await Candidate.findByEmail(loginIdentifier);
        if (!candidate) {
            candidate = await Candidate.findByNationalId(loginIdentifier);
        }
        if (!candidate) {
            return res.status(404).json({ success: false, message: "هذا الحساب غير موجود" });
        }
        const isMatch = await bcrypt.compare(password, candidate.password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: "كلمة المرور غير صحيحة" });
        }
        res.status(200).json({
            success: true,
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