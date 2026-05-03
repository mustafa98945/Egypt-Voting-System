const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const adminMiddleware = require('../middleware/adminMiddleware');

// بدون توكن
router.post('/login', adminController.login);

// محتاجة توكن Admin
router.post('/logout', adminMiddleware, adminController.logout);
router.post('/add', adminMiddleware, adminController.addAdmin);
router.get('/all', adminMiddleware, adminController.getAllAdmins);
router.delete('/delete/:id', adminMiddleware, adminController.deleteAdmin);
router.put('/edit/:id', adminMiddleware, adminController.editAdmin);
router.get('/candidates/pending', adminMiddleware, adminController.getPendingCandidates);
router.get('/candidates/:id', adminMiddleware, adminController.getCandidateDetails);
router.put('/candidates/:id/decision', adminMiddleware, adminController.decideCandidateApproval);

module.exports = router;