const express = require('express');
const cors = require('cors');
const path = require('path');
const authRoutes = require('./routes/authRoutes');
const employeeRoutes = require('./routes/employeeRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const wageRoutes = require('./routes/wageRoutes');
const errorMiddleware = require('./middleware/errorMiddleware');

const app = express();
const frontendPath = path.join(__dirname, '..', 'frontend');

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.sendFile(path.join(frontendPath, 'flashcards.html'));
});

app.use(express.static(frontendPath, { index: false }));

app.use('/', authRoutes);
app.use('/', employeeRoutes);
app.use('/', attendanceRoutes);
app.use('/', wageRoutes);

app.get('/health', (req, res) => {
  res.json({ success: true, message: 'RINL Wage Portal API is running.' });
});

app.use(errorMiddleware);

module.exports = app;
