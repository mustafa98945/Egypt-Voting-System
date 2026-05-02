const jwt = require('jsonwebtoken');
const pool = require('../config/db');

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

        // تحديث logout_time تلقائي مع كل request
        pool.query(
            `UPDATE admin_sessions 
             SET logout_time = CURRENT_TIME
             WHERE admin_id = $1
             AND session_date = CURRENT_DATE`,
            [decoded.id]
        ).catch(err => console.error("Session Update Error:", err.message));

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