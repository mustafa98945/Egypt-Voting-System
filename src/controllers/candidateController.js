const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const sharp = require('sharp');
const { uploadToSupabase } = require('../utils/supabaseHelper');
const Voter = require('../models/voterModel');
const Candidate = require('../models/candidateModel'); // تأكد من وجود هذا السطر
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
        throw new Error(`فشل في معالجة المستند: ${fileName}`);
    }
};

// --- 1. تسجيل مرشح جديد ---
exports.registerCandidate = async (req, res) => {
    try {
        const data = req.body;
        if (data.password !== data.confirm_password) {
            return res.status(400).json({ success: false, message: "كلمات المرور غير متطابقة" });
        }

        const citizen = await Voter.verifyInRegistry(data.national_id, data.birth_date, data.expiry_date);
        if (!citizen) {
            return res.status(401).json({ success: false, message: "بيانات الهوية غير مطابقة للسجل المدني" });
        }

        let personalPhotosUrls = [];
        const photos = Array.isArray(data.personal_photos_url) ? data.personal_photos_url : [data.personal_photos_url];
        for (let i = 0; i < photos.length; i++) {
            const url = await processBase64AndUpload(photos[i], `personal_${data.national_id}_${Date.now()}_${i}.jpg`);
            if (url) personalPhotosUrls.push(url);
        }

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
        
        // استخدام الموديل لإنشاء المرشح
        await Candidate.create({
            ...data,
            password: hashedPassword,
            personal_photos_url: personalPhotosUrls,
            ...uploadedUrls
        });

        res.status(201).json({ success: true, message: "تم تسجيل طلب الترشح بنجاح" });
    } catch (err) {
        if (err.code === '23505') return res.status(400).json({ success: false, message: "هذا الرقم القومي أو البريد مسجل مسبقاً" });
        res.status(500).json({ success: false, message: `خطأ فني: ${err.message}` });
    }
};

// --- 2. تسجيل دخول المرشح ---
exports.loginCandidate = async (req, res) => {
    try {
        const { national_id, email, password } = req.body;
        let candidate;

        if (email && password) {
            candidate = await Candidate.findByEmail(email);
        } else {
            candidate = await Candidate.findByNationalId(national_id);
        }

        if (!candidate || (email && password && !(await bcrypt.compare(password, candidate.password)))) {
            return res.status(401).json({ success: false, message: "بيانات الدخول غير صحيحة" });
        }

        const token = jwt.sign(
            { id: candidate.candidate_id, role: 'candidate', national_id: candidate.national_id }, 
            process.env.JWT_SECRET, 
            { expiresIn: '24h' }
        );

        res.status(200).json({ 
            success: true, 
            token: token, 
            user_data: { 
                id: candidate.candidate_id, 
                full_name: candidate.full_name,
                national_id: candidate.national_id,
                email: candidate.email,
                symbol: candidate.election_symbol_url, 
                governorate: candidate.governorate_name,
                unit: candidate.unit_name
            } 
        });
    } catch (err) {
        res.status(500).json({ success: false, message: "حدث خطأ أثناء تسجيل الدخول" });
    }
};

// --- 3. جلب بيانات صفحة المرشح التفصيلية (بدون أصوات) ---
exports.getCandidateProfile = async (req, res) => {
    const { id } = req.params;
    try {
        const profile = await Candidate.getFullProfile(id);
        if (!profile) return res.status(404).json({ success: false, message: "المرشح غير موجود" });
        res.json({ success: true, data: profile });
    } catch (err) {
        res.status(500).json({ success: false, message: "خطأ في السيرفر" });
    }
};

// --- 4. جلب عدد الأصوات فقط (الدالة المنفصلة) ---
exports.getCandidateVotes = async (req, res) => {
    const { id } = req.params;
    try {
        const totalVotes = await Candidate.getCandidateVotes(id);
        res.json({ success: true, candidate_id: id, total_votes: totalVotes });
    } catch (err) {
        res.status(500).json({ success: false, message: "خطأ في حساب الأصوات" });
    }
};

// --- 5. عرض قائمة المرشحين (محسنة للـ UI) ---
exports.listCandidates = async (req, res) => {
    try {
        const query = `
            SELECT 
                c.candidate_id, 
                cr.full_name, 
                c.occupation, 
                c.candidate_type,
                c.election_symbol_url,
                c.personal_photos_url[1] as main_photo
            FROM candidates c
            LEFT JOIN civil_registry cr ON TRIM(c.national_id) = TRIM(cr.national_id)
            ORDER BY c.created_at DESC
        `;
        const result = await pool.query(query);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, message: "خطأ في تحميل القائمة" });
    }
};