const Candidate = require('../models/candidateModel');
const Voter = require('../models/voterModel');
const bcrypt = require('bcrypt');
const sharp = require('sharp');
const { uploadToSupabase } = require('../utils/supabaseHelper');

// --- دالة مساعدة لمعالجة الصور وضغطها (خارج الـ exports عشان النضافة) ---
const processAndUpload = async (fileBuffer, fileName, folder = 'candidates', width = 1000, quality = 80) => {
    try {
        const optimized = await sharp(fileBuffer)
            .resize({ width, withoutEnlargement: true }) // تكبير الصورة لو صغيرة بيوظ جودتها، فبنمنع ده
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

        // 1. التحقق من تطابق كلمة المرور
        if (password !== confirm_password) {
            return res.status(400).json({ success: false, message: "كلمات المرور غير متطابقة" });
        }

        // 2. التحقق من السجل المدني (Voter Registry)
        const citizen = await Voter.verifyInRegistry(national_id, birth_date);
        if (!citizen) {
            return res.status(401).json({ success: false, message: "بيانات الهوية غير مطابقة للسجل المدني" });
        }

        // 3. معالجة الصور الشخصية المتعددة
        let personalPhotosUrls = [];
        if (req.files && req.files['personal_photos_url']) {
            const photos = req.files['personal_photos_url'];
            for (let i = 0; i < photos.length; i++) {
                const url = await processAndUpload(
                    photos[i].buffer, 
                    `personal_${national_id}_${Date.now()}_${i}.jpg`,
                    'candidates', 600, 75 // الصور الشخصية مش محتاجة مساحة عملاقة
                );
                personalPhotosUrls.push(url);
            }
        }

        // 4. معالجة باقي المستندات الرسمية (أتوماتيك)
        const fileFields = [
            'national_id_card_url', 'education_url', 'military_service_url',
            'financial_disclosure_url', 'birth_certificate_url', 'fitness_health_url',
            'criminal_record_url', 'deposit_receipt_url', 'election_symbol_url',
            'party_card_url'
        ];

        let uploadedFiles = {};
        for (const field of fileFields) {
            if (req.files && req.files[field]) {
                const file = req.files[field][0];
                uploadedFiles[field] = await processAndUpload(
                    file.buffer, 
                    `${field}_${national_id}_${Date.now()}.jpg`
                );
            } else {
                // لو مفيش ملف مرفوع، بنشوف لو باعت URL جاهز (للاختبار) أو نحط null
                uploadedFiles[field] = req.body[field] || null;
            }
        }

        // 5. تشفير كلمة المرور وتجهيز البيانات
        const hashedPassword = await bcrypt.hash(password, 10);
        const finalPhones = Array.isArray(phone_numbers) ? phone_numbers.slice(0, 3) : [];

        // 6. إنشاء السجل في قاعدة البيانات
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
            message: "تم تقديم طلب الترشح بنجاح، وطلبك قيد المراجعة",
            data: { candidate_id: newCandidate.candidate_id, age: newCandidate.calculated_age }
        });

    } catch (err) {
        console.error("Register Error:", err);
        if (err.code === '23505') {
            return res.status(400).json({ success: false, message: "هذا الرقم القومي أو البريد الإلكتروني مسجل بالفعل" });
        }
        res.status(500).json({ success: false, message: "حدث خطأ في السيرفر أثناء المعالجة" });
    }
};

// 2. تسجيل الدخول الذكي
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