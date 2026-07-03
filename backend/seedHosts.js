const db = require('./config/dbConfig');

const hosts = [
  ['Ponnaganti Sravani', 'shaliniponnaganti@gmail.com', '+919346431127'],
  ['Vijay Sri Krishna', 'vadapallivijay07@gmail.com', '+919391220964'],
  ['Neelam Mali', 'neelammali2406@gmail.com', '+919381004994'],
  ['Ronnic Wilmer Ekka', 'ronnicekka4@gmail.com', '+917893426872'],
  ['Devupalli Ramcharan', 'ramcharan.devupalli9@gmail.com', '+918121467799'],
  ['Navara Moda Sravya', 'sravyanavara1915@gmail.com', '+919492523250'],
  ['Srimayi Khandavalli', 'srimayikhandavilli@gmail.com', '+917674966172']
];

async function seedHosts() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS hosts (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      notify_on_signup BOOLEAN DEFAULT TRUE,
      notify_on_login BOOLEAN DEFAULT TRUE,
      active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  for (const [name, email, phone] of hosts) {
    const updated = await db.query(
      `UPDATE hosts
       SET name = $1,
           phone = $3,
           notify_on_signup = TRUE,
           notify_on_login = TRUE,
           active = TRUE
       WHERE LOWER(email) = LOWER($2)`,
      [name, email, phone]
    );

    if (updated.rowCount === 0) {
      await db.query(
        `INSERT INTO hosts (name, email, phone, notify_on_signup, notify_on_login, active)
         VALUES ($1, $2, $3, TRUE, TRUE, TRUE)`,
        [name, email, phone]
      );
    }
  }

  const result = await db.query(
    `SELECT name, email, phone, notify_on_signup, notify_on_login, active
     FROM hosts
     ORDER BY id`
  );
  console.table(result.rows);
}

seedHosts()
  .catch((err) => {
    console.error('Host seed failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => db.end());
