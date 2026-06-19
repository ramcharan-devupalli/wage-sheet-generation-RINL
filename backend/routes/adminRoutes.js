const express = require("express");
const router = express.Router();

const {
  getAdminStats,
  getAllUsers,
  importUsers,
  importContracts,
  importWorkers,
  updateUserStatus,
  getWageRates,
  updateWageRate,
  getWageExpenses,
} = require("../controllers/adminController");

router.get("/stats", getAdminStats);
router.get("/users", getAllUsers);
router.post("/import/users", importUsers);
router.post("/import/contracts", importContracts);
router.post("/import/workers", importWorkers);
router.patch("/users/:id/status", updateUserStatus);
router.get("/wage-rates", getWageRates);
router.patch("/wage-rates/:skill", updateWageRate);
router.get("/wage-expenses", getWageExpenses);

module.exports = router;
