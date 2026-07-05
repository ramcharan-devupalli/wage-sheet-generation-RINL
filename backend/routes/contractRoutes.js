const router = require("express").Router();
const pool = require("../config/dbConfig");

function compactId(raw) {
  return String(raw || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function idAliases(raw) {
  const value = String(raw || "").trim();
  const compact = compactId(value);
  const withoutRinlPrefix = value.replace(/^rinl[-_\s]*/i, "");
  return Array.from(new Set([
    value.toLowerCase(),
    withoutRinlPrefix.toLowerCase(),
    compact,
    compact.replace(/^rinl/, "")
  ].filter(Boolean)));
}

async function resolveEngineerId(rawEngineerId) {
  const aliases = idAliases(rawEngineerId);
  if (!aliases.length) return rawEngineerId || null;

  const result = await pool.query(
    `SELECT COALESCE(rinl_id, emp_id) AS engineer_id
     FROM employees
     WHERE LOWER(COALESCE(role, '')) IN ('engineer', 'engineer incharge', 'engineer in charge')
       AND (
         LOWER(COALESCE(rinl_id, emp_id)) = ANY($1::text[])
         OR LOWER(emp_id) = ANY($1::text[])
         OR LOWER(REGEXP_REPLACE(COALESCE(rinl_id, emp_id, ''), '[^a-zA-Z0-9]', '', 'g')) = ANY($2::text[])
         OR LOWER(REGEXP_REPLACE(COALESCE(emp_id, ''), '[^a-zA-Z0-9]', '', 'g')) = ANY($2::text[])
       )
     LIMIT 1`,
    [aliases, aliases.map(compactId)]
  );

  return result.rows[0]?.engineer_id || rawEngineerId || null;
}

router.post("/", async (req, res, next) => {
  try {
    const {
      job_cd,
      contractor_name,
      contractor_email,
      email,
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

    const resolvedEngineerId = await resolveEngineerId(engineerId || engineer_id || null);
    const contractorEmail = contractor_email || email || null;

    const result = await pool.query(
      `INSERT INTO contractors (rinl_id, contractor_id, engineer_id, name, mobile, email, company, dept_cd, job_start_dt, job_end_dt)
       VALUES ($1, $1, $2, $3, $4, $5, $6, $7, $11, $12)
       ON CONFLICT (contractor_id) DO UPDATE SET
         rinl_id = EXCLUDED.rinl_id,
         engineer_id = EXCLUDED.engineer_id,
         name = EXCLUDED.name,
         mobile = EXCLUDED.mobile,
         email = EXCLUDED.email,
         company = EXCLUDED.company,
         dept_cd = EXCLUDED.dept_cd,
         job_start_dt = EXCLUDED.job_start_dt,
         job_end_dt = EXCLUDED.job_end_dt
       RETURNING
         COALESCE(rinl_id, contractor_id) AS rinl_id,
         contractor_id AS job_cd,
         engineer_id,
         name AS contractor_name,
         email AS contractor_email,
         mobile AS contractor_phone,
         company AS work_area,
         dept_cd,
         $8::text AS contractor_address,
         $9::text AS party_cd,
         $10::text AS job_desc,
         COALESCE(job_start_dt, created_at::date) AS job_start_dt,
         job_end_dt`,
      [
        job_cd,
        resolvedEngineerId,
        contractor_name,
        contractor_phone || null,
        contractorEmail,
        work_area || null,
        dept_cd || null,
        contractor_address || null,
        party_cd || null,
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
        COALESCE(c.rinl_id, c.contractor_id) AS rinl_id,
        c.contractor_id AS job_cd,
        c.engineer_id,
        c.name AS contractor_name,
        c.email AS contractor_email,
        c.mobile AS contractor_phone,
        c.company AS work_area,
        COALESCE(c.dept_cd, '-') AS dept_cd,
        COALESCE(c.job_start_dt, c.created_at::date) AS job_start_dt,
        c.job_end_dt
      FROM contractors c
      ORDER BY c.created_at DESC
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
      contractor_email,
      email,
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

    const resolvedEngineerId = await resolveEngineerId(engineerId || engineer_id || null);
    const contractorEmail = contractor_email || email || null;

    const result = await pool.query(
      `UPDATE contractors
       SET name = $1,
           rinl_id = $5,
           mobile = $2,
           company = $3,
           engineer_id = $4,
           dept_cd = $6,
           job_start_dt = $7,
           job_end_dt = $8,
           email = $9
       WHERE contractor_id = $5
       RETURNING
         COALESCE(rinl_id, contractor_id) AS rinl_id,
         contractor_id AS job_cd,
         engineer_id,
         name AS contractor_name,
         email AS contractor_email,
         mobile AS contractor_phone,
         company AS work_area,
         COALESCE(dept_cd, '-') AS dept_cd,
         COALESCE(job_start_dt, created_at::date) AS job_start_dt,
         job_end_dt`,
      [
        contractor_name,
        contractor_phone || null,
        work_area || null,
        resolvedEngineerId,
        job_cd,
        dept_cd || "-",
        job_start_dt || null,
        job_end_dt || null,
        contractorEmail,
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
