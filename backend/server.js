require('dotenv').config();

const fs = require('fs');
const path = require('path');
const db = require('./config/dbConfig');
const app = require('./app');

const port = process.env.PORT || 3000;
const schemaPath = path.join(__dirname, 'database', 'schema.sql');

async function initializeDatabase() {
  if (fs.existsSync(schemaPath)) {
    await db.query(fs.readFileSync(schemaPath, 'utf8'));
  }

  await ensureCompatibleSchema();

  await db.query(`
    INSERT INTO employees (emp_id, name, role, mobile, email, password) VALUES
      ('RINL-SUP-001', 'Rajesh Kumar', 'Supervisor', '9346431127', 'rajesh@vizagsteel.com', '1234'),
      ('RINL-HR-001', 'Priya Sharma', 'HR / Admin', '9876543210', 'priya@vizagsteel.com', '1234'),
      ('RINL-SKL-001', 'Venkat Rao', 'Skilled Worker', '9123456789', 'venkat@vizagsteel.com', '1234'),
      ('RINL-CON-001', 'Sravani Devi', 'Contractor Representative', '9346431127', 'sravani@vizagsteel.com', '1234')
    ON CONFLICT (emp_id) DO NOTHING
  `);

  await db.query(`
    INSERT INTO contractors (contractor_id, name, company, mobile, email) VALUES
      ('CON-001', 'Ramesh Babu', 'Ramesh Constructions', '9111111111', 'ramesh@example.com'),
      ('CON-002', 'Suresh Goud', 'Suresh Steel Works', '9222222222', 'suresh@example.com'),
      ('CON-003', 'Lakshmi Devi', 'Lakshmi Enterprises', '9333333333', 'lakshmi@example.com')
    ON CONFLICT (contractor_id) DO NOTHING
  `);

  await db.query(`
    INSERT INTO workers (worker_id, name, category, contractor_id, mobile, daily_wage) VALUES
      ('WRK-001', 'Anil Kumar', 'Skilled Worker', 'CON-001', '9000000001', 650),
      ('WRK-002', 'Suresh Rao', 'Unskilled Worker', 'CON-001', '9000000002', 450),
      ('WRK-003', 'Kavitha Devi', 'Semi-Skilled Worker', 'CON-002', '9000000003', 550),
      ('WRK-004', 'Ravi Shankar', 'Skilled Worker', 'CON-002', '9000000004', 650),
      ('WRK-005', 'Meena Kumari', 'Unskilled Worker', 'CON-003', '9000000005', 450)
    ON CONFLICT (worker_id) DO NOTHING
  `);
}

async function ensureCompatibleSchema() {
  await db.query(`
    ALTER TABLE employees
      ADD COLUMN IF NOT EXISTS emp_id TEXT,
      ADD COLUMN IF NOT EXISTS name TEXT,
      ADD COLUMN IF NOT EXISTS role TEXT,
      ADD COLUMN IF NOT EXISTS mobile TEXT,
      ADD COLUMN IF NOT EXISTS email TEXT,
      ADD COLUMN IF NOT EXISTS password TEXT,
      ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active',
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  `);

  await db.query(`
    ALTER TABLE contractors
      ADD COLUMN IF NOT EXISTS contractor_id TEXT,
      ADD COLUMN IF NOT EXISTS name TEXT,
      ADD COLUMN IF NOT EXISTS company TEXT,
      ADD COLUMN IF NOT EXISTS mobile TEXT,
      ADD COLUMN IF NOT EXISTS email TEXT,
      ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active',
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  `);

  await db.query(`
    ALTER TABLE workers
      ADD COLUMN IF NOT EXISTS worker_id TEXT,
      ADD COLUMN IF NOT EXISTS name TEXT,
      ADD COLUMN IF NOT EXISTS category TEXT,
      ADD COLUMN IF NOT EXISTS contractor_id TEXT,
      ADD COLUMN IF NOT EXISTS mobile TEXT,
      ADD COLUMN IF NOT EXISTS daily_wage NUMERIC(10, 2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active',
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  `);

  await db.query('CREATE UNIQUE INDEX IF NOT EXISTS employees_emp_id_unique ON employees (emp_id)');
  await db.query('CREATE UNIQUE INDEX IF NOT EXISTS contractors_contractor_id_unique ON contractors (contractor_id)');
  await db.query('CREATE UNIQUE INDEX IF NOT EXISTS workers_worker_id_unique ON workers (worker_id)');
}

initializeDatabase()
  .then(() => {
    app.listen(port, () => console.log(`RINL Wage Portal server running at http://localhost:${port}`));
  })
  .catch((err) => {
    console.error('PostgreSQL connection failed:', err.message);
    process.exit(1);
  });
