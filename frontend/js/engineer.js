const contractors = [];
const categoryData = [];
const dailyAttendance = [];
const monthlyAttendance = [];
const attendanceItems = [];
const wageSheets = [];
const overtimeItems = [];
const complianceItems = [];
const progressItems = [];
const alerts = [];

if (typeof applySessionToPage === "function") applySessionToPage("engineerincharge.html");
if (typeof bindLogoutButtons === "function") bindLogoutButtons();

let activeSection = "overview";
let activeRemarksContractor = "";
let uploadedRows = [];

const formatMoney = (value) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);

function getStatusClass(status) {
  const normalized = String(status).toLowerCase();
  if (normalized.includes("verified") || normalized.includes("approved") || normalized.includes("compliant") || normalized.includes("matched")) return "good";
  if (normalized.includes("mismatch") || normalized.includes("issue") || normalized.includes("violation") || normalized.includes("flagged") || normalized.includes("reject")) return "bad";
  return "pending";
}

function badge(status) {
  return `<span class="badge ${getStatusClass(status)}">${status}</span>`;
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 2400);
}

function emptyState(message = "Upload a CSV, XLS, or XLSX file to load data.") {
  return `<div class="empty-state">${message}</div>`;
}

function emptyTable(colspan, message = "No data loaded. Upload a file to populate this table.") {
  return `<tr><td colspan="${colspan}">${message}</td></tr>`;
}

function addAlert(title, text, tone = "#176b87") {
  alerts.unshift({ title, text, tone });
  renderAlerts();
}

function switchSection(target) {
  activeSection = target;
  document.querySelectorAll(".section").forEach((section) => section.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.target === target));
  document.getElementById(target)?.classList.add("active");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function actionButton(label, action, contractor, extraClass = "") {
  return `<button class="mini-btn ${extraClass}" data-action="${action}" data-contractor="${contractor}">${label}</button>`;
}

function downloadCsv(filename, columns, rows) {
  const escapeCsv = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const csv = [
    columns.join(","),
    ...rows.map((row) => columns.map((column) => escapeCsv(row[column])).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function normalizeKey(key) {
  return String(key || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeRow(row) {
  return Object.entries(row).reduce((acc, [key, value]) => {
    acc[normalizeKey(key)] = value == null ? "" : String(value).trim();
    return acc;
  }, {});
}

function pick(row, keys, fallback = "") {
  for (const key of keys) {
    const value = row[normalizeKey(key)];
    if (value !== undefined && value !== "") return value;
  }
  return fallback;
}

function numeric(row, keys, fallback = 0) {
  const value = pick(row, keys, "");
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseCsv(text) {
  const rows = [];
  let field = "";
  let current = [];
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && quoted && next === '"') {
      field += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      current.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      current.push(field);
      if (current.some((item) => String(item).trim())) rows.push(current);
      current = [];
      field = "";
    } else {
      field += char;
    }
  }

  current.push(field);
  if (current.some((item) => String(item).trim())) rows.push(current);

  const headers = (rows.shift() || []).map(normalizeKey);
  return rows.map((cells) => headers.reduce((acc, header, index) => {
    acc[header || `column_${index + 1}`] = String(cells[index] || "").trim();
    return acc;
  }, {}));
}

function monthLabel(value) {
  if (!value) return "Uploaded Month";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("en-IN", { month: "long", year: "numeric" });
}

function replaceArray(target, items) {
  target.splice(0, target.length, ...items);
}

function extractDashboardData(rows) {
  const contractorMap = new Map();
  const categoryMap = new Map();
  const dateMap = new Map();
  const monthMap = new Map();
  const wageMap = new Map();
  const overtimeMap = new Map();
  const complianceMap = new Map();
  const progressMap = new Map();

  rows.forEach((row, index) => {
    const contractor = pick(row, ["contractor", "contractor_name", "agency", "vendor"], "Unknown Contractor");
    const department = pick(row, ["department", "dept", "section"], "General");
    const worker = pick(row, ["worker", "worker_name", "name", "employee_name"], `Worker ${index + 1}`);
    const skill = pick(row, ["category", "skill", "worker_skill", "designation"], "Unskilled");
    const statusText = pick(row, ["status", "attendance_status", "present_absent"], "");
    const presentDays = numeric(row, ["present", "present_days", "days_present", "days", "work_days"], statusText.toLowerCase().includes("present") ? 1 : 0);
    const absentDays = numeric(row, ["absent", "absent_days"], statusText.toLowerCase().includes("absent") ? 1 : 0);
    const overtimeHours = numeric(row, ["overtime", "ot", "ot_hours", "overtime_hours"], 0);
    const amount = numeric(row, ["net_wage", "net", "wage_amount", "amount", "gross_wage", "gross"], 0);
    const dateValue = pick(row, ["date", "attendance_date", "work_date"], "");
    const month = pick(row, ["month", "wage_month", "period"], monthLabel(dateValue));
    const compliance = pick(row, ["compliance", "compliance_status", "pf_status", "esi_status"], "Pending");
    const workOrder = pick(row, ["work_order", "workorder", "package", "activity"], "");
    const progress = numeric(row, ["progress", "progress_percent", "completion"], 0);

    const contractorRecord = contractorMap.get(contractor) || {
      name: contractor,
      workers: 0,
      present: 0,
      absent: 0,
      overtime: 0,
      status: "Uploaded",
      department,
    };
    contractorRecord.workers += 1;
    contractorRecord.present += presentDays > 0 ? 1 : 0;
    contractorRecord.absent += absentDays > 0 || presentDays === 0 ? 1 : 0;
    contractorRecord.overtime += overtimeHours > 0 ? 1 : 0;
    contractorRecord.department = department;
    contractorMap.set(contractor, contractorRecord);

    categoryMap.set(skill, (categoryMap.get(skill) || 0) + 1);

    const dateKey = dateValue || `Row ${index + 1}`;
    dateMap.set(dateKey, (dateMap.get(dateKey) || 0) + (presentDays > 0 ? 1 : 0));

    const monthKey = month || "Uploaded Month";
    const currentMonth = monthMap.get(monthKey) || { present: 0, total: 0 };
    currentMonth.present += presentDays > 0 ? 1 : 0;
    currentMonth.total += 1;
    monthMap.set(monthKey, currentMonth);

    const wageRecord = wageMap.get(contractor) || { contractor, month: monthKey, workers: 0, amount: 0, status: "Uploaded" };
    wageRecord.workers += 1;
    wageRecord.amount += amount;
    wageRecord.month = monthKey;
    wageMap.set(contractor, wageRecord);

    if (overtimeHours > 0) {
      overtimeMap.set(`${worker}-${contractor}`, {
        worker,
        contractor,
        hours: overtimeHours,
        amount: numeric(row, ["overtime_amount", "ot_amount"], overtimeHours * 450),
      });
    }

    complianceMap.set(compliance, (complianceMap.get(compliance) || 0) + 1);

    if (workOrder) {
      progressMap.set(workOrder, {
        workOrder,
        contractor,
        progress,
        status: progress >= 80 ? "On Track" : progress >= 40 ? "In Progress" : "Delayed",
      });
    }
  });

  replaceArray(contractors, Array.from(contractorMap.values()));
  replaceArray(categoryData, Array.from(categoryMap.entries()).map(([label, value], index) => ({
    label,
    value,
    color: ["#176b87", "#16835f", "#b98512", "#6c5aa8", "#2f67b1", "#c03d3d"][index % 6],
  })));
  replaceArray(dailyAttendance, Array.from(dateMap.entries()).slice(-7).map(([label, value]) => ({ label, value })));
  replaceArray(monthlyAttendance, Array.from(monthMap.entries()).slice(-6).map(([label, item]) => ({
    label,
    value: item.total ? Math.round((item.present / item.total) * 100) : 0,
  })));
  replaceArray(attendanceItems, rows.slice(0, 100).map((row, index) => {
    const contractor = pick(row, ["contractor", "contractor_name", "agency", "vendor"], "Unknown Contractor");
    const present = numeric(row, ["present", "present_days", "days_present", "days", "work_days"], 0);
    const absent = numeric(row, ["absent", "absent_days"], 0);
    return {
      contractor,
      date: pick(row, ["date", "attendance_date", "work_date"], ""),
      department: pick(row, ["department", "dept", "section"], "General"),
      muster: "Uploaded",
      attendance: present || absent ? `${present} Present / ${absent} Absent` : pick(row, ["status", "attendance_status"], "Uploaded"),
      match: "Pending",
      status: pick(row, ["status", "attendance_status"], index === 0 ? "Pending" : "Uploaded"),
    };
  }));
  replaceArray(wageSheets, Array.from(wageMap.values()));
  replaceArray(overtimeItems, Array.from(overtimeMap.values()));
  replaceArray(complianceItems, Array.from(complianceMap.entries()).map(([title, value]) => ({
    title,
    value,
    status: title,
    tone: getStatusClass(title),
  })));
  if (progressMap.size) replaceArray(progressItems, Array.from(progressMap.values()));
}

async function parseUploadedFile(file) {
  const extension = file.name.split(".").pop().toLowerCase();

  if (extension === "csv") {
    return parseCsv(await file.text());
  }

  if (!window.XLSX) {
    throw new Error("Excel parser is not loaded. Please check internet connection or upload CSV.");
  }

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(firstSheet, { defval: "" }).map(normalizeRow);
}

async function handleDocumentUpload(file) {
  if (!file) return;

  try {
    const rows = (await parseUploadedFile(file)).map(normalizeRow);
    if (!rows.length) {
      showToast("No data rows found in uploaded file.");
      return;
    }

    uploadedRows = rows;
    extractDashboardData(rows);
    renderDashboard();
    switchSection("overview");
    document.getElementById("uploadMeta").textContent = `${file.name}: ${rows.length} rows extracted`;
    addAlert("Document uploaded", `${file.name} extracted ${rows.length} row(s) into the dashboard.`, "#16835f");
    showToast("File uploaded and dashboard updated.");
  } catch (error) {
    console.error(error);
    showToast(error.message || "Unable to read uploaded file.");
  }
}

function renderMetrics() {
  const totalWorkers = contractors.reduce((sum, item) => sum + item.workers, 0);
  const presentToday = contractors.reduce((sum, item) => sum + item.present, 0);
  const absentToday = contractors.reduce((sum, item) => sum + item.absent, 0);
  const overtimeWorkers = contractors.reduce((sum, item) => sum + item.overtime, 0);
  const wageLiability = wageSheets.reduce((sum, item) => sum + item.amount, 0);
  const complianceIssues = complianceItems.filter((item) => item.tone !== "good").length;

  const metrics = [
    { label: "Total Contractors", value: contractors.length, note: "Active this month", icon: "TC", tone: "#176b87" },
    { label: "Total Workers", value: totalWorkers, note: "Approved workforce", icon: "TW", tone: "#16835f" },
    { label: "Present Today", value: presentToday, note: "Across all contractors", icon: "PT", tone: "#2f67b1" },
    { label: "Absent Today", value: absentToday, note: "Needs verification", icon: "AT", tone: "#c03d3d" },
    { label: "Overtime Workers", value: overtimeWorkers, note: "Workers with OT entries", icon: "OT", tone: "#b98512" },
    { label: "Wage Liability", value: formatMoney(wageLiability), note: "Current month", icon: "WL", tone: "#6c5aa8" },
    { label: "Compliance Issues", value: complianceIssues, note: "Open exceptions", icon: "CI", tone: "#c03d3d" },
    { label: "Active Work Orders", value: progressItems.length, note: "Tracked packages", icon: "WO", tone: "#176b87" },
  ];

  document.getElementById("metricGrid").innerHTML = metrics.map((item) => `
    <article class="metric" style="--tone:${item.tone}">
      <div class="metric-label"><span>${item.label}</span><span class="metric-icon">${item.icon}</span></div>
      <div class="metric-value">${item.value}</div>
      <div class="metric-note">${item.note}</div>
    </article>
  `).join("");
}

function renderContractorRows(targetId) {
  const target = document.getElementById(targetId);
  if (!target) return;

  if (!contractors.length) {
    target.innerHTML = emptyTable(7);
    return;
  }

  target.innerHTML = contractors.map((item) => `
    <tr>
      <td><strong>${item.name}</strong><br><span class="muted">${item.department}</span></td>
      <td>${item.workers}</td>
      <td>${item.present}</td>
      <td>${item.absent}</td>
      <td>${item.overtime}</td>
      <td>${badge(item.status)}</td>
      <td>
        <div class="row-actions">
          ${actionButton("Details", "contractor-details", item.name)}
          ${actionButton("Attendance", "contractor-attendance", item.name)}
          ${actionButton("Wage Sheet", "contractor-wage", item.name)}
          ${actionButton("Approve", "contractor-approve", item.name, "approve")}
          ${actionButton("Reject", "contractor-reject", item.name, "reject")}
        </div>
      </td>
    </tr>
  `).join("");
}

function renderAlerts() {
  if (!alerts.length) {
    const markup = emptyState("No alerts yet. Upload a file to generate dashboard notifications.");
    document.getElementById("overviewAlerts").innerHTML = markup;
    document.getElementById("alertRows").innerHTML = markup;
    return;
  }

  const markup = alerts.map((item) => `
    <article class="alert" style="--tone:${item.tone}">
      <div>
        <h4>${item.title}</h4>
        <p>${item.text}</p>
      </div>
    </article>
  `).join("");
  document.getElementById("overviewAlerts").innerHTML = markup;
  document.getElementById("alertRows").innerHTML = markup;
}

function renderCategoryChart() {
  if (!categoryData.length) {
    document.getElementById("categoryDonut").style.background = "#e7eef2";
    document.getElementById("categoryLegend").innerHTML = emptyState("Upload worker category or skill data to build this chart.");
    return;
  }

  const total = categoryData.reduce((sum, item) => sum + item.value, 0);
  let start = 0;
  const slices = categoryData.map((item) => {
    const end = start + (item.value / total) * 360;
    const slice = `${item.color} ${start}deg ${end}deg`;
    start = end;
    return slice;
  });

  document.getElementById("categoryDonut").style.background = `conic-gradient(${slices.join(",")})`;
  document.getElementById("categoryLegend").innerHTML = categoryData.map((item) => `
    <div class="legend-row" style="--tone:${item.color}">
      <span class="legend-dot"></span>
      <span>${item.label}</span>
      <strong>${item.value}</strong>
    </div>
  `).join("");
}

function renderDailyTrend() {
  if (!dailyAttendance.length) {
    document.getElementById("dailyTrend").innerHTML = emptyState("Upload attendance dates to build daily trend.");
    return;
  }

  const max = Math.max(...dailyAttendance.map((item) => item.value));
  document.getElementById("dailyTrend").innerHTML = dailyAttendance.map((item) => `
    <div class="bar-col">
      <div class="bar" title="${item.value} present" style="height:${Math.max(18, (item.value / max) * 220)}px"></div>
      <div class="bar-label">${item.label}</div>
    </div>
  `).join("");
}

function renderMonthlyTrend() {
  if (!monthlyAttendance.length) {
    document.getElementById("monthlyTrend").innerHTML = emptyState("Upload month or date columns to build monthly trend.");
    return;
  }

  const width = 640;
  const height = 250;
  const values = monthlyAttendance.map((item) => item.value);
  const min = Math.min(...values) - 3;
  const max = Math.max(...values) + 3;
  const points = monthlyAttendance.map((item, index) => {
    const x = 30 + (index * (width - 60)) / (monthlyAttendance.length - 1);
    const y = height - 32 - ((item.value - min) / (max - min)) * (height - 70);
    return { ...item, x, y };
  });
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");

  document.getElementById("monthlyTrend").innerHTML = `
    <svg class="line-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Monthly attendance trend">
      <path d="${path}" fill="none" stroke="#176b87" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></path>
      ${points.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="5" fill="#176b87"></circle><text x="${point.x}" y="${height - 6}" text-anchor="middle" font-size="12" fill="#65727f">${point.label}</text><text x="${point.x}" y="${point.y - 12}" text-anchor="middle" font-size="12" font-weight="800" fill="#17212b">${point.value}%</text>`).join("")}
    </svg>
  `;
}

function renderHorizontalBars(targetId, data, valueKey, labelKey, suffix = "") {
  const target = document.getElementById(targetId);
  if (!data.length) {
    target.innerHTML = emptyState();
    return;
  }

  const max = Math.max(...data.map((item) => item[valueKey]), 1);
  target.innerHTML = data.map((item) => `
    <div class="hbar-row">
      <div class="hbar-meta"><span>${item[labelKey]}</span><span>${item[valueKey]}${suffix}</span></div>
      <div class="track"><div class="fill" style="--value:${Math.max(5, (item[valueKey] / max) * 100)}%"></div></div>
    </div>
  `).join("");
}

function populateFilters() {
  const select = document.getElementById("contractorFilter");
  select.innerHTML = `<option value="all">All Contractors</option>${contractors.map((item) => `<option>${item.name}</option>`).join("")}`;
  document.getElementById("dateFilter").value = "";
}

function renderAttendanceRows() {
  const contractor = document.getElementById("contractorFilter").value;
  const department = document.getElementById("departmentFilter").value;
  const date = document.getElementById("dateFilter").value;
  const rows = attendanceItems.filter((item) =>
    (contractor === "all" || item.contractor === contractor) &&
    (department === "all" || item.department === department) &&
    (!date || item.date === date)
  );

  document.getElementById("attendanceRows").innerHTML = rows.map((item) => `
    <tr>
      <td>${item.contractor}</td>
      <td>${item.date}</td>
      <td>${item.department}</td>
      <td>${badge(item.muster)}</td>
      <td>${item.attendance}</td>
      <td>${badge(item.match)}</td>
      <td>${badge(item.status)}</td>
    </tr>
  `).join("") || emptyTable(7, uploadedRows.length ? "No attendance records match the selected filters." : "No attendance data loaded. Upload a file to populate attendance.");
}

function renderWageRows() {
  if (!wageSheets.length) {
    document.getElementById("wageRows").innerHTML = emptyTable(6, "No wage data loaded. Upload a file with wage columns to populate approvals.");
    return;
  }

  document.getElementById("wageRows").innerHTML = wageSheets.map((item) => `
    <tr>
      <td><strong>${item.contractor}</strong></td>
      <td>${item.month}</td>
      <td>${item.workers}</td>
      <td>${formatMoney(item.amount)}</td>
      <td>${badge(item.status)}</td>
      <td>
        <div class="row-actions">
          ${actionButton("View", "wage-view", item.contractor)}
          ${actionButton("Verify", "wage-verify", item.contractor)}
          ${actionButton("Approve", "wage-approve", item.contractor, "approve")}
          ${actionButton("Reject", "wage-reject", item.contractor, "reject")}
          <button class="mini-btn remarks-btn" data-contractor="${item.contractor}">Remarks</button>
        </div>
      </td>
    </tr>
  `).join("");
}

function renderOvertime() {
  if (!overtimeItems.length) {
    document.getElementById("overtimeRows").innerHTML = emptyTable(5, "No overtime data loaded.");
    renderHorizontalBars("overtimeContractorBars", [], "hours", "contractor", " hrs");
    renderHorizontalBars("topOvertimeBars", [], "hours", "worker", " hrs");
    return;
  }

  document.getElementById("overtimeRows").innerHTML = overtimeItems.map((item) => `
    <tr>
      <td>${item.worker}</td>
      <td>${item.contractor}</td>
      <td>${item.hours}</td>
      <td>${formatMoney(item.amount)}</td>
      <td>${item.hours > 24 ? badge("Excessive overtime") : badge("Within limit")}</td>
    </tr>
  `).join("");

  const byContractor = contractors.map((contractor) => ({
    contractor: contractor.name,
    hours: overtimeItems.filter((item) => item.contractor === contractor.name).reduce((sum, item) => sum + item.hours, 0),
  }));
  renderHorizontalBars("overtimeContractorBars", byContractor, "hours", "contractor", " hrs");
  renderHorizontalBars("topOvertimeBars", overtimeItems, "hours", "worker", " hrs");
}

function renderCompliance() {
  if (!complianceItems.length) {
    document.getElementById("complianceGrid").innerHTML = emptyState("No compliance data loaded.");
    return;
  }

  document.getElementById("complianceGrid").innerHTML = complianceItems.map((item) => `
    <article class="compliance-tile">
      <h4>${item.title}</h4>
      <strong>${item.value}</strong>
      ${badge(item.status)}
    </article>
  `).join("");
}

function renderProgress() {
  if (!progressItems.length) {
    document.getElementById("progressList").innerHTML = emptyState("No project progress data loaded.");
    document.getElementById("progressRows").innerHTML = emptyTable(4, "No work order progress data loaded.");
    return;
  }

  const progressMarkup = progressItems.map((item) => `
    <div class="progress-item">
      <div class="progress-meta"><span>${item.workOrder}</span><span>${item.progress}%</span></div>
      <div class="track"><div class="fill" style="--value:${item.progress}%"></div></div>
    </div>
  `).join("");

  document.getElementById("progressList").innerHTML = progressMarkup;
  document.getElementById("progressRows").innerHTML = progressItems.map((item) => `
    <tr>
      <td>${item.workOrder}</td>
      <td>${item.contractor}</td>
      <td>${item.progress}%</td>
      <td>${badge(item.status)}</td>
    </tr>
  `).join("");
}

function rerenderTables() {
  renderMetrics();
  renderContractorRows("contractorRowsFull");
  renderAttendanceRows();
  renderWageRows();
  renderOvertime();
  renderCompliance();
  renderProgress();
}

function findContractor(name) {
  return contractors.find((item) => item.name === name);
}

function findWageSheet(contractor) {
  return wageSheets.find((item) => item.contractor === contractor);
}

function handleContractorAction(action, contractorName) {
  const contractor = findContractor(contractorName);
  if (!contractor) return;

  if (action === "contractor-details") {
    switchSection("contractors");
    showToast(`${contractor.name} details are shown in Contractor Monitoring.`);
    return;
  }

  if (action === "contractor-attendance") {
    switchSection("attendance");
    document.getElementById("contractorFilter").value = contractor.name;
    renderAttendanceRows();
    showToast(`Attendance filtered for ${contractor.name}.`);
    return;
  }

  if (action === "contractor-wage") {
    switchSection("wages");
    showToast(`${contractor.name} wage sheet opened.`);
    return;
  }

  if (action === "contractor-approve") {
    contractor.status = "Approved";
    addAlert("Contractor submission approved", `${contractor.name} submission was approved by Engineer In-Charge.`, "#16835f");
    rerenderTables();
    showToast(`${contractor.name} submission approved.`);
    return;
  }

  if (action === "contractor-reject") {
    contractor.status = "Rejected";
    addAlert("Contractor submission rejected", `${contractor.name} submission was rejected and returned for correction.`, "#c03d3d");
    rerenderTables();
    showToast(`${contractor.name} submission rejected.`);
  }
}

function handleWageAction(action, contractorName) {
  const wage = findWageSheet(contractorName);
  if (!wage) return;

  if (action === "wage-view") {
    switchSection("wages");
    showToast(`${contractorName} wage sheet is open for review.`);
    return;
  }

  if (action === "wage-verify") {
    wage.status = "Calculations Verified";
    addAlert("Wage calculations verified", `${contractorName} wage sheet calculations were verified.`, "#176b87");
    renderWageRows();
    renderMetrics();
    showToast(`${contractorName} calculations verified.`);
    return;
  }

  if (action === "wage-approve") {
    wage.status = "Approved";
    addAlert("Wage sheet approved", `${contractorName} wage sheet was approved for payroll processing.`, "#16835f");
    renderWageRows();
    renderMetrics();
    showToast(`${contractorName} wage sheet approved.`);
    return;
  }

  if (action === "wage-reject") {
    wage.status = "Rejected";
    addAlert("Wage sheet rejected", `${contractorName} wage sheet was rejected with correction required.`, "#c03d3d");
    renderWageRows();
    renderMetrics();
    showToast(`${contractorName} wage sheet rejected.`);
  }
}

function handleVerificationAction(button) {
  const text = button.textContent.trim();

  if (text.includes("View uploaded")) {
    attendanceItems.forEach((item) => {
      if (item.muster === "Pending") item.muster = "Uploaded";
    });
    showToast("Uploaded muster rolls opened.");
  } else if (text.includes("Verify attendance")) {
    attendanceItems.forEach((item) => {
      if (item.status !== "Flagged") item.status = "Verified";
    });
    showToast("Attendance records verified.");
  } else if (text.includes("Flag suspicious")) {
    const mismatch = attendanceItems.find((item) => item.match === "Mismatch") || attendanceItems[0];
    mismatch.status = "Flagged";
    addAlert("Suspicious attendance flagged", `${mismatch.contractor} attendance was flagged for manual review.`, "#c03d3d");
    showToast("Suspicious attendance flagged.");
  } else if (text.includes("Compare attendance")) {
    attendanceItems.forEach((item) => {
      item.match = item.status === "Flagged" ? "Mismatch" : "Matched";
    });
    showToast("Attendance compared against wage sheet.");
  }

  renderAttendanceRows();
}

function exportReport(button) {
  const reportName = button.textContent.trim().replace(/\s+/g, "-").toLowerCase();
  const rows = uploadedRows.length
    ? uploadedRows
    : reportName.includes("wage")
    ? wageSheets
    : reportName.includes("overtime")
    ? overtimeItems
    : reportName.includes("contractor")
    ? contractors
    : attendanceItems;
  const columns = Object.keys(rows[0] || {});
  downloadCsv(`${reportName || "engineer-report"}.csv`, columns, rows);
  showToast(`${button.textContent.trim()} downloaded.`);
}

function bindEvents() {
  document.querySelectorAll(".nav-item, .text-action").forEach((button) => {
    button.addEventListener("click", () => {
      const target = button.dataset.target;
      if (!target) return;
      switchSection(target);
    });
  });

  document.body.addEventListener("click", (event) => {
    const actionButtonNode = event.target.closest("[data-action]");
    if (actionButtonNode) {
      const { action, contractor } = actionButtonNode.dataset;
      if (action.startsWith("contractor-")) handleContractorAction(action, contractor);
      if (action.startsWith("wage-")) handleWageAction(action, contractor);
      return;
    }

    const verifyButton = event.target.closest(".verify-tile");
    if (verifyButton) {
      handleVerificationAction(verifyButton);
      return;
    }

    const reportButton = event.target.closest(".report-grid button");
    if (reportButton) {
      exportReport(reportButton);
      return;
    }

    const exportButton = event.target.closest(".export-actions button");
    if (exportButton) {
      const type = exportButton.textContent.trim().toLowerCase();
      const rows = uploadedRows.length ? uploadedRows : type === "excel" ? wageSheets : attendanceItems;
      downloadCsv(`engineer-${type}-export.csv`, Object.keys(rows[0] || {}), rows);
      showToast(`${exportButton.textContent.trim()} export downloaded.`);
      return;
    }

    const messageButton = event.target.closest("[data-message]");
    if (messageButton) showToast(messageButton.dataset.message);

    const remarksButton = event.target.closest(".remarks-btn");
    if (remarksButton) {
      activeRemarksContractor = remarksButton.dataset.contractor;
      document.getElementById("remarksContext").textContent = `Remarks for ${remarksButton.dataset.contractor}`;
      document.getElementById("remarksText").value = findWageSheet(activeRemarksContractor)?.remarks || "";
      document.getElementById("remarksDialog").showModal();
    }
  });

  document.getElementById("saveRemarksBtn").addEventListener("click", () => {
    const value = document.getElementById("remarksText").value.trim();
    const wage = findWageSheet(activeRemarksContractor);
    if (wage) {
      wage.remarks = value;
      wage.status = value ? "Remarks Added" : wage.status;
      renderWageRows();
      addAlert("Remarks saved", `Remarks were saved for ${activeRemarksContractor}.`, "#176b87");
    }
    showToast(value ? "Remarks saved." : "Remarks saved without additional notes.");
    document.getElementById("remarksText").value = "";
  });

  ["contractorFilter", "dateFilter", "departmentFilter"].forEach((id) => {
    document.getElementById(id).addEventListener("change", renderAttendanceRows);
  });

  document.getElementById("globalSearch").addEventListener("input", (event) => {
    const q = event.target.value.toLowerCase().trim();
    document.querySelectorAll("tbody tr").forEach((row) => {
      row.style.display = row.textContent.toLowerCase().includes(q) ? "" : "none";
    });
  });

  document.getElementById("documentUpload").addEventListener("change", (event) => {
    handleDocumentUpload(event.target.files[0]);
    event.target.value = "";
  });

  document.getElementById("refreshBtn").addEventListener("click", () => {
    renderDashboard();
    switchSection(activeSection);
    showToast("Dashboard refreshed.");
  });
}

function renderDashboard() {
  renderMetrics();
  renderContractorRows("contractorRowsFull");
  renderAlerts();
  renderCategoryChart();
  renderDailyTrend();
  renderMonthlyTrend();
  renderHorizontalBars("strengthBars", contractors, "workers", "name");
  populateFilters();
  renderAttendanceRows();
  renderWageRows();
  renderOvertime();
  renderCompliance();
  renderProgress();
}

renderDashboard();
bindEvents();
