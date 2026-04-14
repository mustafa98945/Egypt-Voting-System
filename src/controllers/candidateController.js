const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const sharp = require('sharp');
const { uploadToSupabase } = require('../utils/supabaseHelper');
const Candidate = require('../models/candidateModel');
const pool = require('../config/db');

// --- دالة مساعدة لمعالجة الـ Base64 ورفعها ---
// ميزة الدالة دي إنها بتصغر حجم الصور قبل الرفع عشان السيرفر ميهنجش
const processBase64AndUpload = async (base64String, fileName, folder = 'candidates') => {
    try {
        if (!base64String || typeof base64String !== 'string') return null;
        
        // فك تشفير الـ Base64 وتحويله لـ Buffer
        const base64Data = base64String.split(';base64,').pop();
        const buffer = Buffer.from(base64Data, 'base64');
        if (buffer.length === 0) return null;

        try {
            // استخدام Sharp لضغط الصورة وتقليل جودتها لـ 70% (توفير مساحة وسرعة)
            const optimized = await sharp(buffer)
                .rotate() // لتعديل اتجاه الصورة لو متصورة بالموبايل مقلوبة
                .resize({ width: 1000, withoutEnlargement: true }) // عرض أقصى 1000 بكسل
                .jpeg({ quality: 70, chromaSubsampling: '4:2:0' }) 
                .toBuffer();
            return await uploadToSupabase(optimized, fileName, folder);
        } catch (sharpError) {
            // لو sharp فشل لأي سبب (ملف مش صورة مثلاً)، بنرفع الـ buffer الأصلي
            return await uploadToSupabase(buffer, fileName, folder);
        }
    } catch (error) {
        console.error(`Error processing ${fileName}:`, error.message);
        return null;
    }
};

// --- 1. تسجيل مرشح جديد ---
exports.registerCandidate = async (req, res) => {
    try {
        const data = req.body;

        // الخطوة 1: التحقق من السجل المدني (Triple Check)
        const citizen = await Candidate.verifyRegistry(
            data.national_id, 
            data.birth_date, 
            data.expiry_date
        );
        
        if (!citizen) {
            return res.status(401).json({ 
                success: false, 
                message: "بيانات الهوية غير مطابقة للسجل المدني أو البطاقة منتهية" 
            });
        }

        // الخطوة 2: معالجة الملفات الكثيرة للمرشح (الصور والمستندات)
        const candidateElectionFiles = [
            'election_symbol_url', 
            'financial_disclosure_url', 
            'personal_photos_url', 
            'fitness_health_url', 
            'deposit_receipt_url'
        ];
        
        let uploadedUrls = {};
        for (const field of candidateElectionFiles) {
            if (data[field]) {
                const fileName = `${field}_${data.national_id}_${Date.now()}.jpg`;
                const publicUrl = await processBase64AndUpload(data[field], fileName);
                if (publicUrl) {
                    uploadedUrls[field] = publicUrl;
                }
            }
        }

        // الخطوة 3: تشفير كلمة المرور
        const hashedPassword = await bcrypt.hash(data.password, 10);
        
        // الخطوة 4: تجميع البيانات النهائية للحفظ
        const fullCandidateData = {
            national_id: data.national_id,
            birth_date: data.birth_date,
            expiry_date: data.expiry_date,
            email: data.email,
            password: hashedPassword,
            phone_number: data.phone_number,
            occupation: data.occupation,
            candidate_type: data.candidate_type,
            short_bio: data.short_bio,
            ...uploadedUrls
        };

        const newCandidate = await Candidate.create(fullCandidateData);

        res.status(201).json({ 
            success: true, 
            message: "تم تسجيل المرشح بنجاح",
            data: {
                candidate_id: newCandidate.candidate_id,
                national_id: newCandidate.national_id
            }
        });

    } catch (err) {
        console.error("Register Error:", err);
        if (err.code === '23505') return res.status(400).json({ success: false, message: "الرقم القومي أو البريد مسجل مسبقاً كمرشح" });
        res.status(500).json({ success: false, message: `خطأ فني: ${err.message}` });
    }
};

// --- 2. تسجيل دخول المرشح ---
exports.loginCandidate = async (req, res) => {
    try {
        const { national_id, email, password, isFaceAuthenticated } = req.body;
        let candidate;

        // البحث سواء بالرقم القومي أو الايميل
        if (national_id) {
            candidate = await Candidate.findByNationalId(national_id);
            if (!candidate) return res.status(404).json({ success: false, message: "الرقم القومي غير مسجل" });

            // لو مش داخل ببصمة الوجه، لازم نتشيك على الباسورد
            if (!isFaceAuthenticated && password) {
                const isMatch = await bcrypt.compare(password, candidate.password);
                if (!isMatch) return res.status(401).json({ success: false, message: "كلمة المرور غير صحيحة" });
            }
        } 
        else if (email) {
            candidate = await Candidate.findByEmail(email);
            if (!candidate) return res.status(404).json({ success: false, message: "البريد الإلكتروني غير مسجل" });

            const isMatch = await bcrypt.compare(password, candidate.password);
            if (!isMatch) return res.status(401).json({ success: false, message: "بيانات الدخول غير صحيحة" });
        } 
        else {
            return res.status(400).json({ success: false, message: "يرجى إدخال الرقم القومي أو البريد" });
        }

        // ✅ التعديل الجذري: إضافة الـ Role والـ ID الصحيح للتوكن لضمان صلاحيات التصويت لاحقاً
        const token = jwt.sign(
            { 
                id: candidate.candidate_id, 
                national_id: candidate.national_id,
                role: 'candidate' 
            }, 
            process.env.JWT_SECRET, 
            { expiresIn: '24h' }
        );

        res.status(200).json({ 
            success: true, 
            token, 
            user_data: {
                id: candidate.candidate_id,
                national_id: candidate.national_id,
                role: 'candidate',
                full_name: candidate.full_name 
            }
        });

    } catch (err) {
        console.error("Login Error:", err);
        res.status(500).json({ success: false, message: "خطأ في السيرفر" });
    }
};

// --- 3. جلب البروفايل ---
exports.getCandidateProfile = async (req, res) => {
    try {
        const profile = await Candidate.getFullProfile(req.params.id);
        if (!profile) return res.status(404).json({ success: false, message: "المرشح غير موجود" });
        res.json({ success: true, data: profile });
    } catch (err) {
        res.status(500).json({ success: false, message: "خطأ في جلب البيانات" });
    }
};

// --- 4. قائمة المرشحين (لعرضها في شاشة التصويت) ---
exports.listCandidates = async (req, res) => {
    try {
        const query = `
            SELECT 
                c.national_id, 
                cr.full_name, 
                c.occupation, 
                c.candidate_type,
                c.election_symbol_url,
                c.personal_photos_url,
                c.candidate_id
            FROM candidates c
            LEFT JOIN civil_registry cr ON c.national_id = cr.national_id
            ORDER BY c.created_at DESC
        `;
        const { rows } = await pool.query(query);
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error("List Error:", err);
        res.status(500).json({ success: false, message: "خطأ في تحميل القائمة" });
    }
};

// --- 5. عداد الأصوات للمرشح ---
exports.getCandidateVotes = async (req, res) => {
    try {
        const totalVotes = await Candidate.getCandidateVotes(req.params.id);
        res.json({ success: true, total_votes: totalVotes });
    } catch (err) {
        res.status(500).json({ success: false, message: "خطأ في حساب الأصوات" });
    }
};