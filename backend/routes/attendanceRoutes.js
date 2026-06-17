const router = require('express').Router();
const { getAttendance, markAttendance } = require('../controllers/attendanceController');

router.get('/attendance', getAttendance);
router.post('/attendance', markAttendance);

module.exports = router;
