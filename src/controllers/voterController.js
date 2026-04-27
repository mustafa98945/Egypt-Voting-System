const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const sharp = require('sharp');
const { uploadToSupabase } = require('../utils/supabaseHelper');
const Voter = require('../models/voterModel');

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
        console.error(error.message);
        return null;
    }
};

////////////////////////////////////////////////////////////
// ✅ VERIFY
////////////////////////////////////////////////////////////
exports.verifyBeforeRegister = async (req, res) => {
    try {
        const { national_id, birth_date, expiry_date, email } = req.body;

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

        res.json({
            success: true,
            data: citizen
        });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

////////////////////////////////////////////////////////////
// ✅ REGISTER
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

        res.status(201).json({
            success: true,
            data: {
                voter_id: newVoter.voter_id,
                administrative_unit: citizen.administrative_unit
            }
        });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

////////////////////////////////////////////////////////////
// ✅ LOGIN
////////////////////////////////////////////////////////////
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        const voter = await Voter.findByEmail(email);

        if (!voter) {
            return res.status(404).json({
                success: false,
                message: "الحساب غير موجود"
            });
        }

        const isMatch = await bcrypt.compare(password, voter.password);

        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: "كلمة المرور غير صحيحة"
            });
        }

        // ✅ مهم جداً
        const token = jwt.sign(
            {
                id: voter.voter_id,
                national_id: voter.national_id,
                role: 'voter',
                administrative_unit: voter.administrative_unit
            },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
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
        res.status(500).json({ success: false, message: err.message });
    }
};

////////////////////////////////////////////////////////////
// ✅ VOTER CARD
////////////////////////////////////////////////////////////
exports.getVoterCard = async (req, res) => {
    try {
        const voter = await Voter.findByIdentifier(req.user.id);

        if (!voter) {
            return res.status(404).json({
                success: false,
                message: "غير موجود"
            });
        }

        res.json({
            success: true,
            data: voter
        });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};