const router = require('express').Router();
const {
  getDashboardStats,
  getEmployees,
  createEmployee,
  getWorkers,
  createWorker,
  getContractors,
  createContractor,
  getLoginActivity
} = require('../controllers/employeeController');

router.get('/dashboard-stats', getDashboardStats);
router.get('/employees', getEmployees);
router.post('/employees', createEmployee);
router.get('/workers', getWorkers);
router.post('/workers', createWorker);
router.get('/contractors', getContractors);
router.post('/contractors', createContractor);
router.get('/login-activity', getLoginActivity);

module.exports = router;
