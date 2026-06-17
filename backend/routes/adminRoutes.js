const express = require("express");
const router = express.Router();

const {
  getAdminStats,
  getAllUsers,
  updateUserStatus,
  getWageRates,
  updateWageRate,
  getWageExpenses,
} = require("../controllers/adminController");

router.get("/stats", getAdminStats);
router.get("/users", getAllUsers);
router.patch("/users/:id/status", updateUserStatus);
router.get("/wage-rates", getWageRates);
router.patch("/wage-rates/:skill", updateWageRate);
router.get("/wage-expenses", getWageExpenses);

module.exports = router;