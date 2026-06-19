const workers = [];
const overtime = [];
const issues = [];
const notifications = [];
const SUPERVISOR_API_BASE = ["file:", "http:"].includes(window.location.protocol)
  && ["", "127.0.0.1", "localhost"].includes(window.location.hostname)
  && window.location.port !== "3000"
  ? "http://localhost:3000"
  : "";

const workAreas = ['Blast Furnace', 'Rolling Mill', 'Maintenance', 'Material Handling', 'Loading Yard'];
let selectedWorkerId = null;
let savedSession = null;

function setText(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value;
}

function replaceArray(target, rows) {
  target.splice(0, target.length, ...rows);
}

function sessionHeaders() {
  return {
    "Content-Type": "application/json",
    "x-employee-id": savedSession?.employee?.empId || ""
  };
}

function normalizeWorker(row) {
  return {
    id: row.adhar_id || row.worker_id || row.id || "-",
    name: row.worker_name || row.name || "-",
    category: row.worker_skill || row.worker_desig || row.category || "-",
    status: row.status || "Active",
    area: row.job_cd || row.contractor_id || row.area || "Unassigned"
  };
}

function renderMetrics() {
  const present = workers.filter((worker) => worker.status === 'Present' || worker.status === 'Half Day').length;
  const absent = workers.filter((worker) => worker.status === 'Absent').length;
  const pendingOt = overtime.filter((item) => item.status === 'Pending').length;
  const unreadAlerts = notifications.filter((item) => !item.read).length;
  const criticalAlerts = notifications.filter((item) => item.priority === 'Critical').length;
  setText('totalWorkers', workers.length);
  setText('presentToday', present);
  setText('absentToday', absent);
  setText('overtimeWorkers', overtime.length);
  setText('pendingIssues', issues.length);
  setText('pendingOtCount', `${pendingOt} Pending`);
  setText('totalAlerts', notifications.length);
  setText('unreadAlerts', unreadAlerts);
  setText('criticalAlerts', criticalAlerts);
}

function renderWorkers(filter = '') {
  const tbody = document.getElementById('workerBody');
  const query = filter.trim().toLowerCase();
  const rows = workers.filter((worker) =>
    !query || `${worker.id} ${worker.name} ${worker.category} ${worker.area}`.toLowerCase().includes(query)
  );
  tbody.innerHTML = '';

  if (!rows.length) {
    tbody.innerHTML = `<tr><td class="empty-row" colspan="6">${query ? 'No workers match your search.' : 'No worker data available.'}</td></tr>`;
    return;
  }

  rows.forEach((worker) => {
    const row = document.createElement('tr');
    row.className = worker.id === selectedWorkerId ? 'selected' : '';
    row.innerHTML = `
      <td>${worker.id}</td>
      <td>${worker.name}</td>
      <td>${worker.category}</td>
      <td><span class="status ${worker.status.split(' ')[0]}">${worker.status}</span></td>
      <td>
        <select class="area-select" data-area="${worker.id}">
          ${workAreas.map((area) => `<option ${area === worker.area ? 'selected' : ''}>${area}</option>`).join('')}
        </select>
      </td>
      <td>
        <button class="mini-btn" data-select="${worker.id}">Select</button>
        <button class="mini-btn" data-details="${worker.id}">Details</button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

function renderOvertime() {
  const tbody = document.getElementById('overtimeBody');
  if (!overtime.length) {
    tbody.innerHTML = '<tr><td class="empty-row" colspan="5">No overtime requests available.</td></tr>';
    renderMetrics();
    return;
  }

  tbody.innerHTML = overtime.map((item, index) => `
    <tr>
      <td>${item.worker}</td>
      <td>${item.hours}</td>
      <td>${item.area}</td>
      <td><span class="status ${item.status}">${item.status}</span></td>
      <td>
        <button class="mini-btn" data-ot-approve="${index}">Approve</button>
        <button class="mini-btn danger" data-ot-reject="${index}">Reject</button>
      </td>
    </tr>
  `).join('');
  renderMetrics();
}

function renderIssues() {
  const list = document.getElementById('issueList');
  if (!issues.length) {
    list.innerHTML = '<div class="empty-state">No open issues reported.</div>';
    return;
  }

  list.innerHTML = issues.map((issue) => `
    <div class="issue-card">
      <strong>${issue.type}</strong>
      <p>${issue.area}</p>
      <p>${issue.details}</p>
    </div>
  `).join('');
}

function renderNotifications() {
  const list = document.getElementById('notificationList');
  if (!list) return;

  if (!notifications.length) {
    list.innerHTML = '<div class="empty-state">No notifications or alerts available.</div>';
    renderMetrics();
    return;
  }

  list.innerHTML = notifications.map((item, index) => `
    <div class="notification-card ${item.read ? '' : 'unread'}">
      <div>
        <span class="alert-priority ${item.priority}">${item.priority}</span>
        <strong>${item.title}</strong>
        <p>${item.message}</p>
        <small>${item.time}</small>
      </div>
      <button class="mini-btn" data-alert-read="${index}" ${item.read ? 'disabled' : ''}>${item.read ? 'Read' : 'Mark read'}</button>
    </div>
  `).join('');
  renderMetrics();
}

function renderReport() {
  const date = document.getElementById('reportDate').value;
  const present = document.getElementById('reportPresent').value;
  const completed = document.getElementById('reportCompleted').value;
  const issueText = document.getElementById('reportIssues').value.trim();
  document.getElementById('reportPreview').innerHTML = `
    <div class="report-card">
      <strong>Date:</strong> ${date || 'Not selected'}<br>
      <strong>Workers Present:</strong> ${present}<br>
      <strong>Work Completed:</strong> ${completed}%<br>
      <strong>Issues:</strong><br>${issueText ? issueText.replace(/\n/g, '<br>') : 'No issues reported.'}
    </div>
  `;
}

function bindNavigation() {
  document.querySelectorAll('.nav-link').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      const page = link.dataset.page;
      document.querySelectorAll('.nav-link').forEach((item) => item.classList.toggle('active', item === link));
      document.querySelectorAll('.page').forEach((section) => section.classList.toggle('active', section.id === `page-${page}`));
      const heading = link.childNodes[0].textContent.trim();
      setText('pageHeading', heading === 'Overview' ? 'Supervisor Dashboard' : heading);
    });
  });
}

function bindActions() {
  document.getElementById('workerSearch').addEventListener('input', (event) => renderWorkers(event.target.value));

  document.getElementById('workerBody').addEventListener('click', (event) => {
    const selectId = event.target.dataset.select;
    const detailId = event.target.dataset.details;
    if (selectId) {
      selectedWorkerId = selectId;
      const worker = workers.find((item) => item.id === selectId);
      if (!worker) return;
      setText('selectedWorkerHint', `${worker.name} selected. Choose an attendance status below.`);
      renderWorkers(document.getElementById('workerSearch').value);
    }
    if (detailId) {
      const worker = workers.find((item) => item.id === detailId);
      if (!worker) return;
      setText('selectedWorkerHint', `${worker.id} - ${worker.name}, ${worker.category}, ${worker.status}, ${worker.area}`);
    }
  });

  document.getElementById('workerBody').addEventListener('change', (event) => {
    const workerId = event.target.dataset.area;
    if (!workerId) return;
    const worker = workers.find((item) => item.id === workerId);
    if (!worker) return;
    worker.area = event.target.value;
    setText('selectedWorkerHint', `${worker.name} assigned to ${worker.area}.`);
  });

  document.querySelectorAll('[data-status-action]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!selectedWorkerId) {
        setText('selectedWorkerHint', 'Select a worker first.');
        return;
      }
      const worker = workers.find((item) => item.id === selectedWorkerId);
      if (!worker) return;
      worker.status = button.dataset.statusAction;
      setText('selectedWorkerHint', `${worker.name} marked as ${worker.status}.`);
      renderWorkers(document.getElementById('workerSearch').value);
      renderMetrics();
    });
  });

  document.getElementById('overtimeBody').addEventListener('click', (event) => {
    const approve = event.target.dataset.otApprove;
    const reject = event.target.dataset.otReject;
    if (approve !== undefined) overtime[Number(approve)].status = 'Approved';
    if (reject !== undefined) overtime[Number(reject)].status = 'Rejected';
    renderOvertime();
  });

  document.getElementById('reportForm').addEventListener('submit', (event) => {
    event.preventDefault();
    renderReport();
  });

  document.getElementById('incidentForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const details = document.getElementById('incidentDetails').value.trim();
    if (!details) return;
    const incident = {
      type: document.getElementById('incidentType').value,
      area: document.getElementById('incidentArea').value,
      details
    };
    issues.unshift(incident);
    notifications.unshift({
      priority: incident.type === 'Worker Injury' || incident.type === 'Safety Issue' ? 'Critical' : 'Important',
      title: incident.type,
      message: `${incident.area}: ${incident.details}`,
      time: new Date().toLocaleString(),
      read: false
    });
    document.getElementById('incidentDetails').value = '';
    renderIssues();
    renderNotifications();
    renderMetrics();
  });

  document.getElementById('alertForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const title = document.getElementById('alertTitle').value.trim();
    const message = document.getElementById('alertMessage').value.trim();
    if (!title || !message) return;
    notifications.unshift({
      priority: document.getElementById('alertPriority').value,
      title,
      message,
      time: new Date().toLocaleString(),
      read: false
    });
    document.getElementById('alertTitle').value = '';
    document.getElementById('alertMessage').value = '';
    renderNotifications();
  });

  document.getElementById('notificationList').addEventListener('click', (event) => {
    const index = event.target.dataset.alertRead;
    if (index === undefined) return;
    notifications[Number(index)].read = true;
    renderNotifications();
  });

  document.getElementById('markAlertsRead').addEventListener('click', () => {
    notifications.forEach((item) => {
      item.read = true;
    });
    renderNotifications();
  });
}

async function loadSupervisorDashboard() {
  try {
    const response = await fetch(`${SUPERVISOR_API_BASE}/api/workers`, {
      method: 'GET',
      credentials: 'include',
      headers: sessionHeaders()
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Could not load workforce data');
    replaceArray(workers, Array.isArray(data) ? data.map(normalizeWorker) : []);
  } catch (error) {
    console.error(error);
    notifications.unshift({
      priority: 'Important',
      title: 'Workforce data unavailable',
      message: 'Start the backend server or upload worker data in Admin Dashboard.',
      time: new Date().toLocaleString(),
      read: false
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (window.applySessionToPage) savedSession = applySessionToPage('supervisor.html');
  if (window.bindLogoutButtons) bindLogoutButtons();

  document.getElementById('reportDate').valueAsDate = new Date();
  bindNavigation();
  bindActions();
  loadSupervisorDashboard().finally(() => {
    renderWorkers();
    renderMetrics();
    renderNotifications();
  });
  renderOvertime();
  renderIssues();
  renderNotifications();
  renderReport();
  renderMetrics();
});
