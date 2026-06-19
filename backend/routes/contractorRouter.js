const router = require("express").Router();
const contractorController = require("../controllers/contractorController");

router.get("/dashboard", contractorController.getDashboard);
router.get("/leave-requests", contractorController.getLeaveRequestsForReview);
router.patch("/leave-requests/:workerId", contractorController.reviewLeave);
router.post("/workers", contractorController.saveWorker);
router.patch("/workers/:id", contractorController.updateWorkerStatus);
router.post("/attendance", contractorController.saveAttendance);
router.post("/wage-sheets/generate", contractorController.generateWageSheet);

module.exports = router;
