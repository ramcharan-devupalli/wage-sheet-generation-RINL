CREATE TABLE IF NOT EXISTS employees (
  id SERIAL PRIMARY KEY,
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
  contractor_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  company TEXT,
  mobile TEXT,
  email TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS workers (
  id SERIAL PRIMARY KEY,
  worker_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  contractor_id TEXT,
  mobile TEXT,
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
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);