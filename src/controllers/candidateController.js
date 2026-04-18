const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const sharp = require('sharp');
const { uploadToSupabase } = require('../utils/supabaseHelper');
const Candidate = require('../models/candidateModel');
const pool = require('../config/db');

// --- 1. دالة معالجة الصور ---
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
            return await uploadToSupabase(buffer, fileName, folder);
        }
    } catch (error) {
        console.error(`Error processing ${fileName}:`, error.message);
        return null;
    }
};

// --- مجلدات ملفات المرشح ---
const candidateFileFolders = {
    'election_symbol_url':      'candidates/election_symbols',
    'financial_disclosure_url': 'candidates/financial_disclosures',
    'personal_photos_url':      'candidates/personal_photos',
    'fitness_health_url':       'candidates/fitness_health',
    'deposit_receipt_url':      'candidates/deposit_receipts'
};

// --- 2. التحقق والـ Auto-fill (الشاشة الأولى) ---
exports.verifyBeforeRegister = async (req, res) => {
    try {
        const { national_id, birth_date, expiry_date, email } = req.body;

        if (!national_id || !birth_date || !expiry_date || !email) {
            return res.status(400).json({
                success: false,
                message: "الحقول الأساسية مطلوبة"
            });
        }

        const citizen = await Candidate.verifyRegistry(national_id, birth_date, expiry_date);
        if (!citizen) {
            return res.status(401).json({
                success: false,
                message: "بيانات الهوية غير مطابقة للسجل المدني"
            });
        }

        const duplicateQuery = `
            SELECT 
                CASE WHEN email = $1 THEN 'email' END as email_exists,
                CASE WHEN TRIM(national_id) = TRIM($2) THEN 'national_id' END as id_exists
            FROM candidates
            WHERE email = $1 OR TRIM(national_id) = TRIM($2)
            LIMIT 1
        `;
        const { rows: dupRows } = await pool.query(duplicateQuery, [email, national_id]);
        if (dupRows.length > 0) {
            const msg = dupRows[0].email_exists
                ? "البريد الإلكتروني مسجل مسبقاً"
                : "الرقم القومي مسجل مسبقاً كمرشح";
            return res.status(400).json({ success: false, message: msg });
        }

        res.json({
            success: true,
            message: "تم التحقق بنجاح",
            data: {
                username: citizen.username,
                governorate: citizen.governorate,
                address: citizen.address,
                administrative_unit: citizen.administrative_unit,
                degree: citizen.degree,
                age: citizen.age,
                gender: citizen.gender,
                electoral_district: citizen.electoral_district,
                military_service_url: citizen.military_service_url,
                education_qualification_url: citizen.education_qualification_url,
                birth_certificate_url: citizen.birth_certificate_url,
                criminal_record_url: citizen.criminal_record_url
            }
        });

    } catch (err) {
        console.error("Candidate Verify Error:", err);
        res.status(500).json({ success: false, message: `خطأ في السيرفر: ${err.message}` });
    }
};

// --- 3. تسجيل مرشح جديد ---
exports.registerCandidate = async (req, res) => {
    try {
        const data = req.body;

        const citizen = await Candidate.verifyRegistry(
            data.national_id, data.birth_date, data.expiry_date
        );
        if (!citizen) {
            return res.status(401).json({
                success: false,
                message: "بيانات الهوية غير مطابقة للسجل المدني"
            });
        }

        const duplicateQuery = `
            SELECT 
                CASE WHEN email = $1 THEN 'email' END as email_exists,
                CASE WHEN TRIM(national_id) = TRIM($2) THEN 'national_id' END as id_exists
            FROM candidates
            WHERE email = $1 OR TRIM(national_id) = TRIM($2)
            LIMIT 1
        `;
        const { rows: dupRows } = await pool.query(duplicateQuery, [data.email, data.national_id]);
        if (dupRows.length > 0) {
            const msg = dupRows[0].email_exists
                ? "البريد الإلكتروني مسجل مسبقاً"
                : "الرقم القومي مسجل مسبقاً";
            return res.status(400).json({ success: false, message: msg });
        }

        // رفع ملفات المرشح - كل ملف في مجلده الخاص ✅
        let uploadedUrls = {};
        for (const field of Object.keys(candidateFileFolders)) {
            if (data[field]) {
                const fileName = `${field}_${data.national_id}_${Date.now()}.jpg`;
                const folder = candidateFileFolders[field];
                const url = await processBase64AndUpload(data[field], fileName, folder);
                if (url) uploadedUrls[field] = url;
            }
        }

        // رفع بطاقة الحزب السياسي في مجلدها الخاص ✅
        if (data.political_party_card) {
            const fileName = `political_party_${data.national_id}_${Date.now()}.jpg`;
            const url = await processBase64AndUpload(
                data.political_party_card, fileName, 'candidates/party_cards'
            );
            if (url) uploadedUrls['political_party_card_url'] = url;
        }

        const hashedPassword = await bcrypt.hash(data.password, 10);

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
            electoral_district: citizen.electoral_district,
            ...uploadedUrls
        };

        const newCandidate = await Candidate.create(fullCandidateData);

        res.status(201).json({
            success: true,
            message: `تم تسجيل المرشح بنجاح في دائرة: ${citizen.electoral_district}`,
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

// --- 4. تسجيل الدخول ---
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

// --- 5. قائمة المرشحين ---
exports.listCandidates = async (req, res) => {
    try {
        const userDistrict = req.user.electoral_district;
        const { search } = req.query;

        if (!userDistrict) {
            return res.status(400).json({
                success: false, message: "لم يتم تحديد الدائرة الانتخابية"
            });
        }

        let query = `
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
        `;

        const params = [userDistrict];

        if (search && search.trim() !== '') {
            query += ` AND cr.full_name ILIKE $2`;
            params.push(`%${search.trim()}%`);
        }

        query += ` ORDER BY c.created_at DESC`;

        const { rows } = await pool.query(query, params);

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

// --- 6. بروفايل المرشح ---
exports.getCandidateProfile = async (req, res) => {
    try {
        const profile = await Candidate.getFullProfile(req.params.id);
        if (!profile) return res.status(404).json({
            success: false, message: "المرشح غير موجود"
        });

        res.json({
            success: true,
            data: {
                full_name: profile.full_name,
                age: profile.age,
                degree: profile.degree,
                governorate: profile.governorate,
                short_bio: profile.short_bio,
                personal_photos_url: profile.personal_photos_url,
                election_symbol_url: profile.election_symbol_url
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: "خطأ في جلب البيانات" });
    }
};

// --- 7. إجمالي أصوات مرشح ---
exports.getCandidateVotes = async (req, res) => {
    try {
        const totalVotes = await Candidate.getCandidateVotes(req.params.id);
        res.json({ success: true, total_votes: totalVotes });
    } catch (err) {
        res.status(500).json({ success: false, message: "خطأ في حساب الأصوات" });
    }
};