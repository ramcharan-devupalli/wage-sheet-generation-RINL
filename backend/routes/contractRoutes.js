const router = require("express").Router();
const pool = require("../config/dbConfig");

router.post("/", async (req, res, next) => {
  try {
    const {
      job_cd,
      contractor_name,
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
      `INSERT INTO contractors (contractor_id, name, mobile, company)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (contractor_id) DO UPDATE SET
         name = EXCLUDED.name,
         mobile = EXCLUDED.mobile,
         company = EXCLUDED.company
       RETURNING
         contractor_id AS job_cd,
         name AS contractor_name,
         mobile AS contractor_phone,
         company AS work_area,
         $5::text AS contractor_address,
         $6::text AS party_cd,
         $7::text AS dept_cd,
         $8::text AS job_desc,
         COALESCE($9::date, created_at::date) AS job_start_dt,
         $10::date AS job_end_dt`,
      [
        job_cd,
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
        contractor_id AS job_cd,
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
           mobile = $2,
           company = $3
       WHERE contractor_id = $4
       RETURNING
         contractor_id AS job_cd,
         name AS contractor_name,
         mobile AS contractor_phone,
         company AS work_area,
         $5::text AS dept_cd,
         COALESCE($6::date, created_at::date) AS job_start_dt,
         $7::date AS job_end_dt`,
      [
        contractor_name,
        contractor_phone || null,
        work_area || null,
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
