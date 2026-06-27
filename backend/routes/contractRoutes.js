const router = require("express").Router();
const pool = require("../config/dbConfig");

router.post("/", async (req, res, next) => {
  try {
    const {
      job_cd,
      contractor_name,
      engineer_id,
      engineerId,
      contractor_phone,
      work_area,
      contractor_address,
      party_cd,
      dept_cd,
      job_desc,
      job_start_dt,
      job_end_dt,
    } = req.body;

    if (!job_cd || !contractor_name) {
      return res.status(400).json({ message: "Job code and contractor name are required" });
    }

    const result = await pool.query(
      `INSERT INTO contractors (rinl_id, contractor_id, engineer_id, name, mobile, company)
       VALUES ($1, $1, $2, $3, $4, $5)
       ON CONFLICT (contractor_id) DO UPDATE SET
         rinl_id = EXCLUDED.rinl_id,
         engineer_id = EXCLUDED.engineer_id,
         name = EXCLUDED.name,
         mobile = EXCLUDED.mobile,
         company = EXCLUDED.company
       RETURNING
         COALESCE(rinl_id, contractor_id) AS rinl_id,
         contractor_id AS job_cd,
         engineer_id,
         name AS contractor_name,
         mobile AS contractor_phone,
         company AS work_area,
         $6::text AS contractor_address,
         $7::text AS party_cd,
         $8::text AS dept_cd,
         $9::text AS job_desc,
         COALESCE($10::date, created_at::date) AS job_start_dt,
         $11::date AS job_end_dt`,
      [
        job_cd,
        engineerId || engineer_id || null,
        contractor_name,
        contractor_phone || null,
        work_area || null,
        contractor_address || null,
        party_cd || null,
        dept_cd || null,
        job_desc || null,
        job_start_dt || null,
        job_end_dt || null,
      ]
    );

    res.status(201).json({ message: "Contract saved successfully", contract: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

router.get("/", async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT
        COALESCE(rinl_id, contractor_id) AS rinl_id,
        contractor_id AS job_cd,
        engineer_id,
        name AS contractor_name,
        mobile AS contractor_phone,
        company AS work_area,
        '-' AS dept_cd,
        created_at AS job_start_dt,
        NULL AS job_end_dt
      FROM contractors
      ORDER BY created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

router.patch("/:job_cd", async (req, res, next) => {
  try {
    const { job_cd } = req.params;
    const {
      contractor_name,
      engineer_id,
      engineerId,
      contractor_phone,
      work_area,
      dept_cd,
      job_start_dt,
      job_end_dt,
    } = req.body;

    if (!contractor_name) {
      return res.status(400).json({ message: "Contractor name is required" });
    }

    const result = await pool.query(
      `UPDATE contractors
       SET name = $1,
           rinl_id = $5,
           mobile = $2,
           company = $3,
           engineer_id = $4
       WHERE contractor_id = $5
       RETURNING
         COALESCE(rinl_id, contractor_id) AS rinl_id,
         contractor_id AS job_cd,
         engineer_id,
         name AS contractor_name,
         mobile AS contractor_phone,
         company AS work_area,
         $6::text AS dept_cd,
         COALESCE($7::date, created_at::date) AS job_start_dt,
         $8::date AS job_end_dt`,
      [
        contractor_name,
        contractor_phone || null,
        work_area || null,
        engineerId || engineer_id || null,
        job_cd,
        dept_cd || "-",
        job_start_dt || null,
        job_end_dt || null,
      ]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: "Contractor not found" });
    }

    res.json({ message: "Contractor updated successfully", contract: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

router.delete("/:job_cd", async (req, res, next) => {
  try {
    const { job_cd } = req.params;
    const result = await pool.query(
      "DELETE FROM contractors WHERE contractor_id = $1 RETURNING contractor_id",
      [job_cd]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: "Contractor not found" });
    }

    res.json({ message: "Contractor deleted successfully" });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
