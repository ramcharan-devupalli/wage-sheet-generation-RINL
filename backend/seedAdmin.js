const db = require('./config/dbConfig');

async function seedAdmin() {
  const result = await db.query(
    `UPDATE employees
     SET name = $1,
         role = $2,
         mobile = $3,
         email = $4,
         password = $5,
         status = $6
     WHERE emp_id = $7 OR rinl_id = $7
     RETURNING emp_id, name, role, mobile, email, status`,
    ['Admin Manager', 'Admin', '9346431127', 'shaliniponnaganti@gmail.com', '1234', 'active', 'RINL-AM-01']
  );

  if (result.rowCount === 0) {
    const inserted = await db.query(
      `INSERT INTO employees (rinl_id, emp_id, name, role, mobile, email, password, status)
       VALUES ($1, $1, $2, $3, $4, $5, $6, $7)
       RETURNING emp_id, name, role, mobile, email, status`,
      ['RINL-AM-01', 'Admin Manager', 'Admin', '9346431127', 'shaliniponnaganti@gmail.com', '1234', 'active']
    );
    console.table(inserted.rows);
    return;
  }

  console.table(result.rows);
}

seedAdmin()
  .catch((err) => {
    console.error('Admin seed failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => db.end());
