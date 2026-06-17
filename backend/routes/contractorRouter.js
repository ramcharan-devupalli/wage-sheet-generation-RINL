const router = require("express").Router();
const contractorController = require("../controllers/contractorController");

router.get("/dashboard", contractorController.getDashboard);
router.post("/workers", contractorController.saveWorker);
router.patch("/workers/:id", contractorController.updateWorkerStatus);
router.post("/attendance", contractorController.saveAttendance);
router.post("/wage-sheets/generate", contractorController.generateWageSheet);

module.exports = router;
