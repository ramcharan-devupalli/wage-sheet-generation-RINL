const router = require("express").Router();
const workerController = require("../controllers/workerController");

router.get("/me", workerController.getCurrentWorker);
router.post("/leave", workerController.submitLeave);
router.get("/", workerController.getWorkers);
router.post("/", workerController.createWorker);

module.exports = router;
