require('dotenv').config();
const express = require('express');
const cors = require('cors');

// 1. استدعاء المسارات (Routes)
const voterRoutes = require('./routes/voterRoutes');
const candidateRoutes = require('./routes/candidateRoutes');
const voteRoutes = require('./routes/voteRoutes'); // المسار الجديد اللي فيه castVote

const app = express();

// 2. إعدادات الـ CORS والسماح بالبيانات الكبيرة (مهم للصور الـ Base64)
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// الصفحة الرئيسية للتأكد أن السيرفر يعمل
app.get('/', (req, res) => {
    res.send(`<h1>Election System API is Running Successfully!</h1>`);
});

// 3. تعريف الروابط (Endpoints)
// أي طلب يبدأ بـ /api/voters يروح لملف voterRoutes
app.use('/api/voters', voterRoutes);         

// أي طلب يبدأ بـ /api/candidates يروح لملف candidateRoutes
app.use('/api/candidates', candidateRoutes); 

// أي طلب يبدأ بـ /api/vote يروح لملف voteRoutes (الخاص بعملية التصويت)
app.use('/api/vote', voteRoutes); 


// 4. معالجة الأخطاء العامة (Global Error Handler)
app.use((err, req, res, next) => {
    if (err.type === 'entity.too.large') {
        return res.status(413).json({ 
            success: false, 
            message: "حجم البيانات كبير جداً، يرجى محاولة رفع صور أصغر" 
        });
    }
    console.error("Internal Server Error:", err.stack);
    res.status(500).json({ 
        success: false, 
        message: "حدث خطأ داخلي في السيرفر، يرجى المحاولة لاحقاً" 
    });
});

// 5. تشغيل السيرفر
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 السيرفر شغال الآن على منفذ: ${PORT}`);
    console.log(`📡 المسارات المتاحة: `);
    console.log(`   - Voters: /api/voters`);
    console.log(`   - Candidates: /api/candidates`);
    console.log(`   - Voting: /api/vote/cast`);
});