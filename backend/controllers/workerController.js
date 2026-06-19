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

const createWorker = async (req, res, next) => {
  try {
    const {
      adhar_id,
      worker_id,
      worker_name,
      name,
      job_cd,
      contractor_id,
      worker_skill,
      category,
      worker_desig,
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
      `INSERT INTO workers (worker_id, name, category, contractor_id, mobile, daily_wage)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (worker_id) DO UPDATE SET
         name = EXCLUDED.name,
         category = EXCLUDED.category,
         contractor_id = EXCLUDED.contractor_id,
         mobile = EXCLUDED.mobile,
         daily_wage = EXCLUDED.daily_wage
       RETURNING
         worker_id AS adhar_id,
         name AS worker_name,
         contractor_id AS job_cd,
         category AS worker_desig,
         category AS worker_skill,
         mobile,
         daily_wage,
         '-' AS worker_gender`,
      [id, workerName, skill, job_cd || contractor_id || null, mobile || null, Number(daily_wage || 0)]
    );

    res.status(201).json({ message: "Worker saved successfully", worker: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

const getWorkers = async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT
        worker_id AS adhar_id,
        name AS worker_name,
        contractor_id AS job_cd,
        category AS worker_desig,
        category AS worker_skill,
        '-' AS worker_gender
      FROM workers
      ORDER BY created_at DESC
    `);
    res.json(result.rows);
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
      `SELECT worker_id, name, category, contractor_id, mobile, daily_wage
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
      `SELECT worker_id, name, category, contractor_id
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
      applyTo: applyTo || "Contractor",
    });

    res.status(201).json({ message: "Leave request sent to contractor" });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createWorker,
  getWorkers,
  getCurrentWorker,
  submitLeave,
};
