const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const sharp = require('sharp');
const { uploadToSupabase } = require('../utils/supabaseHelper');
const Voter = require('../models/voterModel');

console.log("✅ VoterController Loaded Successfully");

////////////////////////////////////////////////////////////
// ✅ رفع الصور
////////////////////////////////////////////////////////////
const processBase64AndUpload = async (base64String, fileName, folder = 'voters_cards/party_cards') => {
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
        console.error("Image upload error:", error.message);
        return null;
    }
};
////////////////////////////////////////////////////////////
// ✅ VERIFY BEFORE REGISTER
////////////////////////////////////////////////////////////
exports.verifyBeforeRegister = async (req, res) => {
    try {
        const { national_id, birth_date, expiry_date } = req.body;

        const citizen = await Voter.verifyInRegistry(
            national_id,
            birth_date,
            expiry_date
        );

        if (!citizen) {
            return res.status(401).json({
                success: false,
                message: "بيانات غير صحيحة"
            });
        }

        // ✅ شرط السن من DB
        if (citizen.age < 18) {
            return res.status(400).json({
                success: false,
                message: "يجب أن يكون عمرك 18 سنة أو أكثر للتسجيل"
            });
        }

        return res.json({
            success: true,
            data: {
                full_name: citizen.full_name,
                address: citizen.address,
                governorate: citizen.governorate,
                administrative_unit: citizen.administrative_unit,
                age: citizen.age
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
// ✅ REGISTER VOTER
////////////////////////////////////////////////////////////
exports.registerVoter = async (req, res) => {
    try {
        const data = req.body;

        const citizen = await Voter.verifyInRegistry(
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

        // ✅ شرط السن من DB
        if (citizen.age < 18) {
            return res.status(400).json({
                success: false,
                message: "يجب أن يكون عمرك 18 سنة أو أكثر للتسجيل"
            });
        }

        let partyCardUrl = null;

        if (data.party_card_url) {
            const fileName = `party_card_${data.national_id}_${Date.now()}.jpg`;
            partyCardUrl = await processBase64AndUpload(
                data.party_card_url,
                fileName
            );
        }

        const hashedPassword = await bcrypt.hash(data.password, 10);

        const newVoter = await Voter.create({
            national_id: data.national_id,
            email: data.email,
            password: hashedPassword,
            party_card_url: partyCardUrl
        });

        return res.status(201).json({
            success: true,
            data: {
                voter_id: newVoter.voter_id,
                administrative_unit: citizen.administrative_unit
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
// ✅ LOGIN
////////////////////////////////////////////////////////////
exports.login = async (req, res) => {
    try {
        const { email, password, national_id, isFaceAuthenticated } = req.body;

        let voter;

        ////////////////////////////////////////////////////////////
        // ✅ 1️⃣ Login باستخدام Face Recognition
        ////////////////////////////////////////////////////////////
        if (national_id) {

            if (!isFaceAuthenticated) {
                return res.status(401).json({
                    success: false,
                    message: "فشل التحقق بالوجه"
                });
            }

            voter = await Voter.findByNationalId(national_id);
        }

        ////////////////////////////////////////////////////////////
        // ✅ 2️⃣ Login باستخدام Email + Password
        ////////////////////////////////////////////////////////////
        else if (email && password) {

            voter = await Voter.findByEmail(email);

            if (voter) {
                const isMatch = await bcrypt.compare(password, voter.password);

                if (!isMatch) {
                    return res.status(401).json({
                        success: false,
                        message: "كلمة المرور غير صحيحة"
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
                message: "يرجى إدخال بيانات الدخول"
            });
        }

        ////////////////////////////////////////////////////////////
        // ✅ الحساب غير موجود
        ////////////////////////////////////////////////////////////
        if (!voter) {
            return res.status(404).json({
                success: false,
                message: "الحساب غير موجود"
            });
        }

        ////////////////////////////////////////////////////////////
        // ✅ إنشاء التوكن
        ////////////////////////////////////////////////////////////
        const token = jwt.sign(
            {
                id: voter.voter_id,
                national_id: voter.national_id,
                role: 'voter',
                administrative_unit: voter.administrative_unit,
                governorate: voter.governorate
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
                id: voter.voter_id,
                full_name: voter.full_name,
                administrative_unit: voter.administrative_unit,
                role: 'voter'
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
// ✅ PROFILE (Edit Profile Screen)
////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////
// ✅ VOTER PROFILE
////////////////////////////////////////////////////////////
exports.getVoterProfile = async (req, res) => {
    try {

        const voter = await Voter.findProfileById(req.user.id);

        if (!voter) {
            return res.status(404).json({
                success: false,
                message: "Voter not found"
            });
        }

        res.json({
            success: true,
            data: {
                name: voter.full_name,
                email: voter.email,
                phone_number: voter.phone_number || null,
                date_of_birth: voter.birth_date,
                address: voter.address,
                government: voter.governorate,
                administrative_unit: voter.administrative_unit,
                profile_photo: voter.party_card_url
            }
        });

    } catch (err) {
        res.status(500).json({
            success: false,
            message: "Error loading profile"
        });
    }
};