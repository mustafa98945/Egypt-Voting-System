const express = require('express');
const router = express.Router();
const electionController = require('../controllers/electionController');
const adminMiddleware = require('../middleware/adminMiddleware');

// للـ Flutter - بدون توكن
router.get('/status', electionController.getElectionStatus);

// للـ Admin - محتاجة توكن
router.post('/create', adminMiddleware, electionController.createElection);
router.put('/edit/:id', adminMiddleware, electionController.editElection);
router.get('/all', adminMiddleware, electionController.getAllElections);
router.delete('/delete/:id', adminMiddleware, electionController.deleteElection);

module.exports = router;