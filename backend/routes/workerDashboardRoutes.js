const express = require("express");
const router = express.Router();

const {
  getWorkerDashboard,
} = require("../controllers/workerDashboardController");

router.get("/me/:adhar_id", getWorkerDashboard);

module.exports = router;
