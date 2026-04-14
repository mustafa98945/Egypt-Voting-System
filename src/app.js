require('dotenv').config();
const express = require('express');
const cors = require('cors');

// 1. استدعاء المسارات (Routes)
const voterRoutes = require('./routes/voterRoutes');
const candidateRoutes = require('./routes/candidateRoutes');
const voteRoutes = require('./routes/voteRoutes'); 
const statsRoutes = require('./routes/statsRoutes');

const app = express();

// 2. إعدادات الـ Middleware
app.use(cors());

// الـ limit 50mb عشان معالجة صور بصمة الوجه والبطاقات
app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// الصفحة الرئيسية (ترحيبية)
app.get('/', (req, res) => {
    res.send(`
        <div style="text-align: center; margin-top: 50px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
            <h1 style="color: #2ecc71;">🚀 Election System API is Running!</h1>
            <p style="color: #34495e;">The backend is live and ready for connections.</p>
            <div style="background: #f4f4f4; padding: 15px; display: inline-block; border-radius: 8px;">
                <strong>Active Endpoints:</strong> /api/voters | /api/candidates | /api/vote | /api/stats
            </div>
            <p style="margin-top: 20px; color: #7f8c8d;">Status: <span style="color: #27ae60;">Online</span> | Year: 2026</p>
        </div>
    `);
});

// 3. تعريف الروابط الأساسية (Endpoints)
app.use('/api/voters', voterRoutes);         
app.use('/api/candidates', candidateRoutes); 
app.use('/api/vote', voteRoutes); 
app.use('/api/stats', statsRoutes);

// 4. معالجة الروابط غير الموجودة (404 Not Found)
app.use((req, res) => {
    res.status(404).json({ 
        success: false, 
        message: "هذا الرابط غير موجود في السيرفر، تأكد من الـ Endpoint الصحيح" 
    });
});

// 5. معالجة الأخطاء العامة (Error Handling)
app.use((err, req, res, next) => {
    // معالجة خطأ حجم البيانات الكبير
    if (err.type === 'entity.too.large') {
        return res.status(413).json({ 
            success: false, 
            message: "حجم البيانات كبير جداً، حاول تقليل جودة الصورة" 
        });
    }
    
    console.error("❌ Internal Server Error:", err.stack);
    res.status(500).json({ 
        success: false, 
        message: "حدث خطأ داخلي في السيرفر، يرجى مراجعة الـ Logs" 
    });
});

// 6. تشغيل السيرفر
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`-----------------------------------------`);
    console.log(`🚀 السيرفر شغال الآن على منفذ: ${PORT}`);
    console.log(`📡 الروابط المفعلة: `);
    console.log(`   ✅ الناخبين:     /api/voters`);
    console.log(`   ✅ المرشحين:     /api/candidates`);
    console.log(`   ✅ التصويت:      /api/vote`);
    console.log(`   ✅ الإحصائيات:    /api/stats`);
    console.log(`-----------------------------------------`);
});