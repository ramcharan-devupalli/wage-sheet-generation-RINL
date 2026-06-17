const db = require('../config/dbConfig');

async function queryAll(sql, params = []) {
  const result = await db.query(sql, params);
  return result.rows;
}

async function queryOne(sql, params = []) {
  const result = await db.query(sql, params);
  return result.rows[0] || null;
}

async function getDashboardStats(req, res, next) {
  try {
    const activeUsers = await queryAll("SELECT emp_id, name, role, login_time, ip_address FROM login_sessions WHERE status = 'active' ORDER BY login_time DESC");
    const todayLogins = await queryOne("SELECT COUNT(*)::int as count FROM login_logs WHERE action = 'LOGIN' AND timestamp::date = CURRENT_DATE");
    const recentLogins = await queryAll('SELECT emp_id, name, role, action, timestamp FROM login_logs ORDER BY timestamp DESC LIMIT 10');
    const totalWorkers = await queryOne('SELECT COUNT(*)::int as count FROM workers');
    const totalContractors = await queryOne('SELECT COUNT(*)::int as count FROM contractors');
    const totalEmployees = await queryOne('SELECT COUNT(*)::int as count FROM employees');
    const byCategory = await queryAll('SELECT category, COUNT(*)::int as count FROM workers GROUP BY category ORDER BY category');

    return res.json({
      success: true,
      activeUsers,
      activeCount: activeUsers.length,
      todayLoginCount: todayLogins.count,
      recentLogins,
      totalWorkers: totalWorkers.count,
      totalContractors: totalContractors.count,
      totalEmployees: totalEmployees.count,
      byCategory
    });
  } catch (err) {
    next(err);
  }
}

async function getEmployees(req, res, next) {
  try {
    const employees = await queryAll('SELECT id, emp_id, name, role, mobile, email, status, created_at FROM employees ORDER BY created_at DESC');
    return res.json({ success: true, employees });
  } catch (err) {
    next(err);
  }
}

async function createEmployee(req, res, next) {
  try {
    const { empId, name, role, mobile, email, password } = req.body;
    if (!empId || !name || !role || !password) {
      return res.status(400).json({ success: false, message: 'Employee ID, name, role, and password are required.' });
    }

    const employee = await queryOne(
      `INSERT INTO employees (emp_id, name, role, mobile, email, password)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, emp_id, name, role, mobile, email, status, created_at`,
      [empId, name, role, mobile || null, email || null, password]
    );
    return res.status(201).json({ success: true, employee });
  } catch (err) {
    next(err);
  }
}

async function getWorkers(req, res, next) {
  try {
    const workers = await queryAll(
      `SELECT w.*, c.name AS contractor_name, c.company
       FROM workers w
       LEFT JOIN contractors c ON c.contractor_id = w.contractor_id
       ORDER BY w.created_at DESC`
    );
    return res.json({ success: true, workers });
  } catch (err) {
    next(err);
  }
}

async function createWorker(req, res, next) {
  try {
    const { workerId, name, category, contractorId, mobile, dailyWage } = req.body;
    if (!workerId || !name || !category) {
      return res.status(400).json({ success: false, message: 'Worker ID, name, and category are required.' });
    }

    const worker = await queryOne(
      `INSERT INTO workers (worker_id, name, category, contractor_id, mobile, daily_wage)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [workerId, name, category, contractorId || null, mobile || null, dailyWage || 0]
    );
    return res.status(201).json({ success: true, worker });
  } catch (err) {
    next(err);
  }
}

async function getContractors(req, res, next) {
  try {
    const contractors = await queryAll('SELECT * FROM contractors ORDER BY created_at DESC');
    return res.json({ success: true, contractors });
  } catch (err) {
    next(err);
  }
}

async function createContractor(req, res, next) {
  try {
    const { contractorId, name, company, mobile, email } = req.body;
    if (!contractorId || !name) {
      return res.status(400).json({ success: false, message: 'Contractor ID and name are required.' });
    }

    const contractor = await queryOne(
      `INSERT INTO contractors (contractor_id, name, company, mobile, email)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [contractorId, name, company || null, mobile || null, email || null]
    );
    return res.status(201).json({ success: true, contractor });
  } catch (err) {
    next(err);
  }
}

async function getLoginActivity(req, res, next) {
  try {
    const logs = await queryAll('SELECT * FROM login_logs ORDER BY timestamp DESC LIMIT 50');
    return res.json({ success: true, logs });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getDashboardStats,
  getEmployees,
  createEmployee,
  getWorkers,
  createWorker,
  getContractors,
  createContractor,
  getLoginActivity
};
