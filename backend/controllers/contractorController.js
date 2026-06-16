const pool = require("../config/dbConfig");

const sampleEngineer = {
  name: "Er. S. Prakash",
  department: "Mechanical Maintenance",
  contact: "prakash.eic@rinl.example / 0891-251-4420",
  pending_verifications: 3,
};

const sampleContract = {
  number: "RINL/MM/2025/184",
  start_date: "2025-09-01",
  end_date: "2026-08-31",
  value: 12500000,
  remaining_balance: 3820000,
  scope_of_work: "Maintenance support for mechanical, electrical, civil and utilities workforce deployment.",
};

function normalizeWorker(row) {
  return {
    id: row.worker_id,
    name: row.name,
    category: row.category,
    department: row.department || row.contractor_id || "General",
    status: row.status || "Active",
    days: Number(row.days || 0),
    ot: Number(row.ot || 0),
    gross: Number(row.gross || 0),
    pf: Number(row.pf || 0),
    esi: Number(row.esi || 0),
    net: Number(row.net || 0),
  };
}

async function getWorkers() {
  const result = await pool.query(`
    SELECT
      w.worker_id,
      w.name,
      w.category,
      w.contractor_id,
      INITCAP(COALESCE(w.status, 'active')) AS status,
      COALESCE(SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END), 0) AS days,
      COALESCE(SUM(a.overtime_hrs), 0) AS ot,
      COALESCE(MAX(w.daily_wage), 0) * COALESCE(SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END), 0) AS gross,
      ROUND((COALESCE(MAX(w.daily_wage), 0) * COALESCE(SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END), 0)) * 0.12, 2) AS pf,
      ROUND((COALESCE(MAX(w.daily_wage), 0) * COALESCE(SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END), 0)) * 0.0075, 2) AS esi,
      ROUND((COALESCE(MAX(w.daily_wage), 0) * COALESCE(SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END), 0)) * 0.8725, 2) AS net
    FROM workers w
    LEFT JOIN attendance a ON a.worker_id = w.worker_id
    GROUP BY w.worker_id, w.name, w.category, w.contractor_id, w.status
    ORDER BY w.created_at DESC
  `);
  return result.rows.map(normalizeWorker);
}

const getDashboard = async (req, res, next) => {
  try {
    const workers = await getWorkers();
    const attendanceResult = await pool.query(`
      SELECT
        a.worker_id AS "workerId",
        COALESCE(w.name, a.worker_id) AS name,
        TO_CHAR(a.date, 'YYYY-MM-DD') AS date,
        'A' AS shift,
        INITCAP(a.status) AS status,
        CASE WHEN a.status = 'present' THEN 8 ELSE 0 END AS hours
      FROM attendance a
      LEFT JOIN workers w ON w.worker_id = a.worker_id
      ORDER BY a.date DESC, a.created_at DESC
      LIMIT 100
    `);
    const wageResult = await pool.query(`
      SELECT
        CONCAT('WS-', UPPER(month), '-', year) AS id,
        CONCAT(month, ' ', year) AS month,
        COUNT(DISTINCT worker_id) AS workers,
        COALESCE(SUM(gross_wage), 0) AS gross,
        COALESCE(SUM(net_wage), 0) AS net,
        'Generated' AS status,
        'Ready for Engineer-In-Charge verification.' AS remarks
      FROM wage_sheets
      GROUP BY month, year
      ORDER BY year DESC, month DESC
      LIMIT 12
    `);

    res.json({
      workers,
      attendance: attendanceResult.rows,
      overtime: [],
      wageSheets: wageResult.rows,
      engineer: sampleEngineer,
      contract: sampleContract,
      notifications: [
        { type: "good", title: "Wage sheet approved", text: "Approved wage sheets are available for download." },
        { type: "warn", title: "Pending verifications", text: `${sampleEngineer.pending_verifications} items are pending with Engineer-In-Charge.` },
      ],
    });
  } catch (err) {
    next(err);
  }
};

const saveWorker = async (req, res, next) => {
  try {
    const { id, worker_id, name, category, department, mobile, daily_wage } = req.body;
    const workerId = id || worker_id || `W-${Date.now()}`;
    if (!name || !category) return res.status(400).json({ message: "Worker name and category are required" });

    const result = await pool.query(
      `INSERT INTO workers (worker_id, name, category, contractor_id, mobile, daily_wage, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'active')
       ON CONFLICT (worker_id) DO UPDATE SET
         name = EXCLUDED.name,
         category = EXCLUDED.category,
         contractor_id = EXCLUDED.contractor_id,
         mobile = EXCLUDED.mobile,
         daily_wage = EXCLUDED.daily_wage
       RETURNING worker_id, name, category, contractor_id, status`,
      [workerId, name, category, department || null, mobile || null, Number(daily_wage || 0)]
    );
    res.status(201).json({ message: "Worker saved", worker: normalizeWorker(result.rows[0]) });
  } catch (err) {
    next(err);
  }
};

const updateWorkerStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status = "inactive", department, category } = req.body;
    const result = await pool.query(
      `UPDATE workers
       SET status = $1,
           contractor_id = COALESCE($2, contractor_id),
           category = COALESCE($3, category)
       WHERE worker_id = $4
       RETURNING worker_id, name, category, contractor_id, status`,
      [String(status).toLowerCase(), department || null, category || null, id]
    );
    if (!result.rows.length) return res.status(404).json({ message: "Worker not found" });
    res.json({ message: "Worker updated", worker: normalizeWorker(result.rows[0]) });
  } catch (err) {
    next(err);
  }
};

const saveAttendance = async (req, res, next) => {
  try {
    const { workerId, worker_id, date, status, overtime = 0 } = req.body;
    const id = workerId || worker_id;
    if (!id || !date) return res.status(400).json({ message: "Worker ID and date are required" });
    const result = await pool.query(
      "INSERT INTO attendance (worker_id, date, status, overtime_hrs) VALUES ($1, $2, $3, $4) RETURNING *",
      [id, date, String(status || "present").toLowerCase(), Number(overtime || 0)]
    );
    res.status(201).json({ message: "Attendance saved", attendance: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

const generateWageSheet = async (req, res, next) => {
  try {
    const { month = "June", year = 2026 } = req.body;
    const workers = await getWorkers();
    const rows = workers.map((worker) => ({
      worker_id: worker.id,
      contractor_id: worker.department,
      month,
      year: Number(year),
      days_present: worker.days,
      overtime_hrs: worker.ot,
      gross_wage: worker.gross,
      pf_deduction: worker.pf,
      esi_deduction: worker.esi,
      net_wage: worker.net,
    }));

    for (const row of rows) {
      await pool.query(
        `INSERT INTO wage_sheets
         (worker_id, contractor_id, month, year, days_present, overtime_hrs, gross_wage, pf_deduction, esi_deduction, net_wage)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [row.worker_id, row.contractor_id, row.month, row.year, row.days_present, row.overtime_hrs, row.gross_wage, row.pf_deduction, row.esi_deduction, row.net_wage]
      );
    }

    res.status(201).json({ message: "Wage sheet generated", rows });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getDashboard,
  saveWorker,
  updateWorkerStatus,
  saveAttendance,
  generateWageSheet,
};
