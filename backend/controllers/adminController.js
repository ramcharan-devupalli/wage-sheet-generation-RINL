const pool = require("../config/dbConfig");

function value(row, keys, fallback = "") {
  for (const key of keys) {
    const found = row[key];
    if (found !== undefined && found !== null && String(found).trim() !== "") return String(found).trim();
  }
  return fallback;
}

function normalizeRole(role) {
  const normalized = String(role || "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (["admin", "hr", "hr admin", "hr / admin"].includes(normalized)) return "Admin";
  if (["engineer", "engineer incharge", "engineer in charge", "eic"].includes(normalized)) return "Engineer Incharge";
  if (["contractor", "contractor representative"].includes(normalized)) return "Contractor";
  if (["supervisor", "shift supervisor"].includes(normalized)) return "Supervisor";
  if (["worker", "workers", "skilled worker", "skilled labor"].includes(normalized)) return "Skilled Worker";
  if (["semi skilled worker", "semi skilled labor", "semi-skilled worker", "semi-skilled labor"].includes(normalized)) return "Semi-Skilled Worker";
  if (["unskilled worker", "unskilled labor"].includes(normalized)) return "Unskilled Worker";
  return role || "Worker";
}

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
    const monthNumberText = String(Number(monthNumber));

    const result = await pool.query(`
      WITH normalized_sheets AS (
        SELECT
          ws.*,
          LOWER(TRIM(ws.month::text)) AS normalized_month
        FROM wage_sheets ws
      )
      SELECT
        COALESCE(ns.contractor_id, '-') AS job_cd,
        COALESCE(c.name, '-') AS contractor_name,
        COUNT(DISTINCT ns.worker_id) AS worker_count,
        COALESCE(SUM(ns.days_present), 0) AS total_present_days,
        COALESCE(SUM(ns.gross_wage), 0) AS wage_expense
      FROM normalized_sheets ns
      LEFT JOIN contractors c ON c.contractor_id = ns.contractor_id
      WHERE ns.year = $1
        AND (
          LPAD(ns.normalized_month, 2, '0') = $2
          OR ns.normalized_month IN ($3, $4, $5, $6)
        )
      GROUP BY ns.contractor_id, c.name
      ORDER BY wage_expense DESC
    `, [Number(year), monthNumber, monthName, shortMonthName, month, monthNumberText]);

    const total = result.rows.reduce((sum, row) => sum + Number(row.wage_expense || 0), 0);
    res.json({ jobs: result.rows, total_expense: total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error loading wage expenses" });
  }
};

const importUsers = async (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (!rows.length) return res.status(400).json({ message: "No user rows provided" });

  try {
    const imported = [];
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const empId = value(row, ["employee_id", "emp_id", "id"], `EMP-${Date.now()}-${index + 1}`);
      const name = value(row, ["name", "employee_name", "user_name"], empId);
      const role = normalizeRole(value(row, ["role", "user_role"], "Worker"));
      const mobile = value(row, ["mobile", "phone", "phone_number"], null);
      const email = value(row, ["email", "mail"], null);
      const password = value(row, ["password", "pwd"], "1234");
      const status = value(row, ["status"], "active").toLowerCase();

      const result = await pool.query(
        `INSERT INTO employees (emp_id, name, role, mobile, email, password, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (emp_id) DO UPDATE SET
           name = EXCLUDED.name,
           role = EXCLUDED.role,
           mobile = EXCLUDED.mobile,
           email = EXCLUDED.email,
           password = EXCLUDED.password,
           status = EXCLUDED.status
         RETURNING id, name, email, mobile, role, emp_id AS employee_id, status, created_at`,
        [empId, name, role, mobile, email, password, status]
      );
      imported.push(result.rows[0]);
    }
    res.json({ message: "Users imported", users: imported });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error importing users" });
  }
};

const importContracts = async (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (!rows.length) return res.status(400).json({ message: "No contract rows provided" });

  try {
    const imported = [];
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const contractorId = value(row, ["job_cd", "job_code", "contractor_id", "contract_id"], `CON-${Date.now()}-${index + 1}`);
      const name = value(row, ["contractor_name", "contractor", "name"], contractorId);
      const mobile = value(row, ["contractor_phone", "phone", "mobile"], null);
      const company = value(row, ["work_area", "company", "area"], null);
      const result = await pool.query(
        `INSERT INTO contractors (contractor_id, name, mobile, company)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (contractor_id) DO UPDATE SET
           name = EXCLUDED.name,
           mobile = EXCLUDED.mobile,
           company = EXCLUDED.company
         RETURNING contractor_id AS job_cd, name AS contractor_name, mobile AS contractor_phone, company AS work_area, '-' AS dept_cd, created_at AS job_start_dt, NULL AS job_end_dt`,
        [contractorId, name, mobile, company]
      );
      imported.push(result.rows[0]);
    }
    res.json({ message: "Contracts imported", contracts: imported });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error importing contracts" });
  }
};

const importWorkers = async (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (!rows.length) return res.status(400).json({ message: "No worker rows provided" });

  try {
    const imported = [];
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const workerId = value(row, ["adhar_id", "aadhaar_id", "aadhar_id", "worker_id"], `W-${Date.now()}-${index + 1}`);
      const name = value(row, ["worker_name", "name"], workerId);
      const category = value(row, ["worker_skill", "skill", "category", "worker_desig"], "Worker");
      const contractorId = value(row, ["job_cd", "job_code", "contractor_id"], null);
      const mobile = value(row, ["mobile", "phone", "phone_number"], null);
      const dailyWage = Number(value(row, ["daily_wage", "wage", "rate"], 0)) || 0;
      const result = await pool.query(
        `INSERT INTO workers (worker_id, name, category, contractor_id, mobile, daily_wage, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'active')
         ON CONFLICT (worker_id) DO UPDATE SET
           name = EXCLUDED.name,
           category = EXCLUDED.category,
           contractor_id = EXCLUDED.contractor_id,
           mobile = EXCLUDED.mobile,
           daily_wage = EXCLUDED.daily_wage,
           status = 'active'
         RETURNING worker_id AS adhar_id, name AS worker_name, contractor_id AS job_cd, category AS worker_skill, category AS worker_desig, mobile, daily_wage`,
        [workerId, name, category, contractorId, mobile, dailyWage]
      );
      imported.push(result.rows[0]);
    }
    res.json({ message: "Workers imported", workers: imported });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error importing workers" });
  }
};

module.exports = {
  getAdminStats,
  getAllUsers,
  importUsers,
  importContracts,
  importWorkers,
  updateUserStatus,
  getWageRates,
  updateWageRate,
  getWageExpenses,
};
