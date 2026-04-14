const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const sharp = require('sharp');
const { uploadToSupabase } = require('../utils/supabaseHelper');
const Voter = require('../models/voterModel');
const pool = require('../config/db');

// --- الدالة المساعدة لمعالجة الـ Base64 (نفس اللي في المرشح) ---
const processBase64AndUpload = async (base64String, fileName, folder = 'voters') => {
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
            return await uploadToSupabase(buffer, fileName, folder);
        }
    } catch (error) {
        console.error(`Error processing ${fileName}:`, error.message);
        return null;
    }
};

// --- 1. التحقق قبل التسجيل (Auto-fill) ---
exports.verifyBeforeRegister = async (req, res) => {
    try {
        const { national_id, birth_date, expiry_date } = req.body;

        const citizen = await Voter.verifyInRegistry(national_id, birth_date, expiry_date);

        if (!citizen) {
            return res.status(401).json({ 
                success: false, 
                message: "بيانات الهوية غير مطابقة للسجل المدني أو البطاقة منتهية" 
            });
        }

        res.json({ 
            success: true, 
            data: {
                full_name: citizen.full_name,
                address: citizen.address,
                governorate: citizen.governorate_name,
                administrative_unit: citizen.administrative_unit,
                unit_id: citizen.unit_id
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// --- 2. تسجيل ناخب جديد (نفس طريقة المرشح) ---
exports.registerVoter = async (req, res) => {
    try {
        const data = req.body;

        // الخطوة 1: التأكد من السجل المدني لجلب الـ unit_id
        const citizen = await Voter.verifyInRegistry(data.national_id, data.birth_date, data.expiry_date);
        if (!citizen) {
            return res.status(401).json({ success: false, message: "تعذر التحقق من البيانات المسجلة" });
        }

        // الخطوة 2: معالجة صورة بطاقة الحزب (Base64)
        let partyCardUrl = null;
        if (data.party_card_url) {
            const fileName = `party_card_${data.national_id}_${Date.now()}.jpg`;
            partyCardUrl = await processBase64AndUpload(data.party_card_url, fileName);
        }

        // الخطوة 3: تشفير الباسورد
        const hashedPassword = await bcrypt.hash(data.password, 10);

        // الخطوة 4: الحفظ في الداتابيز
        const newVoter = await Voter.create({
            national_id: data.national_id,
            email: data.email,
            password: hashedPassword,
            party_card_url: partyCardUrl,
            unit_id: citizen.unit_id // تم الجلب من السجل المدني مباشرة
        });

        res.status(201).json({
            success: true,
            message: "تم إنشاء حساب الناخب بنجاح",
            data: {
                voter_id: newVoter.voter_id,
                email: newVoter.email
            }
        });

    } catch (err) {
        console.error("Voter Register Error:", err);
        if (err.code === '23505') return res.status(400).json({ success: false, message: "الرقم القومي أو البريد مسجل مسبقاً" });
        res.status(500).json({ success: false, message: `خطأ فني: ${err.message}` });
    }
};

// --- 3. تسجيل دخول الناخب (بنفس الـ Logic بتاع المرشح) ---
exports.login = async (req, res) => {
    try {
        const { national_id, email, password, isFaceAuthenticated } = req.body;
        let voter;

        // 1. المسار الأول: الدخول عن طريق بصمة الوجه (National ID فقط)
        if (isFaceAuthenticated && national_id) {
            voter = await Voter.findByNationalId(national_id);
            if (!voter) {
                return res.status(404).json({ success: false, message: "هذا الحساب غير مسجل" });
            }
            // بما إن الوجه تم التحقق منه في الموبايل/الفورنت إند، بنعمل Login فوراً
        } 
        
        // 2. المسار الثاني: الدخول التقليدي (Email + Password)
        else if (email && password) {
            voter = await Voter.findByEmail(email);
            if (!voter) {
                return res.status(404).json({ success: false, message: "البريد الإلكتروني غير مسجل" });
            }

            const isMatch = await bcrypt.compare(password, voter.password);
            if (!isMatch) {
                return res.status(401).json({ success: false, message: "كلمة المرور غير صحيحة" });
            }
        } 
        
        else {
            return res.status(400).json({ success: false, message: "يرجى توفير بيانات الدخول الصحيحة" });
        }

        // 3. إنشاء التوكن (JWT) لكل الحالات الناجحة
        const token = jwt.sign(
            { id: voter.voter_id, national_id: voter.national_id, role: 'voter' },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.status(200).json({
            success: true,
            token,
            user_data: {
                id: voter.voter_id,
                national_id: voter.national_id,
                full_name: voter.full_name,
                role: 'voter'
            }
        });

    } catch (err) {
        console.error("Login Error:", err);
        res.status(500).json({ success: false, message: "خطأ في السيرفر" });
    }
};
// --- 4. جلب بيانات الكارت الرقمي (للموبايل) ---
exports.getVoterCard = async (req, res) => {
    try {
        const voter = await Voter.findByIdentifier(req.user.id, 'id');
        if (!voter) return res.status(404).json({ success: false, message: "الناخب غير موجود" });

        res.json({
            success: true,
            data: {
                full_name: voter.full_name,
                national_id: voter.national_id,
                v_code: voter.v_code,
                governorate: voter.governorate_name,
                administrative_unit: voter.administrative_unit,
                has_voted: voter.has_voted
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: "خطأ في جلب بيانات الكارت" });
    }
};