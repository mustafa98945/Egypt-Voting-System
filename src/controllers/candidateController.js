const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const sharp = require('sharp');
const { uploadToSupabase } = require('../utils/supabaseHelper');
const Candidate = require('../models/candidateModel');
const pool = require('../config/db');

////////////////////////////////////////////////////////////
// ✅ رفع الصور
////////////////////////////////////////////////////////////
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
                .jpeg({ quality: 70 })
                .toBuffer();

            return await uploadToSupabase(optimized, fileName, folder);
        } catch {
            return await uploadToSupabase(buffer, fileName, folder);
        }

    } catch (error) {
        console.error(error.message);
        return null;
    }
};

////////////////////////////////////////////////////////////
// ✅ التحقق الأولي
////////////////////////////////////////////////////////////
exports.verifyBeforeRegister = async (req, res) => {
    try {
        const { national_id, birth_date, expiry_date, email } = req.body;

        const citizen = await Candidate.verifyRegistry(
            national_id,
            birth_date,
            expiry_date
        );

        if (!citizen) {
            return res.status(401).json({
                success: false,
                message: "بيانات الهوية غير صحيحة"
            });
        }

        res.json({
            success: true,
            data: {
                full_name: citizen.full_name,
                governorate: citizen.governorate,
                administrative_unit: citizen.administrative_unit
            }
        });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

////////////////////////////////////////////////////////////
// ✅ تسجيل مرشح
////////////////////////////////////////////////////////////
exports.registerCandidate = async (req, res) => {
    try {
        const data = req.body;

        const citizen = await Candidate.verifyRegistry(
            data.national_id,
            data.birth_date,
            data.expiry_date
        );

        if (!citizen) {
            return res.status(401).json({
                success: false,
                message: "فشل التحقق"
            });
        }

        const hashedPassword = await bcrypt.hash(data.password, 10);

        const newCandidate = await Candidate.create({
            national_id: data.national_id,
            birth_date: data.birth_date,
            expiry_date: data.expiry_date,
            email: data.email,
            password: hashedPassword,
            phone_number: data.phone_number,
            occupation: data.occupation,
            candidate_type: data.candidate_type,
            short_bio: data.short_bio
        });

        res.status(201).json({
            success: true,
            message: "تم تسجيل المرشح بنجاح",
            data: { candidate_id: newCandidate.candidate_id }
        });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

////////////////////////////////////////////////////////////
// ✅ تسجيل الدخول
////////////////////////////////////////////////////////////
exports.loginCandidate = async (req, res) => {
    try {
        const { email, password } = req.body;

        const candidate = await Candidate.findByEmail(email);

        if (!candidate) {
            return res.status(404).json({
                success: false,
                message: "الحساب غير موجود"
            });
        }

        const isMatch = await bcrypt.compare(password, candidate.password);

        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: "كلمة المرور غير صحيحة"
            });
        }

        // ✅ مهم جداً: نحط administrative_unit في التوكن
        const token = jwt.sign(
            {
                id: candidate.candidate_id,
                national_id: candidate.national_id,
                role: 'candidate',
                administrative_unit: candidate.administrative_unit
            },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            success: true,
            token,
            user_data: {
                id: candidate.candidate_id,
                role: 'candidate',
                administrative_unit: candidate.administrative_unit
            }
        });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

////////////////////////////////////////////////////////////
// ✅ قائمة المرشحين (فلترة حسب administrative_unit فقط)
////////////////////////////////////////////////////////////
exports.listCandidates = async (req, res) => {
    try {

        const userUnit = req.user.administrative_unit;

        if (!userUnit) {
            return res.status(400).json({
                success: false,
                message: "الوحدة الإدارية غير موجودة"
            });
        }

        const query = `
            SELECT 
                c.candidate_id,
                cr.full_name AS name,
                DATE_PART('year', AGE(CURRENT_DATE, cr.birth_date))::INT AS age,
                cr.degree,
                cr.governorate AS location,
                c.short_bio,
                c.personal_photos_url AS personal_photo,
                c.election_symbol_url AS symbol
            FROM candidates c
            JOIN civil_registry cr
              ON TRIM(c.national_id) = TRIM(cr.national_id)
            WHERE TRIM(cr.administrative_unit) = TRIM($1)
            ORDER BY c.created_at DESC
        `;

        const { rows } = await pool.query(query, [userUnit]);

        res.json({
            success: true,
            count: rows.length,
            data: rows
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: "خطأ في تحميل القائمة"
        });
    }
};

////////////////////////////////////////////////////////////
// ✅ بروفايل مرشح
////////////////////////////////////////////////////////////
exports.getCandidateProfile = async (req, res) => {
    try {
        const profile = await Candidate.getFullProfile(req.params.id);

        if (!profile) {
            return res.status(404).json({
                success: false,
                message: "غير موجود"
            });
        }

        res.json({
            success: true,
            data: profile
        });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

////////////////////////////////////////////////////////////
// ✅ عدد الأصوات
////////////////////////////////////////////////////////////
exports.getCandidateVotes = async (req, res) => {
    try {
        const totalVotes = await Candidate.getCandidateVotes(req.params.id);
        res.json({ success: true, total_votes: totalVotes });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};