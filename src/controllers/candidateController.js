const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const sharp = require('sharp');
const { uploadToSupabase } = require('../utils/supabaseHelper');
const Voter = require('../models/voterModel');
const Candidate = require('../models/candidateModel');
const pool = require('../config/db');

// --- دالة مساعدة لمعالجة الـ Base64 ورفعها ---
const processBase64AndUpload = async (base64String, fileName, folder = 'candidates') => {
    try {
        if (!base64String || typeof base64String !== 'string') return null;
        const base64Data = base64String.split(';base64,').pop();
        const buffer = Buffer.from(base64Data, 'base64');
        if (buffer.length === 0) return null;

        try {
            const optimized = await sharp(buffer)
                .rotate()
                .resize({ width: 1000, withoutEnlargement: true })
                .jpeg({ quality: 70, chromaSubsampling: '4:2:0' }) 
                .toBuffer();
            return await uploadToSupabase(optimized, fileName, folder);
        } catch (sharpError) {
            return await uploadToSupabase(buffer, fileName, folder);
        }
    } catch (error) {
        console.error(`Error processing ${fileName}:`, error.message);
        return null;
    }
};

// --- 1. تسجيل مرشح جديد (OCR + Validation Logic) ---
exports.registerCandidate = async (req, res) => {
    try {
        const data = req.body;

        // التحقق من تطابق كلمة المرور
        if (data.password !== data.confirm_password) {
            return res.status(400).json({ success: false, message: "كلمات المرور غير متطابقة" });
        }

        // مضاهاة بيانات الـ AI (الرقم، الميلاد، الانتهاء) مع السجل المدني
        const citizen = await Voter.verifyInRegistry(data.national_id, data.birth_date, data.expiry_date);
        
        if (!citizen) {
            return res.status(401).json({ 
                success: false, 
                message: "بيانات الهوية غير مطابقة للسجل المدني أو البطاقة منتهية" 
            });
        }

        // معالجة ورفع الصور الشخصية
        let personalPhotosUrls = [];
        if (data.personal_photos_url) {
            const photos = Array.isArray(data.personal_photos_url) ? data.personal_photos_url : [data.personal_photos_url];
            for (let i = 0; i < photos.length; i++) {
                const url = await processBase64AndUpload(photos[i], `personal_${data.national_id}_${Date.now()}_${i}.jpg`);
                if (url) personalPhotosUrls.push(url);
            }
        }

        // رفع الملفات الرسمية (اللي جنبها سهم يمين في التصميم)
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
        const isIndependent = data.candidate_type === 'Independent';

        // حفظ المرشح في الـ Database
        await Candidate.create({
            ...data,
            password: hashedPassword,
            personal_photos_url: personalPhotosUrls,
            is_independent: isIndependent,
            political_party_name: isIndependent ? null : data.political_party_name,
            ...uploadedUrls
        });

        res.status(201).json({ success: true, message: "تم تسجيل طلب الترشح بنجاح" });

    } catch (err) {
        if (err.code === '23505') return res.status(400).json({ success: false, message: "الرقم القومي أو البريد مسجل مسبقاً" });
        res.status(500).json({ success: false, message: `خطأ فني: ${err.message}` });
    }
};

// --- 2. تسجيل دخول المرشح ---
exports.loginCandidate = async (req, res) => {
    try {
        const { national_id, email, password } = req.body;
        const candidate = email ? await Candidate.findByEmail(email) : await Candidate.findByNationalId(national_id);

        if (!candidate || (email && !(await bcrypt.compare(password, candidate.password)))) {
            return res.status(401).json({ success: false, message: "بيانات الدخول غير صحيحة" });
        }

        const token = jwt.sign(
            { id: candidate.candidate_id, role: 'candidate' }, 
            process.env.JWT_SECRET, 
            { expiresIn: '24h' }
        );

        res.status(200).json({ 
            success: true, 
            token, 
            user_data: { 
                id: candidate.candidate_id, 
                full_name: candidate.full_name,
                symbol: candidate.election_symbol_url, 
                governorate: candidate.governorate_name,
                unit: candidate.unit_name
            } 
        });
    } catch (err) {
        res.status(500).json({ success: false, message: "خطأ في السيرفر" });
    }
};

// --- 3. جلب البروفايل (البيانات اللي هتظهر للناخب في Figma) ---
exports.getCandidateProfile = async (req, res) => {
    try {
        const profile = await Candidate.getFullProfile(req.params.id);
        if (!profile) return res.status(404).json({ success: false, message: "المرشح غير موجود" });

        // البيانات منظمة حسب شاشة العرض (الاسم، السن، المحافظة، الرمز)
        res.json({ 
            success: true, 
            data: {
                name: profile.full_name,
                age: profile.age,
                governorate: profile.governorate_name,
                unit: profile.unit_name,
                degree: profile.degree,
                occupation: profile.occupation,
                bio: profile.short_bio,
                symbol_url: profile.election_symbol_url,
                images: profile.personal_photos_url,
                type: profile.candidate_type
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: "خطأ في جلب البيانات" });
    }
};

// --- 4. جلب الأصوات فقط (تحديث Live) ---
exports.getCandidateVotes = async (req, res) => {
    try {
        const totalVotes = await Candidate.getCandidateVotes(req.params.id);
        res.json({ success: true, candidate_id: req.params.id, total_votes: totalVotes });
    } catch (err) {
        res.status(500).json({ success: false, message: "خطأ في حساب الأصوات" });
    }
};

// --- 5. قائمة المرشحين (للكروت الرئيسية) ---
exports.listCandidates = async (req, res) => {
    try {
        const query = `
            SELECT 
                c.candidate_id, 
                cr.full_name, 
                c.occupation, 
                CASE WHEN c.is_independent THEN 'مستقل' ELSE c.political_party_name END as candidate_type,
                c.election_symbol_url,
                c.personal_photos_url[1] as main_photo
            FROM candidates c
            LEFT JOIN civil_registry cr ON TRIM(c.national_id) = TRIM(cr.national_id)
            ORDER BY c.created_at DESC
        `;
        const { rows } = await pool.query(query);
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: "خطأ في تحميل القائمة" });
    }
};