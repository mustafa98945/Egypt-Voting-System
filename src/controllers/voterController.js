const bcrypt = require('bcryptjs'); 
const sharp = require('sharp');
const jwt = require('jsonwebtoken');
const Voter = require('../models/voterModel');
const { uploadToSupabase } = require('../utils/supabaseHelper');

const processBase64AndUpload = async (base64String, fileName, folder = 'voters') => {
    try {
        if (!base64String) return null;
        const base64Data = base64String.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, 'base64');
        const optimized = await sharp(buffer).jpeg({ quality: 75 }).toBuffer();
        return await uploadToSupabase(optimized, fileName, folder);
    } catch (error) {
        console.error(`خطأ في معالجة الصورة:`, error);
        throw new Error("فشل رفع الصورة");
    }
};

exports.verifyBeforeRegister = async (req, res) => {
    try {
        const { national_id, birth_date, expiry_date } = req.body;
        const citizen = await Voter.verifyInRegistry(national_id, birth_date, expiry_date);
        if (!citizen) return res.status(401).json({ success: false, message: "بيانات غير صحيحة" });
        res.json({ success: true, data: citizen });
    } catch (err) { res.status(500).json({ success: false, message: "خطأ في السيرفر" }); }
};

exports.registerVoter = async (req, res) => {
    try {
        const { national_id, birth_date, expiry_date, email, password, party_card_url } = req.body;
        const citizen = await Voter.verifyInRegistry(national_id, birth_date, expiry_date);
        if (!citizen) return res.status(401).json({ success: false, message: "الهوية غير مطابقة" });

        let finalPartyCardUrl = party_card_url ? await processBase64AndUpload(party_card_url, `card_${national_id}_${Date.now()}.jpg`) : null;
        const hashedPassword = await bcrypt.hash(password, 10);
        
        await Voter.create({ national_id, email, password: hashedPassword, party_card_url: finalPartyCardUrl });
        res.status(201).json({ success: true, message: "تم التسجيل بنجاح" });
    } catch (err) {
        if (err.code === '23505') return res.status(400).json({ success: false, message: "مسجل بالفعل" });
        res.status(500).json({ success: false, message: "خطأ في التسجيل" });
    }
};

exports.login = async (req, res) => {
    const { email, password, national_id_from_face } = req.body;
    try {
        let user;
        if (national_id_from_face) {
            user = await Voter.findByIdentifier(national_id_from_face, true);
        } else {
            user = await Voter.findByIdentifier(email, false);
            if (user && !(await bcrypt.compare(password, user.password))) user = null;
        }

        if (!user) return res.status(401).json({ success: false, message: "بيانات خاطئة" });

        const token = jwt.sign(
            { id: user.voter_id, role: 'voter', national_id: user.national_id },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.status(200).json({ success: true, token, user_data: { id: user.voter_id, full_name: user.full_name, national_id: user.national_id, governorate: user.governorate_name, unit: user.unit_name, has_voted: user.has_voted } });
    } catch (err) { res.status(500).json({ success: false, message: "خطأ في الدخول" }); }
};