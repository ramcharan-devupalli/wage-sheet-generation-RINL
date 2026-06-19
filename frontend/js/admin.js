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
const summaryReviewBody = document.getElementById("summaryReviewBody");
const summaryReviewDialog = document.getElementById("summaryReviewDialog");
const summaryReviewDetails = document.getElementById("summaryReviewDetails");
const summaryReviewTitle = document.getElementById("summaryReviewTitle");
const summaryReviewMeta = document.getElementById("summaryReviewMeta");
const adminSummaryNote = document.getElementById("adminSummaryNote");
const approveSummaryBtn = document.getElementById("approveSummaryBtn");
const adminAlertList = document.getElementById("adminAlertList");

const sections = document.querySelectorAll(".section");
const navBtns = document.querySelectorAll(".nav-btn");
const pageTitle = document.getElementById("pageTitle");
const ENGINEER_SUMMARY_KEY = "rinl_engineer_summary_submissions";
const LOCAL_WAGE_KEY = "rinl_wage_sheet_submissions";

let users = [];
let contracts = [];
let workers = [];
let muster = [];
let wageExpenses = [];
let uploadedDocuments = JSON.parse(localStorage.getItem("adminUploadedDocuments") || "[]");
let activeSummaryReviewId = "";

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
approveSummaryBtn.addEventListener("click", approveSummaryReview);

document.body.addEventListener("click", (event) => {
  const reviewButton = event.target.closest("[data-summary-review]");
  if (reviewButton) openSummaryReview(reviewButton.dataset.summaryReview);
});

window.addEventListener("storage", (event) => {
  if (event.key === ENGINEER_SUMMARY_KEY || event.key === LOCAL_WAGE_KEY || event.key === "adminUploadedDocuments") {
    renderSummaryReviews();
    renderAdminAlerts();
  }
});

window.addEventListener("focus", () => {
  renderSummaryReviews();
  renderAdminAlerts();
});

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

const PRESENT_KEYS = ["present", "p", "days_present", "present_days", "total_present_days", "present_day", "attendance_days", "worked_days", "work_days"];
const RATE_KEYS = ["daily_wage", "wage", "wage_rate", "rate", "daily_rate", "rate_per_day", "wage_per_day", "basic_wage", "basic_rate", "per_day_rate", "per_day_wage"];
const EXPENSE_KEYS = ["expense", "wage_expense", "total_expense", "monthly_expense", "gross_wage", "gross", "total_wage", "net_wage", "net", "amount", "total_amount", "wage_amount", "salary", "payroll"];

function toNumber(value) {
  const cleaned = String(value ?? "")
    .replace(/,/g, "")
    .replace(/rs\.?/gi, "")
    .replace(/[^\d.-]/g, "")
    .trim();
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : 0;
}

function pickNumber(row, keys, fallback = 0) {
  const value = pick(row, keys, fallback);
  return toNumber(value);
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
      password: pick(row, ["password", "pwd"], "1234"),
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
      daily_wage: pickNumber(row, RATE_KEYS),
    }));
  }

  if (type === "wages") {
    return rows.map((row) => {
      const presentDays = pickNumber(row, PRESENT_KEYS);
      const dailyWage = pickNumber(row, RATE_KEYS);
      const uploadedExpense = pickNumber(row, EXPENSE_KEYS);

      return {
        worker_id: pick(row, ["worker_id", "adhar_id", "aadhaar_id", "aadhar_id"], ""),
        worker_name: pick(row, ["worker_name", "name"], ""),
        job_cd: pick(row, ["job_cd", "job_code", "contractor_id", "contract_id"]),
        contractor_name: pick(row, ["contractor_name", "contractor"], "-"),
        wage_month: pick(row, ["wage_month", "muster_month", "month", "period", "date"]),
        present: presentDays,
        worker_count: pickNumber(row, ["worker_count", "workers", "total_workers", "no_of_workers", "number_of_workers"]),
        daily_wage: dailyWage,
        wage_expense: uploadedExpense || presentDays * dailyWage,
      };
    });
  }

  return rows.map((row) => ({
    worker_name: pick(row, ["worker_name", "name"]),
    worker_id: pick(row, ["worker_id", "adhar_id", "aadhaar_id", "aadhar_id"], ""),
    job_cd: pick(row, ["job_cd", "job_code", "contractor_id"]),
    contractor_name: pick(row, ["contractor_name", "contractor"], "-"),
    muster_month: pick(row, ["muster_month", "month", "date"]),
    present: pickNumber(row, PRESENT_KEYS),
    worker_count: pickNumber(row, ["worker_count", "workers", "total_workers", "no_of_workers", "number_of_workers"]),
    daily_wage: pickNumber(row, RATE_KEYS),
    wage_expense: pickNumber(row, EXPENSE_KEYS),
    absent: pickNumber(row, ["absent", "a"]),
    weekly_off: pickNumber(row, ["weekly_off", "wo"]),
    holidays: pickNumber(row, ["holidays", "h"]),
    leaves: pickNumber(row, ["leaves", "l"]),
  }));
}

function detectTableType(rows, fileName = "") {
  const keys = new Set(Object.keys(rows[0] || {}));
  const has = (...names) => names.some((name) => keys.has(normalizeKey(name)));
  const lowerName = fileName.toLowerCase();

  if (has(...EXPENSE_KEYS, ...RATE_KEYS, "days_present", "present_days", "wage_month") || lowerName.includes("wage") || lowerName.includes("payroll")) {
    return "wages";
  }

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
  const uploadedWageRows = wageExpenses.length ? wageExpenses : readUploadedTable("wages");
  const uploadedWageTotal = uploadedWageRows.reduce((sum, row) => sum + Number(row.wage_expense || 0), 0);
  if (uploadedWageTotal) document.getElementById("totalWage").textContent = formatMoney(uploadedWageTotal);
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

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function readEngineerSummaries() {
  try {
    return JSON.parse(localStorage.getItem(ENGINEER_SUMMARY_KEY) || "[]");
  } catch (error) {
    return [];
  }
}

function writeEngineerSummaries(summaries) {
  localStorage.setItem(ENGINEER_SUMMARY_KEY, JSON.stringify(summaries));
}

function readLocalWageSubmissions() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_WAGE_KEY) || "[]");
  } catch (error) {
    return [];
  }
}

function reviewBadge(status) {
  const normalized = String(status || "").toLowerCase();
  const cls = normalized.includes("approved") ? "active-badge" : normalized.includes("rejected") ? "inactive-badge" : "pending-badge";
  return `<span class="badge ${cls}">${esc(status || "Pending")}</span>`;
}

function renderSummaryReviews() {
  if (!summaryReviewBody) return;

  const summaries = readEngineerSummaries();
  if (!summaries.length) {
    summaryReviewBody.innerHTML = `<tr><td colspan="7">No engineer summaries submitted yet.</td></tr>`;
    return;
  }

  summaryReviewBody.innerHTML = summaries.map((summary) => `
    <tr>
      <td>${esc(summary.engineerName || "Engineer In-Charge")}</td>
      <td>${esc(summary.period || "-")}</td>
      <td>${Number(summary.totals?.contractors || 0)}</td>
      <td>${Number(summary.totals?.workers || 0)}</td>
      <td>${formatMoney(summary.totals?.wageCost || 0)}</td>
      <td>${reviewBadge(summary.status)}</td>
      <td><button type="button" data-summary-review="${esc(summary.id)}">View Details</button></td>
    </tr>
  `).join("");
}

function buildAdminAlerts() {
  const summaryAlerts = readEngineerSummaries().map((summary) => {
    const approved = /approved/i.test(summary.status || "");
    return {
      title: approved ? "Engineer summary approved" : "Engineer summary submitted",
      text: `${summary.engineerName || "Engineer In-Charge"} - ${summary.period || "Current period"} - ${summary.status || "Submitted to Admin"}`,
      time: summary.reviewedAt || summary.submittedAt,
      tone: approved ? "good" : "warn",
      action: approved ? "" : summary.id
    };
  });

  const wageAlerts = readLocalWageSubmissions()
    .filter((submission) => !/approved by engineer|rejected by engineer/i.test(submission.status || ""))
    .map((submission) => ({
      title: "Contractor wage sheet pending engineer review",
      text: `${submission.contractor || "Contractor"} submitted ${submission.month || "current period"} wage sheet.`,
      time: submission.submittedAt,
      tone: "warn",
      action: ""
    }));

  const documentAlerts = uploadedDocuments.slice(-5).map((file) => ({
    title: "Document uploaded",
    text: `${file.name} linked to ${file.linkedTo || "Documents"}.`,
    time: file.uploadedAt,
    tone: "info",
    action: ""
  }));

  return [...summaryAlerts, ...wageAlerts, ...documentAlerts].sort((a, b) => {
    const aTime = new Date(a.time || 0).getTime();
    const bTime = new Date(b.time || 0).getTime();
    return bTime - aTime;
  });
}

function renderAdminAlerts() {
  if (!adminAlertList) return;

  const alerts = buildAdminAlerts();
  if (!alerts.length) {
    adminAlertList.innerHTML = `
      <div class="alert-item">
        <strong>No notifications</strong>
        <span>Engineer summary submissions and workflow alerts will appear here.</span>
      </div>
    `;
    return;
  }

  adminAlertList.innerHTML = alerts.map((alert) => `
    <div class="alert-item ${alert.tone}">
      <div>
        <strong>${esc(alert.title)}</strong>
        <span>${esc(alert.text)}</span>
        <small>${alert.time ? esc(new Date(alert.time).toLocaleString("en-IN")) : "Just now"}</small>
      </div>
      ${alert.action ? `<button type="button" data-summary-review="${esc(alert.action)}">View Details</button>` : ""}
    </div>
  `).join("");
}

function detailRows(items) {
  return items.map(([label, value]) => `
    <div class="review-row">
      <span>${esc(label)}</span>
      <strong>${esc(value)}</strong>
    </div>
  `).join("");
}

function wageSheetRows(rows) {
  if (!rows.length) return `<p class="upload-hint">No wage sheet details available.</p>`;

  return `
    <table>
      <thead>
        <tr><th>Contractor</th><th>Month</th><th>Workers</th><th>Amount</th><th>Status</th></tr>
      </thead>
      <tbody>
        ${rows.map((row) => `
          <tr>
            <td>${esc(row.contractor || row.contractorName || "-")}</td>
            <td>${esc(row.month || row.period || "-")}</td>
            <td>${Number(row.workers || 0)}</td>
            <td>${formatMoney(row.amount || row.net || row.gross || 0)}</td>
            <td>${reviewBadge(row.status || "Submitted")}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function openSummaryReview(summaryId) {
  const summary = readEngineerSummaries().find((item) => item.id === summaryId);
  if (!summary) return;

  const contractorWageSheets = summary.contractorWageSheets?.length ? summary.contractorWageSheets : readLocalWageSubmissions();
  activeSummaryReviewId = summaryId;
  summaryReviewTitle.textContent = `${summary.engineerName || "Engineer In-Charge"} Summary`;
  summaryReviewMeta.textContent = `${summary.period || "-"} | Submitted ${summary.submittedAt ? new Date(summary.submittedAt).toLocaleString("en-IN") : "-"}`;
  adminSummaryNote.value = summary.adminNote || "";
  summaryReviewDetails.innerHTML = `
    <div class="review-grid">
      <section class="review-card">
        <h4>Operational Summary</h4>
        <p class="upload-hint">${esc(summary.operationalSummary || "-")}</p>
        ${detailRows([
          ["Contractors", summary.totals?.contractors || 0],
          ["Workers", summary.totals?.workers || 0],
          ["Pending Wage Sheets", summary.totals?.pendingWageSheets || 0],
          ["Status", summary.status || "Submitted to Admin"],
        ])}
      </section>
      <section class="review-card">
        <h4>Financial Summary</h4>
        <p class="upload-hint">${esc(summary.financialSummary || "-")}</p>
        ${detailRows([
          ["Total Wage Cost", formatMoney(summary.totals?.wageCost || 0)],
          ["Contractor Wage Sheets", contractorWageSheets.length],
          ["Engineer Wage Sheets", summary.engineerWageSheets?.length || 0],
          ["Reviewed At", summary.reviewedAt ? new Date(summary.reviewedAt).toLocaleString("en-IN") : "Pending"],
        ])}
      </section>
      <section class="review-card full">
        <h4>Contractor Wage Sheets</h4>
        ${wageSheetRows(contractorWageSheets)}
      </section>
      <section class="review-card full">
        <h4>Engineer In-Charge Wage Sheet Snapshot</h4>
        ${wageSheetRows(summary.engineerWageSheets || [])}
      </section>
    </div>
  `;
  summaryReviewDialog.showModal();
}

function approveSummaryReview(event) {
  event.preventDefault();
  const summaries = readEngineerSummaries();
  const index = summaries.findIndex((summary) => summary.id === activeSummaryReviewId);
  if (index < 0) return;

  summaries[index] = {
    ...summaries[index],
    status: "Approved by Admin",
    adminNote: adminSummaryNote.value.trim() || "Summary approved. Wage-sheet details reviewed and accepted.",
    reviewedAt: new Date().toISOString()
  };
  writeEngineerSummaries(summaries);
  renderSummaryReviews();
  renderAdminAlerts();
  summaryReviewDialog.close();
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
  renderAdminAlerts();
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
    const syncedRows = await syncImportedRows(type, rows);

    if (type === "users") {
      users = [...users, ...syncedRows];
      renderUsers(users);
    } else if (type === "contracts") {
      contracts = [...contracts, ...syncedRows];
      renderContracts();
    } else if (type === "workers") {
      workers = [...workers, ...syncedRows];
      renderWorkers();
    } else if (type === "wages") {
      wageExpenses = [...wageExpenses, ...rows];
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

async function syncImportedRows(type, rows) {
  const importPath = {
    users: "users",
    contracts: "contracts",
    workers: "workers",
  }[type];

  if (!importPath) return rows;

  const data = await fetchJson(`${API_BASE}/admin/import/${importPath}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rows }),
  });

  return data[type] || rows;
}

function getTableRows(type) {
  if (type === "users") return users;
  if (type === "contracts") return contracts;
  if (type === "workers") return workers;
  if (type === "wages") return wageExpenses;
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
  renderAdminAlerts();
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
  ["users", "contracts", "workers", "muster", "wages"].forEach((type) => {
    localStorage.removeItem(`adminUploaded_${type}`);
  });
  localStorage.removeItem("adminUploadedDocuments");
  users = [];
  contracts = [];
  workers = [];
  muster = [];
  wageExpenses = [];
  uploadedDocuments = [];
  csvUploadStatus.textContent = "Uploaded data cleared.";
  renderDocuments();
  renderAdminAlerts();
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

  if (hasUploadedExpenseData()) {
    const report = buildUploadedExpenseReport(month);
    renderExpenseTable(report.jobs, report.total_expense);
    return;
  }

  try {
    const data = await fetchJson(`${API_BASE}/admin/wage-expenses?month=${month}`);
    renderExpenseTable(data.jobs || [], data.total_expense || 0);
  } catch (err) {
    console.error(err);
    expenseBody.innerHTML = `<tr><td colspan="5">No uploaded wage data found for this month. Upload wage, muster, and worker files, or start the backend server on port 3000.</td></tr>`;
    totalExpense.textContent = formatMoney(0);
  }
}

function hasUploadedExpenseData() {
  return readUploadedTable("wages").length > 0 || readUploadedTable("muster").length > 0;
}

function buildUploadedExpenseReport(month) {
  const uploadedWorkers = workers.length ? workers : readUploadedTable("workers");
  const uploadedMuster = muster.length ? muster : readUploadedTable("muster");
  const uploadedWages = wageExpenses.length ? wageExpenses : readUploadedTable("wages");
  const uploadedContracts = contracts.length ? contracts : readUploadedTable("contracts");
  const workerById = new Map();
  const contractByJob = new Map();
  const groups = new Map();

  uploadedWorkers.forEach((worker) => {
    const id = normalizeLookupValue(worker.adhar_id || worker.worker_id || worker.id);
    if (id) workerById.set(id, worker);
    const name = normalizeLookupValue(worker.worker_name || worker.name);
    if (name) workerById.set(name, worker);
  });

  uploadedContracts.forEach((contract) => {
    const jobCode = normalizeLookupValue(contract.job_cd || contract.contractor_id);
    if (jobCode) contractByJob.set(jobCode, contract);
  });

  uploadedWages
    .filter((entry) => isSameExpenseMonth(entry.wage_month || entry.muster_month || entry.month || entry.date, month))
    .forEach((entry) => {
      addExpenseGroup(groups, contractByJob, {
        job_cd: entry.job_cd,
        contractor_name: entry.contractor_name,
        worker_id: entry.worker_id || entry.worker_name,
        present: entry.present,
        worker_count: entry.worker_count,
        daily_wage: entry.daily_wage,
        wage_expense: entry.wage_expense,
      });
    });

  uploadedMuster
    .filter((entry) => isSameExpenseMonth(entry.muster_month, month))
    .forEach((entry) => {
      const worker = workerById.get(normalizeLookupValue(entry.adhar_id || entry.worker_id || entry.worker_name)) || {};
      const jobCode = entry.job_cd || worker.job_cd || "-";
      const presentDays = toNumber(entry.present || entry.days_present);
      const dailyWage = toNumber(worker.daily_wage || worker.wage_rate || entry.daily_wage || entry.wage_rate);
      addExpenseGroup(groups, contractByJob, {
        job_cd: jobCode,
        contractor_name: entry.contractor_name,
        worker_id: entry.adhar_id || entry.worker_id || worker.adhar_id || worker.worker_name || entry.worker_name,
        present: presentDays,
        worker_count: entry.worker_count,
        daily_wage: dailyWage,
        wage_expense: toNumber(entry.wage_expense) || presentDays * dailyWage,
      });
    });

  const jobs = Array.from(groups.values()).map((group) => ({
    job_cd: group.job_cd,
    contractor_name: group.contractor_name,
    worker_count: group.workerIds.size || group.explicitWorkerCount || "-",
    total_present_days: group.total_present_days,
    wage_expense: group.wage_expense,
  }));

  return {
    jobs,
    total_expense: jobs.reduce((sum, job) => sum + Number(job.wage_expense || 0), 0),
  };
}

function addExpenseGroup(groups, contractByJob, entry) {
  const jobCode = entry.job_cd || "-";
  const contract = contractByJob.get(normalizeLookupValue(jobCode)) || {};
  const key = jobCode || "-";
  const group = groups.get(key) || {
    job_cd: key,
    contractor_name: entry.contractor_name || contract.contractor_name || contract.name || "-",
    workerIds: new Set(),
    explicitWorkerCount: 0,
    total_present_days: 0,
    wage_expense: 0,
  };
  const workerId = normalizeLookupValue(entry.worker_id);
  const workerCount = toNumber(entry.worker_count);
  const presentDays = toNumber(entry.present);
  const wageExpense = toNumber(entry.wage_expense) || presentDays * toNumber(entry.daily_wage);

  if (workerId) group.workerIds.add(workerId);
  group.explicitWorkerCount += workerCount;
  group.total_present_days += presentDays;
  group.wage_expense += wageExpense;
  groups.set(key, group);
}

function normalizeLookupValue(value) {
  return String(value || "").trim().toLowerCase();
}

function isSameExpenseMonth(value, selectedMonth) {
  if (!value) return false;
  const raw = String(value).trim();
  const selected = String(selectedMonth).trim();
  const [year, month] = selected.split("-");
  const monthNumber = Number(month);
  const monthDate = new Date(Number(year), monthNumber - 1, 1);
  const monthNames = [
    monthDate.toLocaleString("en-US", { month: "long" }).toLowerCase(),
    monthDate.toLocaleString("en-US", { month: "short" }).toLowerCase(),
  ];
  const normalized = raw.toLowerCase();

  if (normalized === selected) return true;
  if (normalized === month || normalized === String(monthNumber)) return true;
  if (monthNames.includes(normalized)) return true;

  const parsed = new Date(raw);
  return !Number.isNaN(parsed.getTime())
    && parsed.getFullYear() === Number(year)
    && parsed.getMonth() + 1 === monthNumber;
}

function renderExpenseTable(jobs, total) {
  if (!jobs.length) {
    expenseBody.innerHTML = `<tr><td colspan="5">No data found.</td></tr>`;
    totalExpense.textContent = formatMoney(0);
    return;
  }

  expenseBody.innerHTML = jobs.map((job) => `
    <tr>
      <td>${job.job_cd}</td>
      <td>${job.contractor_name}</td>
      <td>${job.worker_count}</td>
      <td>${job.total_present_days}</td>
      <td>${formatMoney(job.wage_expense)}</td>
    </tr>
  `).join("");

  totalExpense.textContent = formatMoney(total);
}

function formatMoney(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
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
  document.getElementById("totalWage").textContent = formatMoney(data.total_wage);
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
  return ["users", "contracts", "workers", "muster", "wages"].some((type) => readUploadedTable(type).length);
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
renderSummaryReviews();
renderAdminAlerts();
