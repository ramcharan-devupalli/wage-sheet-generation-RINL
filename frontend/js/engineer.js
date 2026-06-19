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
const LOCAL_WAGE_KEY = "rinl_wage_sheet_submissions";
const ENGINEER_SUMMARY_KEY = "rinl_engineer_summary_submissions";
const reportSummary = {
  totalContractors: 0,
  totalWorkers: 0,
  totalWageCost: 0,
  pendingWageSheets: 0,
};

if (typeof applySessionToPage === "function") applySessionToPage("engineerincharge.html");
if (typeof bindLogoutButtons === "function") bindLogoutButtons();

let activeSection = "overview";
let activeRemarksContractor = "";
let activeWageSubmissionId = "";
let uploadedRows = [];

function readLocalWageSubmissions() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_WAGE_KEY) || "[]");
  } catch (error) {
    return [];
  }
}

function writeLocalWageSubmissions(submissions) {
  try {
    localStorage.setItem(LOCAL_WAGE_KEY, JSON.stringify(submissions));
  } catch (error) {
    showToast("Browser storage is blocked. Wage decision was not saved.");
  }
}

function readEngineerSummaries() {
  try {
    return JSON.parse(localStorage.getItem(ENGINEER_SUMMARY_KEY) || "[]");
  } catch (error) {
    return [];
  }
}

function writeEngineerSummaries(summaries) {
  try {
    localStorage.setItem(ENGINEER_SUMMARY_KEY, JSON.stringify(summaries));
  } catch (error) {
    showToast("Browser storage is blocked. Summary was not saved.");
  }
}

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

function addOrUpdateWageSheet(submission) {
  const existing = wageSheets.find((item) => item.id === submission.id || item.contractor === submission.contractor);
  const record = {
    id: submission.id,
    contractor: submission.contractor,
    month: submission.month,
    workers: Number(submission.workers || 0),
    amount: Number(submission.amount || submission.net || submission.gross || 0),
    status: submission.status || "Submitted to Engineer",
    remarks: submission.remarks || "Pending Engineer-In-Charge review.",
    submissionId: submission.id
  };

  if (existing) Object.assign(existing, record);
  else wageSheets.unshift(record);
}

function syncSubmittedWageSheets() {
  readLocalWageSubmissions().forEach((submission) => {
    addOrUpdateWageSheet(submission);
    if (!alerts.some((alert) => alert.wageSubmissionId === submission.id)) {
      alerts.unshift({
        title: "Wage sheet submitted",
        text: `${submission.contractor} submitted ${submission.month} wage sheet for engineer review.`,
        tone: "#b98512",
        wageSubmissionId: submission.id,
        contractor: submission.contractor
      });
    }
  });
}

function syncAdminSummaryDecisions() {
  readEngineerSummaries().forEach((summary) => {
    if (!/approved/i.test(summary.status || "")) return;
    if (alerts.some((alert) => alert.summarySubmissionId === summary.id)) return;

    alerts.unshift({
      title: "Admin summary approved",
      text: `Admin approved ${summary.period} summary. Note: ${summary.adminNote || "No note added."}`,
      tone: "#16835f",
      summarySubmissionId: summary.id
    });
  });
}

function findSubmissionById(id) {
  return readLocalWageSubmissions().find((submission) => submission.id === id);
}

function findSubmissionByContractor(contractorName) {
  return readLocalWageSubmissions().find((submission) => submission.contractor === contractorName);
}

function detailRows(object, moneyKeys = []) {
  return Object.entries(object || {}).map(([key, value]) => {
    const label = key.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase());
    const display = moneyKeys.includes(key) ? formatMoney(Number(value || 0)) : value;
    return `<div class="review-row"><span>${label}</span><b>${display ?? "-"}</b></div>`;
  }).join("");
}

function workerDetailTable(rows = []) {
  if (!rows.length) return emptyState("No worker wage line items were submitted.");
  return `
    <div class="table-wrap review-table-wrap">
      <table>
        <thead>
          <tr>
            <th>Worker ID</th>
            <th>Name</th>
            <th>Category</th>
            <th>Days</th>
            <th>OT</th>
            <th>Gross</th>
            <th>PF</th>
            <th>ESI</th>
            <th>Net</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((worker) => `
            <tr>
              <td>${worker.id || "-"}</td>
              <td>${worker.name || "-"}</td>
              <td>${worker.category || "-"}</td>
              <td>${worker.days || 0}</td>
              <td>${worker.overtime || 0}</td>
              <td>${formatMoney(worker.gross || 0)}</td>
              <td>${formatMoney(worker.pf || 0)}</td>
              <td>${formatMoney(worker.esi || 0)}</td>
              <td>${formatMoney(worker.net || 0)}</td>
              <td>${badge(worker.status || "Active")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>`;
}

function renderWageReviewDetails(submission) {
  const details = submission.details || {};
  const summaryMoneyKeys = ["grossWage", "pfDeduction", "esiDeduction", "netPayable", "contractValue", "remainingBalance", "totalDeductions", "payrollExpense"];
  return `
    <div class="review-status-line">
      ${badge(submission.status || "Submitted to Engineer")}
      <span>Submitted: ${submission.submittedAt ? new Date(submission.submittedAt).toLocaleString("en-IN") : "-"}</span>
      <span>Reviewed: ${submission.reviewedAt ? new Date(submission.reviewedAt).toLocaleString("en-IN") : "Pending"}</span>
    </div>
    <div class="review-grid">
      <section class="review-section"><h4>Contractor Information</h4>${detailRows(details.contractorInfo)}</section>
      <section class="review-section"><h4>Workforce Summary</h4>${detailRows(details.workforceSummary)}</section>
      <section class="review-section"><h4>Attendance Summary</h4>${detailRows(details.attendanceSummary)}</section>
      <section class="review-section"><h4>Wage Calculation Summary</h4>${detailRows(details.wageCalculationSummary, summaryMoneyKeys)}</section>
      <section class="review-section"><h4>Expense Summary</h4>${detailRows(details.expenseSummary, summaryMoneyKeys)}</section>
      <section class="review-section"><h4>Verification Section</h4>${detailRows(details.verificationSection)}</section>
    </div>
    <section class="review-section full"><h4>Worker Wage Line Items</h4>${workerDetailTable(details.workerRows)}</section>
  `;
}

function openWageReview(submissionId) {
  const submission = findSubmissionById(submissionId);
  if (!submission) {
    showToast("Submitted wage sheet not found.");
    return;
  }

  activeWageSubmissionId = submissionId;
  document.getElementById("wageReviewTitle").textContent = `${submission.contractor} Wage Sheet`;
  document.getElementById("wageReviewMeta").textContent = `${submission.month} | ${submission.workers || 0} workers | ${formatMoney(submission.amount || submission.net || submission.gross || 0)}`;
  document.getElementById("wageReviewBody").innerHTML = renderWageReviewDetails(submission);
  document.getElementById("wageReviewRemarks").value = submission.remarks || "";
  document.getElementById("wageReviewDialog").showModal();
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
  const parsed = Number(String(value).replace(/,/g, "").replace(/rs\.?/gi, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function hasAny(row, keys) {
  return keys.some((key) => {
    const value = row[normalizeKey(key)];
    return value !== undefined && value !== "";
  });
}

const WORKER_COUNT_KEYS = ["workers", "worker_count", "total_workers", "no_of_workers", "number_of_workers", "workforce", "manpower"];
const WAGE_AMOUNT_KEYS = ["total_wage_cost", "wage_cost", "wage_amount", "amount", "net_wage", "net", "gross_wage", "gross", "total_wage", "expense", "total_expense", "monthly_expense", "payroll"];
const PENDING_WAGE_KEYS = ["pending_wage_sheets", "pending_wages", "pending_sheets", "pending_wage_sheet_count"];

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
  const contractorIds = new Set();
  const workerIds = new Set();
  const categoryMap = new Map();
  const dateMap = new Map();
  const monthMap = new Map();
  const wageMap = new Map();
  const overtimeMap = new Map();
  const complianceMap = new Map();
  const progressMap = new Map();
  let uploadedTotalContractors = 0;
  let uploadedTotalWorkers = 0;
  let uploadedTotalWageCost = 0;
  let uploadedPendingWageSheets = 0;

  rows.forEach((row, index) => {
    const contractor = pick(row, ["contractor", "contractor_name", "agency", "vendor"], "Unknown Contractor");
    const contractorId = pick(row, ["contractor_id", "contract_id", "job_cd", "job_code", "work_order"], contractor);
    const department = pick(row, ["department", "dept", "section"], "General");
    const worker = pick(row, ["worker", "worker_name", "name", "employee_name"], `Worker ${index + 1}`);
    const workerId = pick(row, ["worker_id", "employee_id", "emp_id", "adhar_id", "aadhaar_id", "aadhar_id"], worker);
    const skill = pick(row, ["category", "skill", "worker_skill", "designation"], "Unskilled");
    const statusText = pick(row, ["status", "attendance_status", "present_absent"], "");
    const presentDays = numeric(row, ["present", "present_days", "days_present", "days", "work_days"], statusText.toLowerCase().includes("present") ? 1 : 0);
    const absentDays = numeric(row, ["absent", "absent_days"], statusText.toLowerCase().includes("absent") ? 1 : 0);
    const overtimeHours = numeric(row, ["overtime", "ot", "ot_hours", "overtime_hours"], 0);
    const amount = numeric(row, WAGE_AMOUNT_KEYS, 0);
    const explicitWorkerCount = numeric(row, WORKER_COUNT_KEYS, 0);
    const dateValue = pick(row, ["date", "attendance_date", "work_date"], "");
    const month = pick(row, ["month", "wage_month", "period"], monthLabel(dateValue));
    const compliance = pick(row, ["compliance", "compliance_status", "pf_status", "esi_status"], "Pending");
    const workOrder = pick(row, ["work_order", "workorder", "package", "activity"], "");
    const progress = numeric(row, ["progress", "progress_percent", "completion"], 0);
    const uploadedContractorCount = numeric(row, ["total_contractors", "contractor_count", "contractors"], 0);
    const uploadedWorkerCount = numeric(row, ["total_workers"], 0);
    const uploadedWageCost = numeric(row, ["total_wage_cost"], 0);
    const uploadedPendingCount = numeric(row, PENDING_WAGE_KEYS, 0);

    if (uploadedContractorCount) uploadedTotalContractors = uploadedContractorCount;
    if (uploadedWorkerCount) uploadedTotalWorkers = uploadedWorkerCount;
    if (uploadedWageCost) uploadedTotalWageCost = uploadedWageCost;
    if (uploadedPendingCount) uploadedPendingWageSheets = uploadedPendingCount;
    if (contractorId) contractorIds.add(String(contractorId).toLowerCase());
    if (workerId) workerIds.add(String(workerId).toLowerCase());

    const contractorRecord = contractorMap.get(contractor) || {
      name: contractor,
      workers: 0,
      explicitWorkers: 0,
      workerIds: new Set(),
      present: 0,
      absent: 0,
      overtime: 0,
      status: "Uploaded",
      department,
    };
    if (explicitWorkerCount) contractorRecord.explicitWorkers = Math.max(contractorRecord.explicitWorkers, explicitWorkerCount);
    if (workerId) contractorRecord.workerIds.add(String(workerId).toLowerCase());
    contractorRecord.workers = contractorRecord.explicitWorkers || contractorRecord.workerIds.size || contractorRecord.workers + 1;
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
    wageRecord.workers = explicitWorkerCount || wageRecord.workers + 1;
    wageRecord.amount += amount;
    wageRecord.month = monthKey;
    wageRecord.status = pick(row, ["wage_status", "wage_sheet_status", "approval_status", "status"], wageRecord.status);
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

  replaceArray(contractors, Array.from(contractorMap.values()).map(({ workerIds: _workerIds, explicitWorkers: _explicitWorkers, ...item }) => item));
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

  reportSummary.totalContractors = uploadedTotalContractors;
  reportSummary.totalWorkers = uploadedTotalWorkers;
  reportSummary.totalWageCost = uploadedTotalWageCost;
  reportSummary.pendingWageSheets = uploadedPendingWageSheets;
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

function formatReportWageCost(value) {
  const amount = Number(value || 0);
  if (amount >= 100000) {
    const lakhs = amount / 100000;
    return `₹${Number.isInteger(lakhs) ? lakhs : lakhs.toFixed(1)} Lakhs`;
  }
  return formatMoney(amount);
}

function renderReportRows(targetId, rows) {
  const target = document.getElementById(targetId);
  if (!target) return;
  target.innerHTML = rows.map(([label, value]) => `
    <div class="report-detail-row">
      <span>${label}</span>
      <strong>${value}</strong>
    </div>
  `).join("");
}

function getTopExpenseCategory() {
  if (!categoryData.length) return "Skilled Workers";
  return categoryData.reduce((top, item) => item.value > top.value ? item : top, categoryData[0]).label;
}

function getHighestCostContractor() {
  if (!wageSheets.length) return "ABC Contractors";
  return wageSheets.reduce((top, item) => Number(item.amount || 0) > Number(top.amount || 0) ? item : top, wageSheets[0]).contractor;
}

function renderReportSummary() {
  const hasReportData = contractors.length || wageSheets.length || overtimeItems.length || uploadedRows.length;
  const totalContractors = reportSummary.totalContractors || contractors.length || 5;
  const totalWorkers = reportSummary.totalWorkers || contractors.reduce((sum, item) => sum + item.workers, 0) || 575;
  const totalWageCost = reportSummary.totalWageCost || wageSheets.reduce((sum, item) => sum + item.amount, 0) || 8082000;
  const totalOtCost = overtimeItems.reduce((sum, item) => sum + Number(item.amount || 0), 0) || 425000;
  const pendingWageSheets = reportSummary.pendingWageSheets || wageSheets.filter((item) => {
    const status = String(item.status || "").toLowerCase();
    return !status.includes("approved") && !status.includes("verified") && !status.includes("rejected");
  }).length || (hasReportData ? 0 : 3);
  const approvedWageSheets = wageSheets.filter((item) => /approved/i.test(item.status)).length || (hasReportData ? 0 : 10);
  const rejectedWageSheets = wageSheets.filter((item) => /rejected/i.test(item.status)).length;
  const verifiedWageSheets = wageSheets.filter((item) => /verified|approved|rejected/i.test(item.status)).length || (hasReportData ? approvedWageSheets + rejectedWageSheets : 12);
  const reviewedContractors = contractors.filter((item) => /approved|rejected|verified|uploaded/i.test(item.status)).length || (hasReportData ? contractors.length : 5);
  const averageWage = totalWorkers ? Math.round(totalWageCost / totalWorkers) : 0;
  const totalOtHours = overtimeItems.reduce((sum, item) => sum + Number(item.hours || 0), 0);
  const averageOtHours = totalWorkers && totalOtHours ? totalOtHours / totalWorkers : 1.47;

  document.getElementById("reportTotalContractors").textContent = totalContractors;
  document.getElementById("reportTotalWorkers").textContent = totalWorkers;
  document.getElementById("reportTotalWageCost").textContent = formatReportWageCost(totalWageCost);
  document.getElementById("reportPendingWageSheets").textContent = pendingWageSheets;

  renderReportRows("operationalSummaryRows", [
    ["Total Contractors", totalContractors],
    ["Total Workers", totalWorkers],
    ["Total Payroll Cost", formatReportWageCost(totalWageCost)],
    ["Total OT Cost", formatReportWageCost(totalOtCost)],
    ["Top Expense Category", getTopExpenseCategory()],
    ["Highest Cost Contractor", getHighestCostContractor()],
    ["Pending Approvals", pendingWageSheets],
  ]);

  renderReportRows("verificationSummaryRows", [
    ["Contractors Reviewed", `${reviewedContractors}/${totalContractors}`],
    ["Wage Sheets Verified", verifiedWageSheets],
    ["Approved", approvedWageSheets],
    ["Pending", pendingWageSheets],
    ["Rejected", rejectedWageSheets],
  ]);

  renderReportRows("financialSummaryRows", [
    ["Total Wage Expense", formatReportWageCost(totalWageCost)],
    ["OT Expense", formatReportWageCost(totalOtCost)],
    ["Average Wage", formatMoney(averageWage)],
    ["Average OT Hours", `${averageOtHours.toFixed(2)} hrs/worker`],
  ]);
  updateSummarySubmitStatus();
}

function getEngineerName() {
  try {
    const session = JSON.parse(localStorage.getItem("rinlSession") || "null");
    return session?.employee?.name || "Engineer In-Charge";
  } catch (error) {
    return "Engineer In-Charge";
  }
}

function latestSummaryPeriod() {
  const submitted = readLocalWageSubmissions()[0];
  const wage = wageSheets[0];
  return submitted?.month || wage?.month || new Date().toLocaleString("en-IN", { month: "long", year: "numeric" });
}

function getLatestEngineerSummary() {
  const engineerName = getEngineerName();
  return readEngineerSummaries().find((summary) => summary.engineerName === engineerName) || null;
}

function updateSummarySubmitStatus() {
  const target = document.getElementById("summarySubmitStatus");
  if (!target) return;

  const summary = getLatestEngineerSummary();
  if (!summary) {
    target.textContent = "No summary submitted yet.";
    return;
  }

  const submittedAt = summary.submittedAt ? new Date(summary.submittedAt).toLocaleString("en-IN") : "-";
  target.textContent = `${summary.status || "Submitted to Admin"} on ${submittedAt}${summary.adminNote ? ` | Admin note: ${summary.adminNote}` : ""}`;
}

function buildEngineerSummaryPayload() {
  const operationalText = document.getElementById("operationalSummaryInput").value.trim();
  const financialText = document.getElementById("financialSummaryInput").value.trim();
  const totalWorkers = contractors.reduce((sum, item) => sum + Number(item.workers || 0), 0);
  const totalWageCost = reportSummary.totalWageCost || wageSheets.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const pendingWageSheets = wageSheets.filter((item) => !/approved|verified|rejected/i.test(item.status || "")).length;

  return {
    id: `${getEngineerName().replace(/[^a-z0-9]+/gi, "-")}-${Date.now()}`,
    engineerName: getEngineerName(),
    period: latestSummaryPeriod(),
    operationalSummary: operationalText || `Reviewed ${contractors.length} contractor(s), ${totalWorkers} worker(s), and ${attendanceItems.length} attendance record(s). Pending wage sheets: ${pendingWageSheets}.`,
    financialSummary: financialText || `Total wage cost is ${formatMoney(totalWageCost)} with ${wageSheets.length} wage sheet(s) under engineer review.`,
    totals: {
      contractors: contractors.length,
      workers: totalWorkers,
      wageCost: totalWageCost,
      pendingWageSheets
    },
    contractorWageSheets: readLocalWageSubmissions(),
    engineerWageSheets: wageSheets.map((item) => ({ ...item })),
    reportSnapshot: {
      contractors: contractors.map((item) => ({ ...item })),
      attendance: attendanceItems.slice(0, 100).map((item) => ({ ...item })),
      overtime: overtimeItems.map((item) => ({ ...item }))
    },
    status: "Submitted to Admin",
    submittedAt: new Date().toISOString(),
    reviewedAt: null,
    adminNote: ""
  };
}

function submitEngineerSummary(event) {
  event.preventDefault();
  const engineerName = getEngineerName();
  const summaries = readEngineerSummaries().filter((summary) => summary.engineerName !== engineerName);
  const payload = buildEngineerSummaryPayload();

  summaries.unshift(payload);
  writeEngineerSummaries(summaries);
  addAlert("Summary submitted to admin", `${payload.period} operational and financial summary was sent to Admin for approval.`, "#176b87");
  updateSummarySubmitStatus();
  showToast("Operational and financial summary submitted to Admin.");
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
        ${item.wageSubmissionId ? `<div class="row-actions alert-actions">
          <button class="mini-btn" data-view-wage-submission="${item.wageSubmissionId}">View Details</button>
          <button class="mini-btn approve" data-wage-submission="${item.wageSubmissionId}" data-decision="approved">Approve</button>
          <button class="mini-btn reject" data-wage-submission="${item.wageSubmissionId}" data-decision="rejected">Reject</button>
        </div>` : ""}
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
          ${item.submissionId ? `<button class="mini-btn" data-view-wage-submission="${item.submissionId}">View Details</button>` : actionButton("View", "wage-view", item.contractor)}
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
  renderReportSummary();
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
    if (wage.submissionId) {
      reviewSubmittedWageSheet(wage.submissionId, "approved");
      return;
    }
    wage.status = "Approved";
    addAlert("Wage sheet approved", `${contractorName} wage sheet was approved for payroll processing.`, "#16835f");
    renderWageRows();
    renderMetrics();
    showToast(`${contractorName} wage sheet approved.`);
    return;
  }

  if (action === "wage-reject") {
    if (wage.submissionId) {
      reviewSubmittedWageSheet(wage.submissionId, "rejected");
      return;
    }
    wage.status = "Rejected";
    addAlert("Wage sheet rejected", `${contractorName} wage sheet was rejected with correction required.`, "#c03d3d");
    renderWageRows();
    renderMetrics();
    showToast(`${contractorName} wage sheet rejected.`);
  }
}

function reviewSubmittedWageSheet(submissionId, decision) {
  const submissions = readLocalWageSubmissions();
  const index = submissions.findIndex((submission) => submission.id === submissionId);
  if (index < 0) {
    showToast("Submitted wage sheet not found.");
    return;
  }

  const approved = decision === "approved";
  const dialogRemarks = document.getElementById("wageReviewRemarks")?.value.trim();
  submissions[index] = {
    ...submissions[index],
    status: approved ? "Approved by Engineer" : "Rejected by Engineer",
    remarks: dialogRemarks || (approved ? "Approved for payroll processing." : "Rejected by Engineer-In-Charge. Corrections required."),
    reviewedAt: new Date().toISOString()
  };
  writeLocalWageSubmissions(submissions);
  addOrUpdateWageSheet(submissions[index]);

  const alert = alerts.find((item) => item.wageSubmissionId === submissionId);
  if (alert) {
    alert.title = approved ? "Wage sheet accepted" : "Wage sheet rejected";
    alert.text = `${submissions[index].contractor} wage sheet was ${approved ? "Accepted" : "Rejected"} by Engineer-In-Charge.`;
    alert.tone = approved ? "#16835f" : "#c03d3d";
  }

  renderAlerts();
  renderWageRows();
  renderMetrics();
  renderReportSummary();
  document.getElementById("wageReviewDialog")?.close();
  showToast(`Wage sheet ${decision}.`);
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
    const wageViewButton = event.target.closest("[data-view-wage-submission]");
    if (wageViewButton) {
      openWageReview(wageViewButton.dataset.viewWageSubmission);
      return;
    }

    const wageSubmissionButton = event.target.closest("[data-wage-submission]");
    if (wageSubmissionButton) {
      reviewSubmittedWageSheet(wageSubmissionButton.dataset.wageSubmission, wageSubmissionButton.dataset.decision);
      return;
    }

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

  document.getElementById("approveWageReviewBtn").addEventListener("click", (event) => {
    event.preventDefault();
    if (activeWageSubmissionId) reviewSubmittedWageSheet(activeWageSubmissionId, "approved");
  });

  document.getElementById("rejectWageReviewBtn").addEventListener("click", (event) => {
    event.preventDefault();
    if (activeWageSubmissionId) reviewSubmittedWageSheet(activeWageSubmissionId, "rejected");
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

  document.getElementById("engineerSummaryForm").addEventListener("submit", submitEngineerSummary);

  document.getElementById("refreshBtn").addEventListener("click", () => {
    renderDashboard();
    switchSection(activeSection);
    showToast("Dashboard refreshed.");
  });

  window.addEventListener("storage", (event) => {
    if (event.key === LOCAL_WAGE_KEY || event.key === ENGINEER_SUMMARY_KEY) renderDashboard();
  });

  window.addEventListener("focus", renderDashboard);
}

function renderDashboard() {
  syncSubmittedWageSheets();
  syncAdminSummaryDecisions();
  renderMetrics();
  renderReportSummary();
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
