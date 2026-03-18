const express = require('express');
const router = express.Router();
const statsController = require('../controllers/statsController');

// الحصول على أعلى المرشحين
router.get('/top-candidates', statsController.getTopCandidates);

// الحصول على ملخص الأرقام
router.get('/summary', statsController.getElectionSummary);

module.exports = router;