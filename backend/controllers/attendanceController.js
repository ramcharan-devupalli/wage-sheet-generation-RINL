const db = require('../config/dbConfig');

async function queryAll(sql, params = []) {
  const result = await db.query(sql, params);
  return result.rows;
}

async function queryOne(sql, params = []) {
  const result = await db.query(sql, params);
  return result.rows[0] || null;
}

async function getAttendance(req, res, next) {
  try {
    const { date, workerId } = req.query;
    const filters = [];
    const params = [];

    if (date) {
      params.push(date);
      filters.push(`a.date = $${params.length}`);
    }

    if (workerId) {
      params.push(workerId);
      filters.push(`a.worker_id = $${params.length}`);
    }

    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const attendance = await queryAll(
      `SELECT a.*, w.name AS worker_name, w.category
       FROM attendance a
       LEFT JOIN workers w ON w.worker_id = a.worker_id
       ${where}
       ORDER BY a.date DESC, a.created_at DESC`,
      params
    );
    return res.json({ success: true, attendance });
  } catch (err) {
    next(err);
  }
}

async function markAttendance(req, res, next) {
  try {
    const { workerId, date, status, overtimeHrs } = req.body;
    if (!workerId || !date) {
      return res.status(400).json({ success: false, message: 'Worker ID and date are required.' });
    }

    const attendance = await queryOne(
      `INSERT INTO attendance (worker_id, date, status, overtime_hrs)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [workerId, date, status || 'present', overtimeHrs || 0]
    );
    return res.status(201).json({ success: true, attendance });
  } catch (err) {
    next(err);
  }
}

module.exports = { getAttendance, markAttendance };
