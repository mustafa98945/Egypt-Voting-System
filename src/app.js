require('dotenv').config();
const express = require('express');
const cors = require('cors');

// 1. استدعاء المسارات (Routes)
const voterRoutes = require('./routes/voterRoutes');
const candidateRoutes = require('./routes/candidateRoutes');
const voteRoutes = require('./routes/voteRoutes'); 

const app = express();

// 2. إعدادات الـ CORS والسماح بالبيانات الكبيرة (مهم للصور الـ Base64)
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// الصفحة الرئيسية للتأكد أن السيرفر يعمل
app.get('/', (req, res) => {
    res.send(`
        <div style="text-align: center; margin-top: 50px; font-family: Arial, sans-serif;">
            <h1 style="color: #2c3e50;">🚀 Election System API is Running Successfully!</h1>
            <p style="color: #7f8c8d;">The backend is live and ready for connections.</p>
        </div>
    `);
});

// 3. تعريف الروابط الأساسية (Endpoints)
// مسارات الناخبين (تسجيل، دخول، تحقق)
app.use('/api/voters', voterRoutes);         

// مسارات المرشحين (عرض القوائم، بيانات المرشح)
app.use('/api/candidates', candidateRoutes); 

// مسارات التصويت (عملية تسجيل الصوت المحمية)
app.use('/api/vote', voteRoutes); 


// 4. معالجة الأخطاء العامة (Global Error Handler)
app.use((err, req, res, next) => {
    // خطأ حجم البيانات (لو الصورة أكبر من 50 ميجا)
    if (err.type === 'entity.too.large') {
        return res.status(413).json({ 
            success: false, 
            message: "حجم البيانات كبير جداً، يرجى محاولة رفع صور أصغر أو ضغطها" 
        });
    }
    
    // أي خطأ غير متوقع آخر
    console.error("Internal Server Error:", err.stack);
    res.status(500).json({ 
        success: false, 
        message: "حدث خطأ داخلي في السيرفر، يرجى المحاولة لاحقاً" 
    });
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
    console.log(`-----------------------------------------`);
});