const router = require("express").Router();
const workerController = require("../controllers/workerController");
const {
  getWorkerDashboard,
} = require("../controllers/workerDashboardController");

router.get("/me/:adhar_id", getWorkerDashboard);
router.get("/me", workerController.getCurrentWorker);
router.post("/leave", workerController.submitLeave);
router.get("/", workerController.getWorkers);
router.post("/", workerController.createWorker);
router.patch("/:id", workerController.updateWorker);
router.delete("/:id", workerController.deleteWorker);

module.exports = router;
