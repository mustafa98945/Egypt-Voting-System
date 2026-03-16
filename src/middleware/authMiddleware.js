const jwt = require('jsonwebtoken');

/**
 * ميدل وير للتحقق من التوكن (JWT)
 * بيضمن إن المستخدم مسجل دخول ومعاه صلاحية الوصول
 */
const authMiddleware = (req, res, next) => {
    // 1. الحصول على الـ Token من الهيدر
    // بيبقى بالشكل ده في الـ Header: Authorization: Bearer <TOKEN>
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    // 2. لو مفيش توكن، ارفض الطلب فوراً
    if (!token) {
        return res.status(401).json({ 
            success: false, 
            message: "دخول غير مصرح به، يرجى تسجيل الدخول أولاً" 
        });
    }

    try {
        // 3. التحقق من صحة التوكن باستخدام السر (JWT_SECRET) الموجود في الـ .env
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // 4. تخزين بيانات المستخدم (voter_id مثلاً) داخل الـ req عشان الـ Controller يستخدمها
        req.user = decoded;

        // 5. السماح بالانتقال للمرحلة التالية (الـ Controller)
        next();
    } catch (err) {
        // 6. لو التوكن غلط أو منتهي الصلاحية
        return res.status(403).json({ 
            success: false, 
            message: "جلسة الدخول منتهية أو غير صالحة، يرجى إعادة تسجيل الدخول" 
        });
    }
};

module.exports = authMiddleware;