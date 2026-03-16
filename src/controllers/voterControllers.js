const Voter = require('../models/voterModel');
const bcrypt = require('bcrypt');
const sharp = require('sharp');
const { uploadToSupabase } = require('../utils/supabaseHelper');

// --- دالة مساعدة لمعالجة الصور (بنفس المنطق الموحد للمشروع) ---
const processAndUpload = async (fileBuffer, fileName, folder = 'voters', width = 1000, quality = 80) => {
    try {
        const optimized = await sharp(fileBuffer)
            .resize({ width, withoutEnlargement: true })
            .jpeg({ quality })
            .toBuffer();
            
        return await uploadToSupabase(optimized, fileName, folder);
    } catch (error) {
        console.error(`خطأ في معالجة الملف ${fileName}:`, error);
        throw new Error("فشل في معالجة صورة الناخب");
    }
};

// 1. التحقق قبل التسجيل
exports.verifyBeforeRegister = async (req, res) => {
    const { national_id, birth_date, expiry_date } = req.body;
    try {
        const citizen = await Voter.verifyInRegistry(national_id, birth_date, expiry_date);
        
        if (!citizen) {
            return res.status(401).json({ success: false, message: "حدث خطأ في البيانات المدخلة، يرجى المراجعة" });
        }
        res.json({ success: true, data: citizen });
    } catch (err) {
        res.status(500).json({ success: false, message: "حدث خطأ في السيرفر" });
    }
};

// 2. تسجيل الحساب للناخب
exports.registerVoter = async (req, res) => {
    try {
        const { 
            national_id, birth_date, expiry_date, email, 
            password, confirm_password 
        } = req.body;
        
        if (password !== confirm_password) {
            return res.status(400).json({ success: false, message: "كلمات المرور غير متطابقة" });
        }

        const citizen = await Voter.verifyInRegistry(national_id, birth_date, expiry_date);
        if (!citizen) {
            return res.status(401).json({ success: false, message: "بيانات الهوية غير مطابقة للسجل المدني" });
        }

        // --- استخدام الدالة الموحدة لمعالجة الرفع ---
        let partyCardUrl = null;
        if (req.files && req.files['party_card_url']) {
            const file = req.files['party_card_url'][0];
            partyCardUrl = await processAndUpload(
                file.buffer, 
                `voter_card_${national_id}_${Date.now()}.jpg`
            );
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        
        await Voter.create({ 
            national_id, 
            email, 
            password: hashedPassword, 
            party_card_url: partyCardUrl 
        });
        
        res.status(201).json({ success: true, message: "تم إنشاء حسابك بنجاح" });

    } catch (err) {
        if (err.code === '23505') {
            return res.status(400).json({ success: false, message: "هذا الحساب مسجل بالفعل" });
        }
        console.error("Voter Registration Error:", err.message);
        res.status(500).json({ success: false, message: "حدث خطأ في السيرفر" });
    }
};

// 3. تسجيل الدخول
exports.login = async (req, res) => {
    const { email, password, national_id_from_face } = req.body;
    try {
        let user;

        if (national_id_from_face) {
            user = await Voter.findByIdentifier(national_id_from_face, true);
        } else {
            user = await Voter.findByIdentifier(email, false);
            if (user) {
                const isMatch = await bcrypt.compare(password, user.password);
                if (!isMatch) user = null;
            }
        }

        if (!user) return res.status(401).json({ success: false, message: "بيانات الدخول غير صحيحة" });

        res.json({ 
            success: true, 
            user_data: { 
                voter_id: user.voter_id, 
                full_name: user.full_name, 
                governorate: user.governorate_name, 
                unit: user.unit_name, 
                has_voted: user.has_voted 
            } 
        });
    } catch (err) {
        res.status(500).json({ success: false, message: "حدث خطأ في السيرفر" });
    }
};