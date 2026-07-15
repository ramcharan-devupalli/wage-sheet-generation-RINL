const workers = [];
const overtime = [];
const issues = [];
const notifications = [];
let leaveRequests = [];
const LOCAL_LEAVE_KEY = "rinl_worker_leave_requests";
const SUPERVISOR_API_BASE = "https://wage-sheet-generation-rinl-production.up.railway.app";

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

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sessionHeaders() {
  const employee = savedSession?.employee || {};
  const employeeId = employee.rinl_id || employee.rinlId || employee.empId || employee.emp_id || "";
  return {
    "Content-Type": "application/json",
    "x-employee-id": employeeId,
    "x-role": employee.role || "Supervisor"
  };
}

function normalizeWorker(row) {
  return {
    id: row.rinl_id || row.rinlId || row.adhar_id || row.worker_id || row.id || "-",
    name: row.worker_name || row.name || "-",
    category: row.worker_skill || row.worker_desig || row.category || "-",
    status: row.status || "Active",
    area: row.job_cd || row.contractor_id || row.area || "Unassigned"
  };
}

function readLocalLeaveRequests() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_LEAVE_KEY) || "[]");
  } catch (error) {
    return [];
  }
}

function writeLocalLeaveRequests(requests) {
  localStorage.setItem(LOCAL_LEAVE_KEY, JSON.stringify(requests));
}

function normalizeLeaveRequest(request) {
  return {
    id: request.id || `${request.workerId || request.worker_id}-${request.submittedAt || Date.now()}`,
    workerId: request.workerId || request.worker_id || request.loginId || "-",
    workerName: request.workerName || request.worker_name || request.name || "Worker",
    category: request.category || request.skill || "-",
    contractorId: request.contractorId || request.contractor_id || "-",
    fromDate: request.fromDate || request.from_date || "-",
    toDate: request.toDate || request.to_date || "-",
    reason: request.reason || "-",
    applyTo: request.applyTo || request.apply_to || "Supervisor",
    status: request.status || "Leave Requested",
    approval: request.approval || request.leaveApprovalStatus || "Pending",
    notification: request.notification || "Leave request sent to supervisor and pending review.",
    requestedDays: request.requestedDays || request.requested_days || 1,
    submittedAt: request.submittedAt || request.submitted_at || new Date().toISOString(),
    reviewedAt: request.reviewedAt || request.reviewed_at || null
  };
}

function mergeLeaveRequests(serverRows = [], localRows = []) {
  const merged = new Map();
  [...serverRows, ...localRows].map(normalizeLeaveRequest).forEach((request) => {
    if (!request.workerId || request.workerId === "-") return;
    merged.set(request.workerId, request);
  });
  leaveRequests = Array.from(merged.values()).sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)));
}

function renderMetrics() {
  const present = workers.filter((worker) => worker.status === 'Present' || worker.status === 'Half Day').length;
  const absent = workers.filter((worker) => worker.status === 'Absent').length;
  const pendingOt = overtime.filter((item) => item.status === 'Pending').length;
  const pendingLeaves = leaveRequests.filter((request) => request.approval === 'Pending').length;
  const unreadAlerts = notifications.filter((item) => !item.read).length + pendingLeaves;
  const criticalAlerts = notifications.filter((item) => item.priority === 'Critical').length;
  setText('totalWorkers', workers.length);
  setText('presentToday', present);
  setText('absentToday', absent);
  setText('overtimeWorkers', overtime.length);
  setText('pendingIssues', issues.length);
  setText('pendingOtCount', `${pendingOt} Pending`);
  setText('totalAlerts', notifications.length + leaveRequests.length);
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
        <div class="attendance-actions">
          <button class="mini-btn" data-row-status="Present" data-worker-id="${worker.id}">Mark Attendance</button>
          <button class="mini-btn" data-row-status="Half Day" data-worker-id="${worker.id}">Half Day</button>
          <button class="mini-btn danger" data-row-status="Absent" data-worker-id="${worker.id}">Absent</button>
        </div>
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

function renderLeaveRequests() {
  const list = document.getElementById('leaveRequestList');
  if (!list) return;

  if (!leaveRequests.length) {
    list.innerHTML = '<div class="empty-state">No worker leave requests available.</div>';
    renderMetrics();
    return;
  }

  list.innerHTML = leaveRequests.map((request) => {
    const pending = request.approval === 'Pending';
    return `
      <div class="notification-card ${pending ? 'unread' : ''}">
        <div>
          <span class="alert-priority ${pending ? 'Important' : request.approval === 'Approved' ? 'Normal' : 'Critical'}">${escapeHtml(request.approval)}</span>
          <strong>${escapeHtml(request.workerName)} leave request</strong>
          <p>${escapeHtml(request.fromDate)} to ${escapeHtml(request.toDate)} (${escapeHtml(request.requestedDays)} day/s)</p>
          <p>${escapeHtml(request.reason)}</p>
          <small>Worker ID: ${escapeHtml(request.workerId)} | Category: ${escapeHtml(request.category)}</small>
        </div>
        <div class="decision-actions">
          <button class="mini-btn" data-leave-decision="approved" data-worker-id="${escapeHtml(request.workerId)}" ${pending ? '' : 'disabled'}>Approve</button>
          <button class="mini-btn danger" data-leave-decision="rejected" data-worker-id="${escapeHtml(request.workerId)}" ${pending ? '' : 'disabled'}>Reject</button>
        </div>
      </div>
    `;
  }).join('');
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
      setText('pageHeading', heading === 'Dashboard' ? 'Supervisor Dashboard' : heading);
    });
  });
}

function bindActions() {
  document.getElementById('workerSearch').addEventListener('input', (event) => renderWorkers(event.target.value));

  document.getElementById('workerBody').addEventListener('click', (event) => {
    const status = event.target.dataset.rowStatus;
    const workerId = event.target.dataset.workerId;
    const selectId = event.target.dataset.select;
    const detailId = event.target.dataset.details;
    if (status && workerId) {
      const worker = workers.find((item) => item.id === workerId);
      if (!worker) return;
      selectedWorkerId = workerId;
      worker.status = status;
      setText('selectedWorkerHint', `${worker.name} marked as ${worker.status}.`);
      renderWorkers(document.getElementById('workerSearch').value);
      renderMetrics();
      return;
    }
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

  document.getElementById('leaveRequestList').addEventListener('click', (event) => {
    const decision = event.target.dataset.leaveDecision;
    const workerId = event.target.dataset.workerId;
    if (!decision || !workerId) return;
    reviewLeaveRequest(workerId, decision);
  });

  document.getElementById('markAlertsRead').addEventListener('click', () => {
    notifications.forEach((item) => {
      item.read = true;
    });
    renderNotifications();
  });
}

async function loadLeaveRequests() {
  let serverRows = [];
  try {
    const response = await fetch(`${SUPERVISOR_API_BASE}/api/rbac/dashboard`, {
      method: 'GET',
      credentials: 'include',
      headers: sessionHeaders()
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Could not load leave requests');
    serverRows = data.leaveRequests || [];
  } catch (error) {
    console.error(error);
  }

  mergeLeaveRequests(serverRows, readLocalLeaveRequests());
  renderLeaveRequests();
}

async function reviewLeaveRequest(workerId, decision) {
  const approved = decision === 'approved';
  const localRows = readLocalLeaveRequests();
  const localIndex = localRows.findIndex((request) => request.workerId === workerId);
  if (localIndex >= 0) {
    localRows[localIndex] = {
      ...localRows[localIndex],
      status: approved ? 'Leave Approved' : 'Leave Rejected',
      approval: approved ? 'Approved' : 'Rejected',
      notification: approved
        ? 'Your leave request was approved by supervisor.'
        : 'Your leave request was rejected by supervisor.',
      reviewedAt: new Date().toISOString()
    };
    writeLocalLeaveRequests(localRows);
  }

  const currentIndex = leaveRequests.findIndex((request) => request.workerId === workerId);
  if (currentIndex >= 0) {
    leaveRequests[currentIndex] = normalizeLeaveRequest({
      ...leaveRequests[currentIndex],
      status: approved ? 'Leave Approved' : 'Leave Rejected',
      approval: approved ? 'Approved' : 'Rejected',
      notification: approved
        ? 'Your leave request was approved by supervisor.'
        : 'Your leave request was rejected by supervisor.',
      reviewedAt: new Date().toISOString()
    });
  }

  renderLeaveRequests();

  try {
    const response = await fetch(`${SUPERVISOR_API_BASE}/api/supervisor/leave-requests/${encodeURIComponent(workerId)}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: sessionHeaders(),
      body: JSON.stringify({ decision })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Could not update leave request');
    const updated = normalizeLeaveRequest(data.leaveRequest);
    const index = leaveRequests.findIndex((request) => request.workerId === workerId);
    if (index >= 0) leaveRequests[index] = updated;
    renderLeaveRequests();
  } catch (error) {
    console.error(error);
  }
}

async function loadSupervisorDashboard() {
  try {
    const response = await fetch(`${SUPERVISOR_API_BASE}/api/rbac/dashboard`, {
      method: 'GET',
      credentials: 'include',
      headers: sessionHeaders()
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Could not load workforce data');
    replaceArray(workers, Array.isArray(data.workers) ? data.workers.map(normalizeWorker) : []);
    mergeLeaveRequests(data.leaveRequests || [], readLocalLeaveRequests());
  } catch (error) {
    console.error(error);
    notifications.unshift({
      priority: 'Important',
      title: 'Workforce data unavailable',
      message: 'Start the backend server or ask Admin to assign workers to this supervisor.',
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
  loadLeaveRequests();
  renderOvertime();
  renderIssues();
  renderNotifications();
  renderLeaveRequests();
  renderReport();
  renderMetrics();
  window.addEventListener('storage', (event) => {
    if (event.key === LOCAL_LEAVE_KEY) loadLeaveRequests();
  });
  window.addEventListener('focus', loadLeaveRequests);
});
