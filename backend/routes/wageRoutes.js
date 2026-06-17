const router = require('express').Router();
const { getWageSheets, createWageSheet } = require('../controllers/wageController');

router.get('/wages', getWageSheets);
router.post('/wages', createWageSheet);

module.exports = router;
