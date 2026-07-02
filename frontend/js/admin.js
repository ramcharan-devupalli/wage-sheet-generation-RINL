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
const csvDownloadType = document.getElementById("csvDownloadType");
const downloadCsvBtn = document.getElementById("downloadCsvBtn");
const downloadAllCsvBtn = document.getElementById("downloadAllCsvBtn");
const csvDownloadStatus = document.getElementById("csvDownloadStatus");
const documentUpload = document.getElementById("documentUpload");
const documentList = document.getElementById("documentList");
const csvDropZone = document.getElementById("csvDropZone");
const documentDropZone = document.getElementById("documentDropZone");
const summaryReviewBody = document.getElementById("summaryReviewBody");
const engineerForm = document.getElementById("engineerForm");
const engineerFormStatus = document.getElementById("engineerFormStatus");
const contractForm = document.getElementById("contractForm");
const contractFormStatus = document.getElementById("contractFormStatus");
const supervisorForm = document.getElementById("supervisorForm");
const supervisorFormStatus = document.getElementById("supervisorFormStatus");
const workerForm = document.getElementById("workerForm");
const workerFormStatus = document.getElementById("workerFormStatus");
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
const SUPERVISOR_ATTENDANCE_KEY = "rinl_supervisor_attendance_overrides";
const CONTRACT_DEPT_KEY = "rinl_contract_dept_overrides";
const ENGINEER_DIRECTORY_KEY = "rinl_engineer_directory";
const WORKER_EDIT_KEY = "rinl_worker_edit_overrides";
const WAGE_RATE_SETTINGS_KEY = "rinl_wage_rate_settings";
const WAGE_RATE_CATEGORIES = [
  { key: "Supervisor", label: "Supervisor" },
  { key: "Skilled", label: "Skilled" },
  { key: "Semi Skilled", label: "Semi Skilled" },
  { key: "UnSkilled", label: "UnSkilled" },
];

let users = [];
let engineers = [];
let contracts = [];
let supervisors = [];
let workers = [];
let muster = [];
let wageExpenses = [];
let loginActivity = [];
let uploadedDocuments = JSON.parse(localStorage.getItem("adminUploadedDocuments") || "[]");
let activeSummaryReviewId = "";
let adminSearchText = "";

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
documentUpload?.addEventListener("change", handleDocumentUpload);
clearUploadedDataBtn.addEventListener("click", clearUploadedData);
downloadCsvBtn?.addEventListener("click", () => downloadCsv(csvDownloadType.value));
downloadAllCsvBtn?.addEventListener("click", downloadAllCsvFiles);
engineerForm?.addEventListener("submit", saveEngineer);
contractForm?.addEventListener("submit", saveContractor);
supervisorForm?.addEventListener("submit", saveSupervisor);
workerForm?.addEventListener("submit", saveWorker);
document.getElementById("openEngineerFormBtn")?.addEventListener("click", openEngineerForm);
document.getElementById("openContractFormBtn")?.addEventListener("click", openContractForm);
document.getElementById("openSupervisorFormBtn")?.addEventListener("click", openSupervisorForm);
document.getElementById("openWorkerFormBtn")?.addEventListener("click", openWorkerForm);
document.getElementById("resetEngineerFormBtn")?.addEventListener("click", resetEngineerForm);
document.getElementById("resetContractFormBtn")?.addEventListener("click", resetContractForm);
document.getElementById("resetSupervisorFormBtn")?.addEventListener("click", resetSupervisorForm);
document.getElementById("resetWorkerFormBtn")?.addEventListener("click", resetWorkerForm);
setupDropZone(csvDropZone, handleCsvFiles);
if (documentDropZone) setupDropZone(documentDropZone, handleDocumentFiles);
approveSummaryBtn.addEventListener("click", approveSummaryReview);
document.getElementById("globalSearch")?.addEventListener("input", (event) => {
  adminSearchText = event.target.value.trim().toLowerCase();
  renderSearchableTables();
});

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

function isEngineerRecord(row) {
  const text = [
    row?.role,
    row?.name,
    row?.email,
    row?.employee_id,
    row?.emp_id,
    row?.rinl_id,
  ].join(" ").toLowerCase();

  return /\b(engineer|eic|engineer incharge|engineer in charge)\b/.test(text);
}

function inferUserRole(row, fallback = "Admin") {
  const explicitRole = pick(row, ["role", "user_role"], "");
  if (explicitRole) return explicitRole;
  return isEngineerRecord(row) ? "Engineer Incharge" : fallback;
}

function mergePeopleRows(rows) {
  const merged = new Map();
  rows.forEach((row) => {
    const key = String(row?.id || row?.employee_id || row?.emp_id || row?.rinl_id || row?.email || "").toLowerCase();
    if (!key) return;
    merged.set(key, { ...(merged.get(key) || {}), ...row });
  });
  return Array.from(merged.values());
}

const PRESENT_KEYS = ["present", "p", "days_present", "present_days", "total_present_days", "present_day", "attendance_days", "worked_days", "work_days"];
const RATE_KEYS = ["daily_wage", "daily_wages", "daily wage", "daily wages", "wage", "wages", "wage_rate", "wage rate", "rate", "daily_rate", "daily rate", "rate_per_day", "rate per day", "wage_per_day", "wage per day", "basic_wage", "basic wage", "basic_rate", "basic rate", "per_day_rate", "per day rate", "per_day_wage", "per day wage"];
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

function hasCsvValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== "" && String(value).trim() !== "-";
}

function preferCsvValue(csvValue, syncedValue) {
  return hasCsvValue(csvValue) ? csvValue : syncedValue;
}

function normalizeCsvRows(type, rows) {
  if (type === "users") {
    return rows.map((row, index) => {
      const normalized = {
        id: Number(pick(row, ["id"], index + 1)),
        employee_id: pick(row, ["rinl_id", "rinl-id", "employee_id", "emp_id", "id"], index + 1),
        name: pick(row, ["name", "employee_name", "user_name"]),
        email: pick(row, ["email", "mail"]),
        mobile: pick(row, ["mobile", "phone", "phone_number"]),
        password: pick(row, ["password", "pwd"], "1234"),
        status: String(pick(row, ["status"], "active")).toLowerCase(),
      };
      normalized.role = inferUserRole({ ...row, ...normalized }, "Admin");
      return normalized;
    });
  }

  if (type === "contracts") {
    return rows.map((row) => ({
      job_cd: pick(row, ["job_cd", "job_code", "contractor_id", "contract_id"]),
      engineer_id: pick(row, ["engineer_id", "engineer", "engineer_incharge", "engineer_rinl_id", "eic_id"]),
      contractor_name: pick(row, ["contractor_name", "contractor", "name"]),
      contractor_phone: pick(row, ["contractor_phone", "phone", "mobile"]),
      work_area: pick(row, ["work_area", "company", "area"]),
      dept_cd: pick(row, ["dept_cd", "department", "dept"]),
      job_start_dt: pick(row, ["job_start_dt", "start_date", "created_at"], ""),
      job_end_dt: pick(row, ["job_end_dt", "end_date"], ""),
    }));
  }

  if (type === "supervisors") {
    return rows.map((row) => ({
      rinl_id: pick(row, ["rinl_id", "rinl-id", "supervisor_id", "supervisor_rinl_id"]),
      supervisor_id: pick(row, ["supervisor_id", "supervisor_rinl_id", "rinl_id", "rinl-id"]),
      contractor_id: pick(row, ["contractor_id", "job_cd", "job_code", "contract_id"]),
      name: pick(row, ["name", "supervisor_name", "supervisor", "employee_name", "person_name", "full_name"]),
      mobile: pick(row, ["mobile", "mobile_number", "supervisor_mobile", "phone", "phone_number", "contact", "contact_number"]),
      email: pick(row, ["email", "email_id", "mail", "mail_id", "supervisor_email"]),
      status: String(pick(row, ["status"], "active")).toLowerCase(),
      present: pickNumber(row, ["present", "present_days", "days_present", "total_present_days"]),
      absent: pickNumber(row, ["absent", "absent_days", "total_absent_days"]),
      overtime: pickNumber(row, ["overtime", "overtime_hrs", "ot"]),
    }));
  }

  if (type === "workers") {
    return rows.map((row) => ({
      adhar_id: pick(row, ["adhar_id", "aadhaar_id", "aadhar_id", "worker_id", "worker_rinl_id", "rinl_id", "rinl-id", "id"]),
      worker_name: pick(row, ["worker_name", "name", "employee_name", "person_name", "full_name"]),
      mobile: pick(row, ["mobile", "mobile_number", "worker_mobile", "phone", "phone_number", "contact", "contact_number"]),
      job_cd: pick(row, ["job_cd", "job_code", "job", "job_id", "contractor_id", "contract_id", "contract_code", "contract"]),
      supervisor_id: pick(row, ["supervisor_id", "supervisor id", "supervisor", "supervisor_rinl_id", "supervisor rinl id", "supervisor_rinl", "supervisor_code", "supervisor code"]),
      worker_desig: pick(row, ["worker_desig", "worker desig", "designation", "designation_name", "designation name", "worker_designation", "worker designation", "category"]),
      worker_skill: pick(row, ["worker_skill", "worker skill", "skill", "skill_type", "skill type", "skill_category", "skill category", "category"]),
      worker_gender: pick(row, ["worker_gender", "worker gender", "gender", "gender_name", "gender name", "sex"]),
      present: pickNumber(row, ["present", "present_days", "days_present", "total_present_days"]),
      absent: pickNumber(row, ["absent", "absent_days", "total_absent_days"]),
      overtime: pickNumber(row, ["overtime", "overtime_hrs", "ot"]),
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

  if (has("supervisor_id", "supervisor_name", "supervisor_rinl_id") || lowerName.includes("supervisor")) {
    return "supervisors";
  }

  if (has("worker_id", "worker_name", "adhar_id", "aadhaar_id", "aadhar_id", "worker_skill", "skill", "gender") || lowerName.includes("worker")) {
    return "workers";
  }

  if (has(...EXPENSE_KEYS, ...RATE_KEYS, "days_present", "present_days", "wage_month") || lowerName.includes("wage") || lowerName.includes("payroll")) {
    return "wages";
  }

  if (has("present", "absent", "weekly_off", "muster_month") || lowerName.includes("muster") || lowerName.includes("attendance")) {
    return "muster";
  }

  if (has("contractor_name", "contractor_phone", "job_cd", "job_code", "contract_id", "work_area") || lowerName.includes("contract")) {
    return "contracts";
  }

  if (has("rinl_id", "rinl-id", "employee_id", "emp_id", "email", "mobile", "role", "user_role") || lowerName.includes("user") || lowerName.includes("employee")) {
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

function readSavedWageRates() {
  try {
    return JSON.parse(localStorage.getItem(WAGE_RATE_SETTINGS_KEY) || "{}");
  } catch (error) {
    return {};
  }
}

function writeSavedWageRate(skill, value) {
  const rates = readSavedWageRates();
  rates[normalizeWageCategory(skill) || skill] = value;
  localStorage.setItem(WAGE_RATE_SETTINGS_KEY, JSON.stringify(rates));
}

function clearAdminDashboardCache() {
  [
    "users",
    "engineers",
    "contracts",
    "supervisors",
    "workers",
    "muster",
    "wages",
  ].forEach((type) => localStorage.removeItem(`adminUploaded_${type}`));
  [
    "adminUploadedDocuments",
    SUPERVISOR_ATTENDANCE_KEY,
    CONTRACT_DEPT_KEY,
    WORKER_EDIT_KEY,
    WAGE_RATE_SETTINGS_KEY,
    ENGINEER_SUMMARY_KEY,
    LOCAL_WAGE_KEY,
  ].forEach((key) => localStorage.removeItem(key));

  users = [];
  engineers = [];
  contracts = [];
  supervisors = [];
  workers = [];
  muster = [];
  wageExpenses = [];
  uploadedDocuments = [];
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

function matchesSearch(row, query = adminSearchText) {
  if (!query) return true;
  return Object.values(row || {}).join(" ").toLowerCase().includes(query);
}

function filterSearchRows(rows) {
  return adminSearchText ? rows.filter((row) => matchesSearch(row)) : rows;
}

function renderSearchableTables() {
  const role = normalizeKey(document.getElementById("roleFilter")?.value || "");
  renderUsers(role ? users.filter((u) => normalizeKey(u.role) === role) : users);
  renderEngineers();
  renderContracts();
  renderSupervisors();
  renderWorkers();
  renderMuster();
  renderLoginActivity();
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

function readSupervisorAttendanceOverrides() {
  try {
    return JSON.parse(localStorage.getItem(SUPERVISOR_ATTENDANCE_KEY) || "{}");
  } catch (error) {
    return {};
  }
}

function writeSupervisorAttendanceOverride(supervisorId, stats) {
  if (!supervisorId) return;
  const overrides = readSupervisorAttendanceOverrides();
  overrides[normalizeLookupValue(supervisorId)] = {
    present: toNumber(stats.present),
    absent: toNumber(stats.absent),
    overtime: toNumber(stats.overtime),
  };
  localStorage.setItem(SUPERVISOR_ATTENDANCE_KEY, JSON.stringify(overrides));
}

function removeSupervisorAttendanceOverride(supervisorId) {
  if (!supervisorId) return;
  const overrides = readSupervisorAttendanceOverrides();
  delete overrides[normalizeLookupValue(supervisorId)];
  localStorage.setItem(SUPERVISOR_ATTENDANCE_KEY, JSON.stringify(overrides));
}

function readContractOverrides() {
  try {
    return JSON.parse(localStorage.getItem(CONTRACT_DEPT_KEY) || "{}");
  } catch (error) {
    return {};
  }
}

function applyContractOverride(contract, overrides = readContractOverrides()) {
  const key = normalizeLookupValue(contract?.job_cd || contract?.contractor_id || contract?.rinl_id || contract?.rinlId);
  const override = overrides[key];
  if (!override) return contract;
  if (typeof override === "string") return { ...contract, dept_cd: override };
  return { ...contract, ...override };
}

function writeContractOverride(jobCode, data) {
  if (!jobCode) return;
  const overrides = readContractOverrides();
  overrides[normalizeLookupValue(jobCode)] = {
    job_cd: data.job_cd || data.contractor_id || jobCode,
    contractor_name: data.contractor_name || data.name || "",
    engineer_id: data.engineer_id || data.engineerId || "",
    contractor_phone: data.contractor_phone || data.mobile || "",
    work_area: data.work_area || data.company || "",
    dept_cd: data.dept_cd || "-",
    job_start_dt: data.job_start_dt || data.start_date || "",
    job_end_dt: data.job_end_dt || data.end_date || "",
  };
  localStorage.setItem(CONTRACT_DEPT_KEY, JSON.stringify(overrides));
}

function writeEngineerDirectory() {
  const directory = {};
  engineers.forEach((engineer) => {
    const ids = [
      engineer.rinl_id,
      engineer.rinlId,
      engineer.employee_id,
      engineer.emp_id,
      engineer.id
    ].filter(Boolean);
    const details = {
      id: engineer.rinl_id || engineer.rinlId || engineer.employee_id || engineer.emp_id || engineer.id || "",
      name: engineer.name || "",
      department: isEngineerRecord(engineer) ? "Engineer Incharge" : engineer.role || "Engineer Incharge",
      contact: [engineer.mobile, engineer.email].filter(Boolean).join(" / "),
      mobile: engineer.mobile || "",
      email: engineer.email || "",
      status: engineer.status || "",
      pending: 0
    };
    ids.forEach((id) => {
      directory[normalizeLookupValue(id)] = details;
    });
  });
  localStorage.setItem(ENGINEER_DIRECTORY_KEY, JSON.stringify(directory));
}

function removeContractOverride(jobCode) {
  if (!jobCode) return;
  const overrides = readContractOverrides();
  delete overrides[normalizeLookupValue(jobCode)];
  localStorage.setItem(CONTRACT_DEPT_KEY, JSON.stringify(overrides));
}

function readWorkerEditOverrides() {
  try {
    return JSON.parse(localStorage.getItem(WORKER_EDIT_KEY) || "{}");
  } catch (error) {
    return {};
  }
}

function writeWorkerEditOverride(workerId, data) {
  if (!workerId) return;
  const overrides = readWorkerEditOverrides();
  overrides[normalizeLookupValue(workerId)] = {
    adhar_id: data.adhar_id || data.worker_id || workerId,
    worker_name: data.worker_name || data.name || "",
    mobile: data.mobile || data.worker_mobile || data.phone || data.phone_number || "",
    job_cd: data.job_cd || data.contractor_id || "",
    supervisor_id: data.supervisor_id || data.supervisorId || "",
    worker_desig: data.worker_desig || data.category || "",
    worker_skill: data.worker_skill || data.category || "",
    worker_gender: data.worker_gender || "-",
    present: toNumber(data.present),
    absent: toNumber(data.absent),
    overtime: toNumber(data.overtime),
    daily_wage: data.daily_wage || data.dailyWage || 0,
  };
  localStorage.setItem(WORKER_EDIT_KEY, JSON.stringify(overrides));
}

function removeWorkerEditOverride(workerId) {
  if (!workerId) return;
  const overrides = readWorkerEditOverrides();
  delete overrides[normalizeLookupValue(workerId)];
  localStorage.setItem(WORKER_EDIT_KEY, JSON.stringify(overrides));
}

function workerMobileValue(worker) {
  return worker?.mobile
    || worker?.worker_mobile
    || worker?.mobile_number
    || worker?.phone
    || worker?.phone_number
    || worker?.contact
    || worker?.contact_number
    || "";
}

function contractStartDateValue(contract) {
  return contract?.job_start_dt || contract?.start_date || contract?.contract_start || contract?.created_at || "";
}

function contractEndDateValue(contract) {
  return contract?.job_end_dt || contract?.end_date || contract?.contract_end || "";
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
      <td><button type="button" class="action-btn action-view" data-summary-review="${esc(summary.id)}">View Details</button></td>
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
      ${alert.action ? `<button type="button" class="action-btn action-view" data-summary-review="${esc(alert.action)}">View Details</button>` : ""}
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
      users = [...users, ...syncedRows.filter((row) => !isEngineerRecord(row))];
      engineers = [...engineers, ...syncedRows.filter((row) => isEngineerRecord(row))];
      saveUploadedTable("engineers", engineers);
      renderUsers(users);
      renderEngineers();
    } else if (type === "contracts") {
      contracts = [...contracts, ...syncedRows];
      renderContracts();
    } else if (type === "supervisors") {
      supervisors = [...supervisors, ...syncedRows];
      renderSupervisors();
    } else if (type === "workers") {
      workers = [...workers, ...syncedRows];
      renderWorkers();
    } else if (type === "wages") {
      wageExpenses = [...wageExpenses, ...syncedRows];
    } else {
      muster = [...muster, ...syncedRows];
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
    supervisors: "supervisors",
    workers: "workers",
    muster: "muster",
    wages: "wages",
  }[type];

  if (!importPath) return rows;

  const headers = { "Content-Type": "application/json" };
  if (session?.sessionId) {
    headers["x-session-id"] = session.sessionId;
  }

  try {
    const data = await fetchJson(`${API_BASE}/admin/import/${importPath}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ rows }),
    });

    const syncedRows = data[type] || rows;
    if (type === "workers") {
      return syncedRows.map((syncedRow, index) => {
        const csvRow = rows[index] || {};
        return {
          ...syncedRow,
          supervisor_id: preferCsvValue(csvRow.supervisor_id, syncedRow.supervisor_id),
          worker_desig: preferCsvValue(csvRow.worker_desig, syncedRow.worker_desig),
          worker_skill: preferCsvValue(csvRow.worker_skill, syncedRow.worker_skill),
          worker_gender: preferCsvValue(csvRow.worker_gender, syncedRow.worker_gender),
          daily_wage: toNumber(syncedRow.daily_wage) || toNumber(csvRow.daily_wage),
        };
      });
    }

    return syncedRows;
  } catch (err) {
    if (String(err.message || "").includes("404") || String(err.message || "").toLowerCase().includes("entity too large")) {
      console.warn(`Backend import unavailable for ${type}. Using local uploaded rows.`, err);
      return rows;
    }
    throw err;
  }
}

function getTableRows(type) {
  if (type === "users") return users;
  if (type === "engineers") return engineers;
  if (type === "contracts") return contracts;
  if (type === "supervisors") return supervisors;
  if (type === "workers") return workers;
  if (type === "wages") return wageExpenses;
  if (type === "loginActivity") return loginActivity;
  return muster;
}

const CSV_EXPORTS = {
  users: {
    label: "Users",
    file: "rinl-users",
    columns: [
      ["RINL ID", (row) => row.rinl_id || row.rinlId || row.employee_id || row.emp_id],
      ["Name", "name"],
      ["Email", "email"],
      ["Mobile", "mobile"],
      ["Role", "role"],
      ["Status", "status"],
      ["Created At", "created_at"],
    ],
  },
  engineers: {
    label: "Engineers",
    file: "rinl-engineers",
    columns: [
      ["RINL ID", (row) => row.rinl_id || row.rinlId || row.employee_id || row.emp_id],
      ["Name", "name"],
      ["Email", "email"],
      ["Mobile", "mobile"],
      ["Role", "role"],
      ["Status", "status"],
      ["Created At", "created_at"],
    ],
  },
  contracts: {
    label: "Contracts",
    file: "rinl-contracts",
    columns: [
      ["RINL ID", (row) => row.rinl_id || row.contractor_id],
      ["Contractor ID", "contractor_id"],
      ["Engineer ID", "engineer_id"],
      ["Contractor", "name"],
      ["Company", "company"],
      ["Mobile", "mobile"],
      ["Email", "email"],
      ["Department", (row) => row.dept_cd || row.dept || row.department || row.work_area],
      ["Start Date", (row) => contractStartDateValue(row)],
      ["End Date", (row) => contractEndDateValue(row)],
      ["Status", "status"],
    ],
  },
  supervisors: {
    label: "Supervisors",
    file: "rinl-supervisors",
    columns: [
      ["RINL ID", (row) => row.rinl_id || row.supervisor_id],
      ["Supervisor ID", "supervisor_id"],
      ["Contractor ID", "contractor_id"],
      ["Name", "name"],
      ["Mobile", "mobile"],
      ["Email", "email"],
      ["Status", "status"],
      ["Present", "present"],
      ["Absent", "absent"],
      ["Overtime", "overtime"],
    ],
  },
  workers: {
    label: "Workers",
    file: "rinl-workers",
    columns: [
      ["RINL ID", (row) => row.rinl_id || row.worker_id],
      ["Worker ID", "worker_id"],
      ["Name", "name"],
      ["Category", "category"],
      ["Contractor ID", "contractor_id"],
      ["Supervisor ID", "supervisor_id"],
      ["Mobile", "mobile"],
      ["Gender", "gender"],
      ["Daily Wage", "daily_wage"],
      ["Status", "status"],
    ],
  },
  muster: {
    label: "Monthly Muster",
    file: "rinl-muster",
    columns: [
      ["Worker ID", "worker_id"],
      ["Date", "date"],
      ["Status", "status"],
      ["Overtime Hours", (row) => row.overtime_hrs || row.overtime],
      ["Created At", "created_at"],
    ],
  },
  wages: {
    label: "Wage Expenses",
    file: "rinl-wage-expenses",
    columns: [
      ["Worker ID", "worker_id"],
      ["Worker Name", "worker_name"],
      ["Contractor ID", "contractor_id"],
      ["Supervisor ID", "supervisor_id"],
      ["Month", (row) => row.wage_month || row.muster_month || row.month],
      ["Present Days", (row) => row.days_present || row.present_days || row.present],
      ["Daily Wage", "daily_wage"],
      ["Wage Expense", (row) => row.wage_expense || row.total_expense || row.gross_wage || row.net_wage],
    ],
  },
  loginActivity: {
    label: "Login Activity",
    file: "rinl-login-activity",
    columns: [
      ["RINL ID", "emp_id"],
      ["Name", "name"],
      ["Role", "role"],
      ["Action", "action"],
      ["Time", "timestamp"],
      ["IP Address", "ip_address"],
      ["Browser", (row) => [row.browser, row.browser_version].filter(Boolean).join(" ")],
      ["Operating System", "operating_system"],
      ["Device", "device"],
    ],
  },
};

function csvCell(value) {
  const text = value === undefined || value === null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function rowValue(row, column) {
  const source = column[1];
  return typeof source === "function" ? source(row || {}) : row?.[source];
}

function rowsToCsv(rows, columns) {
  const header = columns.map(([label]) => csvCell(label)).join(",");
  const body = rows.map((row) => columns.map((column) => csvCell(rowValue(row, column))).join(","));
  return [header, ...body].join("\r\n");
}

function timestampSlug() {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
}

function triggerCsvDownload(filename, csv) {
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadCsv(type) {
  const config = CSV_EXPORTS[type];
  if (!config) return;

  const rows = getTableRows(type).filter((row) => row && Object.keys(row).length);
  if (!rows.length) {
    csvDownloadStatus.textContent = `No ${config.label.toLowerCase()} records available to download.`;
    return;
  }

  triggerCsvDownload(`${config.file}-${timestampSlug()}.csv`, rowsToCsv(rows, config.columns));
  csvDownloadStatus.textContent = `Downloaded ${rows.length} ${config.label.toLowerCase()} record(s).`;
}

function downloadAllCsvFiles() {
  const availableTypes = Object.keys(CSV_EXPORTS).filter((type) => getTableRows(type).length);

  if (!availableTypes.length) {
    csvDownloadStatus.textContent = "No dashboard records available to download.";
    return;
  }

  availableTypes.forEach((type, index) => {
    setTimeout(() => downloadCsv(type), index * 250);
  });
  csvDownloadStatus.textContent = `Preparing ${availableTypes.length} CSV file(s).`;
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
  if (!documentList) return;

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
  const dialog = document.getElementById("clearDataConfirmDialog");
  const input = document.getElementById("confirmDeleteInput");
  const confirmBtn = document.getElementById("confirmClearDialogBtn");
  const cancelBtn = document.getElementById("cancelClearDialogBtn");
  const closeBtn = document.getElementById("closeClearDialogBtn");

  if (!dialog || !input || !confirmBtn) {
    console.error("Clear data dialog elements not found in DOM.");
    return;
  }

  // Reset input and disabled state
  input.value = "";
  confirmBtn.disabled = true;
  confirmBtn.style.opacity = "0.5";

  // Enable Wipe button only when EXACTLY "DELETE" is entered
  input.oninput = () => {
    if (input.value === "DELETE") {
      confirmBtn.disabled = false;
      confirmBtn.style.opacity = "1";
    } else {
      confirmBtn.disabled = true;
      confirmBtn.style.opacity = "0.5";
    }
  };

  const closeModal = () => {
    dialog.close();
  };

  cancelBtn.onclick = closeModal;
  closeBtn.onclick = closeModal;

  const form = dialog.querySelector("form");
  if (form) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      if (input.value !== "DELETE") return;

      try {
        const headers = { "Content-Type": "application/json" };
        if (session?.sessionId) {
          headers["x-session-id"] = session.sessionId;
        }

        const response = await fetch(`${API_BASE}/admin/clear-data`, {
          method: "POST",
          headers
        });

        const resData = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(resData?.message || `Wipe failed: ${response.status}`);
        }

        clearAdminDashboardCache();

        csvUploadStatus.textContent = resData?.message || "Database records cleared successfully.";
        
        renderUsers([]);
        renderEngineers();
        renderContracts();
        renderSupervisors();
        renderWorkers();
        renderMuster();
        renderDocuments();
        renderAdminAlerts();

        // Refresh UI components dynamically
        await Promise.all([
          loadStats(),
          loadUsers(),
          loadContracts(),
          loadSupervisors(),
          loadWorkers(),
          loadMuster(),
          loadRates()
        ]).catch((err) => console.error("Error refreshing dashboard state:", err));

        dialog.close();
        alert("Database records successfully wiped and dashboard reset to clean slate.");
      } catch (err) {
        console.error(err);
        alert(`Failed to wipe database records: ${err.message}`);
      }
    };
  }

  dialog.showModal();
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

function formatCount(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number.toLocaleString("en-IN") : "0";
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
    document.getElementById("totalMuster").textContent = readUploadedTable("muster").length || muster.length || 0;
    document.getElementById("totalWage").textContent = formatMoney(data.total_wage);
}

async function loadUsers() {
  const uploaded = readUploadedTable("users");
  if (uploaded.length) {
    users = uploaded.filter((row) => !isEngineerRecord(row));
    renderUsers(users);
    applyUploadedStats();
    return;
  }

  users = await fetchJson(`${API_BASE}/admin/users`);
  renderUsers(users);
}

async function loadEngineers() {
  const uploadedEngineers = [
    ...readUploadedTable("engineers"),
    ...readUploadedTable("users").filter((row) => isEngineerRecord(row)),
  ];

  try {
    const serverEngineers = await fetchJson(`${API_BASE}/admin/engineers`);
    engineers = mergePeopleRows([...uploadedEngineers, ...serverEngineers]);
  } catch (err) {
    if (!uploadedEngineers.length) throw err;
    engineers = mergePeopleRows(uploadedEngineers);
  }

  renderEngineers();
  writeEngineerDirectory();
}

async function loadLoginActivity() {
  loginActivity = await fetchJson(`${API_BASE}/admin/login-activity`);
  renderLoginActivity();
}

function renderLoginActivity() {
  const body = document.getElementById("loginActivityBody");
  if (!body) return;

  const rows = filterSearchRows(loginActivity);
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="8">${adminSearchText ? "No activity matches your search." : "No login activity recorded yet."}</td></tr>`;
    return;
  }

  body.innerHTML = rows.map((row) => {
    const browser = [row.browser, row.browser_version].filter(Boolean).join(" ") || "-";
    return `
      <tr>
        <td>${esc(row.name || row.emp_id || "-")}<br><small>${esc(row.emp_id || "-")}</small></td>
        <td>${esc(row.role || "-")}</td>
        <td><span class="badge ${row.action === "LOGIN" ? "active-badge" : row.action === "LOGIN_FAILED" ? "inactive-badge" : "pending-badge"}">${esc(row.action || "-")}</span></td>
        <td>${formatDateTime(row.timestamp)}</td>
        <td>${esc(browser)}</td>
        <td>${esc(row.operating_system || "-")}</td>
        <td>${esc(row.device || "-")}</td>
        <td>${esc(row.ip_address || "-")}</td>
      </tr>
    `;
  }).join("");
}

function renderUsers(list) {
  const body = document.getElementById("usersBody");
  const accessUsers = filterSearchRows(list.filter((u) => !isEngineerRecord(u)));

  if (!accessUsers.length) {
    body.innerHTML = `<tr><td colspan="7">${adminSearchText ? "No users match your search." : "No access users found."}</td></tr>`;
    return;
  }

  body.innerHTML = accessUsers.map((u) => `
    <tr>
      <td>${esc(u.rinl_id || u.rinlId || u.employee_id || "-")}</td>
      <td>${esc(u.name || "-")}</td>
      <td>${esc(u.email || "-")}</td>
      <td>${esc(u.mobile || "-")}</td>
      <td>${esc(u.role || "-")}</td>
      <td><span class="badge ${u.status === "active" ? "active-badge" : u.status === "inactive" ? "inactive-badge" : "pending-badge"}">${u.status || "pending"}</span></td>
      <td>
        <div class="action-cell">
        <button type="button" class="action-btn action-view" onclick="viewUserDetails('${esc(u.rinl_id || u.rinlId || u.employee_id || u.emp_id || u.id || "")}')">View Details</button>
        <button type="button" class="action-btn action-activate" onclick="changeUserStatus(${u.id}, 'active')">Activate</button>
        <button type="button" class="action-btn action-deactivate" onclick="changeUserStatus(${u.id}, 'inactive')">Deactivate</button>
        </div>
      </td>
    </tr>
  `).join("");
}

function normalizeRecordKey(value) {
  return String(value || "").trim().toLowerCase();
}

function findRecordByKeys(rows, lookup, keys) {
  const normalizedLookup = normalizeRecordKey(lookup);
  return rows.find((row) => keys.some((key) => normalizeRecordKey(row?.[key]) === normalizedLookup));
}

function detailRows(rows) {
  return rows.map(([label, value]) => `
    <div class="review-detail-row">
      <span>${esc(label)}</span>
      <strong>${esc(value || "-")}</strong>
    </div>
  `).join("");
}

function showRecordDetails(title, meta, rows) {
  const dialog = document.getElementById("recordDetailsDialog");
  if (!dialog) return;
  document.getElementById("recordDetailsTitle").textContent = title;
  document.getElementById("recordDetailsMeta").textContent = meta;
  document.getElementById("recordDetailsBody").innerHTML = `
    <section class="review-section full">
      <h4>${esc(title)}</h4>
      ${detailRows(rows)}
    </section>
  `;
  dialog.showModal();
}

function viewUserDetails(id) {
  const user = findRecordByKeys(users, id, ["rinl_id", "rinlId", "employee_id", "emp_id", "id"]);
  if (!user) return;
  showRecordDetails("User Details", "Access user saved in PostgreSQL.", [
    ["RINL-ID", user.rinl_id || user.rinlId || user.employee_id || user.emp_id],
    ["Name", user.name],
    ["Role", user.role],
    ["Email", user.email],
    ["Mobile", user.mobile],
    ["Status", user.status],
    ["Created At", formatDate(user.created_at)]
  ]);
}

function viewEngineerDetails(id) {
  const engineer = findRecordByKeys(engineers, id, ["rinl_id", "rinlId", "employee_id", "emp_id", "id"]);
  if (!engineer) return;
  showRecordDetails("Engineer Details", "Engineer In-Charge account and dashboard access.", [
    ["RINL-ID", engineer.rinl_id || engineer.rinlId || engineer.employee_id || engineer.emp_id],
    ["Name", engineer.name],
    ["Role", isEngineerRecord(engineer) ? "Engineer Incharge" : engineer.role],
    ["Email", engineer.email],
    ["Mobile", engineer.mobile],
    ["Status", engineer.status],
    ["Created At", formatDate(engineer.created_at)]
  ]);
}

function renderEngineers() {
  const body = document.getElementById("engineersBody");
  if (!body) return;
  const rows = filterSearchRows(engineers);

  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="7">${adminSearchText ? "No engineers match your search." : "No engineers added yet."}</td></tr>`;
    return;
  }

  body.innerHTML = rows.map((engineer) => `
    <tr>
      <td>${esc(engineer.rinl_id || engineer.rinlId || engineer.employee_id || "-")}</td>
      <td>${esc(engineer.name || "-")}</td>
      <td>${esc(engineer.email || "-")}</td>
      <td>${esc(engineer.mobile || "-")}</td>
      <td>${esc(isEngineerRecord(engineer) ? "Engineer Incharge" : engineer.role || "Engineer Incharge")}</td>
      <td><span class="badge ${engineer.status === "active" ? "active-badge" : engineer.status === "inactive" ? "inactive-badge" : "pending-badge"}">${engineer.status || "pending"}</span></td>
      <td>
        <div class="action-cell">
        <button type="button" class="action-btn action-view" onclick="viewEngineerDetails('${esc(engineer.rinl_id || engineer.rinlId || engineer.employee_id || engineer.emp_id || engineer.id || "")}')">View Details</button>
        <button type="button" class="action-btn action-edit" onclick="editEngineer(${engineer.id})">Edit</button>
        <button type="button" class="action-btn action-delete" onclick="deleteEngineer(${engineer.id})">Delete</button>
        </div>
      </td>
    </tr>
  `).join("");
}

async function saveEngineer(event) {
  event.preventDefault();

  const payload = {
    employee_id: document.getElementById("engineerId").value.trim(),
    name: document.getElementById("engineerName").value.trim(),
    email: document.getElementById("engineerEmail").value.trim(),
    mobile: document.getElementById("engineerMobile").value.trim(),
    password: document.getElementById("engineerPassword").value.trim() || "1234",
    status: document.getElementById("engineerStatus").value,
  };

  if (!payload.employee_id || !payload.name) {
    engineerFormStatus.textContent = "Engineer ID and name are required.";
    return;
  }

  try {
    const data = await fetchJson(`${API_BASE}/admin/engineers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    engineerFormStatus.textContent = data.message || "Engineer saved successfully.";
    resetEngineerForm();
    await Promise.all([loadEngineers(), loadUsers(), loadStats()]);
  } catch (err) {
    console.error(err);
    engineerFormStatus.textContent = err.message || "Could not save engineer.";
  }
}

function openEngineerForm() {
  resetEngineerForm();
  showDetailPanel(engineerForm);
  engineerFormStatus.textContent = "Enter engineer details below.";
  document.getElementById("engineerId").focus();
}

function editEngineer(id) {
  const engineer = engineers.find((item) => Number(item.id) === Number(id));
  if (!engineer) return;

  showDetailPanel(engineerForm);
  document.getElementById("engineerFormTitle").textContent = "Edit Engineer Details";
  engineerForm.dataset.editId = engineer.id || "";
  document.getElementById("engineerId").value = engineer.employee_id || "";
  document.getElementById("engineerId").readOnly = true;
  document.getElementById("engineerName").value = engineer.name || "";
  document.getElementById("engineerEmail").value = engineer.email || "";
  document.getElementById("engineerMobile").value = engineer.mobile || "";
  document.getElementById("engineerPassword").value = "1234";
  document.getElementById("engineerStatus").value = engineer.status || "active";
  engineerFormStatus.textContent = "Editing engineer. Use Add / Update to save changes.";
  engineerForm.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function deleteEngineer(id) {
  const engineer = engineers.find((item) => Number(item.id) === Number(id));
  const label = engineer?.employee_id || engineer?.name || id;
  if (!id || !confirm(`Delete engineer ${label}?`)) return;

  try {
    const data = await fetchJson(`${API_BASE}/admin/engineers/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });

    engineerFormStatus.textContent = data.message || "Engineer deleted successfully.";
    resetEngineerForm();
    await Promise.all([loadEngineers(), loadUsers(), loadStats()]);
  } catch (err) {
    console.error(err);
    engineerFormStatus.textContent = err.message || "Could not delete engineer.";
  }
}

function resetEngineerForm() {
  engineerForm.reset();
  engineerForm.dataset.editId = "";
  document.getElementById("engineerId").readOnly = false;
  document.getElementById("engineerPassword").value = "1234";
  document.getElementById("engineerFormTitle").textContent = "Add Engineer Details";
  engineerForm.hidden = true;
  engineerFormStatus.textContent = "Click Add Engineer to enter details.";
}

document.getElementById("roleFilter").addEventListener("change", (event) => {
  const role = normalizeKey(event.target.value);
  renderUsers(role ? users.filter((u) => normalizeKey(u.role) === role) : users);
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

async function changeEngineerStatus(id, status) {
  await changeUserStatus(id, status);
  await loadEngineers();
}

async function loadContracts() {
  const uploaded = readUploadedTable("contracts");
  if (uploaded.length) {
    const overrides = readContractOverrides();
    contracts = uploaded.map((contract) => applyContractOverride(contract, overrides));
    renderContracts();
    applyUploadedStats();
    return;
  }

  const overrides = readContractOverrides();
  contracts = (await fetchJson(`${API_BASE}/contracts`)).map((contract) => applyContractOverride(contract, overrides));
  renderContracts();
}

function metricValue(row, keys) {
  for (const key of keys) {
    if (row?.[key] !== undefined && row?.[key] !== null && String(row[key]).trim() !== "") {
      return toNumber(row[key]);
    }
  }
  return 0;
}

function directAttendanceStats(row) {
  return {
    present: metricValue(row, ["present", "present_days", "days_present", "total_present_days"]),
    absent: metricValue(row, ["absent", "absent_days", "total_absent_days"]),
    overtime: metricValue(row, ["overtime", "overtime_hrs", "ot"]),
  };
}

function hasAttendanceFields(row) {
  return [
    "present",
    "present_days",
    "days_present",
    "total_present_days",
    "absent",
    "absent_days",
    "total_absent_days",
    "overtime",
    "overtime_hrs",
    "ot"
  ].some((key) => row?.[key] !== undefined && row?.[key] !== null && String(row[key]).trim() !== "");
}

function workerAttendanceStats(worker) {
  const direct = directAttendanceStats(worker);
  if (hasAttendanceFields(worker)) return direct;

  const workerId = normalizeLookupValue(worker.adhar_id || worker.worker_id || worker.rinl_id || worker.rinlId);
  const uploadedRows = [...readUploadedTable("muster"), ...readUploadedTable("wages")];
  return uploadedRows.reduce((totals, row) => {
    const rowWorkerId = normalizeLookupValue(row.worker_id || row.adhar_id || row.aadhaar_id || row.aadhar_id || row.rinl_id);
    if (!workerId || rowWorkerId !== workerId) return totals;

    const stats = directAttendanceStats(row);
    totals.present += stats.present;
    totals.absent += stats.absent;
    totals.overtime += stats.overtime;
    return totals;
  }, { present: 0, absent: 0, overtime: 0 });
}

function supervisorAttendanceStats(supervisor) {
  const override = readSupervisorAttendanceOverrides()[normalizeLookupValue(supervisor.supervisor_id || supervisor.rinl_id || supervisor.rinlId)];
  if (override) return directAttendanceStats(override);

  const direct = directAttendanceStats(supervisor);
  if (hasAttendanceFields(supervisor)) return direct;

  const supervisorId = normalizeLookupValue(supervisor.supervisor_id || supervisor.rinl_id || supervisor.rinlId);
  const contractorId = normalizeLookupValue(supervisor.contractor_id);
  const supervisorWorkers = workers.filter((worker) => {
    const workerSupervisorId = normalizeLookupValue(worker.supervisor_id || worker.supervisorId);
    const workerContractorId = normalizeLookupValue(worker.job_cd || worker.contractor_id);
    if (supervisorId && workerSupervisorId === supervisorId) return true;
    return contractorId && workerContractorId === contractorId;
  });

  return supervisorWorkers.reduce((totals, worker) => {
    const stats = workerAttendanceStats(worker);
    totals.present += stats.present;
    totals.absent += stats.absent;
    totals.overtime += stats.overtime;
    return totals;
  }, { present: 0, absent: 0, overtime: 0 });
}

function renderContracts() {
  const rows = filterSearchRows(contracts);
  document.getElementById("contractsBody").innerHTML = rows.length ? rows.map((c) => `
    <tr>
      <td>${esc(c.rinl_id || c.rinlId || c.job_cd || "-")}</td>
      <td>${esc(c.job_cd || "-")}</td>
      <td>${esc(c.engineer_id || c.engineerId || "-")}</td>
      <td>${esc(c.contractor_name || "-")}</td>
      <td>${esc(c.contractor_phone || "-")}</td>
      <td>${esc(c.work_area || "-")}</td>
      <td>${esc(c.dept_cd || "-")}</td>
      <td>${formatDate(contractStartDateValue(c))} to ${formatDate(contractEndDateValue(c))}</td>
      <td>
        <div class="action-cell">
        <button type="button" class="action-btn action-view" onclick="viewContractorDetails('${esc(c.job_cd || c.contractor_id || "")}')">View Details</button>
        <button type="button" class="action-btn action-edit" onclick="editContractor('${esc(c.job_cd || "")}')">Edit</button>
        <button type="button" class="action-btn action-delete" onclick="deleteContractor('${esc(c.job_cd || "")}')">Delete</button>
        </div>
      </td>
    </tr>
  `).join("") : `<tr><td colspan="9">${adminSearchText ? "No contractors match your search." : "No contractors found."}</td></tr>`;
}

function viewContractorDetails(jobCode) {
  const contractor = findRecordByKeys(contracts, jobCode, ["job_cd", "contractor_id", "rinl_id", "rinlId"]);
  if (!contractor) return;
  showRecordDetails("Contractor Details", "Contract and Engineer In-Charge assignment.", [
    ["RINL-ID", contractor.rinl_id || contractor.rinlId || contractor.job_cd || contractor.contractor_id],
    ["Job Code", contractor.job_cd || contractor.contractor_id],
    ["Contractor", contractor.contractor_name || contractor.name],
    ["Assigned Engineer ID", contractor.engineer_id || contractor.engineerId],
    ["Phone", contractor.contractor_phone || contractor.mobile],
    ["Work Area", contractor.work_area || contractor.company],
    ["Department", contractor.dept_cd],
    ["Start Date", formatDate(contractStartDateValue(contractor))],
    ["End Date", formatDate(contractEndDateValue(contractor))]
  ]);
}

async function saveContractor(event) {
  event.preventDefault();

  const jobCodeInput = document.getElementById("contractJobCode");
  const payload = {
    job_cd: jobCodeInput.value.trim(),
    contractor_name: document.getElementById("contractName").value.trim(),
    engineer_id: document.getElementById("contractEngineerId").value.trim(),
    contractor_phone: document.getElementById("contractPhone").value.trim(),
    work_area: document.getElementById("contractWorkArea").value.trim(),
    dept_cd: document.getElementById("contractDept").value.trim(),
    job_start_dt: document.getElementById("contractStartDate").value,
    job_end_dt: document.getElementById("contractEndDate").value,
  };

  if (!payload.job_cd || !payload.contractor_name) {
    contractFormStatus.textContent = "Job code and contractor name are required.";
    return;
  }

  const editId = contractForm.dataset.editId;
  const url = editId
    ? `${API_BASE}/contracts/${encodeURIComponent(editId)}`
    : `${API_BASE}/contracts`;
  const method = editId ? "PATCH" : "POST";

  try {
    writeEngineerDirectory();
    writeContractOverride(payload.job_cd, payload);
    let currentIndex = contracts.findIndex((contract) => normalizeLookupValue(contract.job_cd || contract.contractor_id || contract.rinl_id || contract.rinlId) === normalizeLookupValue(payload.job_cd));
    if (currentIndex >= 0) contracts[currentIndex] = { ...contracts[currentIndex], ...payload };
    else {
      contracts.unshift({ ...payload });
      currentIndex = 0;
    }
    renderContracts();

    const data = await fetchJson(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    writeContractOverride(payload.job_cd, { ...payload, ...(data.contract || {}) });
    const savedContract = data.contract || payload;
    if (currentIndex >= 0) contracts[currentIndex] = { ...contracts[currentIndex], ...payload, ...savedContract };
    else contracts.unshift({ ...payload, ...savedContract });
    renderContracts();
    localStorage.removeItem("adminUploaded_contracts");
    contractFormStatus.textContent = data.message || "Contractor saved successfully.";
    resetContractForm();
    await Promise.all([loadContracts(), loadStats()]);
  } catch (err) {
    console.error(err);
    contractFormStatus.textContent = "Contractor dates are visible locally. Restart backend to save them permanently.";
  }
}

function editContractor(jobCode) {
  const contractor = contracts.find((item) => String(item.job_cd || "") === String(jobCode));
  if (!contractor) return;

  showDetailPanel(contractForm);
  document.getElementById("contractFormTitle").textContent = "Edit Contractor Details";
  contractForm.dataset.editId = contractor.job_cd || "";
  document.getElementById("contractJobCode").value = contractor.job_cd || "";
  document.getElementById("contractJobCode").readOnly = true;
  document.getElementById("contractName").value = contractor.contractor_name || contractor.name || "";
  document.getElementById("contractEngineerId").value = contractor.engineer_id || contractor.engineerId || "";
  document.getElementById("contractPhone").value = contractor.contractor_phone || contractor.mobile || "";
  document.getElementById("contractWorkArea").value = contractor.work_area || contractor.company || "";
  document.getElementById("contractDept").value = contractor.dept_cd === "-" ? "" : contractor.dept_cd || "";
  document.getElementById("contractStartDate").value = toInputDate(contractStartDateValue(contractor));
  document.getElementById("contractEndDate").value = toInputDate(contractEndDateValue(contractor));
  contractFormStatus.textContent = "Editing contractor. Use Add / Update to save changes.";
  contractForm.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function deleteContractor(jobCode) {
  if (!jobCode || !confirm(`Delete contractor ${jobCode}?`)) return;

  try {
    const data = await fetchJson(`${API_BASE}/contracts/${encodeURIComponent(jobCode)}`, {
      method: "DELETE",
    });

    localStorage.removeItem("adminUploaded_contracts");
    removeContractOverride(jobCode);
    contractFormStatus.textContent = data.message || "Contractor deleted successfully.";
    resetContractForm();
    await Promise.all([loadContracts(), loadStats()]);
  } catch (err) {
    console.error(err);
    contractFormStatus.textContent = err.message || "Could not delete contractor.";
  }
}

function resetContractForm() {
  contractForm.reset();
  contractForm.dataset.editId = "";
  document.getElementById("contractJobCode").readOnly = false;
  document.getElementById("contractFormTitle").textContent = "Add Contractor Details";
  contractForm.hidden = true;
  contractFormStatus.textContent = "Click Add Contractor to enter details.";
}

function openContractForm() {
  resetContractForm();
  showDetailPanel(contractForm);
  contractFormStatus.textContent = "Enter contractor details below.";
  document.getElementById("contractJobCode").focus();
}

async function loadSupervisors() {
  if (!workers.length) {
    try {
      workers = readUploadedTable("workers");
      if (!workers.length) workers = await fetchJson(`${API_BASE}/workers`);
    } catch (err) {
      console.error("Workers for supervisor stats failed", err);
    }
  }
  const overrides = readSupervisorAttendanceOverrides();
  const applySupervisorOverrides = (rows) => rows.map((supervisor) => {
    const override = overrides[normalizeLookupValue(supervisor.supervisor_id || supervisor.rinl_id || supervisor.rinlId)];
    return override ? { ...supervisor, ...override } : supervisor;
  });

  const uploaded = readUploadedTable("supervisors");
  if (uploaded.length) {
    supervisors = applySupervisorOverrides(uploaded);
    renderSupervisors();
    applyUploadedStats();
    return;
  }

  supervisors = applySupervisorOverrides(await fetchJson(`${API_BASE}/admin/supervisors`));
  renderSupervisors();
}

function renderSupervisors() {
  const target = document.getElementById("supervisorsBody");
  if (!target) return;
  const rows = filterSearchRows(supervisors);

  if (!rows.length) {
    target.innerHTML = `<tr><td colspan="11">${adminSearchText ? "No supervisors match your search." : "No supervisors found. Click Add Supervisor to create one."}</td></tr>`;
    return;
  }

  target.innerHTML = rows.map((s) => {
    const stats = supervisorAttendanceStats(s);
    return `
      <tr>
        <td>${esc(s.rinl_id || s.supervisor_id || "-")}</td>
        <td>${esc(s.supervisor_id || "-")}</td>
        <td>${esc(s.contractor_id || "-")}</td>
        <td>${esc(s.name || "-")}</td>
        <td>${esc(s.mobile || "-")}</td>
        <td>${esc(s.email || "-")}</td>
        <td>${esc(s.status || "-")}</td>
        <td>${formatCount(stats.present)}</td>
        <td>${formatCount(stats.absent)}</td>
        <td>${formatCount(stats.overtime)}</td>
        <td>
          <div class="action-cell">
          <button type="button" class="action-btn action-view" onclick="viewSupervisorDetails('${esc(s.supervisor_id || "")}')">View Details</button>
          <button type="button" class="action-btn action-edit" onclick="editSupervisor('${esc(s.supervisor_id || "")}')">Edit</button>
          <button type="button" class="action-btn action-delete" onclick="deleteSupervisor('${esc(s.supervisor_id || "")}')">Delete</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

function viewSupervisorDetails(supervisorId) {
  const supervisor = findRecordByKeys(supervisors, supervisorId, ["supervisor_id", "rinl_id", "rinlId"]);
  if (!supervisor) return;
  const stats = supervisorAttendanceStats(supervisor);

  showRecordDetails("Supervisor Details", "Supervisor and contractor assignment.", [
    ["RINL-ID", supervisor.rinl_id || supervisor.rinlId || supervisor.supervisor_id],
    ["Supervisor ID", supervisor.supervisor_id],
    ["Contractor ID", supervisor.contractor_id],
    ["Name", supervisor.name],
    ["Mobile", supervisor.mobile],
    ["Email", supervisor.email],
    ["Status", supervisor.status],
    ["Present", formatCount(stats.present)],
    ["Absent", formatCount(stats.absent)],
    ["Overtime", formatCount(stats.overtime)],
    ["Created", formatDate(supervisor.created_at)]
  ]);
}

async function saveSupervisor(event) {
  event.preventDefault();

  const payload = {
    supervisor_id: document.getElementById("supervisorId").value.trim(),
    contractor_id: document.getElementById("supervisorContractorId").value.trim(),
    name: document.getElementById("supervisorName").value.trim(),
    mobile: document.getElementById("supervisorMobile").value.trim(),
    email: document.getElementById("supervisorEmail").value.trim(),
    status: document.getElementById("supervisorStatus").value,
    present: document.getElementById("supervisorPresent").value,
    absent: document.getElementById("supervisorAbsent").value,
    overtime: document.getElementById("supervisorOvertime").value,
  };

  if (!payload.supervisor_id || !payload.name) {
    supervisorFormStatus.textContent = "Supervisor ID and name are required.";
    return;
  }

  const editId = supervisorForm.dataset.editId;
  const url = editId
    ? `${API_BASE}/admin/supervisors/${encodeURIComponent(editId)}`
    : `${API_BASE}/admin/supervisors`;
  const method = editId ? "PATCH" : "POST";

  try {
    const data = await fetchJson(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    writeSupervisorAttendanceOverride(payload.supervisor_id, payload);
    supervisorFormStatus.textContent = data.message || "Supervisor saved successfully.";
    resetSupervisorForm();
    await Promise.all([loadSupervisors(), loadStats()]);
  } catch (err) {
    console.error(err);
    supervisorFormStatus.textContent = err.message || "Could not save supervisor.";
  }
}

function editSupervisor(supervisorId) {
  const supervisor = supervisors.find((item) => String(item.supervisor_id || "") === String(supervisorId));
  if (!supervisor) return;

  showDetailPanel(supervisorForm);
  document.getElementById("supervisorFormTitle").textContent = "Edit Supervisor Details";
  supervisorForm.dataset.editId = supervisor.supervisor_id || "";
  document.getElementById("supervisorId").value = supervisor.supervisor_id || "";
  document.getElementById("supervisorId").readOnly = true;
  document.getElementById("supervisorContractorId").value = supervisor.contractor_id || "";
  document.getElementById("supervisorName").value = supervisor.name || "";
  document.getElementById("supervisorMobile").value = supervisor.mobile || "";
  document.getElementById("supervisorEmail").value = supervisor.email || "";
  document.getElementById("supervisorStatus").value = supervisor.status || "active";
  const stats = supervisorAttendanceStats(supervisor);
  document.getElementById("supervisorPresent").value = stats.present || "";
  document.getElementById("supervisorAbsent").value = stats.absent || "";
  document.getElementById("supervisorOvertime").value = stats.overtime || "";
  supervisorFormStatus.textContent = "Editing supervisor. Use Add / Update to save changes.";
  supervisorForm.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function deleteSupervisor(supervisorId) {
  if (!supervisorId || !confirm(`Delete supervisor ${supervisorId}?`)) return;

  try {
    const data = await fetchJson(`${API_BASE}/admin/supervisors/${encodeURIComponent(supervisorId)}`, {
      method: "DELETE",
    });

    removeSupervisorAttendanceOverride(supervisorId);
    supervisorFormStatus.textContent = data.message || "Supervisor deleted successfully.";
    resetSupervisorForm();
    await Promise.all([loadSupervisors(), loadWorkers(), loadStats()]);
  } catch (err) {
    console.error(err);
    supervisorFormStatus.textContent = err.message || "Could not delete supervisor.";
  }
}

function resetSupervisorForm() {
  supervisorForm.reset();
  supervisorForm.dataset.editId = "";
  document.getElementById("supervisorId").readOnly = false;
  document.getElementById("supervisorStatus").value = "active";
  document.getElementById("supervisorFormTitle").textContent = "Add Supervisor Details";
  supervisorForm.hidden = true;
  supervisorFormStatus.textContent = "Click Add Supervisor to enter details.";
}

function openSupervisorForm() {
  resetSupervisorForm();
  showDetailPanel(supervisorForm);
  supervisorFormStatus.textContent = "Enter supervisor details below.";
  document.getElementById("supervisorId").focus();
}

async function loadWorkers() {
  const overrides = readWorkerEditOverrides();
  const applyWorkerOverrides = (rows) => rows.map((worker) => {
    const override = overrides[normalizeLookupValue(worker.adhar_id || worker.worker_id || worker.rinl_id || worker.rinlId)];
    return override ? { ...worker, ...override } : worker;
  });

  const uploaded = readUploadedTable("workers");
  if (uploaded.length) {
    workers = applyWorkerOverrides(uploaded);
    renderWorkers();
    applyUploadedStats();
    return;
  }

  workers = applyWorkerOverrides(await fetchJson(`${API_BASE}/workers`));
  renderWorkers();
}

function renderWorkers() {
  const rows = filterSearchRows(workers);
  document.getElementById("workersBody").innerHTML = rows.length ? rows.map((w) => {
    const stats = workerAttendanceStats(w);
    return `
      <tr>
        <td>${esc(w.rinl_id || w.rinlId || w.adhar_id || "-")}</td>
        <td>${esc(w.adhar_id || "-")}</td>
        <td>${esc(w.worker_name || "-")}</td>
        <td>${esc(workerMobileValue(w) || "-")}</td>
        <td>${esc(w.job_cd || w.contractor_id || "-")}</td>
        <td>${esc(w.supervisor_id || w.supervisorId || "-")}</td>
        <td>${esc(w.worker_desig || "-")}</td>
        <td>${esc(w.worker_skill || "-")}</td>
        <td>${esc(w.worker_gender || "-")}</td>
        <td>${formatCount(stats.present)}</td>
        <td>${formatCount(stats.absent)}</td>
        <td>${formatCount(stats.overtime)}</td>
        <td>${formatMoney(w.daily_wage || w.dailyWage || 0)}</td>
        <td>
          <div class="action-cell">
          <button type="button" class="action-btn action-view" onclick="viewWorkerDetails('${esc(w.adhar_id || w.worker_id || "")}')">View Details</button>
          <button type="button" class="action-btn action-edit" onclick="editWorker('${esc(w.adhar_id || "")}')">Edit</button>
          <button type="button" class="action-btn action-delete" onclick="deleteWorker('${esc(w.adhar_id || "")}')">Delete</button>
          </div>
        </td>
      </tr>
    `;
  }).join("") : `<tr><td colspan="14">${adminSearchText ? "No workers match your search." : "No workers found."}</td></tr>`;
}

function viewWorkerDetails(workerId) {
  const worker = findRecordByKeys(workers, workerId, ["adhar_id", "worker_id", "rinl_id", "rinlId", "id"]);
  if (!worker) return;
  const stats = workerAttendanceStats(worker);
  showRecordDetails("Worker Details", "Worker, contractor, supervisor, and wage information.", [
    ["RINL-ID", worker.rinl_id || worker.rinlId || worker.adhar_id || worker.worker_id],
    ["Worker ID", worker.adhar_id || worker.worker_id],
    ["Name", worker.worker_name || worker.name],
    ["Contractor / Job Code", worker.job_cd || worker.contractor_id],
    ["Supervisor ID", worker.supervisor_id || worker.supervisorId],
    ["Designation", worker.worker_desig || worker.category],
    ["Skill", worker.worker_skill || worker.category],
    ["Gender", worker.worker_gender],
    ["Present", formatCount(stats.present)],
    ["Absent", formatCount(stats.absent)],
    ["Overtime", formatCount(stats.overtime)],
    ["Mobile", workerMobileValue(worker)],
    ["Daily Wage", worker.daily_wage]
  ]);
}

async function saveWorker(event) {
  event.preventDefault();

  const payload = {
    adhar_id: document.getElementById("workerAadhaar").value.trim(),
    worker_name: document.getElementById("workerNameInput").value.trim(),
    mobile: document.getElementById("workerMobile").value.trim(),
    job_cd: document.getElementById("workerJobCode").value.trim(),
    supervisor_id: document.getElementById("workerSupervisorId").value.trim(),
    worker_desig: document.getElementById("workerDesignation").value.trim(),
    worker_skill: document.getElementById("workerSkill").value.trim(),
    worker_gender: document.getElementById("workerGender").value.trim(),
    present: document.getElementById("workerPresent").value,
    absent: document.getElementById("workerAbsent").value,
    overtime: document.getElementById("workerOvertime").value,
    daily_wage: document.getElementById("workerDailyWage").value,
  };

  if (!payload.adhar_id || !payload.worker_name || !payload.worker_skill) {
    workerFormStatus.textContent = "Worker ID, name, and skill are required.";
    return;
  }

  const editId = workerForm.dataset.editId;
  const url = editId
    ? `${API_BASE}/workers/${encodeURIComponent(editId)}`
    : `${API_BASE}/workers`;
  const method = editId ? "PATCH" : "POST";

  try {
    const data = await fetchJson(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    writeWorkerEditOverride(payload.adhar_id, payload);
    const savedWorker = data.worker || payload;
    const currentIndex = workers.findIndex((worker) => normalizeLookupValue(worker.adhar_id || worker.worker_id || worker.rinl_id || worker.rinlId) === normalizeLookupValue(payload.adhar_id));
    if (currentIndex >= 0) workers[currentIndex] = { ...workers[currentIndex], ...payload, ...savedWorker };
    else workers.unshift({ ...payload, ...savedWorker });
    renderWorkers();
    localStorage.removeItem("adminUploaded_workers");
    workerFormStatus.textContent = data.message || "Worker saved successfully.";
    resetWorkerForm();
    await Promise.all([loadWorkers(), loadStats()]);
  } catch (err) {
    console.error(err);
    workerFormStatus.textContent = err.message || "Could not save worker.";
  }
}

function editWorker(workerId) {
  const worker = workers.find((item) => String(item.adhar_id || "") === String(workerId));
  if (!worker) return;

  showDetailPanel(workerForm);
  document.getElementById("workerFormTitle").textContent = "Edit Worker Details";
  workerForm.dataset.editId = worker.adhar_id || "";
  document.getElementById("workerAadhaar").value = worker.adhar_id || "";
  document.getElementById("workerAadhaar").readOnly = true;
  document.getElementById("workerNameInput").value = worker.worker_name || worker.name || "";
  document.getElementById("workerMobile").value = workerMobileValue(worker);
  document.getElementById("workerJobCode").value = worker.job_cd || worker.contractor_id || "";
  document.getElementById("workerSupervisorId").value = worker.supervisor_id || worker.supervisorId || "";
  document.getElementById("workerDesignation").value = worker.worker_desig || worker.category || "";
  document.getElementById("workerSkill").value = worker.worker_skill || worker.category || "";
  document.getElementById("workerGender").value = worker.worker_gender === "-" ? "" : worker.worker_gender || "";
  const stats = workerAttendanceStats(worker);
  document.getElementById("workerPresent").value = stats.present || "";
  document.getElementById("workerAbsent").value = stats.absent || "";
  document.getElementById("workerOvertime").value = stats.overtime || "";
  document.getElementById("workerDailyWage").value = worker.daily_wage || "";
  workerFormStatus.textContent = "Editing worker. Use Add / Update to save changes.";
  workerForm.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function deleteWorker(workerId) {
  if (!workerId || !confirm(`Delete worker ${workerId}?`)) return;

  try {
    const data = await fetchJson(`${API_BASE}/workers/${encodeURIComponent(workerId)}`, {
      method: "DELETE",
    });

    localStorage.removeItem("adminUploaded_workers");
    removeWorkerEditOverride(workerId);
    workerFormStatus.textContent = data.message || "Worker deleted successfully.";
    resetWorkerForm();
    await Promise.all([loadWorkers(), loadStats()]);
  } catch (err) {
    console.error(err);
    workerFormStatus.textContent = err.message || "Could not delete worker.";
  }
}

function resetWorkerForm() {
  workerForm.reset();
  workerForm.dataset.editId = "";
  document.getElementById("workerAadhaar").readOnly = false;
  document.getElementById("workerFormTitle").textContent = "Add Worker Details";
  workerForm.hidden = true;
  workerFormStatus.textContent = "Click Add Worker to enter details.";
}

function openWorkerForm() {
  resetWorkerForm();
  showDetailPanel(workerForm);
  workerFormStatus.textContent = "Enter worker details below.";
  document.getElementById("workerAadhaar").focus();
}

function showDetailPanel(panel) {
  panel.hidden = false;
}

function toInputDate(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

async function loadMuster() {
  const uploaded = readUploadedTable("muster");
  if (uploaded.length) {
    muster = uploaded;
    renderMuster();
    applyUploadedStats();
    return;
  }

  muster = [];
  renderMuster();
}

function renderMuster() {
  const rows = filterSearchRows(muster);
  document.getElementById("musterBody").innerHTML = rows.length ? rows.map((m) => `
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
  `).join("") : `<tr><td colspan="8">${adminSearchText ? "No muster records match your search." : "No muster records found."}</td></tr>`;
}

function hasUploadedData() {
  return ["users", "engineers", "contracts", "workers", "muster", "wages"].some((type) => readUploadedTable(type).length);
}

async function loadRates() {
  let rates = [];
  try {
    rates = await fetchJson(`${API_BASE}/admin/wage-rates`);
  } catch (error) {
    console.error("Rates failed", error);
  }
  const rateMap = new Map(rates.map((rate) => [normalizeWageCategory(rate.worker_skill), rate.daily_wage]));
  const savedRates = readSavedWageRates();
  Object.entries(savedRates).forEach(([skill, value]) => {
    rateMap.set(normalizeWageCategory(skill) || skill, value);
  });
  document.getElementById("ratesBody").innerHTML = WAGE_RATE_CATEGORIES.map((category) => `
    <tr>
      <td>${category.label}</td>
      <td><input type="number" id="rate-${normalizeKey(category.key)}" value="${rateMap.get(category.key) || 0}" /></td>
      <td><button type="button" onclick="updateRate('${category.key}')">Update</button></td>
    </tr>
  `).join("");
}

function normalizeWageCategory(value) {
  if (String(value || "").trim() === "-") return "UnSkilled";
  const normalized = normalizeKey(value);
  if (normalized.includes("supervisor")) return "Supervisor";
  if (normalized === "skilled") return "Skilled";
  if (normalized === "skill" || normalized.includes("semi")) return "Semi Skilled";
  if (normalized.includes("unskilled") || normalized === "un_skilled") return "UnSkilled";
  return "";
}

async function updateRate(skill) {
  const value = document.getElementById(`rate-${normalizeKey(skill)}`).value;
  writeSavedWageRate(skill, value);
  try {
    await fetchJson(`${API_BASE}/admin/wage-rates/${encodeURIComponent(skill)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ daily_wage: value }),
    });
  } catch (error) {
    console.error("Backend wage rate update failed", error);
  }
  alert("Wage rate updated");
  loadRates();
  loadStats();
}

function formatDate(date) {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("en-IN");
}

function formatDateTime(date) {
  if (!date) return "-";
  return new Date(date).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

document.getElementById("profileName").textContent = user.name || "-";
document.getElementById("profileEmail").textContent = user.email || "-";
document.getElementById("profileEmployeeId").textContent = user.rinl_id || user.rinlId || user.employee_id || user.empId || "-";
document.getElementById("profileRole").textContent = user.role || "-";

function loadSafely(loader, label) {
  loader().catch((err) => {
    console.error(`${label} failed`, err);
  });
}

loadSafely(loadStats, "Stats");
loadSafely(loadUsers, "Users");
loadSafely(loadEngineers, "Engineers");
loadSafely(loadContracts, "Contracts");
loadSafely(loadSupervisors, "Supervisors");
loadSafely(loadWorkers, "Workers");
loadSafely(loadMuster, "Muster");
loadSafely(loadRates, "Rates");
loadSafely(loadLoginActivity, "Login activity");
renderDocuments();
renderSummaryReviews();
renderAdminAlerts();
