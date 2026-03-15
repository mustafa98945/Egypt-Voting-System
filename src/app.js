require('dotenv').config();
const express = require('express');
const cors = require('cors');

const voterRoutes = require('./routes/voterRoutes');
const candidateRoutes = require('./routes/candidateRoutes');

const app = express();
app.use(cors());
app.use(express.json());

// الصفحة الرئيسية الـ HTML
app.get('/', (req, res) => {
    res.send(` ... الكود الـ HTML بتاعك هنا ... `);
});

// تقسيم الروابط
app.use('/api/voters', voterRoutes);        // كل روابط الناخبين هتبدأ بـ /api/voters
app.use('/api/candidates', candidateRoutes); // كل روابط المرشحين هتبدأ بـ /api/candidates

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));