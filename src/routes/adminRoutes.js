const express = require('express');
const router = express.Router();

const adminController = require('../controllers/adminController');
const adminMiddleware = require('../middleware/adminMiddleware');

////////////////////////////////////////////////////////////
// ✅ Authentication
////////////////////////////////////////////////////////////

router.post('/login', adminController.login);
router.post('/logout', adminMiddleware, adminController.logout);

////////////////////////////////////////////////////////////
// ✅ Admin Management
////////////////////////////////////////////////////////////

router.post('/add', adminMiddleware, adminController.addAdmin);
router.get('/all', adminMiddleware, adminController.getAllAdmins);
router.delete('/delete/:id', adminMiddleware, adminController.deleteAdmin);
router.put('/edit/:id', adminMiddleware, adminController.editAdmin);

////////////////////////////////////////////////////////////
// ✅ Dashboard
////////////////////////////////////////////////////////////

router.get('/dashboard/stats', adminMiddleware, adminController.getDashboardStats);

////////////////////////////////////////////////////////////
// ✅ Electoral Districts
////////////////////////////////////////////////////////////

router.get('/districts', adminMiddleware, adminController.getElectoralDistricts);

////////////////////////////////////////////////////////////
// ✅ Political Parties
////////////////////////////////////////////////////////////

router.get('/parties', adminMiddleware, adminController.getAllParties);
router.post('/parties/add', adminMiddleware, adminController.addParty);
router.put('/parties/edit/:id', adminMiddleware, adminController.editParty);
router.delete('/parties/delete/:id', adminMiddleware, adminController.deleteParty);

////////////////////////////////////////////////////////////
// ✅ Votes & Voters
////////////////////////////////////////////////////////////

router.get('/votes', adminMiddleware, adminController.getVotesData);
router.get('/voters/status', adminMiddleware, adminController.getVotersStatus);

////////////////////////////////////////////////////////////
// ✅ Election Results
////////////////////////////////////////////////////////////

router.get('/election/results', adminMiddleware, adminController.getElectionResults);
router.put('/group/decision', adminMiddleware, adminController.decideElectionGroup);

////////////////////////////////////////////////////////////
// ✅ Candidate Management
////////////////////////////////////////////////////////////

router.get('/candidates/pending', adminMiddleware, adminController.getPendingCandidates);
router.get('/candidates/accepted', adminMiddleware, adminController.getAcceptedCandidates);
router.delete('/candidates/delete/:id', adminMiddleware, adminController.deleteCandidate);
router.get('/candidates/:id', adminMiddleware, adminController.getCandidateDetails);
router.put('/candidates/:id/decision', adminMiddleware, adminController.decideCandidateApproval);

module.exports = router;