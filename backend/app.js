const express = require('express');
const cors = require('cors');
const path = require('path');
const authRoutes = require('./routes/authRoutes');
const employeeRoutes = require('./routes/employeeRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const wageRoutes = require('./routes/wageRoutes');
const adminRoutes = require('./routes/adminRoutes');
const contractRoutes = require('./routes/contractRoutes');
const workerRoutes = require('./routes/workerRoutes');
const workerDashboardRoutes = require('./routes/workerDashboardRoutes');
const musterRoutes = require('./routes/musterRoutes');
const contractorRouter = require('./routes/contractorRouter');
const supervisorRoutes = require('./routes/supervisorRoutes');
const chatbotRoutes = require('./routes/chatbotRoutes');
const errorMiddleware = require('./middleware/errorMiddleware');

const app = express();
const frontendPath = path.join(__dirname, '..', 'frontend');

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(frontendPath, 'admin.html'));
});

app.get('/engineer', (req, res) => {
  res.sendFile(path.join(frontendPath, 'engineerincharge.html'));
});

app.get('/engineerincharge', (req, res) => {
  res.sendFile(path.join(frontendPath, 'engineerincharge.html'));
});

app.get('/contractor', (req, res) => {
  res.sendFile(path.join(frontendPath, 'contractor.html'));
});

app.get('/supervisor', (req, res) => {
  res.sendFile(path.join(frontendPath, 'supervisor.html'));
});

app.get('/workers', (req, res) => {
  res.sendFile(path.join(frontendPath, 'worker.html'));
});

app.get('/worker', (req, res) => {
  res.sendFile(path.join(frontendPath, 'worker.html'));
});

app.get('/dashboard', (req, res) => {
  res.redirect('/');
});
app.use(express.static(frontendPath, { index: false }));

app.use('/', authRoutes);
app.use('/api', authRoutes);
app.use('/', employeeRoutes);
app.use('/', attendanceRoutes);
app.use('/', wageRoutes);
app.use('/api', wageRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/contracts', contractRoutes);
app.use('/api/worker', workerRoutes);
app.use('/api/workers', workerRoutes);
app.use('/api/worker-dashboard', workerDashboardRoutes);
app.use('/api/muster', musterRoutes);
app.use('/api/contractor', contractorRouter);
app.use('/api/supervisor', supervisorRoutes);
app.use('/api/chatbot', chatbotRoutes);

app.get('/health', (req, res) => {
  res.json({ success: true, message: 'RINL Wage Portal API is running.' });
});

app.use(errorMiddleware);

module.exports = app;
