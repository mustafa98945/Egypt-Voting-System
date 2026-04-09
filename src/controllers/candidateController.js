const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const sharp = require('sharp');
const { uploadToSupabase } = require('../utils/supabaseHelper');
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
            // لو sharp فشل لأي سبب، نرفع الـ buffer الأصلي
            return await uploadToSupabase(buffer, fileName, folder);
        }
    } catch (error) {
        console.error(`Error processing ${fileName}:`, error.message);
        return null;
    }
};

// --- 1. تسجيل مرشح جديد (الربط المطور مع السجل المدني) ---
exports.registerCandidate = async (req, res) => {
    try {
        const data = req.body;

        // الخطوة 1: الـ Triple Check وسحب بيانات السجل المدني
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

        // الخطوة 2: معالجة الـ 5 ملفات الانتخابية ورفعهم (عشان تطلع روابط حقيقية)
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
                    uploadedUrls[field] = publicUrl; // هنا بنخزن الرابط الحقيقي من Supabase
                }
            }
        }

        const hashedPassword = await bcrypt.hash(data.password, 10);
        
        // الخطوة 3: تجميع البيانات النهائية
        const fullCandidateData = {
            // بيانات السجل المدني
            username: citizen.username,
            governorate_name: citizen.governorate, 
            address_details: citizen.address,   
            unit_name: citizen.administrative_unit, 
            degree: citizen.degree,
            age: citizen.age,
            gender: citizen.gender,
            military_service_url: citizen.military_service_url,
            education_url: citizen.education_qualification_url,
            birth_certificate_url: citizen.birth_certificate_url,
            criminal_record_url: citizen.criminal_record_url,
            national_id_front_url: citizen.national_id_front_url, 
            national_id_back_url: citizen.national_id_back_url,
            
            // بيانات الإدخال
            email: data.email,
            password: hashedPassword,
            national_id: data.national_id,
            birth_date: data.birth_date,
            expiry_date: data.expiry_date,
            phone_number: data.phone_number,
            occupation: data.occupation,
            candidate_type: data.candidate_type,
            short_bio: data.short_bio,

            // دمج روابط الرفع الحقيقية (بتعمل Override لو فيه أي روابط قديمة)
            ...uploadedUrls
        };

        const newCandidate = await Candidate.create(fullCandidateData);

        // المخرجات المطلوبة لملء الصفحة تلقائياً مع الروابط الحقيقية
        res.status(201).json({ 
            success: true, 
            message: "تم التحقق من السجل وسحب الأوراق الموثقة بنجاح",
            data: {
                candidate_id: newCandidate.candidate_id,
                username: newCandidate.username,
                governorate_name: newCandidate.governorate_name,
                address_details: newCandidate.address_details,
                unit_name: newCandidate.unit_name,
                degree: newCandidate.degree,
                age: newCandidate.age,
                gender: newCandidate.gender,
                email: newCandidate.email,
                national_id: newCandidate.national_id,
                phone_number: newCandidate.phone_number,
                occupation: newCandidate.occupation,
                candidate_type: newCandidate.candidate_type,
                // الروابط الـ 5 المرفوعة حديثاً
                election_symbol_url: newCandidate.election_symbol_url,
                personal_photos_url: newCandidate.personal_photos_url,
                financial_disclosure_url: newCandidate.financial_disclosure_url,
                fitness_health_url: newCandidate.fitness_health_url,
                deposit_receipt_url: newCandidate.deposit_receipt_url,
                // روابط السجل المدني
                military_service_url: newCandidate.military_service_url,
                education_url: newCandidate.education_url,
                birth_certificate_url: newCandidate.birth_certificate_url,
                criminal_record_url: newCandidate.criminal_record_url
            }
        });

    } catch (err) {
        if (err.code === '23505') return res.status(400).json({ success: false, message: "الرقم القومي أو البريد مسجل مسبقاً" });
        res.status(500).json({ success: false, message: `خطأ فني: ${err.message}` });
    }
};

// --- تسجيل دخول المرشح ---
exports.loginCandidate = async (req, res) => {
    try {
        const { national_id, email, password } = req.body;
        const candidate = email ? await Candidate.findByEmail(email) : await Candidate.findByNationalId(national_id);

        if (!candidate || !(await bcrypt.compare(password, candidate.password))) {
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
                username: candidate.username,
                email: candidate.email
            } 
        });
    } catch (err) {
        res.status(500).json({ success: false, message: "خطأ في السيرفر" });
    }
};

// --- جلب البروفايل ---
exports.getCandidateProfile = async (req, res) => {
    try {
        const profile = await Candidate.getFullProfile(req.params.id);
        if (!profile) return res.status(404).json({ success: false, message: "المرشح غير موجود" });
        res.json({ success: true, data: profile });
    } catch (err) {
        res.status(500).json({ success: false, message: "خطأ في جلب البيانات" });
    }
};

// --- عداد الأصوات ---
exports.getCandidateVotes = async (req, res) => {
    try {
        const totalVotes = await Candidate.getCandidateVotes(req.params.id);
        res.json({ success: true, total_votes: totalVotes });
    } catch (err) {
        res.status(500).json({ success: false, message: "خطأ في حساب الأصوات" });
    }
};

// --- قائمة المرشحين ---
exports.listCandidates = async (req, res) => {
    try {
        const query = `
            SELECT 
                c.candidate_id, 
                c.username,
                cr.full_name, 
                c.occupation, 
                c.election_symbol_url,
                c.personal_photos_url
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