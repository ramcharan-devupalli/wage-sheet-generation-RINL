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

  await seedDemoHierarchy();

  await db.query(`
    UPDATE employees
    SET status = 'inactive'
    WHERE emp_id IN ('RINL-SUP-001', 'RINL-SKL-001', 'RINL-CON-001')
  `);
}

async function seedDemoHierarchy() {
  await db.query(`
    INSERT INTO employees (rinl_id, emp_id, name, role, mobile, email, password, status) VALUES
      ('RINL-HR-001', 'RINL-HR-001', 'Priya Sharma', 'Admin', '9876543210', 'priya@vizagsteel.com', '1234', 'active'),
      ('RINL-AM-01', 'RINL-AM-01', 'Admin Manager', 'Admin', '9346431127', 'admin@vizagsteel.com', '1234', 'active'),
      ('RINL-EN-01', 'RINL-EN-01', 'Engineer Incharge', 'Engineer Incharge', '9346431128', 'engineer@vizagsteel.com', '1234', 'active'),
      ('RINL-SP-01', 'RINL-SP-01', 'Shift Supervisor', 'Supervisor', '9346431130', 'supervisor@vizagsteel.com', '1234', 'active')
    ON CONFLICT (emp_id) DO UPDATE SET
      rinl_id = EXCLUDED.rinl_id,
      name = EXCLUDED.name,
      role = EXCLUDED.role,
      mobile = EXCLUDED.mobile,
      email = EXCLUDED.email,
      password = EXCLUDED.password,
      status = EXCLUDED.status
  `);

  await db.query(`
    INSERT INTO contractors (rinl_id, contractor_id, engineer_id, name, company, mobile, email, status)
    VALUES ('RINL-CON-01', 'RINL-CON-01', 'RINL-EN-01', 'Contractor One', 'RINL Contract Services', '9346431129', 'contractor@vizagsteel.com', 'active')
    ON CONFLICT (contractor_id) DO UPDATE SET
      rinl_id = EXCLUDED.rinl_id,
      engineer_id = EXCLUDED.engineer_id,
      name = EXCLUDED.name,
      company = EXCLUDED.company,
      mobile = EXCLUDED.mobile,
      email = EXCLUDED.email,
      status = EXCLUDED.status
  `);

  await db.query(`
    INSERT INTO supervisors (rinl_id, supervisor_id, contractor_id, name, mobile, email, status)
    VALUES ('RINL-SP-01', 'RINL-SP-01', 'RINL-CON-01', 'Shift Supervisor', '9346431130', 'supervisor@vizagsteel.com', 'active')
    ON CONFLICT (supervisor_id) DO UPDATE SET
      rinl_id = EXCLUDED.rinl_id,
      contractor_id = EXCLUDED.contractor_id,
      name = EXCLUDED.name,
      mobile = EXCLUDED.mobile,
      email = EXCLUDED.email,
      status = EXCLUDED.status
  `);

  await db.query(`
    INSERT INTO workers (rinl_id, worker_id, name, category, contractor_id, supervisor_id, mobile, daily_wage, status)
    VALUES ('RINL-WK-01', 'RINL-WK-01', 'Worker One', 'Skilled Worker', 'RINL-CON-01', 'RINL-SP-01', '9346431131', 850, 'active')
    ON CONFLICT (worker_id) DO UPDATE SET
      rinl_id = EXCLUDED.rinl_id,
      name = EXCLUDED.name,
      category = EXCLUDED.category,
      contractor_id = EXCLUDED.contractor_id,
      supervisor_id = EXCLUDED.supervisor_id,
      mobile = EXCLUDED.mobile,
      daily_wage = EXCLUDED.daily_wage,
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
      status TEXT DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.query('ALTER TABLE supervisors ADD COLUMN IF NOT EXISTS rinl_id TEXT');

  await db.query(`
    ALTER TABLE workers
      ADD COLUMN IF NOT EXISTS rinl_id TEXT,
      ADD COLUMN IF NOT EXISTS worker_id TEXT,
      ADD COLUMN IF NOT EXISTS name TEXT,
      ADD COLUMN IF NOT EXISTS category TEXT,
      ADD COLUMN IF NOT EXISTS contractor_id TEXT,
      ADD COLUMN IF NOT EXISTS supervisor_id TEXT,
      ADD COLUMN IF NOT EXISTS mobile TEXT,
      ADD COLUMN IF NOT EXISTS daily_wage NUMERIC(10, 2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active',
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
