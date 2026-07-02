CREATE TABLE IF NOT EXISTS employees (
  id SERIAL PRIMARY KEY,
  rinl_id TEXT UNIQUE,
  emp_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  mobile TEXT,
  email TEXT,
  password TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS login_sessions (
  id SERIAL PRIMARY KEY,
  emp_id TEXT NOT NULL,
  name TEXT,
  role TEXT,
  login_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  logout_time TIMESTAMP,
  ip_address TEXT,
  status TEXT DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS login_logs (
  id SERIAL PRIMARY KEY,
  emp_id TEXT NOT NULL,
  name TEXT,
  role TEXT,
  action TEXT NOT NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ip_address TEXT
);

CREATE TABLE IF NOT EXISTS contractors (
  id SERIAL PRIMARY KEY,
  rinl_id TEXT UNIQUE,
  contractor_id TEXT UNIQUE NOT NULL,
  engineer_id TEXT,
  name TEXT NOT NULL,
  company TEXT,
  dept_cd TEXT,
  mobile TEXT,
  email TEXT,
  job_start_dt DATE,
  job_end_dt DATE,
  present NUMERIC(10,2) DEFAULT 0,
  absent NUMERIC(10,2) DEFAULT 0,
  overtime NUMERIC(10,2) DEFAULT 0,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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
);

CREATE TABLE IF NOT EXISTS workers (
  id SERIAL PRIMARY KEY,
  rinl_id TEXT UNIQUE,
  worker_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  contractor_id TEXT,
  supervisor_id TEXT,
  mobile TEXT,
  gender TEXT,
  daily_wage NUMERIC(10,2) DEFAULT 0,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS attendance (
  id SERIAL PRIMARY KEY,
  worker_id TEXT NOT NULL,
  date DATE NOT NULL,
  status TEXT DEFAULT 'present',
  overtime_hrs NUMERIC(6,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS wage_sheets (
  id SERIAL PRIMARY KEY,
  worker_id TEXT NOT NULL,
  contractor_id TEXT,
  month TEXT NOT NULL,
  year INTEGER NOT NULL,
  days_present INTEGER DEFAULT 0,
  overtime_hrs NUMERIC(6,2) DEFAULT 0,
  gross_wage NUMERIC(12,2) DEFAULT 0,
  pf_deduction NUMERIC(12,2) DEFAULT 0,
  esi_deduction NUMERIC(12,2) DEFAULT 0,
  net_wage NUMERIC(12,2) DEFAULT 0,
  status TEXT DEFAULT 'Generated',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS rinl_id TEXT;

ALTER TABLE contractors
  ADD COLUMN IF NOT EXISTS rinl_id TEXT,
  ADD COLUMN IF NOT EXISTS engineer_id TEXT,
  ADD COLUMN IF NOT EXISTS dept_cd TEXT,
  ADD COLUMN IF NOT EXISTS job_start_dt DATE,
  ADD COLUMN IF NOT EXISTS job_end_dt DATE;

ALTER TABLE supervisors
  ADD COLUMN IF NOT EXISTS rinl_id TEXT,
  ADD COLUMN IF NOT EXISTS present NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS absent NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overtime NUMERIC(10,2) DEFAULT 0;

ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS rinl_id TEXT,
  ADD COLUMN IF NOT EXISTS supervisor_id TEXT,
  ADD COLUMN IF NOT EXISTS gender TEXT;

UPDATE employees SET rinl_id = emp_id WHERE rinl_id IS NULL;
UPDATE contractors SET rinl_id = contractor_id WHERE rinl_id IS NULL;
UPDATE supervisors SET rinl_id = supervisor_id WHERE rinl_id IS NULL;
UPDATE workers SET rinl_id = worker_id WHERE rinl_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS employees_rinl_id_unique ON employees(rinl_id);
CREATE UNIQUE INDEX IF NOT EXISTS contractors_rinl_id_unique ON contractors(rinl_id);
CREATE UNIQUE INDEX IF NOT EXISTS supervisors_rinl_id_unique ON supervisors(rinl_id);
CREATE UNIQUE INDEX IF NOT EXISTS workers_rinl_id_unique ON workers(rinl_id);
CREATE INDEX IF NOT EXISTS contractors_engineer_idx ON contractors(engineer_id);
CREATE INDEX IF NOT EXISTS supervisors_contractor_idx ON supervisors(contractor_id);
CREATE INDEX IF NOT EXISTS workers_contractor_idx ON workers(contractor_id);
CREATE INDEX IF NOT EXISTS workers_supervisor_idx ON workers(supervisor_id);
CREATE INDEX IF NOT EXISTS attendance_worker_idx ON attendance(worker_id);
CREATE INDEX IF NOT EXISTS wage_sheets_worker_idx ON wage_sheets(worker_id);

-- Migration for existing databases created before wage sheet status tracking.
ALTER TABLE wage_sheets ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Generated';
