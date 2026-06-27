const router = require("express").Router();
const { getScopedDashboard } = require("../controllers/rbacDashboardController");

router.get("/dashboard", getScopedDashboard);

module.exports = router;
