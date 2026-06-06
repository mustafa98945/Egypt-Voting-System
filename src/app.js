require('dotenv').config();
const express = require('express');
const cors = require('cors');

// 1. Import Routes
const voterRoutes = require('./routes/voterRoutes');
const candidateRoutes = require('./routes/candidateRoutes');
const voteRoutes = require('./routes/voteRoutes'); 
const statsRoutes = require('./routes/statsRoutes');
const adminRoutes = require('./routes/adminRoutes');
const electionRoutes = require('./routes/electionRoutes');
const forgotPasswordRoutes = require('./routes/forgotPasswordRoutes');

const app = express();

// 2. Middleware Configuration
app.use(cors());

// 50mb limit for processing face images and documents
app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Root Welcome Page
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

// 3. API Endpoints
app.use('/api/voters', voterRoutes);         
app.use('/api/candidates', candidateRoutes); 
app.use('/api/vote', voteRoutes); 
app.use('/api/stats', statsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/election', electionRoutes);
app.use('/api/auth', forgotPasswordRoutes);

// 4. Handle Unknown Routes (404)
app.use((req, res) => {
    res.status(404).json({ 
        success: false, 
        message: "This route does not exist on the server. Please check the correct endpoint." 
    });
});

// 5. Global Error Handling
app.use((err, req, res, next) => {
    if (err.type === 'entity.too.large') {
        return res.status(413).json({ 
            success: false, 
            message: "Payload too large. Please reduce the image size or quality." 
        });
    }
    
    console.error("❌ Internal Server Error:", err.stack);
    res.status(500).json({ 
        success: false, 
        message: "An internal server error occurred. Please check the logs." 
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`-----------------------------------------`);
    console.log(`🚀 Server is now running on port: ${PORT}`);
    console.log(`📡 Active Endpoints:`);
    console.log(`   ✅ Voters:        /api/voters`);
    console.log(`   ✅ Candidates:    /api/candidates`);
    console.log(`   ✅ Voting:        /api/vote`);
    console.log(`   ✅ Statistics:    /api/stats`);
    console.log(`   ✅ Admin:         /api/admin`);
    console.log(`   ✅ Elections:     /api/election`);
    console.log(`-----------------------------------------`);
});