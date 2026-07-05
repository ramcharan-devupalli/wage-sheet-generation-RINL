const pool = require("../config/dbConfig");

function normalizeKey(key) {
  return String(key || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function value(row, keys, fallback = "") {
  const normalizedRow = {};
  Object.entries(row || {}).forEach(([key, rowValue]) => {
    normalizedRow[normalizeKey(key)] = rowValue;
  });

  for (const key of keys) {
    const found = normalizedRow[normalizeKey(key)];
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

function normalizeWageCategory(category) {
  const normalized = normalizeKey(category).replace(/_/g, "");
  if (normalized.includes("supervisor")) return "Supervisor";
  if (normalized === "skill" || normalized.includes("semiskilled")) return "Semi Skilled";
  if (normalized.includes("unskilled") || normalized === "") return "UnSkilled";
  if (normalized.includes("skilled")) return "Skilled";
  return category || "";
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

function compactId(raw) {
  return String(raw || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function idAliases(raw) {
  const value = String(raw || "").trim();
  const compact = compactId(value);
  const withoutRinlPrefix = value.replace(/^rinl[-_\s]*/i, "");
  return Array.from(new Set([
    value.toLowerCase(),
    withoutRinlPrefix.toLowerCase(),
    compact,
    compact.replace(/^rinl/, "")
  ].filter(Boolean)));
}

async function resolveEngineerId(rawEngineerId) {
  const aliases = idAliases(rawEngineerId);
  if (!aliases.length) return rawEngineerId || null;

  const result = await pool.query(
    `SELECT COALESCE(rinl_id, emp_id) AS engineer_id
     FROM employees
     WHERE LOWER(COALESCE(role, '')) IN ('engineer', 'engineer incharge', 'engineer in charge')
       AND (
         LOWER(COALESCE(rinl_id, emp_id)) = ANY($1::text[])
         OR LOWER(emp_id) = ANY($1::text[])
         OR LOWER(REGEXP_REPLACE(COALESCE(rinl_id, emp_id, ''), '[^a-zA-Z0-9]', '', 'g')) = ANY($2::text[])
         OR LOWER(REGEXP_REPLACE(COALESCE(emp_id, ''), '[^a-zA-Z0-9]', '', 'g')) = ANY($2::text[])
       )
     LIMIT 1`,
    [aliases, aliases.map(compactId)]
  );

  return result.rows[0]?.engineer_id || rawEngineerId || null;
}

const getAdminStats = async (req, res) => {
  try {
    const users = await pool.query("SELECT COUNT(*) FROM employees");
    const contracts = await pool.query("SELECT COUNT(*) FROM contractors");
    const workers = await pool.query("SELECT COUNT(*) FROM workers");
    const muster = await pool.query("SELECT COUNT(*) FROM attendance");

    const wageSheets = await pool.query(`
      SELECT COALESCE(SUM(gross_wage), 0) AS total_wage
      FROM wage_sheets
    `);
    const attendanceWage = await pool.query(`
      SELECT COALESCE(SUM(
        CASE WHEN LOWER(COALESCE(a.status, '')) = 'present'
          THEN COALESCE(w.daily_wage, 0)
          ELSE 0
        END
      ), 0) AS total_wage
      FROM attendance a
      LEFT JOIN workers w ON w.worker_id = a.worker_id
    `);
    const wageSheetTotal = Number(wageSheets.rows[0].total_wage);
    const attendanceTotal = Number(attendanceWage.rows[0].total_wage);

    res.json({
      total_users: Number(users.rows[0].count),
      total_contracts: Number(contracts.rows[0].count),
      total_workers: Number(workers.rows[0].count),
      total_muster: Number(muster.rows[0].count),
      total_wage: wageSheetTotal || attendanceTotal,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error loading admin stats" });
  }
};

const getLoginActivity = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        emp_id,
        name,
        role,
        action,
        timestamp,
        ip_address,
        browser,
        browser_version,
        operating_system,
        device
      FROM login_logs
      ORDER BY timestamp DESC
      LIMIT 100
    `);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error loading login activity" });
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

const getSupervisors = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        s.id,
        COALESCE(s.rinl_id, s.supervisor_id) AS rinl_id,
        s.supervisor_id,
        s.contractor_id,
        s.name,
        s.mobile,
        s.email,
        s.status,
        COALESCE(s.present, 0) AS present,
        COALESCE(s.absent, 0) AS absent,
        COALESCE(s.overtime, 0) AS overtime,
        s.created_at
      FROM supervisors s
      GROUP BY s.id, s.rinl_id, s.supervisor_id, s.contractor_id, s.name, s.mobile, s.email, s.present, s.absent, s.overtime, s.status, s.created_at
      ORDER BY s.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error loading supervisors" });
  }
};

async function syncSupervisorLogin({ supervisorId, name, mobile, email, status }) {
  await pool.query(
    `INSERT INTO employees (rinl_id, emp_id, name, role, mobile, email, password, status)
     VALUES ($1, $1, $2, 'Supervisor', $3, $4, '1234', $5)
     ON CONFLICT (emp_id) DO UPDATE SET
       rinl_id = EXCLUDED.rinl_id,
       name = EXCLUDED.name,
       role = EXCLUDED.role,
       mobile = EXCLUDED.mobile,
       email = EXCLUDED.email,
       status = EXCLUDED.status`,
    [
      supervisorId,
      name,
      mobile || null,
      email || null,
      String(status || "active").toLowerCase()
    ]
  );
}

const saveSupervisor = async (req, res) => {
  try {
    const {
      supervisor_id,
      rinl_id,
      contractor_id,
      name,
      mobile,
      email,
      status,
      present,
      absent,
      overtime,
    } = req.body;

    const supervisorId = String(supervisor_id || rinl_id || "").trim();
    const supervisorName = String(name || "").trim();

    if (!supervisorId || !supervisorName) {
      return res.status(400).json({ message: "Supervisor ID and name are required" });
    }

    const result = await pool.query(
      `INSERT INTO supervisors (rinl_id, supervisor_id, contractor_id, name, mobile, email, status, present, absent, overtime)
       VALUES ($1, $1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (supervisor_id) DO UPDATE SET
         rinl_id = EXCLUDED.rinl_id,
         contractor_id = EXCLUDED.contractor_id,
         name = EXCLUDED.name,
         mobile = EXCLUDED.mobile,
         email = EXCLUDED.email,
         status = EXCLUDED.status,
         present = EXCLUDED.present,
         absent = EXCLUDED.absent,
         overtime = EXCLUDED.overtime
       RETURNING id, COALESCE(rinl_id, supervisor_id) AS rinl_id, supervisor_id, contractor_id, name, mobile, email, status, present, absent, overtime, created_at`,
      [
        supervisorId,
        contractor_id || null,
        supervisorName,
        mobile || null,
        email || null,
        String(status || "active").toLowerCase(),
        Number(present || 0),
        Number(absent || 0),
        Number(overtime || 0),
      ]
    );

    await syncSupervisorLogin({
      supervisorId,
      name: supervisorName,
      mobile,
      email,
      status
    });

    res.status(201).json({ message: "Supervisor saved successfully", supervisor: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error saving supervisor" });
  }
};

const updateSupervisor = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      supervisor_id,
      rinl_id,
      contractor_id,
      name,
      mobile,
      email,
      status,
      present,
      absent,
      overtime,
    } = req.body;

    const supervisorId = String(supervisor_id || rinl_id || id || "").trim();
    const supervisorName = String(name || "").trim();

    if (!supervisorId || !supervisorName) {
      return res.status(400).json({ message: "Supervisor ID and name are required" });
    }

    const result = await pool.query(
      `UPDATE supervisors
       SET rinl_id = $1,
           supervisor_id = $1,
           contractor_id = $2,
           name = $3,
           mobile = $4,
           email = $5,
           status = $6,
           present = $7,
           absent = $8,
           overtime = $9
       WHERE supervisor_id = $10
       RETURNING id, COALESCE(rinl_id, supervisor_id) AS rinl_id, supervisor_id, contractor_id, name, mobile, email, status, present, absent, overtime, created_at`,
      [
        supervisorId,
        contractor_id || null,
        supervisorName,
        mobile || null,
        email || null,
        String(status || "active").toLowerCase(),
        Number(present || 0),
        Number(absent || 0),
        Number(overtime || 0),
        id,
      ]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: "Supervisor not found" });
    }

    await syncSupervisorLogin({
      supervisorId,
      name: supervisorName,
      mobile,
      email,
      status
    });

    res.json({ message: "Supervisor updated successfully", supervisor: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error updating supervisor" });
  }
};

const deleteSupervisor = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      "DELETE FROM supervisors WHERE supervisor_id = $1 RETURNING supervisor_id",
      [id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: "Supervisor not found" });
    }

    await pool.query(
      "UPDATE workers SET supervisor_id = NULL WHERE supervisor_id = $1",
      [id]
    );
    await pool.query(
      "DELETE FROM employees WHERE emp_id = $1 AND LOWER(COALESCE(role, '')) = 'supervisor'",
      [id]
    );

    res.json({ message: "Supervisor deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error deleting supervisor" });
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
      WITH fixed_categories(worker_skill, sort_order) AS (
        VALUES
          ('Supervisor', 1),
          ('Skilled', 2),
          ('Semi Skilled', 3),
          ('UnSkilled', 4)
      ),
      normalized_rates AS (
        SELECT
          CASE
            WHEN LOWER(REGEXP_REPLACE(COALESCE(category, ''), '[^a-zA-Z0-9]+', '', 'g')) LIKE '%supervisor%' THEN 'Supervisor'
            WHEN LOWER(REGEXP_REPLACE(COALESCE(category, ''), '[^a-zA-Z0-9]+', '', 'g')) = 'skill'
              OR LOWER(REGEXP_REPLACE(COALESCE(category, ''), '[^a-zA-Z0-9]+', '', 'g')) LIKE '%semiskilled%' THEN 'Semi Skilled'
            WHEN LOWER(REGEXP_REPLACE(COALESCE(category, ''), '[^a-zA-Z0-9]+', '', 'g')) LIKE '%unskilled%'
              OR LOWER(REGEXP_REPLACE(COALESCE(category, ''), '[^a-zA-Z0-9]+', '', 'g')) = '' THEN 'UnSkilled'
            WHEN LOWER(REGEXP_REPLACE(COALESCE(category, ''), '[^a-zA-Z0-9]+', '', 'g')) LIKE '%skilled%' THEN 'Skilled'
            ELSE NULL
          END AS worker_skill,
          daily_wage
        FROM workers
      )
      SELECT
        fixed_categories.worker_skill,
        COALESCE(MAX(normalized_rates.daily_wage), 0) AS daily_wage
      FROM fixed_categories
      LEFT JOIN normalized_rates ON normalized_rates.worker_skill = fixed_categories.worker_skill
      GROUP BY fixed_categories.worker_skill, fixed_categories.sort_order
      ORDER BY fixed_categories.sort_order
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
    const normalizedSkill = normalizeWageCategory(skill);
    const result = await pool.query(
      `UPDATE workers
       SET daily_wage = $1,
           category = $2
       WHERE CASE
         WHEN LOWER(REGEXP_REPLACE(COALESCE(category, ''), '[^a-zA-Z0-9]+', '', 'g')) LIKE '%supervisor%' THEN 'Supervisor'
         WHEN LOWER(REGEXP_REPLACE(COALESCE(category, ''), '[^a-zA-Z0-9]+', '', 'g')) = 'skill'
           OR LOWER(REGEXP_REPLACE(COALESCE(category, ''), '[^a-zA-Z0-9]+', '', 'g')) LIKE '%semiskilled%' THEN 'Semi Skilled'
         WHEN LOWER(REGEXP_REPLACE(COALESCE(category, ''), '[^a-zA-Z0-9]+', '', 'g')) LIKE '%unskilled%'
           OR LOWER(REGEXP_REPLACE(COALESCE(category, ''), '[^a-zA-Z0-9]+', '', 'g')) = '' THEN 'UnSkilled'
         WHEN LOWER(REGEXP_REPLACE(COALESCE(category, ''), '[^a-zA-Z0-9]+', '', 'g')) LIKE '%skilled%' THEN 'Skilled'
         ELSE category
       END = $2
       RETURNING $2 AS worker_skill, daily_wage`,
      [daily_wage, normalizedSkill]
    );
    res.json({
      message: "Wage rate updated",
      wage_rate: result.rows[0] || { worker_skill: normalizedSkill, daily_wage }
    });
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
      const contractorId = value(row, ["contractor_id", "job_cd", "job_code"], null);
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
      if (/supervisor/i.test(role)) {
        await pool.query(
          `INSERT INTO supervisors (rinl_id, supervisor_id, contractor_id, name, mobile, email, status)
           VALUES ($1, $1, $2, $3, $4, $5, $6)
           ON CONFLICT (supervisor_id) DO UPDATE SET
             rinl_id = EXCLUDED.rinl_id,
             contractor_id = EXCLUDED.contractor_id,
             name = EXCLUDED.name,
             mobile = EXCLUDED.mobile,
             email = EXCLUDED.email,
             status = EXCLUDED.status`,
          [empId, contractorId, name, mobile, email, status]
        );
      }
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
      const engineerId = await resolveEngineerId(value(row, ["engineer_id", "engineer", "engineer_incharge", "engineer_rinl_id", "eic_id"], null));
      const name = value(row, ["contractor_name", "contractor", "name"], contractorId);
      const email = value(row, ["contractor_email", "email", "email_id", "mail", "mail_id"], null);
      const mobile = value(row, ["contractor_phone", "phone", "mobile"], null);
      const company = value(row, ["work_area", "company", "area"], null);

      if (!contractorId || contractorId.trim() === "") {
        return res.status(400).json({ message: `Row ${index + 1}: Job Code/Contractor ID is required.` });
      }
      if (!name || name.trim() === "") {
        return res.status(400).json({ message: `Row ${index + 1}: Contractor Name is required.` });
      }

      const result = await pool.query(
        `INSERT INTO contractors (rinl_id, contractor_id, engineer_id, name, mobile, email, company)
         VALUES ($1, $1, $2, $3, $4, $5, $6)
         ON CONFLICT (contractor_id) DO UPDATE SET
           rinl_id = EXCLUDED.rinl_id,
           engineer_id = EXCLUDED.engineer_id,
           name = EXCLUDED.name,
           mobile = EXCLUDED.mobile,
           email = EXCLUDED.email,
           company = EXCLUDED.company
         RETURNING COALESCE(rinl_id, contractor_id) AS rinl_id, contractor_id AS job_cd, engineer_id, name AS contractor_name, email AS contractor_email, mobile AS contractor_phone, company AS work_area, '-' AS dept_cd, created_at AS job_start_dt, NULL AS job_end_dt`,
        [contractorId, engineerId, name, mobile, email, company]
      );
      imported.push(result.rows[0]);
    }
    res.json({ message: "Contracts imported successfully", contracts: imported });
  } catch (err) {
    console.error(err);
    res.status(400).json({ message: `Database error during contracts import: ${err.message}` });
  }
};

const importSupervisors = async (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (!rows.length) return res.status(400).json({ message: "No supervisor rows provided" });

  try {
    const imported = [];
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const supervisorId = value(row, ["supervisor_id", "supervisor_rinl_id", "rinl_id", "rinl-id"], `SUP-${Date.now()}-${index + 1}`);
      const contractorId = value(row, ["contractor_id", "job_cd", "job_code", "contract_id"], null);
      const name = value(row, ["name", "supervisor_name", "supervisor", "employee_name", "person_name", "full_name"], supervisorId);
      const mobile = value(row, ["mobile", "mobile_number", "supervisor_mobile", "phone", "phone_number", "contact", "contact_number"], null);
      const email = value(row, ["email", "email_id", "mail", "mail_id", "supervisor_email"], null);
      const status = value(row, ["status"], "active").toLowerCase();
      const present = Number(value(row, ["present", "present_days", "days_present", "total_present_days"], 0)) || 0;
      const absent = Number(value(row, ["absent", "absent_days", "total_absent_days"], 0)) || 0;
      const overtime = Number(value(row, ["overtime", "overtime_hrs", "ot"], 0)) || 0;

      if (!supervisorId || supervisorId.trim() === "") {
        return res.status(400).json({ message: `Row ${index + 1}: Supervisor ID is required.` });
      }
      if (!name || name.trim() === "") {
        return res.status(400).json({ message: `Row ${index + 1}: Supervisor Name is required.` });
      }

      const result = await pool.query(
        `INSERT INTO supervisors (rinl_id, supervisor_id, contractor_id, name, mobile, email, status, present, absent, overtime)
         VALUES ($1, $1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (supervisor_id) DO UPDATE SET
           rinl_id = EXCLUDED.rinl_id,
           contractor_id = EXCLUDED.contractor_id,
           name = EXCLUDED.name,
           mobile = EXCLUDED.mobile,
           email = EXCLUDED.email,
           status = EXCLUDED.status,
           present = EXCLUDED.present,
           absent = EXCLUDED.absent,
           overtime = EXCLUDED.overtime
         RETURNING id, COALESCE(rinl_id, supervisor_id) AS rinl_id, supervisor_id, contractor_id, name, mobile, email, status, present, absent, overtime, created_at`,
        [supervisorId, contractorId, name, mobile, email, status, present, absent, overtime]
      );
      await syncSupervisorLogin({
        supervisorId,
        name,
        mobile,
        email,
        status
      });
      imported.push(result.rows[0]);
    }
    res.json({ message: "Supervisors imported successfully", supervisors: imported });
  } catch (err) {
    console.error(err);
    res.status(400).json({ message: `Database error during supervisors import: ${err.message}` });
  }
};

const importWorkers = async (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (!rows.length) return res.status(400).json({ message: "No worker rows provided" });

  try {
    const imported = [];
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const workerId = value(row, ["adhar_id", "aadhaar_id", "aadhar_id", "worker_id", "worker_rinl_id", "rinl_id", "rinl-id", "id"], `W-${Date.now()}-${index + 1}`);
      const name = value(row, ["worker_name", "name", "employee_name", "person_name", "full_name"], workerId);
      const category = value(row, ["worker_skill", "worker skill", "skill", "skill_type", "skill type", "skill_category", "skill category", "category", "worker_desig", "worker desig", "designation", "designation_name", "designation name", "worker_designation", "worker designation"], "Worker");
      const contractorId = value(row, ["job_cd", "job_code", "job", "job_id", "contractor_id", "contract_id", "contract_code", "contract"], null);
      const supervisorId = value(row, ["supervisor_id", "supervisor id", "supervisor", "supervisor_rinl_id", "supervisor rinl id", "supervisor_rinl", "supervisor_code", "supervisor code"], null);
      const email = value(row, ["email", "email_id", "mail", "mail_id", "worker_email"], null);
      const gender = value(row, ["worker_gender", "worker gender", "gender", "gender_name", "gender name", "sex"], null);
      const dailyWage = Number(value(row, ["daily_wage", "daily wage", "daily_wages", "daily wages", "wage", "wages", "wage_rate", "wage rate", "rate", "daily_rate", "daily rate", "rate_per_day", "rate per day", "wage_per_day", "wage per day", "basic_wage", "basic wage", "basic_rate", "basic rate", "per_day_rate", "per day rate", "per_day_wage", "per day wage"], 0)) || 0;
      const present = Number(value(row, ["present", "present_days", "days_present", "total_present_days"], 0)) || 0;
      const absent = Number(value(row, ["absent", "absent_days", "total_absent_days"], 0)) || 0;
      const overtime = Number(value(row, ["overtime", "overtime_hrs", "ot"], 0)) || 0;

      if (!workerId || workerId.trim() === "") {
        return res.status(400).json({ message: `Row ${index + 1}: Aadhaar ID/Worker ID is required.` });
      }
      if (!name || name.trim() === "") {
        return res.status(400).json({ message: `Row ${index + 1}: Worker Name is required.` });
      }

      const result = await pool.query(
        `INSERT INTO workers (rinl_id, worker_id, name, category, contractor_id, supervisor_id, email, gender, daily_wage, status)
         VALUES ($1, $1, $2, $3, $4, $5, $6, $7, $8, 'active')
         ON CONFLICT (worker_id) DO UPDATE SET
           rinl_id = EXCLUDED.rinl_id,
           name = EXCLUDED.name,
           category = EXCLUDED.category,
           contractor_id = EXCLUDED.contractor_id,
           supervisor_id = EXCLUDED.supervisor_id,
           email = EXCLUDED.email,
           gender = EXCLUDED.gender,
           daily_wage = EXCLUDED.daily_wage,
           status = 'active'
         RETURNING COALESCE(rinl_id, worker_id) AS rinl_id, worker_id AS adhar_id, name AS worker_name, contractor_id AS job_cd, supervisor_id, category AS worker_skill, category AS worker_desig, COALESCE(gender, '-') AS worker_gender, email, daily_wage`,
        [workerId, name, category, contractorId, supervisorId, email, gender, dailyWage]
      );
      imported.push({ ...result.rows[0], present, absent, overtime });
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

  const client = await pool.connect();
  try {
    const sessionResult = await client.query(
      "SELECT role FROM login_sessions WHERE id = $1 AND status = 'active'",
      [sessionId]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(403).json({ message: "Invalid or expired session. Please log in again." });
    }

    const userRole = String(sessionResult.rows[0].role || "").toLowerCase();
    if (userRole !== "admin") {
      return res.status(403).json({ message: "Access denied. Only Admins can wipe database data." });
    }

    await client.query("BEGIN");

    // Clear uploaded operational data. Keep only the built-in Admin account.
    await client.query("TRUNCATE TABLE attendance CASCADE");
    await client.query("TRUNCATE TABLE wage_sheets CASCADE");
    await client.query("TRUNCATE TABLE workers CASCADE");
    await client.query("TRUNCATE TABLE supervisors CASCADE");
    await client.query("TRUNCATE TABLE contractors CASCADE");
    await client.query("DELETE FROM employees WHERE emp_id != 'RINL-AM-01'");
    await client.query("DELETE FROM login_sessions WHERE emp_id != 'RINL-AM-01'");
    await client.query("DELETE FROM login_logs WHERE emp_id != 'RINL-AM-01'");
    await client.query(`
      INSERT INTO employees (rinl_id, emp_id, name, role, mobile, email, password, status)
      VALUES ('RINL-AM-01', 'RINL-AM-01', 'Admin Manager', 'Admin', '9346431127', 'admin@vizagsteel.com', '1234', 'active')
      ON CONFLICT (emp_id) DO UPDATE SET
        rinl_id = EXCLUDED.rinl_id,
        name = EXCLUDED.name,
        role = EXCLUDED.role,
        mobile = EXCLUDED.mobile,
        email = EXCLUDED.email,
        password = EXCLUDED.password,
        status = EXCLUDED.status
    `);

    await client.query("COMMIT");

    res.json({ message: "All uploaded records have been cleared from the database successfully." });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(err);
    res.status(500).json({ message: `Failed to wipe database data: ${err.message}` });
  } finally {
    client.release();
  }
};

module.exports = {
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
};
