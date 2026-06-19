const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const poolConfig = process.env.DATABASE_URL
  ? (() => {
      const parsed = new URL(process.env.DATABASE_URL);
      return {
        connectionString: process.env.DATABASE_URL,
        password: String(decodeURIComponent(parsed.password || ''))
      };
    })()
  : {
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 5432),
      database: process.env.DB_NAME || 'rinl_wages',
      user: process.env.DB_USER || 'postgres',
      password: String(process.env.DB_PASSWORD || 'postgres')
    };

const pool = new Pool(poolConfig);

module.exports = pool;
