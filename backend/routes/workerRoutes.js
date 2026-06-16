const router = require("express").Router();
const pool = require("../config/dbConfig");

router.post("/", async (req, res, next) => {
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
});

router.get("/", async (req, res, next) => {
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
});

module.exports = router;
