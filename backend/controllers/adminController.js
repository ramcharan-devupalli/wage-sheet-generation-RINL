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

function looksLikeEngineer(row) {
  const text = [
    row?.role,
    row?.name,
    row?.email,
    row?.emp_id,
    row?.employee_id,
  ].join(" ").toLowerCase();

  return /\b(engineer|eic|engineer incharge|engineer in charge)\b/.test(text);
}

function inferRole(row, fallback = "Worker") {
  const explicitRole = value(row, ["role", "user_role"], "");
  if (explicitRole) return normalizeRole(explicitRole);
  return looksLikeEngineer(row) ? "Engineer Incharge" : normalizeRole(fallback);
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
      SELECT id, COALESCE(rinl_id, emp_id) AS rinl_id, name, email, mobile, role, emp_id AS employee_id, status, created_at
      FROM employees
      WHERE NOT (
        LOWER(COALESCE(role, '')) IN ('engineer', 'engineer incharge', 'engineer in charge')
        OR LOWER(COALESCE(email, '')) LIKE '%engineer%'
        OR LOWER(COALESCE(name, '')) LIKE '%engineer%'
        OR LOWER(COALESCE(emp_id, '')) LIKE '%eic%'
      )
      ORDER BY id DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error loading users" });
  }
};

const getEngineers = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        name,
        email,
        mobile,
        'Engineer Incharge' AS role,
        COALESCE(rinl_id, emp_id) AS rinl_id,
        emp_id AS employee_id,
        status,
        created_at
      FROM employees
      WHERE LOWER(COALESCE(role, '')) IN ('engineer', 'engineer incharge', 'engineer in charge')
        OR LOWER(COALESCE(email, '')) LIKE '%engineer%'
        OR LOWER(COALESCE(name, '')) LIKE '%engineer%'
        OR LOWER(COALESCE(emp_id, '')) LIKE '%eic%'
      ORDER BY id DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error loading engineers" });
  }
};

const createEngineer = async (req, res) => {
  try {
    const {
      employee_id,
      rinl_id,
      emp_id,
      name,
      email,
      mobile,
      password,
      status,
    } = req.body;

    const empId = String(rinl_id || employee_id || emp_id || "").trim();
    const engineerName = String(name || "").trim();

    if (!empId || !engineerName) {
      return res.status(400).json({ message: "Engineer ID and name are required" });
    }

    const result = await pool.query(
      `INSERT INTO employees (rinl_id, emp_id, name, role, mobile, email, password, status)
       VALUES ($1, $1, $2, 'Engineer Incharge', $3, $4, $5, $6)
       ON CONFLICT (emp_id) DO UPDATE SET
         rinl_id = EXCLUDED.rinl_id,
         name = EXCLUDED.name,
         role = EXCLUDED.role,
         mobile = EXCLUDED.mobile,
         email = EXCLUDED.email,
         password = EXCLUDED.password,
         status = EXCLUDED.status
       RETURNING id, COALESCE(rinl_id, emp_id) AS rinl_id, name, email, mobile, role, emp_id AS employee_id, status, created_at`,
      [
        empId,
        engineerName,
        mobile || null,
        email || null,
        password || "1234",
        String(status || "active").toLowerCase(),
      ]
    );

    res.status(201).json({ message: "Engineer saved successfully", engineer: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error saving engineer" });
  }
};

const deleteEngineer = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `DELETE FROM employees
       WHERE id = $1
         AND LOWER(role) IN ('engineer', 'engineer incharge', 'engineer in charge')
       RETURNING id`,
      [id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: "Engineer not found" });
    }

    res.json({ message: "Engineer deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error deleting engineer" });
  }
};

const updateUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const result = await pool.query(
      "UPDATE employees SET status = $1 WHERE id = $2 RETURNING id, COALESCE(rinl_id, emp_id) AS rinl_id, name, email, mobile, role, emp_id AS employee_id, status, created_at",
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
      const empId = value(row, ["rinl_id", "rinl-id", "employee_id", "emp_id", "id"], `EMP-${Date.now()}-${index + 1}`);
      const name = value(row, ["name", "employee_name", "user_name"], empId);
      const mobile = value(row, ["mobile", "phone", "phone_number"], null);
      const email = value(row, ["email", "mail"], null);
      const role = inferRole({ ...row, emp_id: empId, name, email }, "Worker");
      const password = value(row, ["password", "pwd"], "1234");
      const status = value(row, ["status"], "active").toLowerCase();

      if (!empId || empId.trim() === "") {
        return res.status(400).json({ message: `Row ${index + 1}: Employee ID is required.` });
      }
      if (!name || name.trim() === "") {
        return res.status(400).json({ message: `Row ${index + 1}: Name is required.` });
      }

      const result = await pool.query(
        `INSERT INTO employees (rinl_id, emp_id, name, role, mobile, email, password, status)
         VALUES ($1, $1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (emp_id) DO UPDATE SET
           rinl_id = EXCLUDED.rinl_id,
           name = EXCLUDED.name,
           role = EXCLUDED.role,
           mobile = EXCLUDED.mobile,
           email = EXCLUDED.email,
           password = EXCLUDED.password,
           status = EXCLUDED.status
         RETURNING id, COALESCE(rinl_id, emp_id) AS rinl_id, name, email, mobile, role, emp_id AS employee_id, status, created_at`,
        [empId, name, role, mobile, email, password, status]
      );
      imported.push(result.rows[0]);
    }
    res.json({ message: "Users imported successfully", users: imported });
  } catch (err) {
    console.error(err);
    res.status(400).json({ message: `Database error during users import: ${err.message}` });
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

      if (!contractorId || contractorId.trim() === "") {
        return res.status(400).json({ message: `Row ${index + 1}: Job Code/Contractor ID is required.` });
      }
      if (!name || name.trim() === "") {
        return res.status(400).json({ message: `Row ${index + 1}: Contractor Name is required.` });
      }

      const result = await pool.query(
        `INSERT INTO contractors (rinl_id, contractor_id, name, mobile, company)
         VALUES ($1, $1, $2, $3, $4)
         ON CONFLICT (contractor_id) DO UPDATE SET
           rinl_id = EXCLUDED.rinl_id,
           name = EXCLUDED.name,
           mobile = EXCLUDED.mobile,
           company = EXCLUDED.company
         RETURNING COALESCE(rinl_id, contractor_id) AS rinl_id, contractor_id AS job_cd, name AS contractor_name, mobile AS contractor_phone, company AS work_area, '-' AS dept_cd, created_at AS job_start_dt, NULL AS job_end_dt`,
        [contractorId, name, mobile, company]
      );
      imported.push(result.rows[0]);
    }
    res.json({ message: "Contracts imported successfully", contracts: imported });
  } catch (err) {
    console.error(err);
    res.status(400).json({ message: `Database error during contracts import: ${err.message}` });
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

      if (!workerId || workerId.trim() === "") {
        return res.status(400).json({ message: `Row ${index + 1}: Aadhaar ID/Worker ID is required.` });
      }
      if (!name || name.trim() === "") {
        return res.status(400).json({ message: `Row ${index + 1}: Worker Name is required.` });
      }

      const result = await pool.query(
        `INSERT INTO workers (rinl_id, worker_id, name, category, contractor_id, mobile, daily_wage, status)
         VALUES ($1, $1, $2, $3, $4, $5, $6, 'active')
         ON CONFLICT (worker_id) DO UPDATE SET
           rinl_id = EXCLUDED.rinl_id,
           name = EXCLUDED.name,
           category = EXCLUDED.category,
           contractor_id = EXCLUDED.contractor_id,
           mobile = EXCLUDED.mobile,
           daily_wage = EXCLUDED.daily_wage,
           status = 'active'
         RETURNING COALESCE(rinl_id, worker_id) AS rinl_id, worker_id AS adhar_id, name AS worker_name, contractor_id AS job_cd, category AS worker_skill, category AS worker_desig, mobile, daily_wage`,
        [workerId, name, category, contractorId, mobile, dailyWage]
      );
      imported.push(result.rows[0]);
    }
    res.json({ message: "Workers imported successfully", workers: imported });
  } catch (err) {
    console.error(err);
    res.status(400).json({ message: `Database error during workers import: ${err.message}` });
  }
};

const importMuster = async (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (!rows.length) return res.status(400).json({ message: "No muster rows provided" });

  try {
    const imported = [];
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const workerId = value(row, ["worker_id", "adhar_id", "aadhaar_id", "aadhar_id"], "");
      const workerName = value(row, ["worker_name", "name"], workerId);
      const jobCd = value(row, ["job_cd", "job_code", "contractor_id"], null);
      const contractorName = value(row, ["contractor_name", "contractor"], "-");
      const musterMonth = value(row, ["muster_month", "month", "date"], "");

      if (!workerId || workerId.trim() === "") {
        return res.status(400).json({ message: `Row ${index + 1}: Aadhaar ID/Worker ID is required.` });
      }
      if (!musterMonth || musterMonth.trim() === "") {
        return res.status(400).json({ message: `Row ${index + 1}: Muster month is required.` });
      }

      const match = String(musterMonth).split("-");
      const year = Number(match[0]);
      const month = Number(match[1]);
      if (!year || !month) {
        return res.status(400).json({ message: `Row ${index + 1}: Month must be in YYYY-MM format.` });
      }

      const present = Number(value(row, ["present"], 0)) || 0;
      const absent = Number(value(row, ["absent"], 0)) || 0;
      const weeklyOff = Number(value(row, ["weekly_off", "wo"], 0)) || 0;
      const holidays = Number(value(row, ["holidays", "h"], 0)) || 0;
      const leaves = Number(value(row, ["leaves", "l"], 0)) || 0;

      const days = [
        ...Array.from({ length: present }, () => "present"),
        ...Array.from({ length: absent + weeklyOff + holidays + leaves }, () => "absent"),
      ];

      // Delete existing attendance for this worker and month
      await pool.query(
        "DELETE FROM attendance WHERE worker_id = $1 AND date >= $2::date AND date < ($2::date + INTERVAL '1 month')",
        [workerId, `${year}-${String(month).padStart(2, "0")}-01`]
      );

      // Insert daily attendance
      for (let dayIdx = 0; dayIdx < days.length; dayIdx += 1) {
        await pool.query(
          "INSERT INTO attendance (worker_id, date, status) VALUES ($1, $2::date + ($3::int * INTERVAL '1 day'), $4)",
          [workerId, `${year}-${String(month).padStart(2, "0")}-01`, dayIdx, days[dayIdx]]
        );
      }

      imported.push({
        worker_name: workerName,
        worker_id: workerId,
        job_cd: jobCd,
        contractor_name: contractorName,
        muster_month: musterMonth,
        present,
        absent,
        weekly_off: weeklyOff,
        holidays,
        leaves,
      });
    }

    res.json({ message: "Muster imported successfully", muster: imported });
  } catch (err) {
    console.error(err);
    res.status(400).json({ message: `Database error during muster import: ${err.message}` });
  }
};

const importWages = async (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (!rows.length) return res.status(400).json({ message: "No wage rows provided" });

  try {
    const imported = [];
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const workerId = value(row, ["worker_id", "adhar_id", "aadhaar_id", "aadhar_id"], "");
      const workerName = value(row, ["worker_name", "name"], workerId);
      const contractorId = value(row, ["job_cd", "job_code", "contractor_id"], null);
      const contractorName = value(row, ["contractor_name", "contractor"], "-");
      const wageMonth = value(row, ["wage_month", "muster_month", "month", "period", "date"], "");

      if (!workerId || workerId.trim() === "") {
        return res.status(400).json({ message: `Row ${index + 1}: Aadhaar ID/Worker ID is required.` });
      }
      if (!wageMonth || wageMonth.trim() === "") {
        return res.status(400).json({ message: `Row ${index + 1}: Wage month/period is required.` });
      }

      const match = String(wageMonth).split("-");
      const year = Number(match[0]);
      const monthNum = Number(match[1]);
      if (!year || !monthNum) {
        return res.status(400).json({ message: `Row ${index + 1}: Month must be in YYYY-MM format.` });
      }

      const monthDate = new Date(year, monthNum - 1, 1);
      const monthName = monthDate.toLocaleString("en-US", { month: "long" }).toLowerCase();

      const daysPresent = Number(value(row, ["present", "days_present"], 0)) || 0;
      const workerCount = Number(value(row, ["worker_count", "workers"], 1)) || 1;

      // Determine daily wage: either from row or from workers table or default to 0
      let dailyWage = Number(value(row, ["daily_wage", "wage", "rate"], 0)) || 0;
      if (!dailyWage) {
        const workerRes = await pool.query("SELECT daily_wage FROM workers WHERE worker_id = $1", [workerId]);
        if (workerRes.rows.length > 0) {
          dailyWage = Number(workerRes.rows[0].daily_wage) || 0;
        }
      }

      const uploadedExpense = Number(value(row, ["wage_expense", "expense", "amount"], 0)) || 0;
      const grossWage = uploadedExpense || (daysPresent * dailyWage);
      const pfDeduction = grossWage * 0.12;
      const esiDeduction = grossWage * 0.0075;
      const netWage = grossWage - pfDeduction - esiDeduction;

      // Delete existing wage sheet for this worker and month/year to avoid duplicates
      await pool.query(
        "DELETE FROM wage_sheets WHERE worker_id = $1 AND LOWER(TRIM(month)) = LOWER($2) AND year = $3",
        [workerId, monthName, year]
      );

      // Insert wage sheet record
      await pool.query(
        `INSERT INTO wage_sheets
         (worker_id, contractor_id, month, year, days_present, overtime_hrs, gross_wage, pf_deduction, esi_deduction, net_wage)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [workerId, contractorId, monthName, year, daysPresent, 0, grossWage, pfDeduction, esiDeduction, netWage]
      );

      imported.push({
        worker_id: workerId,
        worker_name: workerName,
        job_cd: contractorId,
        contractor_name: contractorName,
        wage_month: wageMonth,
        present: daysPresent,
        worker_count: workerCount,
        daily_wage: dailyWage,
        wage_expense: grossWage,
      });
    }

    res.json({ message: "Wages imported successfully", wages: imported });
  } catch (err) {
    console.error(err);
    res.status(400).json({ message: `Database error during wages import: ${err.message}` });
  }
};

const clearData = async (req, res) => {
  const sessionId = req.headers["x-session-id"];
  if (!sessionId) {
    return res.status(401).json({ message: "No session ID provided. Unauthorized access." });
  }

  try {
    const sessionResult = await pool.query(
      "SELECT role FROM login_sessions WHERE id = $1 AND status = 'active'",
      [sessionId]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(403).json({ message: "Invalid or expired session. Please log in again." });
    }

    const userRole = sessionResult.rows[0].role;
    if (userRole !== "Admin") {
      return res.status(403).json({ message: "Access denied. Only Admins can wipe database data." });
    }

    // Safely truncate/delete uploaded records
    await pool.query("TRUNCATE TABLE attendance CASCADE");
    await pool.query("TRUNCATE TABLE wage_sheets CASCADE");
    await pool.query("TRUNCATE TABLE workers CASCADE");
    await pool.query("TRUNCATE TABLE contractors CASCADE");
    await pool.query("DELETE FROM employees WHERE emp_id != 'RINL-HR-001'");
    await pool.query("DELETE FROM login_sessions WHERE emp_id != 'RINL-HR-001'");
    await pool.query("DELETE FROM login_logs WHERE emp_id != 'RINL-HR-001'");

    res.json({ message: "All uploaded records have been cleared from the database successfully." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: `Failed to wipe database data: ${err.message}` });
  }
};

module.exports = {
  getAdminStats,
  getAllUsers,
  getEngineers,
  createEngineer,
  deleteEngineer,
  importUsers,
  importContracts,
  importWorkers,
  importMuster,
  importWages,
  clearData,
  updateUserStatus,
  getWageRates,
  updateWageRate,
  getWageExpenses,
};
