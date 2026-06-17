require('dotenv').config();

const pool = require('./config/dbConfig');

async function testConnection() {
  try {
    const result = await pool.query('SELECT current_database() AS database, current_user AS user, NOW() AS connected_at');
    console.log('DATABASE CONNECTED');
    console.table(result.rows);
  } catch (err) {
    console.error('DATABASE ERROR:', err.message);
    console.error('Check DB_HOST, DB_PORT, DB_NAME, DB_USER, and DB_PASSWORD in backend/.env.');
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

testConnection();
