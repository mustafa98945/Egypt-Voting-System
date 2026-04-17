const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const sharp = require('sharp');
const { uploadToSupabase } = require('../utils/supabaseHelper');
const Candidate = require('../models/candidateModel');
const pool = require('../config/db');

// --- 1. دالة معالجة الصور (بكل تفاصيل الـ Sharp الأصلية) ---
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
        } catch {
            // لو الـ Sharp فشل لأي سبب، ارفع الملف الأصلي
            return await uploadToSupabase(buffer, fileName, folder);
        }
    } catch (error) {
        console.error(`Error processing ${fileName}:`, error.message);
        return null;
    }
};

// --- 2. تسجيل مرشح جديد (مع Flow الحزب السياسي) ---
exports.registerCandidate = async (req, res) => {
    try {
        const data = req.body;

        // التحقق من السجل المدني
        const citizen = await Candidate.verifyRegistry(
            data.national_id, data.birth_date, data.expiry_date
        );
        if (!citizen) {
            return res.status(401).json({
                success: false,
                message: "بيانات الهوية غير مطابقة للسجل المدني"
            });
        }

        // رفع الملفات (الحلقـة هترفع بس اللي المستخدم اختاره "Yes")
        const candidateElectionFiles = [
            'election_symbol_url', 'financial_disclosure_url',
            'personal_photos_url', 'fitness_health_url', 'deposit_receipt_url'
        ];
        let uploadedUrls = {};
        for (const field of candidateElectionFiles) {
            if (data[field]) { // لو الحقل موجود (يعني داس Yes ورفع الصورة)
                const fileName = `${field}_${data.national_id}_${Date.now()}.jpg`;
                const url = await processBase64AndUpload(data[field], fileName);
                if (url) uploadedUrls[field] = url;
            }
        }

        const hashedPassword = await bcrypt.hash(data.password, 10);

        // تجميع كل البيانات (بما فيها الحقول اللي كانت ناقصة)
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
            electoral_district: citizen.electoral_district, // سحب الدائرة من السجل
            ...uploadedUrls
        };

        const newCandidate = await Candidate.create(fullCandidateData);

        res.status(201).json({
            success: true,
            message: "تم تسجيل المرشح بنجاح",
            data: { candidate_id: newCandidate.candidate_id }
        });

    } catch (err) {
        console.error("Register Error:", err);
        if (err.code === '23505') return res.status(400).json({
            success: false, message: "الرقم القومي أو البريد مسجل مسبقاً"
        });
        res.status(500).json({ success: false, message: `خطأ فني: ${err.message}` });
    }
};

// --- 3. تسجيل الدخول (مع ضمان الدائرة في التوكن) ---
exports.loginCandidate = async (req, res) => {
    try {
        const { national_id, email, password, isFaceAuthenticated } = req.body;
        let candidate;

        if (national_id) {
            candidate = await Candidate.findByNationalId(national_id);
            if (!candidate) return res.status(404).json({
                success: false, message: "الرقم القومي غير مسجل"
            });
            if (!isFaceAuthenticated && password) {
                const isMatch = await bcrypt.compare(password, candidate.password);
                if (!isMatch) return res.status(401).json({
                    success: false, message: "كلمة المرور غير صحيحة"
                });
            }
        } else if (email && password) {
            candidate = await Candidate.findByEmail(email);
            if (!candidate) return res.status(404).json({
                success: false, message: "البريد الإلكتروني غير مسجل"
            });
            const isMatch = await bcrypt.compare(password, candidate.password);
            if (!isMatch) return res.status(401).json({
                success: false, message: "كلمة المرور غير صحيحة"
            });
        } else {
            return res.status(400).json({
                success: false, message: "يرجى إدخال البيانات"
            });
        }

        // التوكن المحتوي على الدائرة للفلترة التلقائية 🎯
        const token = jwt.sign(
            {
                id: candidate.candidate_id,
                national_id: candidate.national_id,
                role: 'candidate',
                electoral_district: candidate.electoral_district
            },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.status(200).json({
            success: true,
            token,
            user_data: {
                id: candidate.candidate_id,
                role: 'candidate',
                full_name: candidate.full_name,
                district: candidate.electoral_district
            }
        });

    } catch (err) {
        console.error("Login Error:", err);
        res.status(500).json({ success: false, message: "خطأ في السيرفر" });
    }
};

// --- 4. قائمة المرشحين (الفلترة بالدائرة) ---
exports.listCandidates = async (req, res) => {
    try {
        const userDistrict = req.user.electoral_district;
        
        if (!userDistrict) {
            return res.status(400).json({
                success: false, message: "لم يتم تحديد الدائرة الانتخابية"
            });
        }

        const query = `
            SELECT 
                c.candidate_id,
                c.candidate_type,
                c.personal_photos_url,
                c.election_symbol_url,
                c.occupation,
                cr.full_name,
                cr.governorate
            FROM candidates c
            LEFT JOIN civil_registry cr ON TRIM(c.national_id) = TRIM(cr.national_id)
            WHERE TRIM(c.electoral_district) = TRIM($1)
            ORDER BY c.created_at DESC
        `;
        const { rows } = await pool.query(query, [userDistrict]);

        res.json({
            success: true,
            district: userDistrict,
            count: rows.length,
            data: rows
        });
    } catch (err) {
        console.error("List Error:", err);
        res.status(500).json({ success: false, message: "خطأ في تحميل القائمة" });
    }
};

// --- 5. بروفايل المرشح الكامل (كل البيانات) ---
exports.getCandidateProfile = async (req, res) => {
    try {
        const profile = await Candidate.getFullProfile(req.params.id);
        if (!profile) return res.status(404).json({
            success: false, message: "المرشح غير موجود"
        });

        res.json({
            success: true,
            data: {
                candidate_id: profile.candidate_id,
                full_name: profile.full_name,
                age: profile.age,
                degree: profile.degree,
                governorate: profile.governorate,
                candidate_type: profile.candidate_type,
                occupation: profile.occupation,
                short_bio: profile.short_bio,
                personal_photos_url: profile.personal_photos_url,
                election_symbol_url: profile.election_symbol_url
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: "خطأ في جلب البيانات" });
    }
};

// --- 6. عدد أصوات مرشح معين ---
exports.getCandidateVotes = async (req, res) => {
    try {
        const totalVotes = await Candidate.getCandidateVotes(req.params.id);
        res.json({ success: true, total_votes: totalVotes });
    } catch (err) {
        res.status(500).json({ success: false, message: "خطأ في حساب الأصوات" });
    }
};