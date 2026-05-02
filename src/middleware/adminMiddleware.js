const jwt = require('jsonwebtoken');

const adminMiddleware = (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                message: "دخول غير مصرح به"
            });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        if (decoded.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: "غير مصرح لك بالدخول"
            });
        }

        req.user = {
            id: decoded.id,
            email: decoded.email,
            role: decoded.role
        };

        // ✅ شيلنا الـ query الزيادة
        next();

    } catch (err) {
        console.error("Admin Middleware Error:", err.message);
        
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: "انتهت صلاحية الجلسة"
            });
        }
        
        return res.status(403).json({
            success: false,
            message: "جلسة غير صالحة"
        });
    }
};

module.exports = adminMiddleware;