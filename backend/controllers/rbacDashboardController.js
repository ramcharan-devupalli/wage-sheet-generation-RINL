const db = require("../config/dbConfig");
const { getLeaveRequests } = require("../services/leaveRequestStore");

function normalizeRole(role) {
  return String(role || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function isWorkerRole(role) {
  return [
    "worker",
    "workers",
    "skilled worker",
    "skilled labor",
    "semi skilled worker",
    "semi skilled labor",
    "unskilled worker",
    "unskilled labor"
  ].includes(normalizeRole(role));
}

function userContext(req) {
  return {
    empId: String(req.headers["x-employee-id"] || req.query.empId || "").trim(),
    role: normalizeRole(req.headers["x-role"] || req.query.role || "")
  };
}

async function allRows(sql, params = []) {
  const result = await db.query(sql, params);
  return result.rows;
}

async function oneRow(sql, params = []) {
  const result = await db.query(sql, params);
  return result.rows[0] || null;
}

function withRinlId(row) {
  if (!row) return row;
  return {
    ...row,
    rinl_id: row.rinl_id || row.emp_id || row.contractor_id || row.supervisor_id || row.worker_id || ""
  };
}

function withRinlIds(rows) {
  return rows.map(withRinlId);
}

async function scopedContractorIdsForEngineer(engineerId) {
  const rows = await allRows(
    "SELECT contractor_id FROM contractors WHERE LOWER(COALESCE(engineer_id, '')) = LOWER($1)",
    [engineerId]
  );
  return rows.map((row) => row.contractor_id);
}

async function workerIdsForContractors(contractorIds) {
  if (!contractorIds.length) return [];
  const rows = await allRows("SELECT worker_id FROM workers WHERE contractor_id = ANY($1::text[])", [contractorIds]);
  return rows.map((row) => row.worker_id);
}

async function attendanceForWorkers(workerIds) {
  if (!workerIds.length) return [];
  return allRows(
    `SELECT a.worker_id, COALESCE(w.name, a.worker_id) AS worker_name, a.date, INITCAP(a.status) AS status, a.overtime_hrs
     FROM attendance a
     LEFT JOIN workers w ON w.worker_id = a.worker_id
     WHERE a.worker_id = ANY($1::text[])
     ORDER BY a.date DESC, a.created_at DESC
     LIMIT 250`,
    [workerIds]
  );
}

async function wagesForWorkers(workerIds) {
  if (!workerIds.length) return [];
  return allRows(
    `SELECT ws.*, COALESCE(w.name, ws.worker_id) AS worker_name
     FROM wage_sheets ws
     LEFT JOIN workers w ON w.worker_id = ws.worker_id
     WHERE ws.worker_id = ANY($1::text[])
     ORDER BY ws.year DESC, ws.month DESC, ws.created_at DESC
     LIMIT 250`,
    [workerIds]
  );
}

function summarize(workers, attendance, wages, contractors = [], supervisors = []) {
  const presentToday = attendance.filter((row) => /present/i.test(row.status || "")).length;
  const overtimeHours = attendance.reduce((sum, row) => sum + Number(row.overtime_hrs || 0), 0);
  const wageTotal = wages.reduce((sum, row) => sum + Number(row.net_wage || 0), 0);
  return {
    contractors: contractors.length,
    supervisors: supervisors.length,
    workers: workers.length,
    attendanceRecords: attendance.length,
    presentToday,
    overtimeHours,
    wageSheets: wages.length,
    wageTotal
  };
}

function derivedSupervisorsFromWorkers(workers) {
  const byId = new Map();
  workers.forEach((worker) => {
    const supervisorId = worker.supervisor_id;
    if (!supervisorId || byId.has(supervisorId)) return;
    byId.set(supervisorId, {
      supervisor_id: supervisorId,
      contractor_id: worker.contractor_id || "",
      name: supervisorId,
      status: "active"
    });
  });
  return Array.from(byId.values());
}

async function adminDashboard() {
  const contractors = await allRows("SELECT * FROM contractors ORDER BY created_at DESC");
  const supervisors = await allRows("SELECT * FROM supervisors ORDER BY created_at DESC");
  const workers = await allRows("SELECT * FROM workers ORDER BY created_at DESC");
  const workerIds = workers.map((worker) => worker.worker_id);
  const attendance = await attendanceForWorkers(workerIds);
  const wages = await wagesForWorkers(workerIds);
  const engineers = await allRows(
    "SELECT emp_id, name, role, mobile, email, status FROM employees WHERE LOWER(COALESCE(role, '')) LIKE '%engineer%' ORDER BY created_at DESC"
  );
  return { roleScope: "admin", engineers: withRinlIds(engineers), contractors: withRinlIds(contractors), supervisors: withRinlIds(supervisors), workers: withRinlIds(workers), attendance, wages, summary: summarize(workers, attendance, wages, contractors, supervisors) };
}

async function engineerDashboard(engineerId) {
  const contractors = await allRows(
    "SELECT * FROM contractors WHERE LOWER(COALESCE(engineer_id, '')) = LOWER($1) ORDER BY created_at DESC",
    [engineerId]
  );
  const contractorIds = contractors.map((contractor) => contractor.contractor_id);
  let supervisors = contractorIds.length
    ? await allRows("SELECT * FROM supervisors WHERE contractor_id = ANY($1::text[]) ORDER BY created_at DESC", [contractorIds])
    : [];
  const workers = contractorIds.length
    ? await allRows("SELECT * FROM workers WHERE contractor_id = ANY($1::text[]) ORDER BY created_at DESC", [contractorIds])
    : [];
  if (!supervisors.length) supervisors = derivedSupervisorsFromWorkers(workers);
  const workerIds = workers.map((worker) => worker.worker_id);
  const attendance = await attendanceForWorkers(workerIds);
  const wages = await wagesForWorkers(workerIds);
  return { roleScope: "engineer", contractors: withRinlIds(contractors), supervisors: withRinlIds(supervisors), workers: withRinlIds(workers), attendance, wages, summary: summarize(workers, attendance, wages, contractors, supervisors) };
}

async function contractorDashboard(contractorId) {
  const contractor = await oneRow("SELECT * FROM contractors WHERE LOWER(contractor_id) = LOWER($1)", [contractorId]);
  let supervisors = await allRows("SELECT * FROM supervisors WHERE LOWER(COALESCE(contractor_id, '')) = LOWER($1) ORDER BY created_at DESC", [contractorId]);
  const workers = await allRows("SELECT * FROM workers WHERE LOWER(COALESCE(contractor_id, '')) = LOWER($1) ORDER BY created_at DESC", [contractorId]);
  if (!supervisors.length) supervisors = derivedSupervisorsFromWorkers(workers);
  const workerIds = workers.map((worker) => worker.worker_id);
  const attendance = await attendanceForWorkers(workerIds);
  const wages = await wagesForWorkers(workerIds);
  const leaveRequests = getLeaveRequests().filter((request) => String(request.contractorId || "").toLowerCase() === contractorId.toLowerCase());
  return { roleScope: "contractor", contractor: withRinlId(contractor), supervisors: withRinlIds(supervisors), workers: withRinlIds(workers), attendance, wages, leaveRequests, summary: summarize(workers, attendance, wages, contractor ? [contractor] : [], supervisors) };
}

async function supervisorDashboard(supervisorId) {
  const supervisor = await oneRow("SELECT * FROM supervisors WHERE LOWER(supervisor_id) = LOWER($1)", [supervisorId]);
  const workers = await allRows("SELECT * FROM workers WHERE LOWER(COALESCE(supervisor_id, '')) = LOWER($1) ORDER BY created_at DESC", [supervisorId]);
  const workerIds = workers.map((worker) => worker.worker_id);
  const attendance = await attendanceForWorkers(workerIds);
  const wages = await wagesForWorkers(workerIds);
  const leaveRequests = getLeaveRequests().filter((request) => workerIds.includes(request.workerId));
  return { roleScope: "supervisor", supervisor: withRinlId(supervisor), workers: withRinlIds(workers), attendance, wages, leaveRequests, summary: summarize(workers, attendance, wages, [], supervisor ? [supervisor] : []) };
}

async function workerDashboard(workerId) {
  const worker = await oneRow(
    `SELECT w.*, c.name AS contractor_name, s.name AS supervisor_name
     FROM workers w
     LEFT JOIN contractors c ON c.contractor_id = w.contractor_id
     LEFT JOIN supervisors s ON s.supervisor_id = w.supervisor_id
     WHERE LOWER(w.worker_id) = LOWER($1)
     LIMIT 1`,
    [workerId]
  );
  const attendance = worker ? await attendanceForWorkers([worker.worker_id]) : [];
  const wages = worker ? await wagesForWorkers([worker.worker_id]) : [];
  const leaveRequests = getLeaveRequests().filter((request) => request.workerId === workerId);
  return { roleScope: "worker", worker: withRinlId(worker), attendance, wages, leaveRequests, summary: summarize(worker ? [worker] : [], attendance, wages) };
}

async function getScopedDashboard(req, res, next) {
  try {
    const { empId, role } = userContext(req);
    if (!empId) return res.status(401).json({ message: "Missing logged-in employee ID." });

    if (role.includes("admin")) return res.json(await adminDashboard());
    if (role.includes("engineer")) return res.json(await engineerDashboard(empId));
    if (role.includes("contractor")) return res.json(await contractorDashboard(empId));
    if (role.includes("supervisor")) return res.json(await supervisorDashboard(empId));
    if (isWorkerRole(role)) return res.json(await workerDashboard(empId));

    return res.status(400).json({ message: "Unsupported role for scoped dashboard." });
  } catch (err) {
    next(err);
  }
}

module.exports = { getScopedDashboard };
