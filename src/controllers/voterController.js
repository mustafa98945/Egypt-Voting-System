const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const sharp = require('sharp');
const { uploadToSupabase } = require('../utils/supabaseHelper');
const Voter = require('../models/voterModel');

// --- دالة مساعدة لمعالجة الصور ---
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
        } catch {
            return await uploadToSupabase(buffer, fileName, folder);
        }
    } catch (error) {
        console.error(`Error processing ${fileName}:`, error.message);
        return null;
    }
};

// --- 1. التحقق والـ Auto-fill (الشاشة الأولى) ---
exports.verifyBeforeRegister = async (req, res) => {
    try {
        const { national_id, birth_date, expiry_date, email } = req.body;

        // التأكد من وجود كل الحقول
        if (!national_id || !birth_date || !expiry_date || !email) {
            return res.status(400).json({ 
                success: false, 
                message: "جميع الحقول مطلوبة: الرقم القومي، تاريخ الميلاد، تاريخ انتهاء البطاقة، والبريد الإلكتروني" 
            });
        }

        // أ- التحقق من السجل المدني
        const citizen = await Voter.verifyInRegistry(national_id, birth_date, expiry_date);
        if (!citizen) {
            return res.status(401).json({ 
                success: false, 
                message: "بيانات الهوية غير مطابقة للسجل المدني أو البطاقة منتهية الصلاحية" 
            });
        }

        // ب- التحقق من تكرار الـ email أو national_id
        const duplicate = await Voter.checkDuplicate(email, national_id);
        if (duplicate) {
            const msg = duplicate.email_exists 
                ? "البريد الإلكتروني مسجل مسبقاً" 
                : "الرقم القومي مسجل مسبقاً";
            return res.status(400).json({ success: false, message: msg });
        }

        // ✅ تمام - إرجاع بيانات السجل للشاشة التانية
        res.json({ 
            success: true,
            message: "تم التحقق بنجاح",
            data: {
                username: citizen.username,
                address: citizen.address,
                governorate: citizen.governorate,
                administrative_unit: citizen.administrative_unit,
                electoral_district: citizen.electoral_district
            }
        });

    } catch (err) {
        console.error("Verify Error:", err);
        res.status(500).json({ 
            success: false, 
            message: `خطأ في السيرفر: ${err.message}` 
        });
    }
};

// --- 2. إتمام التسجيل ---
exports.registerVoter = async (req, res) => {
    try {
        const data = req.body;

        // إعادة التحقق من السجل (أمان مضاعف)
        const citizen = await Voter.verifyInRegistry(
            data.national_id, data.birth_date, data.expiry_date
        );
        if (!citizen) {
            return res.status(401).json({ 
                success: false, 
                message: "تعذر التحقق من البيانات" 
            });
        }

        // إعادة التحقق من التكرار
        const duplicate = await Voter.checkDuplicate(data.email, data.national_id);
        if (duplicate) {
            const msg = duplicate.email_exists 
                ? "البريد الإلكتروني مسجل مسبقاً" 
                : "الرقم القومي مسجل مسبقاً";
            return res.status(400).json({ success: false, message: msg });
        }

        // معالجة صورة بطاقة الحزب (اختيارية)
        let partyCardUrl = null;
        if (data.party_card_url) {
            const fileName = `party_card_${data.national_id}_${Date.now()}.jpg`;
            partyCardUrl = await processBase64AndUpload(data.party_card_url, fileName);
        }

        // تشفير كلمة المرور
        const hashedPassword = await bcrypt.hash(data.password, 10);

        // الحفظ في قاعدة البيانات
        const newVoter = await Voter.create({
            national_id: data.national_id,
            email: data.email,
            password: hashedPassword,
            party_card_url: partyCardUrl
        });

        res.status(201).json({
            success: true,
            message: "تم إنشاء حساب الناخب بنجاح",
            data: {
                voter_id: newVoter.voter_id,
                electoral_district: citizen.electoral_district
            }
        });

    } catch (err) {
        console.error("Register Error:", err);
        if (err.code === '23505') {
            return res.status(400).json({ 
                success: false, 
                message: "الرقم القومي أو البريد الإلكتروني مسجل مسبقاً" 
            });
        }
        res.status(500).json({ 
            success: false, 
            message: `خطأ فني: ${err.message}` 
        });
    }
};

// --- 3. تسجيل الدخول ---
exports.login = async (req, res) => {
    try {
        const { national_id, email, password, isFaceAuthenticated } = req.body;
        let voter;

        // أ- الدخول عبر بصمة الوجه
        if (isFaceAuthenticated && national_id) {
            voter = await Voter.findByNationalId(national_id);
            if (!voter) return res.status(404).json({ 
                success: false, 
                message: "هذا الحساب غير مسجل" 
            });
        } 
        // ب- الدخول التقليدي
        else if (email && password) {
            voter = await Voter.findByEmail(email);
            if (!voter) return res.status(404).json({ 
                success: false, 
                message: "البريد الإلكتروني غير مسجل" 
            });
            const isMatch = await bcrypt.compare(password, voter.password);
            if (!isMatch) return res.status(401).json({ 
                success: false, 
                message: "كلمة المرور غير صحيحة" 
            });
        } 
        else {
            return res.status(400).json({ 
                success: false, 
                message: "يرجى توفير بيانات الدخول" 
            });
        }

        // إنشاء التوكن
        const token = jwt.sign(
            { 
                id: voter.voter_id,
                national_id: voter.national_id,
                role: 'voter',
                electoral_district: voter.electoral_district
            },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.status(200).json({
            success: true,
            token,
            user_data: {
                id: voter.voter_id,
                full_name: voter.full_name,
                username: voter.username,
                district: voter.electoral_district,
                role: 'voter'
            }
        });

    } catch (err) {
        console.error("Login Error:", err);
        res.status(500).json({ success: false, message: "خطأ في السيرفر" });
    }
};

// --- 4. جلب بيانات البروفايل ---
exports.getVoterCard = async (req, res) => {
    try {
        const voter = await Voter.findByIdentifier(req.user.id);
        if (!voter) return res.status(404).json({ 
            success: false, 
            message: "الناخب غير موجود" 
        });

        res.json({
            success: true,
            data: {
                full_name: voter.full_name,
                username: voter.username,
                national_id: voter.national_id,
                address: voter.address,
                governorate: voter.governorate,
                administrative_unit: voter.administrative_unit,
                electoral_district: voter.electoral_district,
                has_voted: voter.has_voted
            }
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            message: "خطأ في جلب البيانات" 
        });
    }
};