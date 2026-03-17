require('dotenv').config();
const express = require('express');
const cors = require('cors');

const voterRoutes = require('./routes/voterRoutes');
const candidateRoutes = require('./routes/candidateRoutes');

const app = express();

// 1. إعدادات الـ CORS
app.use(cors());

// 2. أهم تعديل: زيادة سعة استقبال الـ JSON لـ 50 ميجا
// السطرين دول هما اللي هيسمحوا بمرور الصور الـ Base64 من الفلاتر للسيرفر
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// الصفحة الرئيسية الـ HTML (اختياري)
app.get('/', (req, res) => {
    res.send(`<h1>Election System API is Running...</h1>`);
});

// 3. تقسيم الروابط (Routes)
app.use('/api/voters', voterRoutes);         
app.use('/api/candidates', candidateRoutes); 

// 4. معالجة الأخطاء العامة (Global Error Handler)
// مفيد جداً عشان لو حصل خطأ في الـ JSON ميبوظش السيرفر
app.use((err, req, res, next) => {
    if (err.type === 'entity.too.large') {
        return res.status(413).json({ success: false, message: "حجم البيانات كبير جداً، يرجى ضغط الصور" });
    }
    console.error(err.stack);
    res.status(500).json({ success: false, message: "حدث خطأ داخلي في السيرفر" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
    console.log(`📡 Maximum JSON payload limit: 50mb`);
});