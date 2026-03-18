const jwt = require('jsonwebtoken');

/**
 * ميدل وير للتحقق من التوكن (JWT)
 * يضمن أن المستخدم (ناخب أو مرشح) مسجل دخول ومعاد توحيد بياناته في req.user
 */
const authMiddleware = (req, res, next) => {
    // 1. الحصول على الـ Token من الهيدر (Authorization: Bearer <TOKEN>)
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    // 2. التحقق من وجود التوكن
    if (!token) {
        return res.status(401).json({ 
            success: false, 
            message: "دخول غير مصرح به، يرجى تسجيل الدخول أولاً" 
        });
    }

    try {
        // 3. فك التوكن والتحقق من صلاحيته باستخدام المفتاح السري
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        /**
         * 4. توحيد بيانات المستخدم (Normalization)
         * بنحاول نقرأ الـ ID بأي مسمى محتمل (id, voter_id, candidate_id) ونوحده في req.user.id
         */
        req.user = {
            id: decoded.id || decoded.voter_id || decoded.candidate_id, 
            role: decoded.role, // سواء كان 'voter' أو 'candidate'
            national_id: decoded.national_id
        };

        // التأكد من أن البيانات الأساسية (ID والـ Role) موجودة فعلياً داخل التوكن
        if (!req.user.id || !req.user.role) {
            console.error("Auth Error: Missing fields in token payload", decoded);
            throw new Error("التوكن لا يحتوي على بيانات الهوية المطلوبة");
        }

        // 5. الانتقال للخطوة التالية (الـ Controller)
        next();
    } catch (err) {
        // 6. التعامل مع التوكن المنتهي أو غير الصالح
        console.error("Auth Middleware Error:", err.message);
        
        // لو الخطأ إن التوكن منتهي (Expired)
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ 
                success: false, 
                message: "انتهت صلاحية الجلسة، يرجى تسجيل الدخول مرة أخرى" 
            });
        }

        return res.status(403).json({ 
            success: false, 
            message: "جلسة الدخول غير صالحة" 
        });
    }
};

module.exports = authMiddleware;