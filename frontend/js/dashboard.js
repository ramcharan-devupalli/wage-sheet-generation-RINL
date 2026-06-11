const roleAliases = [
  { key: 'admin', labels: ['admin', 'hr / admin', 'hr', 'administrator'] },
  { key: 'engineer', labels: ['engineer incharge', 'engineer-incharge', 'engineer', 'incharge'] },
  { key: 'contractor', labels: ['contractor', 'contractor representative'] },
  { key: 'workers', labels: ['worker', 'workers', 'supervisor', 'skilled worker', 'skilled labor', 'semi-skilled worker', 'semi-skilled labor', 'unskilled worker', 'unskilled labor'] }
];

const roleViews = {
  admin: {
    label: 'Admin',
    nav: ['Dashboard', 'Contract Management', 'Workforce Management', 'Payroll Management', 'Reports & Analytics', 'Compliance', 'Settings'],
    subtitle: 'Administrator Intelligence Center',
    intro: 'Monitor every contractor, contract renewal, attendance exception, payroll operation, and access event across the wage system.',
    kpis: [
      ['Total Contracts', 'totalContracts', '5 this month', 'C', '#1967d2'],
      ['Active Contracts', 'activeContracts', 'Contract coverage', 'A', '#16a34a'],
      ['Contractors', 'totalContractors', 'Active contractors', 'R', '#6d42c7'],
      ['Expiring Contracts', 'expiringContracts', 'Need attention', 'E', '#f97316']
    ],
    tableTitle: 'Contracts Requiring Action',
    barTitle: 'Department Contractor Distribution',
    quick: ['Add Contractor', 'New Contract', 'Upload Attendance', 'Process Payroll', 'Generate Report']
  },
  engineer: {
    label: 'Engineer Incharge',
    nav: ['Dashboard', 'Attendance Validation', 'Workforce Deployment', 'Contractor Review', 'Shift Exceptions', 'Reports'],
    subtitle: 'Engineer Incharge Operations',
    intro: 'Review daily attendance, overtime, department deployment, contractor performance, and worker availability for plant-side approvals.',
    kpis: [
      ['Workers Assigned', 'totalWorkers', 'Deployment strength', 'W', '#1967d2'],
      ['Present Today', 'presentWorkers', 'Validated attendance', 'P', '#16a34a'],
      ['Attendance Issues', 'attendanceIssues', 'Needs review', 'I', '#dc2626'],
      ['Overtime Hours', 'overtimeHours', 'Current upload', 'O', '#f97316']
    ],
    tableTitle: 'Attendance Requiring Action',
    barTitle: 'Department Workforce Distribution',
    quick: ['Validate Attendance', 'Review Overtime', 'View Contractors', 'Generate Report']
  },
  contractor: {
    label: 'Contractor',
    nav: ['Dashboard', 'My Workers', 'Attendance Upload', 'Wage Sheets', 'Contract Status', 'Reports'],
    subtitle: 'Contractor Work Center',
    intro: 'Track your workers, attendance submissions, wage readiness, contract status, and pending items for approval.',
    kpis: [
      ['My Workers', 'totalWorkers', 'Crew strength', 'W', '#1967d2'],
      ['Present Crew', 'presentWorkers', 'Today status', 'P', '#16a34a'],
      ['Wage Records', 'wageRecords', 'Payroll rows', 'S', '#6d42c7'],
      ['Pending Items', 'pendingItems', 'Needs action', 'N', '#f97316']
    ],
    tableTitle: 'My Pending Submissions',
    barTitle: 'Worker Category Distribution',
    quick: ['Upload Attendance', 'Add Worker', 'View Wage Sheet', 'Contract Status']
  },
  workers: {
    label: 'Workers',
    nav: ['Dashboard', 'Attendance Status', 'Wage Details', 'Category Info', 'Help Desk'],
    subtitle: 'Worker Self Service',
    intro: 'View attendance status, wage category information, payment readiness, and simple worker-focused updates.',
    kpis: [
      ['Supervisor', 'supervisorCount', 'Category count', 'S', '#1967d2'],
      ['Skilled Labor', 'skilledCount', 'Category count', 'K', '#16a34a'],
      ['Semi-skilled', 'semiSkilledCount', 'Category count', 'M', '#f97316'],
      ['Unskilled', 'unskilledCount', 'Category count', 'U', '#6d42c7']
    ],
    tableTitle: 'Worker Wage And Attendance View',
    barTitle: 'Worker Category Strength',
    quick: ['View Attendance', 'View Wages', 'Download Slip', 'Help Desk']
  }
};

let selectedRole = 'admin';
let dashboardData = {};
let uploadedRows = [];
let activeSearch = '';
let activeSection = 0;
let currentSession = null;

function getSession() {
  try {
    return JSON.parse(localStorage.getItem('rinlSession') || 'null');
  } catch (err) {
    return null;
  }
}

function resolveRole(role) {
  const normalized = String(role || '').trim().toLowerCase();
  const found = roleAliases.find((item) => item.labels.includes(normalized));
  return found?.key || 'admin';
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString('en-IN');
}

function getName(session) {
  return session?.employee?.name || 'User';
}

function getInitials(name) {
  return String(name || 'U').trim().slice(0, 1).toUpperCase() || 'U';
}

function normalizeKey(key) {
  return String(key || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function getValue(row, keys) {
  const normalized = Object.entries(row).reduce((acc, [key, value]) => {
    acc[normalizeKey(key)] = value;
    return acc;
  }, {});

  const found = keys.map(normalizeKey).find((key) => normalized[key] !== undefined && normalized[key] !== '');
  return found ? normalized[found] : '';
}

function toNumber(value) {
  const parsed = Number(String(value || '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function daysUntil(value) {
  const date = parseDate(value);
  if (!date) return null;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return Math.round((date - start) / 86400000);
}

function parseCsv(text) {
  const rows = [];
  let field = '';
  let row = [];
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && quoted && next === '"') {
      field += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(field);
      if (row.some((cell) => cell.trim() !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  row.push(field);
  if (row.some((cell) => cell.trim() !== '')) rows.push(row);
  if (rows.length < 2) return [];

  const headers = rows[0].map((header) => header.trim());
  return rows.slice(1).map((cells) => headers.reduce((record, header, index) => {
    record[header || `Column ${index + 1}`] = (cells[index] || '').trim();
    return record;
  }, {}));
}

async function readCsvFiles(files) {
  const reads = Array.from(files || []).map((file) => file.text().then((text) => ({
    name: file.name,
    rows: parseCsv(text)
  })));
  return Promise.all(reads);
}

function classifyRow(row) {
  const keys = Object.keys(row).map(normalizeKey);
  const has = (...names) => names.some((name) => keys.includes(normalizeKey(name)));

  if (has('worker_id', 'worker', 'category', 'daily_wage')) return 'worker';
  if (has('contractor_id', 'contractor', 'company', 'expiry_date', 'contract_end_date')) return 'contract';
  if (has('attendance', 'present', 'absent', 'overtime_hrs', 'status')) return 'attendance';
  if (has('gross_wage', 'net_wage', 'pf_deduction', 'esi_deduction', 'wage')) return 'wage';
  return 'general';
}

function buildCsvData(rows) {
  const grouped = { worker: [], contract: [], attendance: [], wage: [], general: [] };
  rows.forEach((row) => grouped[classifyRow(row)].push(row));
  return grouped;
}

function groupCount(rows, keys, fallback = 'Unassigned') {
  return rows.reduce((acc, row) => {
    const label = getValue(row, keys) || fallback;
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {});
}

function createFallbackRows() {
  return {
    worker: [
      { name: 'A. Kumar', category: 'Skilled', department: 'Mechanical', status: 'Present', contractor: 'ABC Engineering', daily_wage: '780' },
      { name: 'P. Rao', category: 'Semi-skilled', department: 'Electrical', status: 'Present', contractor: 'XYZ Services', daily_wage: '680' },
      { name: 'K. Devi', category: 'Supervisor', department: 'Safety', status: 'On Leave', contractor: 'Prime Works', daily_wage: '950' },
      { name: 'M. Ali', category: 'Unskilled', department: 'Production', status: 'Absent', contractor: 'ABC Engineering', daily_wage: '560' }
    ],
    contract: [
      { contractor: 'ABC Engineering', company: 'ABC Engineering', expiry_date: '2026-07-15', status: 'Active', department: 'Mechanical' },
      { contractor: 'XYZ Services', company: 'XYZ Services', expiry_date: '2026-08-20', status: 'Active', department: 'Electrical' },
      { contractor: 'Prime Works', company: 'Prime Works', expiry_date: '2026-06-02', status: 'Expired', department: 'Civil' }
    ],
    attendance: [
      { worker: 'A. Kumar', status: 'Present', overtime_hrs: '2', department: 'Mechanical' },
      { worker: 'P. Rao', status: 'Present', overtime_hrs: '1', department: 'Electrical' },
      { worker: 'K. Devi', status: 'On Leave', overtime_hrs: '0', department: 'Safety' },
      { worker: 'M. Ali', status: 'Absent', overtime_hrs: '0', department: 'Production' }
    ],
    wage: [
      { worker: 'A. Kumar', net_wage: '18720', status: 'Ready' },
      { worker: 'P. Rao', net_wage: '16320', status: 'Ready' },
      { worker: 'M. Ali', net_wage: '11200', status: 'Pending' }
    ],
    general: []
  };
}

function getSourceRows() {
  const csv = buildCsvData(uploadedRows);
  const fallback = createFallbackRows();
  return {
    worker: csv.worker.length ? csv.worker : fallback.worker,
    contract: csv.contract.length ? csv.contract : fallback.contract,
    attendance: csv.attendance.length ? csv.attendance : fallback.attendance,
    wage: csv.wage.length ? csv.wage : fallback.wage,
    general: csv.general
  };
}

function buildMetrics() {
  const rows = getSourceRows();
  const byCategory = groupCount(rows.worker, ['category', 'worker_category']);
  const attendanceRows = rows.attendance.length ? rows.attendance : rows.worker;
  const presentWorkers = attendanceRows.filter((row) => /present|active/i.test(getValue(row, ['status', 'attendance_status']))).length;
  const absentWorkers = attendanceRows.filter((row) => /absent/i.test(getValue(row, ['status', 'attendance_status']))).length;
  const leaveWorkers = attendanceRows.filter((row) => /leave/i.test(getValue(row, ['status', 'attendance_status']))).length;
  const overtimeHours = attendanceRows.reduce((sum, row) => sum + toNumber(getValue(row, ['overtime_hrs', 'overtime', 'ot_hours'])), 0);
  const contractors = new Set(rows.contract.map((row) => getValue(row, ['contractor', 'contractor_name', 'company', 'name'])).filter(Boolean));
  rows.worker.forEach((row) => {
    const contractor = getValue(row, ['contractor', 'contractor_name', 'company']);
    if (contractor) contractors.add(contractor);
  });

  const expiryCounts = rows.contract.reduce((acc, row) => {
    const status = String(getValue(row, ['status', 'contract_status'])).toLowerCase();
    const days = daysUntil(getValue(row, ['expiry_date', 'contract_end_date', 'end_date', 'valid_to']));
    if (status.includes('expired') || (days !== null && days < 0)) acc.expired += 1;
    else if (days !== null && days <= 90) acc.threeMonths += 1;
    else if (days !== null && days <= 180) acc.sixMonths += 1;
    else acc.active += 1;
    return acc;
  }, { expired: 0, threeMonths: 0, sixMonths: 0, active: 0 });

  const metrics = {
    rows,
    totalContracts: rows.contract.length || Number(dashboardData.totalContractors || 0),
    activeContracts: Math.max(0, rows.contract.length - expiryCounts.expired),
    totalContractors: contractors.size || Number(dashboardData.totalContractors || 0),
    totalEmployees: Number(dashboardData.totalEmployees || rows.wage.length || 0),
    activeCount: Number(dashboardData.activeCount || presentWorkers || 0),
    todayLoginCount: Number(dashboardData.todayLoginCount || 0),
    expiringContracts: expiryCounts.expired + expiryCounts.threeMonths,
    totalWorkers: rows.worker.length || Number(dashboardData.totalWorkers || 0),
    presentWorkers,
    absentWorkers,
    leaveWorkers,
    overtimeHours,
    attendanceIssues: absentWorkers + leaveWorkers,
    wageRecords: rows.wage.length,
    pendingItems: expiryCounts.expired + expiryCounts.threeMonths + absentWorkers + leaveWorkers,
    supervisorCount: Object.entries(byCategory).filter(([key]) => /supervisor/i.test(key)).reduce((sum, [, value]) => sum + value, 0),
    skilledCount: Object.entries(byCategory).filter(([key]) => /skilled/i.test(key) && !/semi/i.test(key)).reduce((sum, [, value]) => sum + value, 0),
    semiSkilledCount: Object.entries(byCategory).filter(([key]) => /semi/i.test(key)).reduce((sum, [, value]) => sum + value, 0),
    unskilledCount: Object.entries(byCategory).filter(([key]) => /unskilled/i.test(key)).reduce((sum, [, value]) => sum + value, 0),
    expiryCounts,
    byCategory,
    byDepartment: groupCount([...rows.worker, ...rows.contract], ['department', 'section', 'unit'], 'General')
  };

  if (!uploadedRows.length && dashboardData.success) {
    const backendCategories = (dashboardData.byCategory || []).reduce((acc, item) => {
      acc[item.category || 'Unassigned'] = Number(item.count || 0);
      return acc;
    }, {});

    metrics.totalWorkers = Number(dashboardData.totalWorkers || metrics.totalWorkers);
    metrics.totalContractors = Number(dashboardData.totalContractors || metrics.totalContractors);
    metrics.totalContracts = Number(dashboardData.totalContractors || metrics.totalContracts);
    metrics.activeContracts = Math.max(0, metrics.totalContracts - metrics.expiryCounts.expired);
    metrics.presentWorkers = Number(dashboardData.activeCount || metrics.presentWorkers);
    metrics.wageRecords = Number(dashboardData.totalEmployees || metrics.wageRecords);
    if (Object.keys(backendCategories).length) {
      metrics.byCategory = backendCategories;
      metrics.supervisorCount = Object.entries(backendCategories).filter(([key]) => /supervisor/i.test(key)).reduce((sum, [, value]) => sum + value, 0);
      metrics.skilledCount = Object.entries(backendCategories).filter(([key]) => /skilled/i.test(key) && !/semi/i.test(key)).reduce((sum, [, value]) => sum + value, 0);
      metrics.semiSkilledCount = Object.entries(backendCategories).filter(([key]) => /semi/i.test(key)).reduce((sum, [, value]) => sum + value, 0);
      metrics.unskilledCount = Object.entries(backendCategories).filter(([key]) => /unskilled/i.test(key)).reduce((sum, [, value]) => sum + value, 0);
    }
  }

  return metrics;
}

function makeKpis(type) {
  const sets = {
    contracts: [
      ['Total Contracts', 'totalContracts', 'All contract rows', 'C', '#2563eb'],
      ['Active Contracts', 'activeContracts', 'Currently valid', 'A', '#16a34a'],
      ['Expiring Soon', 'expiringContracts', 'Renewal attention', 'E', '#f97316'],
      ['Contractors', 'totalContractors', 'Vendor coverage', 'R', '#6d42c7']
    ],
    workforce: [
      ['Total Workers', 'totalWorkers', 'Worker strength', 'W', '#2563eb'],
      ['Present', 'presentWorkers', 'Attendance marked', 'P', '#16a34a'],
      ['Absent', 'absentWorkers', 'Needs follow-up', 'A', '#dc2626'],
      ['On Leave', 'leaveWorkers', 'Approved leave', 'L', '#eab308']
    ],
    payroll: [
      ['Wage Records', 'wageRecords', 'Payroll rows', 'W', '#2563eb'],
      ['Workers', 'totalWorkers', 'Eligible workers', 'E', '#16a34a'],
      ['Pending Items', 'pendingItems', 'Before processing', 'P', '#f97316'],
      ['Overtime Hours', 'overtimeHours', 'Extra hours', 'O', '#6d42c7']
    ],
    reports: [
      ['Workers', 'totalWorkers', 'Report base', 'W', '#2563eb'],
      ['Contractors', 'totalContractors', 'Vendor base', 'C', '#6d42c7'],
      ['Today Logins', 'todayLoginCount', 'System usage', 'L', '#16a34a'],
      ['Action Items', 'pendingItems', 'Open workload', 'A', '#f97316']
    ],
    compliance: [
      ['Expiring', 'expiringContracts', 'Contract risk', 'E', '#f97316'],
      ['Attendance Issues', 'attendanceIssues', 'Worker risk', 'I', '#dc2626'],
      ['Active Contracts', 'activeContracts', 'Compliant base', 'A', '#16a34a'],
      ['Pending Items', 'pendingItems', 'Needs closure', 'P', '#6d42c7']
    ],
    settings: [
      ['Employees', 'totalEmployees', 'System users', 'E', '#2563eb'],
      ['Active Users', 'activeCount', 'Current sessions', 'A', '#16a34a'],
      ['Today Logins', 'todayLoginCount', 'Login audit', 'L', '#f97316'],
      ['Contractors', 'totalContractors', 'Managed vendors', 'C', '#6d42c7']
    ],
    workerCategories: [
      ['Supervisor', 'supervisorCount', 'Category count', 'S', '#2563eb'],
      ['Skilled Labor', 'skilledCount', 'Category count', 'K', '#16a34a'],
      ['Semi-skilled', 'semiSkilledCount', 'Category count', 'M', '#f97316'],
      ['Unskilled', 'unskilledCount', 'Category count', 'U', '#6d42c7']
    ]
  };

  return sets[type] || sets.reports;
}

function getSectionConfig() {
  const view = roleViews[selectedRole];
  const label = view.nav[activeSection] || view.nav[0];
  const normalized = label.toLowerCase();
  const baseTableMode = selectedRole === 'admin' ? 'contracts' : selectedRole === 'engineer' ? 'attendance' : 'workers';
  const base = {
    label,
    subtitle: `${view.label} - ${label}`,
    intro: view.intro,
    kpis: view.kpis,
    tableTitle: view.tableTitle,
    tableMode: baseTableMode,
    barTitle: view.barTitle,
    barMode: selectedRole === 'workers' || selectedRole === 'contractor' ? 'category' : 'department',
    quick: view.quick
  };

  if (normalized.includes('contract')) {
    return {
      ...base,
      intro: 'Review contractor details, active contracts, expiry status, renewal priority, and contract-side action items.',
      kpis: makeKpis('contracts'),
      tableTitle: 'Contract Renewal And Status',
      tableMode: 'contracts',
      barTitle: 'Contract Distribution By Department',
      barMode: 'department',
      quick: ['Add Contractor', 'New Contract', 'Renew Contract', 'Generate Report']
    };
  }

  if (normalized.includes('workforce') || normalized.includes('worker') || normalized.includes('category')) {
    return {
      ...base,
      intro: 'View worker strength, category distribution, contractor assignment, and workforce status in one focused place.',
      kpis: selectedRole === 'workers' || normalized.includes('category') ? makeKpis('workerCategories') : makeKpis('workforce'),
      tableTitle: 'Worker Information',
      tableMode: 'workers',
      barTitle: 'Worker Category Distribution',
      barMode: 'category',
      quick: ['Add Worker', 'View Workers', 'Upload Attendance', 'Generate Report']
    };
  }

  if (normalized.includes('attendance') || normalized.includes('shift')) {
    return {
      ...base,
      intro: 'Check present, absent, leave, and overtime information for quick attendance validation.',
      kpis: makeKpis('workforce'),
      tableTitle: 'Attendance Requiring Review',
      tableMode: 'attendance',
      barTitle: 'Attendance By Department',
      barMode: 'department',
      quick: ['Validate Attendance', 'Upload Attendance', 'Review Overtime', 'Generate Report']
    };
  }

  if (normalized.includes('payroll') || normalized.includes('wage')) {
    return {
      ...base,
      intro: 'Track wage-sheet readiness, payroll records, overtime impact, and pending wage actions.',
      kpis: makeKpis('payroll'),
      tableTitle: 'Wage Sheet Status',
      tableMode: 'wages',
      barTitle: 'Wage Records By Category',
      barMode: 'category',
      quick: ['Process Payroll', 'View Wage Sheet', 'Download Slip', 'Generate Report']
    };
  }

  if (normalized.includes('report') || normalized.includes('analytic')) {
    return {
      ...base,
      intro: 'Use this view to scan high-level totals, report data, recent activity, and export-ready information.',
      kpis: makeKpis('reports'),
      tableTitle: 'Report Data Preview',
      tableMode: 'summary',
      barTitle: 'Operational Distribution',
      quick: ['Generate Report', 'Download Report', 'Upload CSV', 'View Analytics']
    };
  }

  if (normalized.includes('compliance')) {
    return {
      ...base,
      intro: 'Focus on expiry risk, attendance issues, pending approvals, and items that need compliance closure.',
      kpis: makeKpis('compliance'),
      tableTitle: 'Compliance Attention Items',
      tableMode: 'compliance',
      barTitle: 'Risk Distribution',
      quick: ['Review Expiry', 'Audit Attendance', 'Close Pending', 'Generate Report']
    };
  }

  if (normalized.includes('setting') || normalized.includes('help')) {
    return {
      ...base,
      intro: 'Review account, access, help desk, and system activity details for the selected role.',
      kpis: makeKpis(selectedRole === 'workers' ? 'workerCategories' : 'settings'),
      tableTitle: selectedRole === 'workers' ? 'Help Desk And Worker Details' : 'System Access Overview',
      tableMode: selectedRole === 'workers' ? 'workers' : 'settings',
      barTitle: selectedRole === 'workers' ? 'Worker Category Strength' : 'Access And User Distribution',
      quick: selectedRole === 'workers' ? ['View Attendance', 'View Wages', 'Help Desk', 'Download Slip'] : ['Manage Users', 'Audit Logins', 'Role Settings', 'Generate Report']
    };
  }

  return base;
}

function setText(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value;
}

function renderProfile(session) {
  const name = getName(session);
  const view = roleViews[selectedRole];
  setText('sidebarName', name);
  setText('topName', name);
  setText('sidebarRole', view.label);
  setText('topRole', view.label);
  setText('sidebarAvatar', getInitials(name));
  setText('topAvatar', getInitials(name));
}

function renderNavigation() {
  const nav = document.getElementById('roleNav');
  const view = roleViews[selectedRole];
  if (!nav) return;

  nav.innerHTML = view.nav.map((label, index) => `
    <button class="nav-item ${index === activeSection ? 'active' : ''}" type="button" data-section="${index}">
      <span class="nav-icon">${label.slice(0, 1)}</span>
      ${label}
    </button>
  `).join('');

  nav.querySelectorAll('.nav-item').forEach((item) => {
    item.addEventListener('click', () => {
      activeSection = Number(item.dataset.section || 0);
      renderDashboard(currentSession);
    });
  });
}

function renderHero(session) {
  const section = getSectionConfig();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';
  setText('dashboardTitle', `${greeting}, ${getName(session)}`);
  setText('dashboardSubtitle', section.subtitle);
  setText('dashboardIntro', section.intro);
}

function renderKpis(metrics, section) {
  const target = document.getElementById('kpiGrid');
  if (!target) return;

  target.innerHTML = section.kpis.map(([label, key, hint, icon, color]) => `
    <article class="kpi-card" style="--kpi-color:${color}">
      <span class="kpi-icon" style="background:${color}">${icon}</span>
      <div>
        <span>${label}</span>
        <strong>${formatNumber(metrics[key])}</strong>
        <small>${hint}</small>
      </div>
    </article>
  `).join('');
}

function donutStyle(items) {
  const total = items.reduce((sum, item) => sum + item.value, 0) || 1;
  let cursor = 0;
  const stops = items.map((item) => {
    const start = cursor;
    cursor += (item.value / total) * 100;
    return `${item.color} ${start}% ${cursor}%`;
  });
  return `conic-gradient(${stops.join(', ')})`;
}

function renderLegend(targetId, items) {
  const target = document.getElementById(targetId);
  if (!target) return;
  target.innerHTML = items.map((item) => `
    <div class="legend-item">
      <span class="legend-dot" style="background:${item.color}"></span>
      <span>${item.label}</span>
      <strong>${formatNumber(item.value)}</strong>
    </div>
  `).join('');
}

function renderCharts(metrics) {
  const expiryItems = [
    { label: 'Expired', value: metrics.expiryCounts.expired, color: '#dc2626' },
    { label: '< 3 Months', value: metrics.expiryCounts.threeMonths, color: '#f97316' },
    { label: '< 6 Months', value: metrics.expiryCounts.sixMonths, color: '#f4b400' },
    { label: 'Active', value: metrics.expiryCounts.active, color: '#16a34a' }
  ];
  const workforceItems = [
    { label: 'Present', value: metrics.presentWorkers, color: '#1967d2' },
    { label: 'Absent', value: metrics.absentWorkers, color: '#f97316' },
    { label: 'On Leave', value: metrics.leaveWorkers, color: '#f4b400' },
    { label: 'Overtime Hrs', value: metrics.overtimeHours, color: '#16a34a' }
  ];
  const expiryDonut = document.getElementById('expiryDonut');
  const workforceDonut = document.getElementById('workforceDonut');

  if (expiryDonut) expiryDonut.style.background = donutStyle(expiryItems);
  if (workforceDonut) workforceDonut.style.background = donutStyle(workforceItems);
  renderLegend('expiryLegend', expiryItems);
  renderLegend('workforceLegend', workforceItems);
  setText('expiryTotal', `Total Contracts: ${formatNumber(metrics.totalContracts)}`);
  setText('workforceTotal', `Total Workers: ${formatNumber(metrics.totalWorkers)}`);
}

function calculateWageTotal(metrics) {
  const wageTotal = metrics.rows.wage.reduce((sum, row) => {
    return sum + toNumber(getValue(row, ['net_wage', 'gross_wage', 'wage', 'amount']));
  }, 0);

  if (wageTotal) return wageTotal;

  return metrics.rows.worker.reduce((sum, row) => {
    const dailyWage = toNumber(getValue(row, ['daily_wage', 'wage', 'rate']));
    return sum + (dailyWage * 26);
  }, 0);
}

function renderWageStudio(metrics, section) {
  const wageTotal = calculateWageTotal(metrics);
  const rowCount = metrics.rows.wage.length || metrics.rows.worker.length || 0;
  const text = document.getElementById('wageStudioText');

  setText('wageSheetTotal', `Rs. ${formatNumber(wageTotal)}`);
  setText('wageSheetCount', `${formatNumber(rowCount)} wage rows ready`);

  if (text) {
    text.textContent = `${section.label} view is using ${uploadedRows.length ? 'uploaded CSV rows' : 'database/sample rows'} to prepare attendance, daily wage, PF/ESI, and net-pay values.`;
  }
}

function getActionRows(metrics, mode) {
  if (mode === 'workers') {
    return metrics.rows.worker.slice(0, 5).map((row) => ({
      first: getValue(row, ['name', 'worker', 'worker_name']) || 'Worker',
      second: getValue(row, ['category', 'worker_category']) || '-',
      status: getValue(row, ['status', 'attendance_status']) || 'Active',
      action: 'View'
    }));
  }

  if (mode === 'attendance') {
    return (metrics.rows.attendance.length ? metrics.rows.attendance : metrics.rows.worker).slice(0, 5).map((row) => ({
      first: getValue(row, ['worker', 'worker_name', 'name']) || 'Worker',
      second: getValue(row, ['department', 'section', 'unit']) || 'General',
      status: getValue(row, ['status', 'attendance_status']) || 'Pending',
      action: 'Review'
    }));
  }

  if (mode === 'wages') {
    return metrics.rows.wage.slice(0, 5).map((row) => ({
      first: getValue(row, ['worker', 'worker_name', 'name']) || 'Worker',
      second: getValue(row, ['net_wage', 'gross_wage', 'wage']) || '-',
      status: getValue(row, ['status', 'wage_status']) || 'Ready',
      action: 'View'
    }));
  }

  if (mode === 'settings') {
    const rows = dashboardData.recentLogins || [];
    return rows.slice(0, 5).map((row) => ({
      first: row.name || row.emp_id || 'User',
      second: row.role || '-',
      status: row.action || 'LOGIN',
      action: 'Audit'
    }));
  }

  if (mode === 'summary') {
    return [
      { first: 'Workers', second: formatNumber(metrics.totalWorkers), status: 'Ready', action: 'Export' },
      { first: 'Contractors', second: formatNumber(metrics.totalContractors), status: 'Ready', action: 'Export' },
      { first: 'Pending Items', second: formatNumber(metrics.pendingItems), status: metrics.pendingItems ? 'Review' : 'Clear', action: 'Open' },
      { first: 'Today Logins', second: formatNumber(metrics.todayLoginCount), status: 'Tracked', action: 'Audit' }
    ];
  }

  if (mode === 'compliance') {
    return [
      { first: 'Expiring Contracts', second: formatNumber(metrics.expiringContracts), status: metrics.expiringContracts ? 'Review' : 'Clear', action: 'Open' },
      { first: 'Attendance Issues', second: formatNumber(metrics.attendanceIssues), status: metrics.attendanceIssues ? 'Review' : 'Clear', action: 'Open' },
      { first: 'Pending Items', second: formatNumber(metrics.pendingItems), status: metrics.pendingItems ? 'Pending' : 'Clear', action: 'Close' },
      { first: 'Active Contracts', second: formatNumber(metrics.activeContracts), status: 'Active', action: 'View' }
    ];
  }

  return metrics.rows.contract.slice(0, 5).map((row) => {
    const expiry = getValue(row, ['expiry_date', 'contract_end_date', 'end_date', 'valid_to']) || '-';
    const days = daysUntil(expiry);
    return {
      first: getValue(row, ['contractor', 'contractor_name', 'company', 'name']) || 'Contractor',
      second: expiry,
      status: days !== null && days < 0 ? 'Expired' : days !== null && days <= 90 ? 'Renew Soon' : 'Active',
      action: days !== null && days < 0 ? 'Review' : 'Renew'
    };
  });
}

function statusClass(status) {
  if (/expired|absent|pending|issue/i.test(status)) return 'status-danger';
  if (/soon|leave|review|submitted/i.test(status)) return 'status-warning';
  return 'status-good';
}

function renderTable(metrics, section) {
  const head = document.getElementById('actionTableHead');
  const body = document.getElementById('actionTableBody');
  if (!head || !body) return;

  const mode = section.tableMode;
  const firstHead = mode === 'contracts' ? 'Contractor' : mode === 'workers' || mode === 'attendance' || mode === 'wages' ? 'Worker' : 'Item';
  const secondHead = mode === 'contracts' ? 'Expiry Date' : mode === 'attendance' ? 'Department' : mode === 'wages' ? 'Amount' : mode === 'settings' ? 'Role' : 'Details';
  const rows = getActionRows(metrics, mode).filter((row) => JSON.stringify(row).toLowerCase().includes(activeSearch));

  setText('actionTableTitle', section.tableTitle);
  head.innerHTML = `<tr><th>${firstHead}</th><th>${secondHead}</th><th>Status</th><th>Action</th></tr>`;
  body.innerHTML = rows.map((row) => `
    <tr>
      <td>${row.first}</td>
      <td>${row.second}</td>
      <td><span class="status-pill ${statusClass(row.status)}">${row.status}</span></td>
      <td><button class="mini-action" type="button">${row.action}</button></td>
    </tr>
  `).join('') || '<tr><td colspan="4">No matching rows.</td></tr>';
}

function renderBarChart(metrics, section) {
  const target = document.getElementById('barChart');
  if (!target) return;

  const source = section.barMode === 'category' ? metrics.byCategory : metrics.byDepartment;
  const entries = Object.entries(source).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const max = Math.max(...entries.map(([, value]) => value), 1);
  const colors = ['#1967d2', '#f97316', '#16a34a', '#6d42c7', '#0891b2', '#f4b400'];

  setText('barChartTitle', section.barTitle);
  target.innerHTML = entries.map(([label, value], index) => `
    <div class="bar-row">
      <span class="bar-name">${label}</span>
      <span class="bar-track"><span class="bar-fill" style="--bar-color:${colors[index % colors.length]};width:${Math.max(5, (value / max) * 100)}%"></span></span>
      <span class="bar-value-inline">${formatNumber(value)}</span>
    </div>
  `).join('') || '<p class="panel-foot">Upload CSV rows to build this chart.</p>';
}

function renderActivities(metrics) {
  const target = document.getElementById('recentActivities');
  if (!target) return;

  const fromLogs = (dashboardData.recentLogins || []).map((log) => ({
    title: `${log.action || 'LOGIN'} - ${log.name || log.emp_id || 'User'}`,
    time: log.timestamp ? new Date(log.timestamp).toLocaleString() : 'Recent'
  }));
  const generated = [
    { title: `${formatNumber(metrics.totalContracts)} contracts loaded`, time: 'CSV / Database' },
    { title: `${formatNumber(metrics.totalWorkers)} workers available`, time: 'Current view' },
    { title: `${formatNumber(metrics.pendingItems)} action items calculated`, time: roleViews[selectedRole].label }
  ];
  const items = (fromLogs.length ? fromLogs : generated).filter((item) => item.title.toLowerCase().includes(activeSearch)).slice(0, 5);

  target.innerHTML = items.map((item, index) => `
    <div class="activity-item">
      <span class="activity-badge">${index + 1}</span>
      <p>${item.title}</p>
      <small>${item.time}</small>
    </div>
  `).join('') || '<p class="panel-foot">No matching activities.</p>';
}

function renderQuickActions(section) {
  const target = document.getElementById('quickActions');
  const colors = ['#1967d2', '#f97316', '#16a34a', '#6d42c7', '#0891b2'];
  if (!target) return;

  target.innerHTML = section.quick.map((label, index) => `
    <button class="quick-btn" type="button">
      <span style="background:${colors[index % colors.length]}">${label.slice(0, 1)}</span>
      ${label}
    </button>
  `).join('');
}

function renderDashboard(session) {
  const metrics = buildMetrics();
  const section = getSectionConfig();
  localStorage.setItem('rinlSelectedRole', roleViews[selectedRole].label);
  renderProfile(session);
  renderNavigation();
  renderHero(session);
  renderKpis(metrics, section);
  renderCharts(metrics);
  renderWageStudio(metrics, section);
  renderTable(metrics, section);
  renderBarChart(metrics, section);
  renderActivities(metrics);
  renderQuickActions(section);
}

async function logout() {
  const session = getSession();
  if (session) {
    await apiRequest('/logout', {
      method: 'POST',
      body: JSON.stringify({
        sessionId: session.sessionId,
        empId: session.employee?.empId,
        role: session.employee?.role
      })
    });
  }
  localStorage.removeItem('rinlSession');
  localStorage.removeItem('rinlSelectedRole');
  window.location.href = 'flashcards.html';
}

function igniteVisualization() {
  const status = document.getElementById('csvStatus');
  if (status) status.textContent = `Report generated for ${roleViews[selectedRole].label} view with ${uploadedRows.length || 'database/sample'} rows.`;
}

function generateWageSheet() {
  const root = document.getElementById('dashboardRoot');
  const status = document.getElementById('csvStatus');
  const metrics = buildMetrics();
  root?.classList.remove('wage-generating');
  window.requestAnimationFrame(() => {
    root?.classList.add('wage-generating');
    if (status) {
      status.textContent = `Wage sheet generated for ${formatNumber(metrics.rows.wage.length || metrics.rows.worker.length)} rows. Estimated total: Rs. ${formatNumber(calculateWageTotal(metrics))}.`;
    }
    setTimeout(() => root?.classList.remove('wage-generating'), 1200);
  });
}

function bindEvents(session) {
  document.getElementById('logoutBtn')?.addEventListener('click', logout);
  document.getElementById('generateVizBtn')?.addEventListener('click', igniteVisualization);
  document.getElementById('generateWageBtn')?.addEventListener('click', generateWageSheet);
  document.getElementById('dashboardSearch')?.addEventListener('input', (event) => {
    activeSearch = event.target.value.trim().toLowerCase();
    renderDashboard(session);
  });
  document.getElementById('csvUpload')?.addEventListener('change', async (event) => {
    const files = await readCsvFiles(event.target.files);
    uploadedRows = files.flatMap((file) => file.rows);
    const status = document.getElementById('csvStatus');
    if (status) {
      const fileNames = files.map((file) => file.name).join(', ');
      status.textContent = `Loaded ${formatNumber(uploadedRows.length)} CSV rows from ${fileNames}. Dashboard values updated for ${roleViews[selectedRole].label}.`;
    }
    renderDashboard(session);
  });
}

(async function loadDashboard() {
  const session = getSession();
  if (!session) {
    window.location.href = 'flashcards.html';
    return;
  }

  selectedRole = resolveRole(localStorage.getItem('rinlSelectedRole') || session.employee?.role);
  currentSession = session;
  bindEvents(session);

  try {
    const response = await apiRequest('/dashboard-stats');
    dashboardData = response.success ? response : {};
  } catch (error) {
    dashboardData = {};
  }

  renderDashboard(session);
})();
