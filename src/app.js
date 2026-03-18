require('dotenv').config();
const express = require('express');
const cors = require('cors');

// 1. استدعاء المسارات (Routes)
const voterRoutes = require('./routes/voterRoutes');
const candidateRoutes = require('./routes/candidateRoutes');
const voteRoutes = require('./routes/voteRoutes'); 
const statsRoutes = require('./routes/statsRoutes'); // المسار الجديد للإحصائيات

const app = express();

// 2. إعدادات الـ CORS والسماح بالبيانات الكبيرة
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// الصفحة الرئيسية
app.get('/', (req, res) => {
    res.send(`
        <div style="text-align: center; margin-top: 50px; font-family: Arial, sans-serif;">
            <h1 style="color: #2c3e50;">🚀 Election System API is Running Successfully!</h1>
            <p style="color: #7f8c8d;">The backend is live and ready for connections.</p>
        </div>
    `);
});

// 3. تعريف الروابط الأساسية (Endpoints)
app.use('/api/voters', voterRoutes);         
app.use('/api/candidates', candidateRoutes); 
app.use('/api/vote', voteRoutes); 
app.use('/api/stats', statsRoutes); // تفعيل رابط الإحصائيات


// 4. معالجة الأخطاء العامة
app.use((err, req, res, next) => {
    if (err.type === 'entity.too.large') {
        return res.status(413).json({ 
            success: false, 
            message: "حجم البيانات كبير جداً" 
        });
    }
    console.error("Internal Server Error:", err.stack);
    res.status(500).json({ success: false, message: "حدث خطأ داخلي" });
});

// 5. تشغيل السيرفر
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`-----------------------------------------`);
    console.log(`🚀 السيرفر شغال الآن على منفذ: ${PORT}`);
    console.log(`📡 المسارات النشطة: `);
    console.log(`   ✅ Voters:     /api/voters`);
    console.log(`   ✅ Candidates: /api/candidates`);
    console.log(`   ✅ Voting:     /api/vote/cast`);
    console.log(`   ✅ Stats:      /api/stats/top-candidates`); // المسار الجديد ظهر هنا
    console.log(`-----------------------------------------`);
});