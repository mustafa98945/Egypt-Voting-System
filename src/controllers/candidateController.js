const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const sharp = require('sharp');
const { uploadToSupabase } = require('../utils/supabaseHelper');
const Candidate = require('../models/candidateModel');
const { pool } = require('../config/db');

////////////////////////////////////////////////////////////
// ✅ رفع الصور (محتفظ بيه كما هو)
////////////////////////////////////////////////////////////
const processBase64AndUpload = async (base64String, fileName, folder = 'candidates') => {
    try {
        if (!base64String || typeof base64String !== 'string') return null;

        const base64Data = base64String.split(';base64,').pop();
        const buffer = Buffer.from(base64Data, 'base64');

        const optimized = await sharp(buffer)
            .rotate()
            .resize({ width: 1000 })
            .jpeg({ quality: 70 })
            .toBuffer();

        return await uploadToSupabase(optimized, fileName, folder);

    } catch (error) {
        console.error(error.message);
        return null;
    }
};

////////////////////////////////////////////////////////////
// ✅ VERIFY
////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////
// ✅ VERIFY BEFORE REGISTER
////////////////////////////////////////////////////////////
exports.verifyBeforeRegister = async (req, res) => {
    try {
        const { national_id, birth_date, expiry_date } = req.body;

        const citizen = await Candidate.verifyRegistry(
            national_id,
            birth_date,
            expiry_date
        );

        if (!citizen) {
            return res.status(401).json({
                success: false,
                message: "Invalid identity information"
            });
        }

        // ✅ شرط السن من DB
        if (citizen.age < 18) {
            return res.status(400).json({
                success: false,
                message: "You must be at least 18 years old to register"
            });
        }

        return res.json({
            success: true,
            data: {
                full_name: citizen.full_name,
                governorate: citizen.governorate,
                address: citizen.address,
                administrative_unit: citizen.administrative_unit,
                degree: citizen.degree,
                gender: citizen.gender,
                age: citizen.age,
                military_service_url: citizen.military_service_url,
                education_qualification_url: citizen.education_qualification_url,
                birth_certificate_url: citizen.birth_certificate_url,
                criminal_record_url: citizen.criminal_record_url
            }
        });

    } catch (err) {
        console.error("Verify Error:", err);
        return res.status(500).json({
            success: false,
            message: err.message
        });
    }
};


////////////////////////////////////////////////////////////
// ✅ REGISTER CANDIDATE
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
                message: "Verification failed"
            });
        }

        // ✅ شرط السن من DB
        if (citizen.age < 18) {
            return res.status(400).json({
                success: false,
                message: "You must be at least 18 years old to register"
            });
        }

        const hashedPassword = await bcrypt.hash(data.password, 10);

        const uploadFile = async (fileData, fieldName, folder) => {
            if (!fileData) return null;

            if (typeof fileData === 'string' && fileData.startsWith('http')) {
                return fileData;
            }

            const fileName = `${fieldName}_${data.national_id}_${Date.now()}.jpg`;
            return await processBase64AndUpload(fileData, fileName, folder);
        };

        const [
            election_symbol_url,
            personal_photos_url,
            financial_disclosure_url,
            fitness_health_url,
            deposit_receipt_url
        ] = await Promise.all([
            uploadFile(data.election_symbol_url, 'election_symbol', 'candidates/election_symbols'),
            uploadFile(data.personal_photos_url, 'personal_photo', 'candidates/personal_photos'),
            uploadFile(data.financial_disclosure_url, 'financial', 'candidates/financial_disclosures'),
            uploadFile(data.fitness_health_url, 'fitness', 'candidates/fitness_health'),
            uploadFile(data.deposit_receipt_url, 'deposit', 'candidates/deposit_receipts')
        ]);

        const newCandidate = await Candidate.create({
            national_id: data.national_id,
            birth_date: data.birth_date,
            expiry_date: data.expiry_date,
            email: data.email,
            password: hashedPassword,
            phone_number: data.phone_number,
            occupation: data.occupation,
            candidate_type: data.candidate_type,
            short_bio: data.short_bio,
            election_symbol_url,
            personal_photos_url,
            financial_disclosure_url,
            fitness_health_url,
            deposit_receipt_url
        });

        return res.status(201).json({
            success: true,
            message: "Candidate registered successfully",
            data: { candidate_id: newCandidate.candidate_id }
        });

    } catch (err) {
        console.error("Register Error:", err);
        return res.status(500).json({
            success: false,
            message: err.message
        });
    }
};
////////////////////////////////////////////////////////////
// ✅ LOGIN
////////////////////////////////////////////////////////////
exports.loginCandidate = async (req, res) => {
    try {
        const { email, password, national_id } = req.body;

        let candidate;

        ////////////////////////////////////////////////////////////
        // ✅ 1️⃣ Login باستخدام national_id فقط
        ////////////////////////////////////////////////////////////
        if (national_id) {
            candidate = await Candidate.findByNationalId(national_id);
        }

        ////////////////////////////////////////////////////////////
        // ✅ 2️⃣ Login باستخدام Email + Password
        ////////////////////////////////////////////////////////////
        else if (email && password) {

            candidate = await Candidate.findByEmail(email);

            if (candidate) {
                const isMatch = await bcrypt.compare(password, candidate.password);

                if (!isMatch) {
                    return res.status(401).json({
                        success: false,
                        message: "Incorrect password"
                    });
                }
            }
        }

        ////////////////////////////////////////////////////////////
        // ✅ مفيش بيانات
        ////////////////////////////////////////////////////////////
        else {
            return res.status(400).json({
                success: false,
                message: "Please enter login credentials"
            });
        }

        ////////////////////////////////////////////////////////////
        // ✅ الحساب غير موجود
        ////////////////////////////////////////////////////////////
        if (!candidate) {
            return res.status(404).json({
                success: false,
                message: "Account not found"
            });
        }

        ////////////////////////////////////////////////////////////
        // ✅ التحقق من حالة القبول
        ////////////////////////////////////////////////////////////
        if (candidate.is_approved === false) {
            return res.status(403).json({
                success: false,
                message: "Your candidacy request has been rejected"
            });
        }

        if (candidate.is_approved === null) {
            return res.status(403).json({
                success: false,
                message: "Your request is under review, please wait"
            });
        }

        ////////////////////////////////////////////////////////////
        // ✅ إنشاء التوكن
        ////////////////////////////////////////////////////////////
        const token = jwt.sign(
            {
                id: candidate.candidate_id,
                national_id: candidate.national_id,
                role: 'candidate',
                administrative_unit: candidate.administrative_unit,
                governorate: candidate.governorate
            },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        ////////////////////////////////////////////////////////////
        // ✅ Response
        ////////////////////////////////////////////////////////////
        return res.json({
            success: true,
            token,
            user_data: {
                id: candidate.candidate_id,
                role: 'candidate',
                full_name: candidate.full_name,
                administrative_unit: candidate.administrative_unit
            }
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message
        });
    }
};
////////////////////////////////////////////////////////////
// ✅ LIST (مع حساب العمر من birth_date)
////////////////////////////////////////////////////////////
exports.listCandidates = async (req, res) => {
    try {
        const { governorate } = req.user;

        // ✅ التحقق من وجود انتخابات active للمحافظة دي
        const { rows: electionRows } = await pool.query(
            `SELECT election_id
             FROM elections
             WHERE result_status = 'pending'
             AND is_active = TRUE
             AND TRIM(governorate) = TRIM($1)
             ORDER BY created_at DESC
             LIMIT 1`,
            [governorate]
        );

        if (electionRows.length === 0) {
            return res.json({
                success: true,
                count: 0,
                data: []
            });
        }

        // ✅ جيب المرشحين المقبولين من نفس المحافظة
        // بدون شرط election_id لأنه مش موجود في candidates
        const { rows } = await pool.query(
            `SELECT 
                c.candidate_id,
                cr.full_name,
                cr.governorate,
                c.personal_photos_url,
                c.candidate_type,
                c.election_symbol_url
             FROM candidates c
             LEFT JOIN civil_registry cr
               ON TRIM(c.national_id) = TRIM(cr.national_id)
             WHERE c.is_approved = TRUE
             AND TRIM(cr.governorate) = TRIM($1)
             ORDER BY c.created_at DESC`,
            [governorate]
        );

        res.json({
            success: true,
            count: rows.length,
            data: rows
        });

    } catch (err) {
        console.error("List Candidates Error:", err);
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};
////////////////////////////////////////////////////////////
// ✅ PROFILE (Edit Profile Screen)
////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////
// ✅ CANDIDATE PROFILE
////////////////////////////////////////////////////////////
exports.getCandidateProfile = async (req, res) => {
    try {

        const candidate = await Candidate.findProfileById(req.user.id);

        if (!candidate) {
            return res.status(404).json({
                success: false,
                message: "Candidate not found"
            });
        }

        // ✅ تنسيق التاريخ (YYYY-MM-DD)
        let formattedDate = null;
        if (candidate.birth_date) {
            const date = new Date(candidate.birth_date);
            formattedDate = date.toISOString().split('T')[0];
        }

        res.json({
            success: true,
            data: {
                name: candidate.full_name,
                email: candidate.email,
                phone_number: candidate.phone_number,
                date_of_birth: formattedDate, // ✅ التاريخ المعدل هنا
                address: candidate.address,
                government: candidate.governorate,
                administrative_unit: candidate.administrative_unit,
                profile_photo: candidate.personal_photos_url
            }
        });

    } catch (err) {
        res.status(500).json({
            success: false,
            message: "Error loading profile"
        });
    }
};

////////////////////////////////////////////////////////////
// ✅ PUBLIC PROFILE (عرض مرشح معين بالـ id)
////////////////////////////////////////////////////////////
exports.getFullPublicProfile = async (req, res) => {
    try {

        const candidateId = req.params.id;

        const profile = await Candidate.getFullProfile(candidateId);

        if (!profile) {
            return res.status(404).json({
                success: false,
                message: "Candidate not found"
            });
        }

        res.json({
            success: true,
            data: profile
        });

    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};


////////////////////////////////////////////////////////////
// ✅ VOTES
////////////////////////////////////////////////////////////
exports.getCandidateVotes = async (req, res) => {
    try {
        const totalVotes = await Candidate.getCandidateVotes(req.params.id);
        res.json({ success: true, total_votes: totalVotes });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};