const pool = require("../config/dbConfig");
const { getLeaveRequest, saveLeaveRequest } = require("../services/leaveRequestStore");

function getSkillLabel(skill) {
  const labels = {
    skilled: "Skilled Worker",
    unskilled: "Unskilled Worker",
    semiskilled: "Semi Skilled Worker",
    "semi-skilled": "Semi Skilled Worker",
  };

  const key = String(skill || "").toLowerCase();
  return labels[key] || skill || "-";
}

function calculateAttendanceSummary(rows) {
  return rows.reduce(
    (summary, row) => {
      const status = String(row.status || "").toLowerCase();
      if (status === "present") summary.presentDays += 1;
      else if (status === "weekly off") summary.weeklyOff += 1;
      else if (status === "holiday") summary.holidays += 1;
      else summary.absentDays += 1;
      return summary;
    },
    { presentDays: 0, absentDays: 0, weeklyOff: 0, holidays: 0 }
  );
}

function buildAttendanceTrend(rows) {
  const weeks = [0, 0, 0, 0];

  rows.forEach((row) => {
    if (String(row.status || "").toLowerCase() !== "present") return;
    const day = new Date(row.date).getDate();
    const index = Math.min(3, Math.max(0, Math.floor((day - 1) / 7)));
    weeks[index] += 1;
  });

  return weeks.map((value, index) => ({ label: `Week ${index + 1}`, value }));
}

async function resolveWorkerId(req) {
  return (
    req.query.workerId ||
    req.query.worker_id ||
    req.body?.workerId ||
    req.body?.worker_id ||
    req.headers["x-worker-id"] ||
    req.headers["x-employee-id"]
  );
}

function hasAttendanceSummary(body) {
  return body.present !== undefined || body.absent !== undefined || body.overtime !== undefined;
}

async function saveAttendanceSummary(workerId, body) {
  if (!hasAttendanceSummary(body)) return;

  const present = Math.max(0, Math.floor(Number(body.present || 0)));
  const absent = Math.max(0, Math.floor(Number(body.absent || 0)));
  const overtime = Math.max(0, Number(body.overtime || 0));
  const monthStart = new Date();
  monthStart.setDate(1);
  const monthStartText = monthStart.toISOString().slice(0, 10);

  await pool.query(
    "DELETE FROM attendance WHERE worker_id = $1 AND date >= $2::date AND date < ($2::date + INTERVAL '1 month')",
    [workerId, monthStartText]
  );

  for (let index = 0; index < present; index += 1) {
    await pool.query(
      "INSERT INTO attendance (worker_id, date, status, overtime_hrs) VALUES ($1, $2::date + ($3::int * INTERVAL '1 day'), 'present', $4)",
      [workerId, monthStartText, index, index === 0 ? overtime : 0]
    );
  }

  for (let index = 0; index < absent; index += 1) {
    await pool.query(
      "INSERT INTO attendance (worker_id, date, status, overtime_hrs) VALUES ($1, $2::date + ($3::int * INTERVAL '1 day'), 'absent', 0)",
      [workerId, monthStartText, present + index]
    );
  }
}

const createWorker = async (req, res, next) => {
  try {
    const {
      adhar_id,
      worker_id,
      worker_name,
      name,
      job_cd,
      contractor_id,
      supervisor_id,
      supervisorId,
      worker_skill,
      category,
      worker_desig,
      worker_gender,
      gender,
      mobile,
      daily_wage,
    } = req.body;

    const id = String(worker_id || adhar_id || Date.now());
    const workerName = worker_name || name;
    const skill = worker_skill || category || worker_desig;

    if (!id || !workerName || !skill) {
      return res.status(400).json({ message: "Worker ID, name, and skill are required" });
    }

    const result = await pool.query(
      `INSERT INTO workers (rinl_id, worker_id, name, category, contractor_id, supervisor_id, mobile, gender, daily_wage)
       VALUES ($1, $1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (worker_id) DO UPDATE SET
         rinl_id = EXCLUDED.rinl_id,
         name = EXCLUDED.name,
         category = EXCLUDED.category,
         contractor_id = EXCLUDED.contractor_id,
         supervisor_id = EXCLUDED.supervisor_id,
         mobile = EXCLUDED.mobile,
         gender = EXCLUDED.gender,
         daily_wage = EXCLUDED.daily_wage
       RETURNING
         COALESCE(rinl_id, worker_id) AS rinl_id,
         worker_id AS adhar_id,
         name AS worker_name,
         contractor_id AS job_cd,
         supervisor_id,
         category AS worker_desig,
         category AS worker_skill,
         mobile,
         daily_wage,
         COALESCE(gender, '-') AS worker_gender`,
      [
        id,
        workerName,
        skill,
        job_cd || contractor_id || null,
        supervisorId || supervisor_id || null,
        mobile || null,
        worker_gender || gender || null,
        Number(daily_wage || 0)
      ]
    );

    await saveAttendanceSummary(id, req.body);
    res.status(201).json({ message: "Worker saved successfully", worker: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

const getWorkers = async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT
        COALESCE(w.rinl_id, w.worker_id) AS rinl_id,
        w.worker_id AS adhar_id,
        w.name AS worker_name,
        w.contractor_id AS job_cd,
        w.supervisor_id,
        w.mobile,
        w.category AS worker_desig,
        w.category AS worker_skill,
        COALESCE(w.gender, '-') AS worker_gender,
        COALESCE(w.daily_wage, 0) AS daily_wage,
        COALESCE(SUM(CASE WHEN LOWER(COALESCE(a.status, '')) = 'present' THEN 1 ELSE 0 END), 0) AS present,
        COALESCE(SUM(CASE WHEN LOWER(COALESCE(a.status, '')) = 'absent' THEN 1 ELSE 0 END), 0) AS absent,
        COALESCE(SUM(COALESCE(a.overtime_hrs, 0)), 0) AS overtime
      FROM workers w
      LEFT JOIN attendance a ON a.worker_id = w.worker_id
      GROUP BY w.id, w.rinl_id, w.worker_id, w.name, w.contractor_id, w.supervisor_id, w.mobile, w.category, w.gender, w.daily_wage, w.created_at
      ORDER BY w.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
};

const updateWorker = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      adhar_id,
      worker_id,
      worker_name,
      name,
      job_cd,
      contractor_id,
      supervisor_id,
      supervisorId,
      worker_skill,
      category,
      worker_desig,
      worker_gender,
      gender,
      mobile,
      daily_wage,
      status,
    } = req.body;

    const workerId = String(adhar_id || worker_id || id || "").trim();
    const workerName = worker_name || name;
    const skill = worker_skill || category || worker_desig;

    if (!workerId || !workerName || !skill) {
      return res.status(400).json({ message: "Worker ID, name, and skill are required" });
    }

    const result = await pool.query(
      `UPDATE workers
       SET worker_id = $1,
           rinl_id = $1,
           name = $2,
           contractor_id = $3,
           supervisor_id = $4,
           category = $5,
           mobile = $6,
           gender = $7,
           daily_wage = $8,
           status = $9
       WHERE worker_id = $10
       RETURNING
         COALESCE(rinl_id, worker_id) AS rinl_id,
         worker_id AS adhar_id,
         name AS worker_name,
         contractor_id AS job_cd,
         supervisor_id,
         category AS worker_desig,
         category AS worker_skill,
         mobile,
         daily_wage,
         COALESCE(gender, '-') AS worker_gender`,
      [
        workerId,
        workerName,
        job_cd || contractor_id || null,
        supervisorId || supervisor_id || null,
        skill,
        mobile || null,
        worker_gender || gender || null,
        Number(daily_wage || 0),
        status || "active",
        id,
      ]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: "Worker not found" });
    }

    await saveAttendanceSummary(workerId, req.body);
    res.json({ message: "Worker updated successfully", worker: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

const deleteWorker = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      "DELETE FROM workers WHERE worker_id = $1 RETURNING worker_id",
      [id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: "Worker not found" });
    }

    res.json({ message: "Worker deleted successfully" });
  } catch (err) {
    next(err);
  }
};

const getCurrentWorker = async (req, res, next) => {
  try {
    const workerId = await resolveWorkerId(req);

    if (!workerId) {
      return res.status(404).json({ message: "Worker not found" });
    }

    const workerResult = await pool.query(
      `SELECT COALESCE(rinl_id, worker_id) AS rinl_id, worker_id, name, category, contractor_id, mobile, daily_wage
       FROM workers
       WHERE worker_id = $1
       LIMIT 1`,
      [workerId]
    );

    if (!workerResult.rows.length) {
      return res.status(404).json({ message: "Worker not found" });
    }

    const worker = workerResult.rows[0];
    const attendanceResult = await pool.query(
      `SELECT date, status
       FROM attendance
       WHERE worker_id = $1
         AND date >= DATE_TRUNC('month', CURRENT_DATE)
         AND date < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'
       ORDER BY date`,
      [worker.worker_id]
    );

    const attendance = calculateAttendanceSummary(attendanceResult.rows);
    const grossWage = Number(worker.daily_wage || 0) * attendance.presentDays;
    const pfAmount = grossWage * 0.05;
    const insuranceAmount = grossWage * 0.02;
    const netWage = grossWage - pfAmount - insuranceAmount;
    const leave = getLeaveRequest(worker.worker_id) || {};

    res.json({
      loginId: worker.worker_id,
      workerId: worker.worker_id,
      jobCode: worker.contractor_id || "-",
      name: worker.name,
      dob: "-",
      skill: worker.category,
      skillLabel: getSkillLabel(worker.category),
      shiftHours: 8,
      wagePerDay: Number(worker.daily_wage || 0),
      ...attendance,
      grossWage,
      pfAmount,
      insuranceAmount,
      netWage,
      attendanceTrend: buildAttendanceTrend(attendanceResult.rows),
      leaveStatus: leave.status || "Not Applied",
      leaveApprovalStatus: leave.approval || "Pending",
      appliedTo: leave.applyTo || "-",
      notification: leave.notification || "No notifications",
      leaveUsed: leave.used || 0,
      leavePendingCount: leave.approval === "Pending" ? 1 : 0,
      leaveBalance: 12 - Number(leave.used || 0),
    });
  } catch (err) {
    next(err);
  }
};

const submitLeave = async (req, res, next) => {
  try {
    const workerId = await resolveWorkerId(req);
    const { fromDate, toDate, reason, applyTo } = req.body;

    if (!workerId) {
      return res.status(404).json({ message: "Worker not found" });
    }

    if (!fromDate || !toDate || !reason) {
      return res.status(400).json({ message: "From date, to date, and reason are required" });
    }

    const workerResult = await pool.query(
      `SELECT COALESCE(rinl_id, worker_id) AS rinl_id, worker_id, name, category, contractor_id
       FROM workers
       WHERE worker_id = $1
       LIMIT 1`,
      [workerId]
    );

    if (!workerResult.rows.length) {
      return res.status(404).json({ message: "Worker not found" });
    }

    saveLeaveRequest(workerResult.rows[0], {
      fromDate,
      toDate,
      reason,
      applyTo: applyTo || "Supervisor",
    });

    res.status(201).json({ message: "Leave request sent to supervisor" });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createWorker,
  getWorkers,
  updateWorker,
  deleteWorker,
  getCurrentWorker,
  submitLeave,
};
