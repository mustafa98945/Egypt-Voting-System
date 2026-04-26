const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const sharp = require('sharp');
const { uploadToSupabase } = require('../utils/supabaseHelper');
const Voter = require('../models/voterModel');

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
            console.error("Sharp processing failed:", sharpError.message);
            return await uploadToSupabase(buffer, fileName, folder);
        }
    } catch (error) {
        console.error(`Error processing image ${fileName}:`, error.message);
        return null;
    }
};

// --- 1. التحقق والـ Auto-fill ---
exports.verifyBeforeRegister = async (req, res) => {
    try {
        const { national_id, birth_date, expiry_date, email } = req.body;

        if (!national_id || !birth_date || !expiry_date || !email) {
            return res.status(400).json({ 
                success: false, 
                message: "يرجى ملء جميع الحقول المطلوبة للتحقق" 
            });
        }

        const citizen = await Voter.verifyInRegistry(national_id, birth_date, expiry_date);
        if (!citizen) {
            return res.status(401).json({ 
                success: false, 
                message: "بيانات الهوية غير مطابقة للسجل المدني أو البطاقة منتهية" 
            });
        }

        const duplicate = await Voter.checkDuplicate(email, national_id);
        if (duplicate) {
            const msg = duplicate.email_exists 
                ? "البريد الإلكتروني مسجل بالفعل" 
                : "الرقم القومي مسجل بالفعل";
            return res.status(400).json({ success: false, message: msg });
        }

        res.json({ 
            success: true,
            message: "تم التحقق، يمكنك إكمال التسجيل",
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
        res.status(500).json({ success: false, message: "خطأ في الاتصال بالسجل المدني" });
    }
};

// --- 2. إتمام التسجيل ---
exports.registerVoter = async (req, res) => {
    try {
        const data = req.body;

        const citizen = await Voter.verifyInRegistry(
            data.national_id, data.birth_date, data.expiry_date
        );
        if (!citizen) return res.status(401).json({ 
            success: false, message: "فشل التحقق من البيانات" 
        });

        let partyCardUrl = null;
        if (data.party_card_url) {
            const fileName = `party_card_${data.national_id}_${Date.now()}.jpg`;
            partyCardUrl = await processBase64AndUpload(
                data.party_card_url, fileName, 'voters_cards/party_cards'
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
            message: "تم إنشاء حسابك بنجاح",
            data: {
                voter_id: newVoter.voter_id,
                district: citizen.electoral_district
            }
        });

    } catch (err) {
        console.error("Register Error:", err);
        res.status(500).json({ success: false, message: "حدث خطأ أثناء إنشاء الحساب" });
    }
};

// --- 3. تسجيل الدخول ---
exports.login = async (req, res) => {
    try {
        const { national_id, email, password, isFaceAuthenticated } = req.body;
        let voter;

        if (isFaceAuthenticated && national_id) {
            voter = await Voter.findByNationalId(national_id);
            if (!voter) return res.status(404).json({ 
                success: false, message: "الحساب غير موجود" 
            });
        } else if (email && password) {
            voter = await Voter.findByEmail(email);
            if (!voter) return res.status(404).json({ 
                success: false, message: "البريد الإلكتروني غير مسجل" 
            });
            const isMatch = await bcrypt.compare(password, voter.password);
            if (!isMatch) return res.status(401).json({ 
                success: false, message: "كلمة المرور خاطئة" 
            });
        } else {
            return res.status(400).json({ 
                success: false, message: "يرجى إدخال بيانات الدخول" 
            });
        }

        const token = jwt.sign(
            { 
                id: voter.voter_id,
                national_id: voter.national_id,
                role: 'voter',
                administrative_unit: voter.administrative_unit, // ← جديد للفلترة
                electoral_district: voter.electoral_district    // ← محتفظ بيه للـ Flutter
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
                district: voter.administrative_unit, // ← نفس الاسم للـ Flutter
                administrative_unit: voter.administrative_unit,
                role: 'voter'
            }
        });

    } catch (err) {
        console.error("Login Error:", err);
        res.status(500).json({ success: false, message: "خطأ في السيرفر" });
    }
};

// --- 4. جلب بيانات الكارت ---
exports.getVoterCard = async (req, res) => {
    try {
        const voter = await Voter.findByIdentifier(req.user.id);
        if (!voter) {
            return res.status(404).json({ 
                success: false, message: "الناخب غير موجود" 
            });
        }

        res.json({
            success: true,
            data: {
                full_name: voter.full_name,
                v_code: voter.username,
                national_id: voter.national_id,
                governorate: voter.governorate,
                administrative_unit: voter.administrative_unit,
                electoral_district: voter.electoral_district,
                has_voted: voter.has_voted
            }
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, message: "خطأ في جلب بيانات البروفايل" 
        });
    }
};