const express = require("express");
const router = express.Router();

const {
  getAdminStats,
  getAllUsers,
  getEngineers,
  createEngineer,
  deleteEngineer,
  getSupervisors,
  saveSupervisor,
  updateSupervisor,
  deleteSupervisor,
  importUsers,
  importContracts,
  importSupervisors,
  importWorkers,
  importMuster,
  importWages,
  clearData,
  updateUserStatus,
  getWageRates,
  updateWageRate,
  getWageExpenses,
  getLoginActivity,
} = require("../controllers/adminController");

router.get("/stats", getAdminStats);
router.get("/users", getAllUsers);
router.get("/engineers", getEngineers);
router.post("/engineers", createEngineer);
router.delete("/engineers/:id", deleteEngineer);
router.get("/supervisors", getSupervisors);
router.post("/supervisors", saveSupervisor);
router.patch("/supervisors/:id", updateSupervisor);
router.delete("/supervisors/:id", deleteSupervisor);
router.post("/import/users", importUsers);
router.post("/import/contracts", importContracts);
router.post("/import/supervisors", importSupervisors);
router.post("/import/workers", importWorkers);
router.post("/import/muster", importMuster);
router.post("/import/wages", importWages);
router.post("/clear-data", clearData);
router.patch("/users/:id/status", updateUserStatus);
router.get("/wage-rates", getWageRates);
router.patch("/wage-rates/:skill", updateWageRate);
router.get("/wage-expenses", getWageExpenses);
router.get("/login-activity", getLoginActivity);

module.exports = router;
