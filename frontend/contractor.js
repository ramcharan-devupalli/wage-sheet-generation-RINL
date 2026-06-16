const savedSession = typeof currentSession === "function" ? currentSession() : null;
if (savedSession?.employee) {
  const name = savedSession.employee.name || "Contractor User";
  document.querySelectorAll("[data-session-name]").forEach((node) => { node.textContent = name; });
  document.querySelectorAll("[data-session-role]").forEach((node) => { node.textContent = savedSession.employee.role || "Contractor"; });
  document.querySelectorAll(".avatar").forEach((node) => { node.textContent = name.trim().slice(0, 2).toUpperCase() || "CT"; });
}
if (typeof bindLogoutButtons === "function") bindLogoutButtons();

const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
let active = "dashboard";
let searchText = "";
let workers = [];
let attendance = [];
let otRequests = [];
let wageSheets = [];
let notifications = [];
let engineer = { name: "", department: "", contact: "", pending: 0 };
let contract = { number: "", start: "", end: "", value: 0, balance: 0, scope: "" };
let settings = { company: "", signatory: "", documents: "" };

const moduleDefs = {
  dashboard: { title: "Dashboard", copy: "Upload a CSV/XLS file and review the contractor workflow overview.", small: "Home page" },
  workforce: { title: "Workforce", copy: "Manage workers by category and status.", small: "Manage workers" },
  attendance: { title: "Attendance", copy: "Attendance details by worker, shift, status, and labor type.", small: "Daily and monthly" },
  overtime: { title: "Overtime", copy: "Overtime working-hours details by worker, shift, and labor type.", small: "Working hours" },
  wagesheets: { title: "Wage Sheets", copy: "Generate and review wage sheet details.", small: "Critical module" },
  engineers: { title: "Engineers", copy: "Assigned Engineer-In-Charge details.", small: "Assigned EIC" },
  reports: { title: "Reports", copy: "Download reports from uploaded data.", small: "Downloads" },
  contract: { title: "Contract Details", copy: "Contract number, dates, value, balance, and scope.", small: "Validity and value" },
  notifications: { title: "Notifications", copy: "Upload and workflow alerts.", small: "Alerts" },
  settings: { title: "Settings", copy: "Company profile and document settings.", small: "Profile and security" }
};

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}
function cleanKey(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}
function pick(row, names) {
  for (const name of names) {
    const key = cleanKey(name);
    if (row[key] !== undefined && row[key] !== "") return row[key];
  }
  return "";
}
function num(value) {
  const parsed = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}
function hasAny(row, names) {
  return names.some((name) => String(row[cleanKey(name)] ?? "").trim() !== "");
}
function statusPill(value) {
  const text = String(value || "");
  const cls = /approved|active|present|generated/i.test(text) ? "good" : /pending|remarks|near/i.test(text) ? "warn" : /rejected|inactive|absent/i.test(text) ? "bad" : "";
  return '<span class="pill ' + cls + '">' + esc(text) + "</span>";
}
function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2500);
}
function daysRemaining() {
  if (!contract.end) return 0;
  const days = Math.ceil((new Date(contract.end) - new Date()) / 86400000);
  return Number.isFinite(days) ? days : 0;
}
function filtered(rows) {
  const text = searchText.trim().toLowerCase();
  return text ? rows.filter((row) => Object.values(row).join(" ").toLowerCase().includes(text)) : rows;
}
function countBy(rows, field) {
  const map = new Map();
  rows.forEach((row) => {
    const label = row[field] || "Unknown";
    map.set(label, (map.get(label) || 0) + 1);
  });
  return Array.from(map, ([label, value]) => ({ label, value }));
}
function parseDelimited(text, delimiter) {
  const rows = [];
  let cell = "";
  let row = [];
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => String(value).trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => String(value).trim())) rows.push(row);
  return rowsToObjects(rows);
}
function rowsToObjects(rows) {
  const cleanRows = rows.filter((row) => row.some((value) => String(value ?? "").trim()));
  if (!cleanRows.length) return [];
  const headers = cleanRows.shift().map(cleanKey);
  return cleanRows.map((row) => {
    const object = {};
    headers.forEach((header, index) => {
      if (header) object[header] = String(row[index] ?? "").trim();
    });
    return object;
  });
}
function parseHtmlTable(text) {
  const doc = new DOMParser().parseFromString(text, /<html|<table/i.test(text) ? "text/html" : "application/xml");
  return rowsToObjects(Array.from(doc.querySelectorAll("tr")).map((row) => Array.from(row.querySelectorAll("th,td")).map((cell) => cell.textContent.trim())));
}
async function parseUploadedFile(file) {
  if (file.name.toLowerCase().endsWith(".xlsx")) throw new Error("Please save XLSX as CSV for this dashboard import.");
  const text = await file.text();
  if (/<table|<html|<Workbook|<Row/i.test(text)) return parseHtmlTable(text);
  return parseDelimited(text, text.includes("\t") ? "\t" : ",");
}
function normalizeWorker(row, index) {
  const days = num(pick(row, ["days", "present", "work_days", "days_worked"]));
  const rate = num(pick(row, ["daily_wage", "rate", "wage_rate"]));
  const gross = num(pick(row, ["gross", "gross_wage", "total_wage"])) || days * rate;
  const pf = num(pick(row, ["pf", "pf_deduction"])) || gross * 0.12;
  const esi = num(pick(row, ["esi", "esi_deduction"])) || gross * 0.0075;
  return {
    id: pick(row, ["worker_id", "workerid", "id", "aadhaar_id", "adhar_id", "employee_id"]) || "W-" + String(index + 1).padStart(4, "0"),
    name: pick(row, ["name", "worker_name", "worker"]),
    category: pick(row, ["type_of_labor", "labor_type", "labour_type", "category", "skill", "worker_skill", "worker_category"]) || "Unskilled",
    department: pick(row, ["department", "dept", "contractor_id", "job_cd"]) || "",
    status: pick(row, ["worker_status", "status"]) || "Active",
    days,
    ot: num(pick(row, ["ot", "overtime", "overtime_hrs", "ot_hours", "over_time"])),
    gross,
    pf,
    esi,
    net: num(pick(row, ["net", "net_wage", "payable"])) || Math.max(0, gross - pf - esi)
  };
}
function normalizeAttendance(row, index) {
  const workerId = pick(row, ["worker_id", "workerid", "id", "aadhaar_id", "adhar_id"]) || "W-" + String(index + 1).padStart(4, "0");
  const worker = workers.find((item) => item.id === workerId);
  return {
    workerId,
    shift: pick(row, ["shift"]) || "A",
    status: pick(row, ["attendance", "present_absent", "present_or_absent", "status"]) || "Present",
    laborType: pick(row, ["type_of_labor", "labor_type", "labour_type", "type", "category", "worker_category", "skill", "worker_skill"]) || worker?.category || ""
  };
}
function normalizeOt(row, index) {
  const workerId = pick(row, ["worker_id", "workerid", "id", "aadhaar_id", "adhar_id"]) || "W-" + String(index + 1).padStart(4, "0");
  const worker = workers.find((item) => item.id === workerId);
  return {
    workerId,
    shift: pick(row, ["shift", "ot_shift"]) || "A",
    hours: num(pick(row, ["ot", "overtime", "overtime_hrs", "ot_hours", "over_time", "over_time_working_hours"])),
    laborType: pick(row, ["type_of_labor", "labor_type", "labour_type", "type", "category", "worker_category", "skill", "worker_skill"]) || worker?.category || ""
  };
}
function buildContract(rows) {
  const row = rows.find((item) => hasAny(item, ["contract_number", "contract_no", "contract_id", "job_cd", "work_order", "contract_value", "start_date", "end_date", "scope_of_work"]));
  if (!row) return contract;
  return {
    number: pick(row, ["contract_number", "contract_no", "contract_id", "contract", "number", "job_cd", "work_order"]),
    start: pick(row, ["start_date", "contract_start", "job_start_dt", "start"]),
    end: pick(row, ["end_date", "contract_end", "job_end_dt", "end"]),
    value: num(pick(row, ["contract_value", "value", "contract_amount", "work_order_value"])),
    balance: num(pick(row, ["remaining_balance", "balance", "balance_amount", "remaining_amount"])),
    scope: pick(row, ["scope_of_work", "scope", "job_desc", "work_scope", "description"])
  };
}
function buildEngineer(rows) {
  const row = rows.find((item) => hasAny(item, ["engineer_name", "engineer", "eic_name", "engineer_in_charge", "engineer_department", "engineer_contact", "pending_verifications"]));
  if (!row) return engineer;
  const mobile = pick(row, ["engineer_mobile", "mobile", "phone"]);
  const email = pick(row, ["engineer_email", "email"]);
  return {
    name: pick(row, ["engineer_name", "engineer", "eic_name", "engineer_in_charge", "engineer_incharge"]),
    department: pick(row, ["engineer_department", "department", "dept"]),
    contact: pick(row, ["engineer_contact", "contact_details", "contact"]) || [mobile, email].filter(Boolean).join(" / "),
    pending: num(pick(row, ["pending_verifications", "pending_verification", "pending"]))
  };
}
function applyImportedRows(rows, fileName) {
  if (!rows.length) return showToast("No rows found in file");
  workers = rows.map(normalizeWorker).filter((worker) => worker.name || worker.id);
  attendance = rows.filter((row) => hasAny(row, ["attendance", "present_absent", "present", "shift", "type_of_labor", "labor_type"])).map(normalizeAttendance);
  otRequests = rows.filter((row) => num(pick(row, ["ot", "overtime", "overtime_hrs", "ot_hours", "over_time", "over_time_working_hours"])) > 0).map(normalizeOt);
  const gross = workers.reduce((sum, worker) => sum + Number(worker.gross || 0), 0);
  const net = workers.reduce((sum, worker) => sum + Number(worker.net || 0), 0);
  wageSheets = workers.length ? [{ id: "WS-IMPORTED", month: pick(rows[0], ["month", "period", "wage_month"]) || "Imported Period", workers: workers.length, gross, net, status: "Generated", remarks: "Generated from uploaded file." }] : [];
  contract = buildContract(rows);
  engineer = buildEngineer(rows);
  notifications = [
    { type: "good", title: "File imported", text: fileName + " loaded across dashboard modules." },
    { type: "warn", title: "Review uploaded data", text: workers.length + " worker row(s), " + attendance.length + " attendance row(s), " + otRequests.length + " overtime row(s). Engineer: " + (engineer.name || "not found") + ". Contract: " + (contract.number || "not found") + "." }
  ];
  active = "dashboard";
  render();
  showToast(rows.length + " row(s) imported");
}
async function handleDataFile(input) {
  const file = input.files?.[0];
  if (!file) return;
  try {
    applyImportedRows(await parseUploadedFile(file), file.name);
  } catch (error) {
    showToast(error.message || "Could not read this file");
  } finally {
    input.value = "";
  }
}
function totals() {
  return {
    workers: workers.length,
    active: workers.filter((worker) => /active/i.test(worker.status)).length,
    attendance: attendance.filter((row) => /present/i.test(row.status)).length,
    payroll: workers.reduce((sum, worker) => sum + Number(worker.net || 0), 0)
  };
}
function renderNav() {
  document.getElementById("sideNav").innerHTML = Object.entries(moduleDefs).map(([id, module]) => '<button type="button" class="' + (active === id ? "active" : "") + '" data-section="' + id + '" onclick="setActiveSection(\'' + id + '\')"><b>' + esc(module.title) + "</b><small>" + esc(module.small) + "</small></button>").join("");
}
function renderKpis() {
  const item = totals();
  const cards = [["Workers", item.workers, item.active + " active", "#0b3d78"], ["Attendance", item.attendance, "present", "#15803d"], ["Overtime", otRequests.length, "workers", "#c98610"], ["Payroll", money.format(item.payroll), "net wage", "#165aa3"]];
  document.getElementById("kpis").innerHTML = cards.map((card) => '<article class="kpi" style="--tone:' + card[3] + '"><small>' + esc(card[0]) + "</small><strong>" + esc(card[1]) + "</strong><span>" + esc(card[2]) + "</span></article>").join("");
}
function renderModules() {
  const items = [["Data Upload", ["Upload one CSV or XLS file to fill the dashboard."]], ["Work Status", ["Review workers, attendance, overtime, and category details."]], ["Wage Progress", ["Generate wage sheets from uploaded working data."]], ["Alerts", ["See engineer, contract, approval, and upload reminders."]]];
  document.getElementById("moduleArea").innerHTML = '<div class="module-grid">' + items.map((item) => '<article class="module"><h4>' + esc(item[0]) + "</h4><ul>" + item[1].map((text) => "<li>" + esc(text) + "</li>").join("") + "</ul></article>").join("") + "</div>";
}
function renderChart() {
  const data = active === "attendance" ? countBy(attendance, "status") : active === "overtime" ? countBy(otRequests, "laborType") : active === "wagesheets" ? wageSheets.map((sheet) => ({ label: sheet.month, value: sheet.net })) : countBy(workers, "category");
  const max = Math.max(...data.map((row) => Number(row.value) || 0), 1);
  document.getElementById("chartHint").textContent = moduleDefs[active].title + " snapshot";
  document.getElementById("chartArea").innerHTML = data.map((row) => '<div class="bar-row"><b>' + esc(row.label) + '</b><div class="bar-track"><div class="bar-fill" style="--w:' + Math.max(5, Number(row.value || 0) / max * 100) + '%"></div></div><span>' + esc(row.value) + "</span></div>").join("");
}
function table(rows, cols) {
  const body = filtered(rows);
  const head = "<thead><tr>" + cols.map((col) => "<th>" + esc(col.label) + "</th>").join("") + "</tr></thead>";
  return body.length ? head + "<tbody>" + body.map((row) => "<tr>" + cols.map((col) => "<td>" + (col.status ? statusPill(row[col.key]) : esc(row[col.key])) + "</td>").join("") + "</tr>").join("") + "</tbody>" : head + '<tbody><tr><td colspan="' + cols.length + '">No records found. Upload a CSV/XLS file to fill this register.</td></tr></tbody>';
}
function renderWorkArea() {
  const title = document.getElementById("workTitle");
  const hint = document.getElementById("workHint");
  const area = document.getElementById("workArea");
  title.textContent = moduleDefs[active].title + " Workspace";
  hint.textContent = "Use uploaded data for this module";
  if (active === "engineers") {
    title.textContent = "Engineer Details";
    hint.textContent = "Assigned Engineer-In-Charge information";
    area.innerHTML = '<div class="info-list"><div class="info-row"><span>Engineer Name</span><b>' + esc(engineer.name || "Not assigned") + '</b></div><div class="info-row"><span>Department</span><b>' + esc(engineer.department || "-") + '</b></div><div class="info-row"><span>Contact Details</span><b>' + esc(engineer.contact || "-") + '</b></div><div class="info-row"><span>Pending Verifications</span><b>' + esc(engineer.pending || 0) + "</b></div></div>";
  } else if (active === "contract") {
    area.innerHTML = '<div class="info-list"><div class="info-row"><span>Contract Number</span><b>' + esc(contract.number || "-") + '</b></div><div class="info-row"><span>Start Date</span><b>' + esc(contract.start || "-") + '</b></div><div class="info-row"><span>End Date</span><b>' + esc(contract.end || "-") + '</b></div><div class="info-row"><span>Contract Value</span><b>' + money.format(contract.value || 0) + '</b></div><div class="info-row"><span>Remaining Balance</span><b>' + money.format(contract.balance || 0) + '</b></div><div class="info-row"><span>Scope of Work</span><b>' + esc(contract.scope || "-") + "</b></div></div>";
  } else if (active === "settings") {
    area.innerHTML = '<form id="settingsForm"><div class="form-grid"><label>Company Profile<input name="company" value="' + esc(settings.company) + '"></label><label>Authorized Signatory<input name="signatory" value="' + esc(settings.signatory) + '"></label><label class="full">Document Uploads<textarea name="documents">' + esc(settings.documents) + '</textarea></label><label>Password Change<input name="password" type="password"></label><div class="full"><button class="btn primary" type="submit">Save Settings</button></div></div></form>';
    document.getElementById("settingsForm").addEventListener("submit", (event) => { event.preventDefault(); showToast("Settings saved"); });
  } else {
    area.innerHTML = '<div class="section-body"><div class="action-grid full"><button class="btn primary" onclick="openWorkerModal()">Add Worker</button><button class="btn" onclick="setActiveSection(\'attendance\')">Daily Attendance</button><button class="btn" onclick="generateWageSheet()">Generate Wage Sheet</button></div></div>';
  }
}
function overtimeRows() {
  const map = new Map();
  otRequests.forEach((row) => {
    const key = row.workerId || row.shift || Math.random();
    const current = map.get(key) || { workerId: row.workerId, shift: row.shift, totalHours: 0, laborType: row.laborType };
    current.totalHours += Number(row.hours || 0);
    if (!current.laborType) current.laborType = row.laborType;
    if (!current.shift) current.shift = row.shift;
    map.set(key, current);
  });
  return Array.from(map.values()).map((row, index) => ({ serial: index + 1, ...row }));
}
function renderTable() {
  let rows = workers;
  let cols = [{ key: "id", label: "Worker ID" }, { key: "name", label: "Name" }, { key: "category", label: "Category" }, { key: "department", label: "Department" }, { key: "status", label: "Status", status: true }];
  let title = "Worker Register";
  let hint = "Supervisor, Skilled, Semi-Skilled and Unskilled workers";
  if (active === "attendance") {
    const source = attendance.length ? attendance : workers.map((worker) => ({ workerId: worker.id, shift: "", status: "", laborType: worker.category }));
    rows = source.map((row, index) => ({ serial: index + 1, workerId: row.workerId, shift: row.shift, status: row.status, laborType: row.laborType }));
    cols = [{ key: "serial", label: "S.No" }, { key: "workerId", label: "Worker ID" }, { key: "shift", label: "Shift" }, { key: "status", label: "Present / Absent", status: true }, { key: "laborType", label: "Type of Labor" }];
    title = "Attendance Register";
    hint = "Rows and columns for worker ID, shift, present/absent status, and type of labor";
  }
  if (active === "overtime") {
    rows = overtimeRows();
    cols = [{ key: "serial", label: "S.No" }, { key: "workerId", label: "Worker ID" }, { key: "shift", label: "Shift" }, { key: "totalHours", label: "Overtime Hours" }, { key: "laborType", label: "Type of Labor" }];
    title = rows.length + " Worker(s) Did Overtime";
    hint = "Overtime working-hours details by worker, shift, and labor type";
  }
  if (active === "wagesheets") {
    rows = wageSheets;
    cols = [{ key: "id", label: "Sheet ID" }, { key: "month", label: "Month" }, { key: "workers", label: "Workers" }, { key: "gross", label: "Gross" }, { key: "net", label: "Net" }, { key: "status", label: "Status", status: true }, { key: "remarks", label: "Engineer Remarks" }];
    title = "Wage Sheet";
    hint = "Generated from uploaded data";
  }
  document.getElementById("tableTitle").textContent = title;
  document.getElementById("tableHint").textContent = hint;
  document.getElementById("dataTable").innerHTML = table(rows, cols);
}
function renderActions() {
  const actions = {
    dashboard: ["Upload File", "Daily Attendance", "Generate Wage Sheet"],
    workforce: ["Add Worker", "Edit Worker", "Transfer Worker", "Deactivate Worker"],
    attendance: ["Daily Attendance Entry", "Bulk Upload", "Attendance History"],
    overtime: ["OT Working Hours"],
    wagesheets: ["Generate Wage Sheet", "Download Approved Wage Sheet"],
    engineers: ["Contact Engineer", "Pending Verifications"],
    reports: ["Attendance Reports", "Wage Reports", "OT Reports", "Worker Category Reports"],
    contract: ["View Contract"],
    notifications: ["Mark All Read"],
    settings: ["Company Profile", "Authorized Signatory", "Document Uploads", "Password Change"]
  }[active] || [];
  document.getElementById("actionHint").textContent = moduleDefs[active].title + " shortcuts";
  document.getElementById("quickActions").innerHTML = actions.map((action) => '<button class="btn" onclick="runAction(\'' + esc(action) + "')\">" + esc(action) + "</button>").join("");
}
function renderNotifications() {
  document.getElementById("notifications").innerHTML = notifications.length ? notifications.map((item) => '<div class="notice ' + item.type + '"><strong>' + esc(item.title) + "</strong><span>" + esc(item.text) + "</span></div>").join("") : '<div class="notice"><strong>No notifications</strong><span>Upload a file to begin.</span></div>';
}
function render() {
  const module = moduleDefs[active];
  const isDashboard = active === "dashboard";
  renderNav();
  document.getElementById("kpis").style.display = isDashboard ? "grid" : "none";
  document.getElementById("dashboardModulesPanel").style.display = isDashboard ? "block" : "none";
  document.getElementById("workPanel").style.display = isDashboard || active === "overtime" ? "none" : "block";
  document.getElementById("tablePanel").style.display = (isDashboard || ["contract", "engineers", "settings", "reports", "notifications"].includes(active)) ? "none" : "block";
  if (isDashboard) {
    renderKpis();
    document.getElementById("moduleTitle").textContent = "Dashboard Overview";
    document.getElementById("moduleHint").textContent = "Four-point summary of the contractor workflow";
    renderModules();
  }
  document.getElementById("pageTitle").textContent = module.title;
  document.getElementById("pageCopy").textContent = module.copy;
  if (!isDashboard) {
    renderWorkArea();
    renderTable();
  }
  renderActions();
  renderChart();
  renderNotifications();
}
function setActiveSection(sectionId) {
  if (!moduleDefs[sectionId]) return;
  active = sectionId;
  searchText = "";
  document.getElementById("searchInput").value = "";
  render();
}
function openWorkerModal() {
  document.getElementById("modalTitle").textContent = "Add Worker";
  document.getElementById("modalHint").textContent = "Worker information";
  document.getElementById("modalFields").innerHTML = '<label>Worker ID<input name="id" value="W-' + String(workers.length + 1).padStart(4, "0") + '"></label><label>Name<input name="name"></label><label>Category<select name="category"><option>Supervisor</option><option>Skilled</option><option>Semi-Skilled</option><option>Unskilled</option></select></label><label>Department<input name="department"></label>';
  document.getElementById("modal").classList.add("open");
}
function closeModal() { document.getElementById("modal").classList.remove("open"); }
function generateWageSheet() {
  if (!workers.length) return showToast("Upload worker file first");
  const gross = workers.reduce((sum, worker) => sum + Number(worker.gross || 0), 0);
  const net = workers.reduce((sum, worker) => sum + Number(worker.net || 0), 0);
  wageSheets.unshift({ id: "WS-GENERATED", month: "Imported Period", workers: workers.length, gross, net, status: "Generated", remarks: "Ready for review." });
  setActiveSection("wagesheets");
  showToast("Wage sheet generated");
}
function downloadCsv(name, rows) {
  const keys = Object.keys(rows[0] || { message: "" });
  const csv = [keys.join(","), ...rows.map((row) => keys.map((key) => '"' + String(row[key] ?? "").replace(/"/g, '""') + '"').join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name + ".csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
function downloadReport(type) {
  if (type === "attendance") return downloadCsv("attendance-report", attendance);
  if (type === "overtime") return downloadCsv("ot-report", otRequests);
  if (type === "wages") return downloadCsv("wage-report", wageSheets);
  return downloadCsv("worker-category-report", countBy(workers, "category"));
}
function runAction(action) {
  const text = action.toLowerCase();
  if (text.includes("upload")) return document.getElementById("dataFileInput").click();
  if (text.includes("attendance reports")) return downloadReport("attendance");
  if (text.includes("ot reports")) return downloadReport("overtime");
  if (text.includes("wage reports")) return downloadReport("wages");
  if (text.includes("category")) return downloadReport("categories");
  if (text.includes("attendance")) return setActiveSection("attendance");
  if (text.includes("ot")) return setActiveSection("overtime");
  if (text.includes("wage")) return generateWageSheet();
  if (text.includes("mark all")) { notifications = []; render(); return; }
  showToast(action + " opened");
}
window.setActiveSection = setActiveSection;
window.openWorkerModal = openWorkerModal;
window.closeModal = closeModal;
window.generateWageSheet = generateWageSheet;
window.downloadReport = downloadReport;
window.runAction = runAction;

document.getElementById("modalForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  workers.unshift({ id: form.get("id"), name: form.get("name"), category: form.get("category"), department: form.get("department"), status: "Active", days: 0, ot: 0, gross: 0, pf: 0, esi: 0, net: 0 });
  closeModal();
  render();
});
document.getElementById("sideNav").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-section]");
  if (button) setActiveSection(button.dataset.section);
});
document.getElementById("searchInput").addEventListener("input", (event) => {
  searchText = event.target.value;
  if (!["dashboard", "contract", "engineers", "settings", "reports"].includes(active)) renderTable();
});
document.getElementById("dataFileInput").addEventListener("change", (event) => handleDataFile(event.target));
document.getElementById("exportBtn").addEventListener("click", () => {
  if (active === "attendance") return downloadReport("attendance");
  if (active === "overtime") return downloadReport("overtime");
  if (active === "wagesheets") return downloadReport("wages");
  downloadCsv(active + "-view", workers);
});
render();
