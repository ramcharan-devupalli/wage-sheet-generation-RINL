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

function compactId(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function idAliases(value) {
  const raw = String(value || "").trim();
  const compact = compactId(raw);
  const withoutRinlPrefix = raw.replace(/^rinl[-_\s]*/i, "");
  return Array.from(new Set([
    raw.toLowerCase(),
    withoutRinlPrefix.toLowerCase(),
    compact,
    compact.replace(/^rinl/, "")
  ].filter(Boolean)));
}

async function engineerLookupValues(engineerId) {
  const aliases = idAliases(engineerId);
  const engineer = await oneRow(
    `SELECT rinl_id, emp_id
     FROM employees
     WHERE LOWER(COALESCE(rinl_id, emp_id)) = ANY($1::text[])
        OR LOWER(emp_id) = ANY($1::text[])
        OR LOWER(REGEXP_REPLACE(COALESCE(rinl_id, emp_id, ''), '[^a-zA-Z0-9]', '', 'g')) = ANY($2::text[])
        OR LOWER(REGEXP_REPLACE(COALESCE(emp_id, ''), '[^a-zA-Z0-9]', '', 'g')) = ANY($2::text[])
     LIMIT 1`,
    [aliases, aliases.map(compactId)]
  );

  return Array.from(new Set([
    engineerId,
    engineer?.rinl_id,
    engineer?.emp_id
  ].filter(Boolean).flatMap(idAliases)));
}

async function scopedContractorIdsForEngineer(engineerId) {
  const aliases = await engineerLookupValues(engineerId);
  const rows = await allRows(
    `SELECT contractor_id
     FROM contractors
     WHERE LOWER(COALESCE(engineer_id, '')) = ANY($1::text[])
        OR LOWER(REGEXP_REPLACE(COALESCE(engineer_id, ''), '[^a-zA-Z0-9]', '', 'g')) = ANY($2::text[])`,
    [aliases, aliases.map(compactId)]
  );
  return rows.map((row) => row.contractor_id);
}

async function engineerForContractor(contractor) {
  const engineerId = contractor?.engineer_id;
  const aliases = idAliases(engineerId);
  if (!aliases.length) return null;

  const engineer = await oneRow(
    `SELECT
       COALESCE(rinl_id, emp_id) AS rinl_id,
       emp_id,
       name,
       role,
       mobile,
       email,
       status
     FROM employees
     WHERE (
       LOWER(COALESCE(rinl_id, emp_id, '')) = ANY($1::text[])
       OR LOWER(COALESCE(emp_id, '')) = ANY($1::text[])
       OR LOWER(REGEXP_REPLACE(COALESCE(rinl_id, emp_id, ''), '[^a-zA-Z0-9]', '', 'g')) = ANY($2::text[])
       OR LOWER(REGEXP_REPLACE(COALESCE(emp_id, ''), '[^a-zA-Z0-9]', '', 'g')) = ANY($2::text[])
     )
     LIMIT 1`,
    [aliases, aliases.map(compactId)]
  );

  if (!engineer) {
    return {
      id: engineerId,
      name: engineerId,
      department: "",
      contact: "",
      pending: 0,
      status: ""
    };
  }

  return {
    id: engineer.rinl_id || engineer.emp_id,
    name: engineer.name || engineer.rinl_id || engineer.emp_id,
    department: engineer.role || "Engineer Incharge",
    contact: [engineer.mobile, engineer.email].filter(Boolean).join(" / "),
    pending: 0,
    mobile: engineer.mobile || "",
    email: engineer.email || "",
    status: engineer.status || ""
  };
}

async function lookupEntity(table, idColumn, inputId) {
  const aliases = idAliases(inputId);
  if (!aliases.length) return { row: null, aliases: [] };

  const row = await oneRow(
    `SELECT *
     FROM ${table}
     WHERE LOWER(COALESCE(rinl_id, ${idColumn}, '')) = ANY($1::text[])
        OR LOWER(COALESCE(${idColumn}, '')) = ANY($1::text[])
        OR LOWER(REGEXP_REPLACE(COALESCE(rinl_id, ${idColumn}, ''), '[^a-zA-Z0-9]', '', 'g')) = ANY($2::text[])
        OR LOWER(REGEXP_REPLACE(COALESCE(${idColumn}, ''), '[^a-zA-Z0-9]', '', 'g')) = ANY($2::text[])
     LIMIT 1`,
    [aliases, aliases.map(compactId)]
  );

  return {
    row,
    aliases: Array.from(new Set([
      inputId,
      row?.rinl_id,
      row?.[idColumn]
    ].filter(Boolean).flatMap(idAliases)))
  };
}

async function lookupContractorForLogin(inputId) {
  const aliases = idAliases(inputId);
  if (!aliases.length) return { row: null, aliases: [] };

  const directContractor = await oneRow(
    `SELECT *
     FROM contractors
     WHERE LOWER(COALESCE(rinl_id, contractor_id, '')) = ANY($1::text[])
        OR LOWER(COALESCE(contractor_id, '')) = ANY($1::text[])
        OR LOWER(REGEXP_REPLACE(COALESCE(rinl_id, contractor_id, ''), '[^a-zA-Z0-9]', '', 'g')) = ANY($2::text[])
        OR LOWER(REGEXP_REPLACE(COALESCE(contractor_id, ''), '[^a-zA-Z0-9]', '', 'g')) = ANY($2::text[])
     LIMIT 1`,
    [aliases, aliases.map(compactId)]
  );

  if (directContractor) {
    return {
      row: directContractor,
      aliases: Array.from(new Set([
        inputId,
        directContractor.rinl_id,
        directContractor.contractor_id
      ].filter(Boolean).flatMap(idAliases)))
    };
  }

  const loginAccount = await oneRow(
    `SELECT rinl_id, emp_id, name, mobile, email
     FROM employees
     WHERE LOWER(COALESCE(rinl_id, emp_id, '')) = ANY($1::text[])
        OR LOWER(COALESCE(emp_id, '')) = ANY($1::text[])
        OR LOWER(REGEXP_REPLACE(COALESCE(rinl_id, emp_id, ''), '[^a-zA-Z0-9]', '', 'g')) = ANY($2::text[])
        OR LOWER(REGEXP_REPLACE(COALESCE(emp_id, ''), '[^a-zA-Z0-9]', '', 'g')) = ANY($2::text[])
     LIMIT 1`,
    [aliases, aliases.map(compactId)]
  );

  const linkedContractor = loginAccount
    ? await oneRow(
      `SELECT *
       FROM contractors
       WHERE (COALESCE($1, '') <> '' AND LOWER(COALESCE(email, '')) = LOWER($1))
          OR (COALESCE($2, '') <> '' AND COALESCE(mobile, '') = $2)
          OR (COALESCE($3, '') <> '' AND LOWER(COALESCE(name, '')) = LOWER($3))
       ORDER BY
         CASE
           WHEN COALESCE($1, '') <> '' AND LOWER(COALESCE(email, '')) = LOWER($1) THEN 1
           WHEN COALESCE($2, '') <> '' AND COALESCE(mobile, '') = $2 THEN 2
           ELSE 3
         END,
         created_at DESC
       LIMIT 1`,
      [loginAccount.email || "", loginAccount.mobile || "", loginAccount.name || ""]
    )
    : null;

  return {
    row: linkedContractor,
    aliases: Array.from(new Set([
      inputId,
      loginAccount?.rinl_id,
      loginAccount?.emp_id,
      linkedContractor?.rinl_id,
      linkedContractor?.contractor_id
    ].filter(Boolean).flatMap(idAliases)))
  };
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

function mergeSupervisors(supervisors, workers) {
  const byId = new Map();
  supervisors.forEach((supervisor) => {
    if (!supervisor.supervisor_id) return;
    byId.set(supervisor.supervisor_id, supervisor);
  });
  derivedSupervisorsFromWorkers(workers).forEach((supervisor) => {
    if (!byId.has(supervisor.supervisor_id)) byId.set(supervisor.supervisor_id, supervisor);
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
  const aliases = await engineerLookupValues(engineerId);
  const contractors = await allRows(
    `SELECT *
     FROM contractors
     WHERE LOWER(COALESCE(engineer_id, '')) = ANY($1::text[])
        OR LOWER(REGEXP_REPLACE(COALESCE(engineer_id, ''), '[^a-zA-Z0-9]', '', 'g')) = ANY($2::text[])
     ORDER BY created_at DESC`,
    [aliases, aliases.map(compactId)]
  );
  const diagnostic = contractors.length
    ? {}
    : {
      engineerIdUsed: engineerId,
      engineerAliases: aliases,
      noContractorsAssigned: true,
      existingEngineerIds: await allRows(
        `SELECT DISTINCT engineer_id
         FROM contractors
         WHERE COALESCE(engineer_id, '') <> ''
         ORDER BY engineer_id`
      ).then((rows) => rows.map((row) => row.engineer_id))
    };
  const contractorIds = contractors.map((contractor) => contractor.contractor_id);
  let supervisors = contractorIds.length
    ? await allRows("SELECT * FROM supervisors WHERE contractor_id = ANY($1::text[]) ORDER BY created_at DESC", [contractorIds])
    : [];
  const workers = contractorIds.length
    ? await allRows("SELECT * FROM workers WHERE contractor_id = ANY($1::text[]) ORDER BY created_at DESC", [contractorIds])
    : [];
  supervisors = mergeSupervisors(supervisors, workers);
  const workerIds = workers.map((worker) => worker.worker_id);
  const attendance = await attendanceForWorkers(workerIds);
  const wages = await wagesForWorkers(workerIds);
  return { roleScope: "engineer", contractors: withRinlIds(contractors), supervisors: withRinlIds(supervisors), workers: withRinlIds(workers), attendance, wages, summary: summarize(workers, attendance, wages, contractors, supervisors), ...diagnostic };
}

async function contractorDashboard(contractorId) {
  const { row: contractor, aliases } = await lookupContractorForLogin(contractorId);
  const contractorAliases = aliases.map(compactId);
  let supervisors = aliases.length
    ? await allRows(
      `SELECT *
       FROM supervisors
       WHERE LOWER(COALESCE(contractor_id, '')) = ANY($1::text[])
          OR LOWER(REGEXP_REPLACE(COALESCE(contractor_id, ''), '[^a-zA-Z0-9]', '', 'g')) = ANY($2::text[])
       ORDER BY created_at DESC`,
      [aliases, contractorAliases]
    )
    : [];
  const workers = aliases.length
    ? await allRows(
      `SELECT *
       FROM workers
       WHERE LOWER(COALESCE(contractor_id, '')) = ANY($1::text[])
          OR LOWER(REGEXP_REPLACE(COALESCE(contractor_id, ''), '[^a-zA-Z0-9]', '', 'g')) = ANY($2::text[])
       ORDER BY created_at DESC`,
      [aliases, contractorAliases]
    )
    : [];
  supervisors = mergeSupervisors(supervisors, workers);
  const workerIds = workers.map((worker) => worker.worker_id);
  const attendance = await attendanceForWorkers(workerIds);
  const wages = await wagesForWorkers(workerIds);
  const leaveRequests = getLeaveRequests().filter((request) => aliases.includes(String(request.contractorId || "").toLowerCase()));
  const engineer = await engineerForContractor(contractor);
  return { roleScope: "contractor", contractor: withRinlId(contractor), engineer, supervisors: withRinlIds(supervisors), workers: withRinlIds(workers), attendance, wages, leaveRequests, summary: summarize(workers, attendance, wages, contractor ? [contractor] : [], supervisors) };
}

async function supervisorDashboard(supervisorId) {
  const { row: supervisor, aliases } = await lookupEntity("supervisors", "supervisor_id", supervisorId);
  const supervisorAliases = aliases.map(compactId);
  const workers = aliases.length
    ? await allRows(
      `SELECT *
       FROM workers
       WHERE LOWER(COALESCE(supervisor_id, '')) = ANY($1::text[])
          OR LOWER(REGEXP_REPLACE(COALESCE(supervisor_id, ''), '[^a-zA-Z0-9]', '', 'g')) = ANY($2::text[])
       ORDER BY created_at DESC`,
      [aliases, supervisorAliases]
    )
    : [];
  const workerIds = workers.map((worker) => worker.worker_id);
  const attendance = await attendanceForWorkers(workerIds);
  const wages = await wagesForWorkers(workerIds);
  const leaveRequests = getLeaveRequests().filter((request) => workerIds.includes(request.workerId));
  return { roleScope: "supervisor", supervisor: withRinlId(supervisor), workers: withRinlIds(workers), attendance, wages, leaveRequests, summary: summarize(workers, attendance, wages, [], supervisor ? [supervisor] : []) };
}

async function workerDashboard(workerId) {
  const { aliases } = await lookupEntity("workers", "worker_id", workerId);
  const worker = await oneRow(
    `SELECT w.*, c.name AS contractor_name, s.name AS supervisor_name
     FROM workers w
     LEFT JOIN contractors c ON c.contractor_id = w.contractor_id
     LEFT JOIN supervisors s ON s.supervisor_id = w.supervisor_id
     WHERE LOWER(COALESCE(w.rinl_id, w.worker_id, '')) = ANY($1::text[])
        OR LOWER(COALESCE(w.worker_id, '')) = ANY($1::text[])
        OR LOWER(REGEXP_REPLACE(COALESCE(w.rinl_id, w.worker_id, ''), '[^a-zA-Z0-9]', '', 'g')) = ANY($2::text[])
        OR LOWER(REGEXP_REPLACE(COALESCE(w.worker_id, ''), '[^a-zA-Z0-9]', '', 'g')) = ANY($2::text[])
     LIMIT 1`,
    [aliases, aliases.map(compactId)]
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
