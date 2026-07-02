const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const db = require('./config/dbConfig');
const app = require('./app');

const port = process.env.PORT || 3000;
const schemaPath = path.join(__dirname, 'database', 'schema.sql');

async function initializeDatabase() {
  if (fs.existsSync(schemaPath)) {
    await db.query(fs.readFileSync(schemaPath, 'utf8'));
  }

  await ensureCompatibleSchema();

  await seedAdminAccount();

}

async function seedAdminAccount() {
  await db.query(`
    INSERT INTO employees (rinl_id, emp_id, name, role, mobile, email, password, status) VALUES
      ('RINL-AM-01', 'RINL-AM-01', 'Admin Manager', 'Admin', '9346431127', 'admin@vizagsteel.com', '1234', 'active')
    ON CONFLICT (emp_id) DO UPDATE SET
      rinl_id = EXCLUDED.rinl_id,
      name = EXCLUDED.name,
      role = EXCLUDED.role,
      mobile = EXCLUDED.mobile,
      email = EXCLUDED.email,
      password = EXCLUDED.password,
      status = EXCLUDED.status
  `);
}

async function ensureCompatibleSchema() {
  await db.query(`
    ALTER TABLE employees
      ADD COLUMN IF NOT EXISTS rinl_id TEXT,
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
      ADD COLUMN IF NOT EXISTS rinl_id TEXT,
      ADD COLUMN IF NOT EXISTS contractor_id TEXT,
      ADD COLUMN IF NOT EXISTS engineer_id TEXT,
      ADD COLUMN IF NOT EXISTS name TEXT,
      ADD COLUMN IF NOT EXISTS company TEXT,
      ADD COLUMN IF NOT EXISTS dept_cd TEXT,
      ADD COLUMN IF NOT EXISTS mobile TEXT,
      ADD COLUMN IF NOT EXISTS email TEXT,
      ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active',
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS supervisors (
      id SERIAL PRIMARY KEY,
      rinl_id TEXT UNIQUE,
      supervisor_id TEXT UNIQUE NOT NULL,
      contractor_id TEXT,
      name TEXT NOT NULL,
      mobile TEXT,
      email TEXT,
      present NUMERIC(10, 2) DEFAULT 0,
      absent NUMERIC(10, 2) DEFAULT 0,
      overtime NUMERIC(10, 2) DEFAULT 0,
      status TEXT DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.query(`
    ALTER TABLE supervisors
      ADD COLUMN IF NOT EXISTS rinl_id TEXT,
      ADD COLUMN IF NOT EXISTS present NUMERIC(10, 2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS absent NUMERIC(10, 2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS overtime NUMERIC(10, 2) DEFAULT 0
  `);

  await db.query(`
    ALTER TABLE workers
      ADD COLUMN IF NOT EXISTS rinl_id TEXT,
      ADD COLUMN IF NOT EXISTS worker_id TEXT,
      ADD COLUMN IF NOT EXISTS name TEXT,
      ADD COLUMN IF NOT EXISTS category TEXT,
      ADD COLUMN IF NOT EXISTS contractor_id TEXT,
      ADD COLUMN IF NOT EXISTS supervisor_id TEXT,
      ADD COLUMN IF NOT EXISTS mobile TEXT,
      ADD COLUMN IF NOT EXISTS gender TEXT,
      ADD COLUMN IF NOT EXISTS daily_wage NUMERIC(10, 2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active',
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  `);

  await db.query(`
    ALTER TABLE login_sessions
      ADD COLUMN IF NOT EXISTS browser TEXT,
      ADD COLUMN IF NOT EXISTS browser_version TEXT,
      ADD COLUMN IF NOT EXISTS operating_system TEXT,
      ADD COLUMN IF NOT EXISTS device TEXT,
      ADD COLUMN IF NOT EXISTS user_agent TEXT
  `);

  await db.query(`
    ALTER TABLE login_logs
      ADD COLUMN IF NOT EXISTS browser TEXT,
      ADD COLUMN IF NOT EXISTS browser_version TEXT,
      ADD COLUMN IF NOT EXISTS operating_system TEXT,
      ADD COLUMN IF NOT EXISTS device TEXT,
      ADD COLUMN IF NOT EXISTS user_agent TEXT
  `);

  await db.query('UPDATE employees SET rinl_id = emp_id WHERE rinl_id IS NULL');
  await db.query('UPDATE contractors SET rinl_id = contractor_id WHERE rinl_id IS NULL');
  await db.query('UPDATE supervisors SET rinl_id = supervisor_id WHERE rinl_id IS NULL');
  await db.query('UPDATE workers SET rinl_id = worker_id WHERE rinl_id IS NULL');

  await db.query('CREATE UNIQUE INDEX IF NOT EXISTS employees_rinl_id_unique ON employees (rinl_id)');
  await db.query('CREATE UNIQUE INDEX IF NOT EXISTS contractors_rinl_id_unique ON contractors (rinl_id)');
  await db.query('CREATE UNIQUE INDEX IF NOT EXISTS supervisors_rinl_id_unique ON supervisors (rinl_id)');
  await db.query('CREATE UNIQUE INDEX IF NOT EXISTS workers_rinl_id_unique ON workers (rinl_id)');
  await db.query('CREATE UNIQUE INDEX IF NOT EXISTS employees_emp_id_unique ON employees (emp_id)');
  await db.query('CREATE UNIQUE INDEX IF NOT EXISTS contractors_contractor_id_unique ON contractors (contractor_id)');
  await db.query('CREATE UNIQUE INDEX IF NOT EXISTS supervisors_supervisor_id_unique ON supervisors (supervisor_id)');
  await db.query('CREATE UNIQUE INDEX IF NOT EXISTS workers_worker_id_unique ON workers (worker_id)');
  await db.query('CREATE INDEX IF NOT EXISTS contractors_engineer_idx ON contractors (engineer_id)');
  await db.query('CREATE INDEX IF NOT EXISTS supervisors_contractor_idx ON supervisors (contractor_id)');
  await db.query('CREATE INDEX IF NOT EXISTS workers_contractor_idx ON workers (contractor_id)');
  await db.query('CREATE INDEX IF NOT EXISTS workers_supervisor_idx ON workers (supervisor_id)');
  await db.query('CREATE INDEX IF NOT EXISTS attendance_worker_idx ON attendance (worker_id)');
  await db.query('CREATE INDEX IF NOT EXISTS wage_sheets_worker_idx ON wage_sheets (worker_id)');
}

initializeDatabase()
  .then(() => {
    app.listen(port, () => console.log(`RINL Wage Portal server running at http://localhost:${port}`));
  })
  .catch((err) => {
    console.error('PostgreSQL connection failed:', err.message);
    process.exit(1);
  });
