const router = require("express").Router();
const contractorController = require("../controllers/contractorController");

router.get("/leave-requests", contractorController.getLeaveRequestsForReview);
router.patch("/leave-requests/:workerId", contractorController.reviewLeave);

module.exports = router;
