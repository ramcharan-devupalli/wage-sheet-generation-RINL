const pool = require("../config/dbConfig");

const getAdminStats = async (req, res) => {
  try {
    const users = await pool.query("SELECT COUNT(*) FROM employees");
    const contracts = await pool.query("SELECT COUNT(*) FROM contractors");
    const workers = await pool.query("SELECT COUNT(*) FROM workers");
    const muster = await pool.query("SELECT COUNT(*) FROM attendance");

    const wage = await pool.query(`
      SELECT COALESCE(SUM(gross_wage), 0) AS total_wage
      FROM wage_sheets
    `);

    res.json({
      total_users: Number(users.rows[0].count),
      total_contracts: Number(contracts.rows[0].count),
      total_workers: Number(workers.rows[0].count),
      total_muster: Number(muster.rows[0].count),
      total_wage: Number(wage.rows[0].total_wage),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error loading admin stats" });
  }
};

const getAllUsers = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, email, mobile, role, emp_id AS employee_id, status, created_at
      FROM employees
      ORDER BY id DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error loading users" });
  }
};

const updateUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const result = await pool.query(
      "UPDATE employees SET status = $1 WHERE id = $2 RETURNING id, name, email, mobile, role, emp_id AS employee_id, status, created_at",
      [status, id]
    );
    res.json({ message: "User status updated", user: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error updating user status" });
  }
};

const getWageRates = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        category AS worker_skill,
        COALESCE(MAX(daily_wage), 0) AS daily_wage
      FROM workers
      GROUP BY category
      ORDER BY category
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error loading wage rates" });
  }
};

const updateWageRate = async (req, res) => {
  try {
    const { skill } = req.params;
    const { daily_wage } = req.body;
    const result = await pool.query(
      "UPDATE workers SET daily_wage = $1 WHERE category = $2 RETURNING category AS worker_skill, daily_wage",
      [daily_wage, skill]
    );
    res.json({ message: "Wage rate updated", wage_rate: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error updating wage rate" });
  }
};

const getWageExpenses = async (req, res) => {
  try {
    const { month } = req.query;
    if (!month) return res.status(400).json({ message: "month is required" });
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ message: "month must be in YYYY-MM format" });
    }

    const [year, monthNumber] = month.split("-");
    const monthDate = new Date(Number(year), Number(monthNumber) - 1, 1);
    const monthName = monthDate.toLocaleString("en-US", { month: "long" }).toLowerCase();
    const shortMonthName = monthDate.toLocaleString("en-US", { month: "short" }).toLowerCase();

    const result = await pool.query(`
      SELECT
        COALESCE(ws.contractor_id, '-') AS job_cd,
        COALESCE(c.name, '-') AS contractor_name,
        COUNT(DISTINCT ws.worker_id) AS worker_count,
        COALESCE(SUM(ws.days_present), 0) AS total_present_days,
        COALESCE(SUM(ws.gross_wage), 0) AS wage_expense
      FROM wage_sheets ws
      LEFT JOIN contractors c ON c.contractor_id = ws.contractor_id
      WHERE ws.year = $1
        AND (
          LPAD(TRIM(ws.month::text), 2, '0') = $2
          OR LOWER(TRIM(ws.month::text)) IN ($3, $4)
        )
      GROUP BY ws.contractor_id, c.name
      ORDER BY wage_expense DESC
    `, [Number(year), monthNumber, monthName, shortMonthName]);

    const total = result.rows.reduce((sum, row) => sum + Number(row.wage_expense || 0), 0);
    res.json({ jobs: result.rows, total_expense: total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error loading wage expenses" });
  }
};

module.exports = {
  getAdminStats,
  getAllUsers,
  updateUserStatus,
  getWageRates,
  updateWageRate,
  getWageExpenses,
};
