const API_BASE = ["file:", "http:"].includes(window.location.protocol)
  && ["", "127.0.0.1", "localhost"].includes(window.location.hostname)
  && window.location.port !== "3000"
  ? "http://localhost:3000/api"
  : "/api";

if (typeof applySessionToPage === "function") applySessionToPage("admin.html");
if (typeof bindLogoutButtons === "function") bindLogoutButtons();

const session = JSON.parse(localStorage.getItem("rinlSession") || "null");
const user = session?.employee || {
  name: "Admin",
  email: "-",
  employee_id: "-",
  role: "Admin",
};

const expenseMonth = document.getElementById("expenseMonth");
const loadExpenseBtn = document.getElementById("loadExpenseBtn");
const expenseBody = document.getElementById("expenseBody");
const totalExpense = document.getElementById("totalExpense");
const csvType = document.getElementById("csvType");
const csvUpload = document.getElementById("csvUpload");
const csvUploadStatus = document.getElementById("csvUploadStatus");
const clearUploadedDataBtn = document.getElementById("clearUploadedDataBtn");
const documentUpload = document.getElementById("documentUpload");
const documentList = document.getElementById("documentList");
const csvDropZone = document.getElementById("csvDropZone");
const documentDropZone = document.getElementById("documentDropZone");

const sections = document.querySelectorAll(".section");
const navBtns = document.querySelectorAll(".nav-btn");
const pageTitle = document.getElementById("pageTitle");

let users = [];
let contracts = [];
let workers = [];
let muster = [];
let uploadedDocuments = JSON.parse(localStorage.getItem("adminUploadedDocuments") || "[]");

navBtns.forEach((btn) => {
  btn.addEventListener("click", () => showSection(btn.dataset.section, btn));
});

document.querySelectorAll(".quick-grid button").forEach((btn) => {
  btn.addEventListener("click", () => {
    const nav = document.querySelector(`.nav-btn[data-section="${btn.dataset.section}"]`);
    showSection(btn.dataset.section, nav);
  });
});

loadExpenseBtn.addEventListener("click", loadExpenseReport);
csvUpload.addEventListener("change", handleCsvUpload);
documentUpload.addEventListener("change", handleDocumentUpload);
clearUploadedDataBtn.addEventListener("click", clearUploadedData);
setupDropZone(csvDropZone, handleCsvFiles);
setupDropZone(documentDropZone, handleDocumentFiles);

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || `Request failed: ${response.status}`);
  return data;
}

function parseTableRows(rows) {
  if (rows.length < 2) return [];

  const headers = rows[0].map((header) => normalizeKey(header));
  return rows.slice(1).map((values) => {
    const item = {};
    headers.forEach((header, index) => {
      item[header] = String(values[index] ?? "").trim();
    });
    return item;
  });
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell.trim());
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell.trim());
  if (row.some((value) => value !== "")) rows.push(row);
  return parseTableRows(rows);
}

function parseExcel(arrayBuffer) {
  if (!window.XLSX) {
    throw new Error("Excel parser is not loaded. Check internet connection or upload CSV instead.");
  }

  const workbook = window.XLSX.read(arrayBuffer, { type: "array" });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = window.XLSX.utils.sheet_to_json(firstSheet, {
    header: 1,
    defval: "",
    blankrows: false,
  });
  return parseTableRows(rows);
}

function normalizeKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function pick(row, keys, fallback = "-") {
  for (const key of keys) {
    const normalized = normalizeKey(key);
    if (row[normalized] !== undefined && row[normalized] !== "") return row[normalized];
  }
  return fallback;
}

function normalizeCsvRows(type, rows) {
  if (type === "users") {
    return rows.map((row, index) => ({
      id: Number(pick(row, ["id"], index + 1)),
      employee_id: pick(row, ["employee_id", "emp_id", "id"], index + 1),
      name: pick(row, ["name", "employee_name", "user_name"]),
      email: pick(row, ["email", "mail"]),
      mobile: pick(row, ["mobile", "phone", "phone_number"]),
      role: pick(row, ["role", "user_role"], "Admin"),
      status: String(pick(row, ["status"], "active")).toLowerCase(),
    }));
  }

  if (type === "contracts") {
    return rows.map((row) => ({
      job_cd: pick(row, ["job_cd", "job_code", "contractor_id", "contract_id"]),
      contractor_name: pick(row, ["contractor_name", "contractor", "name"]),
      contractor_phone: pick(row, ["contractor_phone", "phone", "mobile"]),
      work_area: pick(row, ["work_area", "company", "area"]),
      dept_cd: pick(row, ["dept_cd", "department", "dept"]),
      job_start_dt: pick(row, ["job_start_dt", "start_date", "created_at"], ""),
      job_end_dt: pick(row, ["job_end_dt", "end_date"], ""),
    }));
  }

  if (type === "workers") {
    return rows.map((row) => ({
      adhar_id: pick(row, ["adhar_id", "aadhaar_id", "aadhar_id", "worker_id"]),
      worker_name: pick(row, ["worker_name", "name"]),
      job_cd: pick(row, ["job_cd", "job_code", "contractor_id"]),
      worker_desig: pick(row, ["worker_desig", "designation", "category"]),
      worker_skill: pick(row, ["worker_skill", "skill", "category"]),
      worker_gender: pick(row, ["worker_gender", "gender"]),
    }));
  }

  return rows.map((row) => ({
    worker_name: pick(row, ["worker_name", "name"]),
    job_cd: pick(row, ["job_cd", "job_code", "contractor_id"]),
    muster_month: pick(row, ["muster_month", "month", "date"]),
    present: Number(pick(row, ["present", "p"], 0)),
    absent: Number(pick(row, ["absent", "a"], 0)),
    weekly_off: Number(pick(row, ["weekly_off", "wo"], 0)),
    holidays: Number(pick(row, ["holidays", "h"], 0)),
    leaves: Number(pick(row, ["leaves", "l"], 0)),
  }));
}

function detectTableType(rows, fileName = "") {
  const keys = new Set(Object.keys(rows[0] || {}));
  const has = (...names) => names.some((name) => keys.has(normalizeKey(name)));
  const lowerName = fileName.toLowerCase();

  if (has("present", "absent", "weekly_off", "muster_month") || lowerName.includes("muster") || lowerName.includes("attendance")) {
    return "muster";
  }

  if (has("worker_id", "worker_name", "adhar_id", "aadhaar_id", "aadhar_id", "worker_skill", "skill", "gender") || lowerName.includes("worker")) {
    return "workers";
  }

  if (has("contractor_name", "contractor_phone", "job_cd", "job_code", "contract_id", "work_area") || lowerName.includes("contract")) {
    return "contracts";
  }

  if (has("employee_id", "emp_id", "email", "mobile", "role", "user_role") || lowerName.includes("user") || lowerName.includes("employee")) {
    return "users";
  }

  return csvType.value === "auto" ? "workers" : csvType.value;
}

function saveUploadedTable(type, rows) {
  localStorage.setItem(`adminUploaded_${type}`, JSON.stringify(rows));
}

function readUploadedTable(type) {
  return JSON.parse(localStorage.getItem(`adminUploaded_${type}`) || "[]");
}

function applyUploadedStats() {
  document.getElementById("totalUsers").textContent = users.length;
  document.getElementById("totalContracts").textContent = contracts.length;
  document.getElementById("totalWorkers").textContent = workers.length;
  document.getElementById("totalMuster").textContent = muster.length;
}

function setupDropZone(zone, onFiles) {
  zone.addEventListener("dragover", (event) => {
    event.preventDefault();
    zone.classList.add("drag-over");
  });

  zone.addEventListener("dragleave", () => {
    zone.classList.remove("drag-over");
  });

  zone.addEventListener("drop", (event) => {
    event.preventDefault();
    zone.classList.remove("drag-over");
    onFiles(Array.from(event.dataTransfer.files || []));
  });
}

async function handleCsvUpload(event) {
  await handleCsvFiles(Array.from(event.target.files || []));
  csvUpload.value = "";
}

async function handleCsvFiles(files) {
  if (!files.length) return;
  const results = [];

  for (const file of files) {
    results.push(await importDataFile(file, csvType.value));
  }

  const imported = results.filter((result) => result.ok);
  const rejected = results.filter((result) => !result.ok);
  const importedText = imported.map((result) => `${result.name}: ${result.count} ${result.type} row(s)`).join("; ");
  const rejectedText = rejected.map((result) => `${result.name}: ${result.message}`).join("; ");

  csvUploadStatus.textContent = [
    importedText ? `Imported ${importedText}.` : "",
    rejectedText ? `Skipped ${rejectedText}.` : "",
  ].filter(Boolean).join(" ");
}

async function importDataFile(file, preferredType = "auto") {
  const fileName = file.name.toLowerCase();
  const isCsv = fileName.endsWith(".csv");
  const isExcel = fileName.endsWith(".xls") || fileName.endsWith(".xlsx");

  if (!isCsv && !isExcel) {
    return { ok: false, name: file.name, message: "not a CSV/XLS/XLSX data file" };
  }

  try {
    const parsed = isCsv
      ? parseCsv(await file.text())
      : parseExcel(await file.arrayBuffer());
    const type = preferredType === "auto" ? detectTableType(parsed, file.name) : preferredType;
    const rows = normalizeCsvRows(type, parsed);

    if (type === "users") {
      users = [...users, ...rows];
      renderUsers(users);
    } else if (type === "contracts") {
      contracts = [...contracts, ...rows];
      renderContracts();
    } else if (type === "workers") {
      workers = [...workers, ...rows];
      renderWorkers();
    } else {
      muster = [...muster, ...rows];
      renderMuster();
    }

    saveUploadedTable(type, getTableRows(type));
    applyUploadedStats();
    return { ok: true, name: file.name, type, count: rows.length };
  } catch (err) {
    console.error(err);
    return { ok: false, name: file.name, message: err.message || "could not read this file" };
  }
}

function getTableRows(type) {
  if (type === "users") return users;
  if (type === "contracts") return contracts;
  if (type === "workers") return workers;
  return muster;
}

async function handleDocumentUpload(event) {
  await handleDocumentFiles(Array.from(event.target.files || []));
  documentUpload.value = "";
}

async function handleDocumentFiles(files) {
  if (!files.length) return;
  const imported = [];

  for (const file of files.filter((item) => /\.(csv|xls|xlsx)$/i.test(item.name))) {
    const result = await importDataFile(file, "auto");
    if (result.ok) imported.push(result);
  }

  uploadedDocuments = [
    ...uploadedDocuments,
    ...files.map((file) => ({
      name: file.name,
      size: file.size,
      type: file.type || "Unknown type",
      uploadedAt: new Date().toLocaleString("en-IN"),
      linkedTo: imported.find((result) => result.name === file.name)?.type || "Documents",
    })),
  ];

  localStorage.setItem("adminUploadedDocuments", JSON.stringify(uploadedDocuments));
  renderDocuments();
  if (imported.length) {
    csvUploadStatus.textContent = `Auto imported ${imported.map((item) => `${item.count} ${item.type} row(s) from ${item.name}`).join("; ")}.`;
  }
}

function renderDocuments() {
  if (!uploadedDocuments.length) {
    documentList.innerHTML = "<li>No documents uploaded.</li>";
    return;
  }

  documentList.innerHTML = uploadedDocuments.map((file) => `
    <li>
      <strong>${file.name}</strong>
      <span>${formatFileSize(file.size)} · ${file.uploadedAt} · ${file.linkedTo || "Documents"}</span>
    </li>
  `).join("");
}

function formatFileSize(bytes) {
  if (!bytes) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function clearUploadedData() {
  ["users", "contracts", "workers", "muster"].forEach((type) => {
    localStorage.removeItem(`adminUploaded_${type}`);
  });
  localStorage.removeItem("adminUploadedDocuments");
  users = [];
  contracts = [];
  workers = [];
  muster = [];
  uploadedDocuments = [];
  csvUploadStatus.textContent = "Uploaded data cleared.";
  renderDocuments();
  loadSafely(loadStats, "Stats");
  loadSafely(loadUsers, "Users");
  loadSafely(loadContracts, "Contracts");
  loadSafely(loadWorkers, "Workers");
  loadSafely(loadMuster, "Muster");
}

async function loadExpenseReport() {
  const month = expenseMonth.value;
  if (!month) {
    alert("Please select a month.");
    return;
  }

  try {
    const data = await fetchJson(`${API_BASE}/admin/wage-expenses?month=${month}`);
    renderExpenseTable(data.jobs || [], data.total_expense || 0);
  } catch (err) {
    console.error(err);
    expenseBody.innerHTML = `<tr><td colspan="5">${err.message || "Error loading expense report"}</td></tr>`;
    totalExpense.textContent = "₹0";
    alert(`Error loading expense report: ${err.message || "Please make sure the backend server is running."}`);
  }
}

function renderExpenseTable(jobs, total) {
  if (!jobs.length) {
    expenseBody.innerHTML = `<tr><td colspan="5">No data found.</td></tr>`;
    totalExpense.textContent = "₹0";
    return;
  }

  expenseBody.innerHTML = jobs.map((job) => `
    <tr>
      <td>${job.job_cd}</td>
      <td>${job.contractor_name}</td>
      <td>${job.worker_count}</td>
      <td>${job.total_present_days}</td>
      <td>₹${Number(job.wage_expense).toLocaleString("en-IN")}</td>
    </tr>
  `).join("");

  totalExpense.textContent = `₹${Number(total).toLocaleString("en-IN")}`;
}

function showSection(id, btn) {
  sections.forEach((section) => section.classList.remove("active"));
  navBtns.forEach((button) => button.classList.remove("active"));
  document.getElementById(id).classList.add("active");
  if (btn) btn.classList.add("active");
  pageTitle.textContent = btn ? btn.childNodes[0].textContent.trim() : "Admin Dashboard";
}

document.getElementById("logoutBtn").addEventListener("click", () => {
  localStorage.removeItem("rinlSession");
  localStorage.removeItem("rinlSelectedRole");
});

async function loadStats() {
  if (hasUploadedData()) {
    applyUploadedStats();
    return;
  }

  const data = await fetchJson(`${API_BASE}/admin/stats`);
  document.getElementById("totalUsers").textContent = data.total_users;
  document.getElementById("totalContracts").textContent = data.total_contracts;
  document.getElementById("totalWorkers").textContent = data.total_workers;
  document.getElementById("totalMuster").textContent = data.total_muster;
  document.getElementById("totalWage").textContent = `₹${Number(data.total_wage).toLocaleString("en-IN")}`;
}

async function loadUsers() {
  const uploaded = readUploadedTable("users");
  if (uploaded.length) {
    users = uploaded;
    renderUsers(users);
    applyUploadedStats();
    return;
  }

  users = await fetchJson(`${API_BASE}/admin/users`);
  renderUsers(users);
}

function renderUsers(list) {
  const body = document.getElementById("usersBody");
  body.innerHTML = list.map((u) => `
    <tr>
      <td>${u.employee_id || "-"}</td>
      <td>${u.name || "-"}</td>
      <td>${u.email || "-"}</td>
      <td>${u.mobile || "-"}</td>
      <td>${u.role || "-"}</td>
      <td><span class="badge ${u.status === "active" ? "active-badge" : u.status === "inactive" ? "inactive-badge" : "pending-badge"}">${u.status || "pending"}</span></td>
      <td>
        <button onclick="changeUserStatus(${u.id}, 'active')">Activate</button>
        <button onclick="changeUserStatus(${u.id}, 'inactive')">Deactivate</button>
      </td>
    </tr>
  `).join("");
}

document.getElementById("roleFilter").addEventListener("change", (event) => {
  const role = event.target.value;
  renderUsers(role ? users.filter((u) => u.role === role) : users);
});

async function changeUserStatus(id, status) {
  await fetchJson(`${API_BASE}/admin/users/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  loadUsers();
  loadStats();
}

async function loadContracts() {
  const uploaded = readUploadedTable("contracts");
  if (uploaded.length) {
    contracts = uploaded;
    renderContracts();
    applyUploadedStats();
    return;
  }

  contracts = await fetchJson(`${API_BASE}/contracts`);
  renderContracts();
}

function renderContracts() {
  document.getElementById("contractsBody").innerHTML = contracts.map((c) => `
    <tr>
      <td>${c.job_cd || "-"}</td>
      <td>${c.contractor_name || "-"}</td>
      <td>${c.contractor_phone || "-"}</td>
      <td>${c.work_area || "-"}</td>
      <td>${c.dept_cd || "-"}</td>
      <td>${formatDate(c.job_start_dt)} to ${formatDate(c.job_end_dt)}</td>
    </tr>
  `).join("");
}

async function loadWorkers() {
  const uploaded = readUploadedTable("workers");
  if (uploaded.length) {
    workers = uploaded;
    renderWorkers();
    applyUploadedStats();
    return;
  }

  workers = await fetchJson(`${API_BASE}/workers`);
  renderWorkers();
}

function renderWorkers() {
  document.getElementById("workersBody").innerHTML = workers.map((w) => `
    <tr>
      <td>${w.adhar_id || "-"}</td>
      <td>${w.worker_name || "-"}</td>
      <td>${w.job_cd || "-"}</td>
      <td>${w.worker_desig || "-"}</td>
      <td>${w.worker_skill || "-"}</td>
      <td>${w.worker_gender || "-"}</td>
    </tr>
  `).join("");
}

async function loadMuster() {
  const uploaded = readUploadedTable("muster");
  if (uploaded.length) {
    muster = uploaded;
    renderMuster();
    applyUploadedStats();
    return;
  }

  muster = await fetchJson(`${API_BASE}/muster`);
  renderMuster();
}

function renderMuster() {
  document.getElementById("musterBody").innerHTML = muster.map((m) => `
    <tr>
      <td>${m.worker_name || "-"}</td>
      <td>${m.job_cd || "-"}</td>
      <td>${m.muster_month || "-"}</td>
      <td>${m.present || 0}</td>
      <td>${m.absent || 0}</td>
      <td>${m.weekly_off || 0}</td>
      <td>${m.holidays || 0}</td>
      <td>${m.leaves || 0}</td>
    </tr>
  `).join("");
}

function hasUploadedData() {
  return ["users", "contracts", "workers", "muster"].some((type) => readUploadedTable(type).length);
}

async function loadRates() {
  const rates = await fetchJson(`${API_BASE}/admin/wage-rates`);
  document.getElementById("ratesBody").innerHTML = rates.map((r) => `
    <tr>
      <td>${r.worker_skill}</td>
      <td><input type="number" id="rate-${r.worker_skill}" value="${r.daily_wage}" /></td>
      <td><button onclick="updateRate('${r.worker_skill}')">Update</button></td>
    </tr>
  `).join("");
}

async function updateRate(skill) {
  const value = document.getElementById(`rate-${skill}`).value;
  await fetchJson(`${API_BASE}/admin/wage-rates/${skill}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ daily_wage: value }),
  });
  alert("Wage rate updated");
  loadRates();
  loadStats();
}

function formatDate(date) {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("en-IN");
}

document.getElementById("profileName").textContent = user.name || "-";
document.getElementById("profileEmail").textContent = user.email || "-";
document.getElementById("profileEmployeeId").textContent = user.employee_id || user.empId || "-";
document.getElementById("profileRole").textContent = user.role || "-";

function loadSafely(loader, label) {
  loader().catch((err) => {
    console.error(`${label} failed`, err);
  });
}

loadSafely(loadStats, "Stats");
loadSafely(loadUsers, "Users");
loadSafely(loadContracts, "Contracts");
loadSafely(loadWorkers, "Workers");
loadSafely(loadMuster, "Muster");
loadSafely(loadRates, "Rates");
renderDocuments();
