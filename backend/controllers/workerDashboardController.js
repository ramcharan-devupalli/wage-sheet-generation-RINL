const pool = require("../config/dbConfig");

function parseMonth(month) {
  const selectedMonth = month || new Date().toISOString().slice(0, 7);
  const [year, monthNumber] = String(selectedMonth).split("-").map(Number);

  if (!year || !monthNumber || monthNumber < 1 || monthNumber > 12) {
    return null;
  }

  return {
    selectedMonth,
    startDate: `${year}-${String(monthNumber).padStart(2, "0")}-01`,
  };
}

function calculateAttendanceSummary(rows) {
  return rows.reduce(
    (summary, row) => {
      const status = String(row.status || "").toLowerCase();
      if (status === "present") summary.present += 1;
      else if (status === "weekly off") summary.weekly_off += 1;
      else if (status === "holiday") summary.holidays += 1;
      else if (status === "leave") summary.leaves += 1;
      else summary.absent += 1;
      return summary;
    },
    { present: 0, absent: 0, weekly_off: 0, holidays: 0, leaves: 0 }
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

const getWorkerDashboard = async (req, res, next) => {
  try {
    const { adhar_id } = req.params;
    const month = parseMonth(req.query.month);

    if (!month) {
      return res.status(400).json({ message: "month must be in YYYY-MM format" });
    }

    const workerResult = await pool.query(
      `SELECT id, worker_id, name, category, contractor_id, daily_wage
       FROM workers
       WHERE worker_id = $1
       LIMIT 1`,
      [adhar_id]
    );

    if (workerResult.rows.length === 0) {
      return res.status(404).json({ message: "Worker not found" });
    }

    const worker = workerResult.rows[0];
    const attendanceResult = await pool.query(
      `SELECT date, status
       FROM attendance
       WHERE worker_id = $1
         AND date >= $2::date
         AND date < ($2::date + INTERVAL '1 month')
       ORDER BY date`,
      [worker.worker_id, month.startDate]
    );

    const muster = calculateAttendanceSummary(attendanceResult.rows);
    const dailyWage = Number(worker.daily_wage || 0);
    const grossWage = Number(muster.present || 0) * dailyWage;
    const pfAmount = grossWage * 0.05;
    const insuranceAmount = grossWage * 0.02;
    const netWage = grossWage - pfAmount - insuranceAmount;

    res.json({
      name: worker.name,
      loginId: worker.worker_id,
      workerId: worker.id,
      jobCode: worker.contractor_id || "-",
      dob: "-",
      skill: worker.category,
      shiftHours: 8,
      selectedMonth: month.selectedMonth,

      presentDays: muster.present,
      absentDays: muster.absent,
      weeklyOff: muster.weekly_off,
      holidays: muster.holidays,

      wagePerDay: dailyWage,
      grossWage,
      pfAmount,
      insuranceAmount,
      netWage,

      leaveStatus: "Not Applied",
      leaveApprovalStatus: "Pending",
      appliedTo: "Supervisor",
      notification: "No notifications",

      leaveUsed: muster.leaves || 0,
      leavePendingCount: 0,
      leaveBalance: 12,

      attendanceTrend: buildAttendanceTrend(attendanceResult.rows),
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getWorkerDashboard,
};
