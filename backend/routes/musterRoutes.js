const router = require("express").Router();
const pool = require("../config/dbConfig");

router.post("/", async (req, res, next) => {
  try {
    const {
      adhar_id,
      worker_id,
      job_cd,
      present,
      absent,
      weekly_off,
      holidays,
      leaves,
      muster_month,
    } = req.body;

    const id = worker_id || adhar_id;
    if (!id || !muster_month) {
      return res.status(400).json({ message: "Worker ID and muster month are required" });
    }

    const [year, month] = String(muster_month).split("-").map(Number);
    if (!year || !month) {
      return res.status(400).json({ message: "muster_month must be in YYYY-MM format" });
    }

    const presentDays = Number(present || 0);
    const absentDays = Number(absent || 0);
    const weeklyOffDays = Number(weekly_off || 0);
    const holidayDays = Number(holidays || 0);
    const leaveDays = Number(leaves || 0);
    const days = [
      ...Array.from({ length: presentDays }, () => "present"),
      ...Array.from({ length: absentDays + weeklyOffDays + holidayDays + leaveDays }, () => "absent"),
    ];

    await pool.query(
      "DELETE FROM attendance WHERE worker_id = $1 AND date >= $2::date AND date < ($2::date + INTERVAL '1 month')",
      [id, `${year}-${String(month).padStart(2, "0")}-01`]
    );

    for (let index = 0; index < days.length; index += 1) {
      await pool.query(
        "INSERT INTO attendance (worker_id, date, status) VALUES ($1, $2::date + ($3::int * INTERVAL '1 day'), $4)",
        [id, `${year}-${String(month).padStart(2, "0")}-01`, index, days[index]]
      );
    }

    res.status(201).json({ message: "Monthly muster saved", job_cd, saved_rows: days.length });
  } catch (err) {
    next(err);
  }
});

router.get("/", async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT
        w.name AS worker_name,
        w.contractor_id AS job_cd,
        TO_CHAR(a.date, 'YYYY-MM') AS muster_month,
        CASE WHEN a.status = 'present' THEN 1 ELSE 0 END AS present,
        CASE WHEN a.status = 'absent' THEN 1 ELSE 0 END AS absent,
        0 AS weekly_off,
        0 AS holidays,
        0 AS leaves
      FROM attendance a
      LEFT JOIN workers w ON w.worker_id = a.worker_id
      ORDER BY a.date DESC, a.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
