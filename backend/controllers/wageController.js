const db = require('../config/dbConfig');

async function queryAll(sql, params = []) {
  const result = await db.query(sql, params);
  return result.rows;
}

async function queryOne(sql, params = []) {
  const result = await db.query(sql, params);
  return result.rows[0] || null;
}

async function getWageSheets(req, res, next) {
  try {
    const { job_cd, muster_month } = req.query;
    if (job_cd && muster_month) {
      const [year, month] = String(muster_month).split('-').map(Number);
      if (!year || !month) {
        return res.status(400).json({ success: false, message: 'muster_month must be in YYYY-MM format.' });
      }

      const wages = await queryAll(
        `SELECT
           w.name AS worker_name,
           w.worker_id AS adhar_id,
           w.category AS worker_skill,
           COALESCE(SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END), 0)::int AS present,
           COALESCE(w.daily_wage, 0) AS daily_wage,
           COALESCE(SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END), 0) * COALESCE(w.daily_wage, 0) AS total_wage
         FROM workers w
         LEFT JOIN attendance a
           ON a.worker_id = w.worker_id
          AND a.date >= $2::date
          AND a.date < ($2::date + INTERVAL '1 month')
         WHERE w.contractor_id = $1
         GROUP BY w.worker_id, w.name, w.category, w.daily_wage
         ORDER BY w.name`,
        [job_cd, `${year}-${String(month).padStart(2, '0')}-01`]
      );

      return res.json(wages);
    }

    const wages = await queryAll(
      `SELECT ws.*, w.name AS worker_name, w.category, c.name AS contractor_name
       FROM wage_sheets ws
       LEFT JOIN workers w ON w.worker_id = ws.worker_id
       LEFT JOIN contractors c ON c.contractor_id = ws.contractor_id
       ORDER BY ws.created_at DESC`
    );
    return res.json({ success: true, wages });
  } catch (err) {
    next(err);
  }
}

async function createWageSheet(req, res, next) {
  try {
    const { workerId, month, year, daysPresent, overtimeHrs } = req.body;
    if (!workerId || !month || !year) {
      return res.status(400).json({ success: false, message: 'Worker ID, month, and year are required.' });
    }

    const worker = await queryOne('SELECT * FROM workers WHERE worker_id = $1', [workerId]);
    if (!worker) return res.status(404).json({ success: false, message: 'Worker not found.' });

    const days = Number(daysPresent || 0);
    const overtime = Number(overtimeHrs || 0);
    const wage = Number(worker.daily_wage || 0);
    const grossWage = days * wage + overtime * (wage / 8);
    const pfDeduction = grossWage * 0.12;
    const esiDeduction = grossWage * 0.0075;
    const netWage = grossWage - pfDeduction - esiDeduction;

    const sheet = await queryOne(
      `INSERT INTO wage_sheets
       (worker_id, contractor_id, month, year, days_present, overtime_hrs, gross_wage, pf_deduction, esi_deduction, net_wage)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [workerId, worker.contractor_id, month, year, days, overtime, grossWage, pfDeduction, esiDeduction, netWage]
    );

    return res.status(201).json({ success: true, sheet });
  } catch (err) {
    next(err);
  }
}

module.exports = { getWageSheets, createWageSheet };
