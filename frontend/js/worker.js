    const WORKER_API_BASE = ["file:", "http:"].includes(window.location.protocol)
      && ["", "127.0.0.1", "localhost"].includes(window.location.hostname)
      && window.location.port !== "3000"
      ? "http://localhost:3000"
      : "";

    const savedSession = typeof applySessionToPage === "function"
      ? applySessionToPage("worker.html")
      : (typeof currentSession === "function" ? currentSession() : null);
    if (typeof bindLogoutButtons === "function") bindLogoutButtons();

    let workerData = null;
    let attendanceChart = null;
    const LOCAL_LEAVE_KEY = "rinl_worker_leave_requests";

    function sessionHeaders() {
      const employee = savedSession?.employee || {};
      const employeeId = employee.rinl_id || employee.rinlId || employee.empId || employee.emp_id || "";
      return {
        "Content-Type": "application/json",
        "x-employee-id": employeeId,
        "x-worker-id": employeeId
      };
    }

    function formatMoney(value) {
      return new Intl.NumberFormat("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(Number(value || 0));
    }

    function getSkillLabel(skill) {
      const map = {
        SK: "Skilled Worker",
        SSK: "Semi-Skilled Worker",
        USK: "Unskilled Worker",
        SUP: "Supervisor"
      };
      return map[(skill || "").toUpperCase()] || skill || "-";
    }

    function calculatePayroll(data) {
      if (
        data.grossWage != null &&
        data.pfAmount != null &&
        data.insuranceAmount != null &&
        data.netWage != null
      ) {
        return {
          gross: Number(data.grossWage || 0),
          pf: Number(data.pfAmount || 0),
          insurance: Number(data.insuranceAmount || 0),
          net: Number(data.netWage || 0)
        };
      }

      const presentDays = Number(data.presentDays || data.present_days || 0);
      const wagePerDay = Number(data.wagePerDay || data.wage_per_day || 0);
      const gross = presentDays * wagePerDay;
      const totalPf = gross * 0.05;
      const totalInsurance = gross * 0.02;
      const net = gross - totalPf - totalInsurance;

      return {
        gross,
        pf: totalPf,
        insurance: totalInsurance,
        net
      };
    }

    function showToast(message) {
      const toast = document.getElementById("toast");
      toast.textContent = message;
      toast.classList.add("show");
      setTimeout(() => toast.classList.remove("show"), 2500);
    }

    function readLocalLeaveRequests() {
      try {
        return JSON.parse(localStorage.getItem(LOCAL_LEAVE_KEY) || "[]");
      } catch (error) {
        return [];
      }
    }

    function writeLocalLeaveRequests(requests) {
      try {
        localStorage.setItem(LOCAL_LEAVE_KEY, JSON.stringify(requests));
      } catch (error) {
        throw new Error("Backend is offline and browser storage is blocked.");
      }
    }

    function saveLocalLeaveRequest(fromDate, toDate, reason, applyTo) {
      const workerId = workerData?.rinl_id || workerData?.rinlId || workerData?.workerId || workerData?.worker_id || workerData?.loginId || workerData?.login_id || "LOCAL-WORKER";
      const workerName = workerData?.name || workerData?.full_name || "Worker";
      const requests = readLocalLeaveRequests().filter((request) => request.workerId !== workerId);
      const request = {
        id: `${workerId}-${Date.now()}`,
        workerId,
        workerName,
        category: workerData?.skill || workerData?.skill_code || "-",
        contractorId: workerData?.jobCode || workerData?.job_code || "-",
        fromDate,
        toDate,
        reason,
        applyTo: applyTo || "Supervisor",
        status: `Applied from ${fromDate} to ${toDate}`,
        approval: "Pending",
        notification: "Leave request sent to supervisor and pending review.",
        requestedDays: Math.max(1, Math.floor((new Date(toDate) - new Date(fromDate)) / 86400000) + 1),
        submittedAt: new Date().toISOString(),
        reviewedAt: null
      };

      requests.unshift(request);
      writeLocalLeaveRequests(requests);
      return request;
    }

    function getLocalLeaveForWorker(data) {
      const workerId = data?.rinl_id || data?.rinlId || data?.workerId || data?.worker_id || data?.loginId || data?.login_id;
      if (!workerId) return null;
      return readLocalLeaveRequests().find((request) => request.workerId === workerId) || null;
    }

    function applyLocalLeaveToWorkerData() {
      if (!workerData) return;
      const leave = getLocalLeaveForWorker(workerData);
      if (!leave) return;
      workerData.leaveStatus = leave.approval === "Approved"
        ? "Leave Approved"
        : leave.approval === "Rejected"
        ? "Leave Rejected"
        : leave.status;
      workerData.leaveApprovalStatus = leave.approval;
      workerData.appliedTo = leave.applyTo;
      workerData.notification = leave.notification;
      workerData.leaveUsed = leave.approval === "Approved" ? leave.requestedDays : 0;
      workerData.leavePendingCount = leave.approval === "Pending" ? 1 : 0;
      workerData.leaveBalance = 12 - Number(workerData.leaveUsed || 0);
    }

    function syncLocalLeaveDecision(showUpdate = false) {
      if (!workerData) return;
      const beforeApproval = workerData.leaveApprovalStatus || workerData.leave_approval_status;
      const beforeNotification = workerData.notification;
      applyLocalLeaveToWorkerData();

      const changed = beforeApproval !== workerData.leaveApprovalStatus || beforeNotification !== workerData.notification;
      if (changed) {
        renderWorkerData();
        if (showUpdate && workerData.leaveApprovalStatus !== "Pending") {
          showToast(workerData.leaveStatus);
        }
      }
    }

    function openLeaveModal() {
      document.getElementById("leaveModal").classList.add("active");
    }

    function closeLeaveModal() {
      document.getElementById("leaveModal").classList.remove("active");
    }

    function getAttendanceSummary(data) {
      const present = Number(data.presentDays ?? data.present_days ?? 0);
      const absent = Number(data.absentDays ?? data.absent_days ?? 0);
      const weeklyOff = Number(data.weeklyOff ?? data.weekly_off ?? 0);
      const holidays = Number(data.holidays ?? 0);
      return { present, absent, weeklyOff, holidays };
    }

    function getMonthlyTrend(data) {
      return Array.isArray(data.attendanceTrend) && data.attendanceTrend.length
        ? data.attendanceTrend
        : [
            { label: "Week 1", value: 6 },
            { label: "Week 2", value: 5 },
            { label: "Week 3", value: 6 },
            { label: "Week 4", value: 6 }
          ];
    }

    function renderAttendanceChart(type = "bar") {
      if (!workerData) return;

      const { present, absent, weeklyOff, holidays } = getAttendanceSummary(workerData);
      const monthlyTrend = getMonthlyTrend(workerData);
      const ctx = document.getElementById("attendanceChart");

      if (attendanceChart) attendanceChart.destroy();

      const isRound = type === "doughnut";
      const config = isRound
        ? {
            type: "doughnut",
            data: {
              labels: ["Present", "Absent", "Weekly Off", "Holidays"],
              datasets: [{
                data: [present, absent, weeklyOff, holidays],
                backgroundColor: ["#059669", "#dc2626", "#f59e0b", "#2563eb"],
                borderWidth: 0
              }]
            },
            options: {
              responsive: true,
              plugins: { legend: { position: "bottom" } }
            }
          }
        : {
            type,
            data: {
              labels: monthlyTrend.map(item => item.label),
              datasets: [{
                label: "Days Present",
                data: monthlyTrend.map(item => item.value),
                borderColor: "#d97706",
                backgroundColor: type === "line" ? "rgba(217,119,6,0.15)" : ["#d97706", "#f59e0b", "#fbbf24", "#fcd34d"],
                fill: type === "line",
                tension: 0.35,
                borderRadius: type === "bar" ? 10 : 0,
                pointRadius: type === "line" ? 4 : 0,
                pointBackgroundColor: "#b45309"
              }]
            },
            options: {
              responsive: true,
              plugins: { legend: { display: type === "line" } },
              scales: {
                y: {
                  beginAtZero: true,
                  ticks: { precision: 0 }
                }
              }
            }
          };

      attendanceChart = new Chart(ctx, config);

      document.getElementById("attendanceInsight").textContent =
        type === "bar"
          ? "Bar view shows weekly attendance comparison clearly."
          : type === "line"
          ? "Line view shows attendance trend across the month."
          : "Doughnut view shows present, absent, weekly off, and holiday split.";
    }

    function updateProgressBars(payroll, data) {
      const presentDays = Number(data.presentDays ?? data.present_days ?? 0);
      const absentDays = Number(data.absentDays ?? data.absent_days ?? 0);
      const weeklyOff = Number(data.weeklyOff ?? data.weekly_off ?? 0);
      const holidays = Number(data.holidays ?? 0);
      const shiftHours = Number(data.shiftHours ?? data.shift_hours ?? 0);

      const totalDays = (presentDays + absentDays + weeklyOff + holidays) || 30;
      const workedPercent = Math.min(100, Math.round((presentDays / totalDays) * 100));
      const shiftPercent = Math.min(100, Math.round((shiftHours / 12) * 100));
      const grossBase = payroll.gross || 1;
      const netPercent = Math.min(100, Math.round((payroll.net / grossBase) * 100));

      document.getElementById("daysWorkedProgress").style.width = workedPercent + "%";
      document.getElementById("netWageProgress").style.width = netPercent + "%";
      document.getElementById("grossWageProgress").style.width = "100%";
      document.getElementById("shiftProgress").style.width = shiftPercent + "%";
    }

    function populateWageSheet(data, payroll) {
      const name = data.name || data.full_name || "-";
      const loginId = data.loginId || data.login_id || "-";
      const workerId = data.rinl_id || data.rinlId || data.workerId || data.worker_id || "-";
      const skillCode = (data.skill || data.skill_code || "").toUpperCase();
      const shiftHours = data.shiftHours ?? data.shift_hours ?? 0;
      const presentDays = data.presentDays ?? data.present_days ?? 0;
      const absentDays = data.absentDays ?? data.absent_days ?? 0;
      const weeklyOff = data.weeklyOff ?? data.weekly_off ?? 0;
      const wagePerDay = data.wagePerDay ?? data.wage_per_day ?? 0;

      document.getElementById("sheetLoginId").textContent = loginId;
      document.getElementById("sheetWorkerId").textContent = workerId;
      document.getElementById("sheetWorkerName").textContent = name;
      document.getElementById("sheetSkill").textContent = getSkillLabel(skillCode);
      document.getElementById("sheetPresent").textContent = presentDays;
      document.getElementById("sheetAbsent").textContent = absentDays;
      document.getElementById("sheetWeeklyOff").textContent = weeklyOff;
      document.getElementById("sheetShift").textContent = `${shiftHours} hrs`;
      document.getElementById("sheetDailyWage").textContent = formatMoney(wagePerDay);
      document.getElementById("sheetGrossWage").textContent = formatMoney(payroll.gross);
      document.getElementById("sheetPf").textContent = formatMoney(payroll.pf);
      document.getElementById("sheetInsurance").textContent = formatMoney(payroll.insurance);
      document.getElementById("sheetNetWage").textContent = formatMoney(payroll.net);
    }

    function renderWorkerData() {
      if (!workerData) return;

      const payroll = calculatePayroll(workerData);

      const name = workerData.name || workerData.full_name || "-";
      const loginId = workerData.loginId || workerData.login_id || "-";
      const workerId = workerData.rinl_id || workerData.rinlId || workerData.workerId || workerData.worker_id || "-";
      const jobCode = workerData.jobCode || workerData.job_code || "-";
      const dob = workerData.dob || workerData.date_of_birth || "-";
      const skillCode = (workerData.skill || workerData.skill_code || "").toUpperCase();
      const shiftHours = workerData.shiftHours ?? workerData.shift_hours ?? 0;
      const presentDays = workerData.presentDays ?? workerData.present_days ?? 0;
      const absentDays = workerData.absentDays ?? workerData.absent_days ?? 0;
      const weeklyOff = workerData.weeklyOff ?? workerData.weekly_off ?? 0;
      const holidays = workerData.holidays ?? 0;
      const wagePerDay = workerData.wagePerDay ?? workerData.wage_per_day ?? 0;
      const leaveStatus = workerData.leaveStatus || workerData.leave_status || "Not Applied";
      const leaveApprovalStatus = workerData.leaveApprovalStatus || workerData.leave_approval_status || "Pending";
      const appliedTo = workerData.appliedTo || workerData.applied_to || "-";
      const notification = workerData.notification || "No notifications";
      const leaveUsed = Number(workerData.leaveUsed ?? workerData.leave_used ?? 0);
      const leavePendingCount = Number(workerData.leavePendingCount ?? workerData.leave_pending_count ?? 0);
      const leaveBalance = Number(workerData.leaveBalance ?? workerData.leave_balance ?? 0);

      const avatarInitials = document.getElementById("avatarInitials");
      const sidebarName = document.getElementById("sidebarName");
      const sidebarSkill = document.getElementById("sidebarSkill");
      if (avatarInitials) {
        avatarInitials.textContent = name
          .split(" ")
          .map(word => word[0])
          .join("")
          .slice(0, 2)
          .toUpperCase() || "--";
      }
      if (sidebarName) sidebarName.textContent = name;
      if (sidebarSkill) sidebarSkill.textContent = getSkillLabel(skillCode);

      document.getElementById("loginId").textContent = loginId;
      document.getElementById("workerId").textContent = workerId;
      document.getElementById("jobCode").textContent = jobCode;
      document.getElementById("workerName").textContent = name;
      document.getElementById("workerDob").textContent = dob;
      document.getElementById("workerSkill").textContent = getSkillLabel(skillCode);
      document.getElementById("workerShift").textContent = `${shiftHours} hrs`;

      document.getElementById("presentDays").textContent = presentDays;
      document.getElementById("absentDays").textContent = absentDays;
      document.getElementById("weeklyOff").textContent = weeklyOff;
      document.getElementById("holidays").textContent = holidays;

      document.getElementById("dailyWage").textContent = formatMoney(wagePerDay);
      document.getElementById("grossWage").textContent = formatMoney(payroll.gross);
      document.getElementById("pfAmount").textContent = formatMoney(payroll.pf);
      document.getElementById("insuranceAmount").textContent = formatMoney(payroll.insurance);
      document.getElementById("netWage").textContent = formatMoney(payroll.net);

      document.getElementById("leaveStatusText").textContent = leaveStatus;
      document.getElementById("approvalStatusText").textContent = leaveApprovalStatus;
      document.getElementById("appliedToText").textContent = appliedTo;
      document.getElementById("notificationText").textContent = notification;

      document.getElementById("leavePageStatus").textContent = leaveStatus;
      document.getElementById("leavePageApproval").textContent = leaveApprovalStatus;
      document.getElementById("leavePageAppliedTo").textContent = appliedTo;
      document.getElementById("leavePageNotification").textContent = notification;
      document.getElementById("leaveUsed").textContent = leaveUsed;
      document.getElementById("leavePendingCount").textContent = leavePendingCount;
      document.getElementById("leaveBalance").textContent = leaveBalance;

      document.getElementById("daysWorkedCard").textContent = `Days Worked: ${presentDays}`;
      document.getElementById("netWageCard").textContent = `Net Wage: â‚¹${formatMoney(payroll.net)}`;
      document.getElementById("grossWageCard").textContent = `Gross Wage: â‚¹${formatMoney(payroll.gross)}`;
      document.getElementById("shiftHoursCard").textContent = `Shift: ${shiftHours} hrs`;

      document.getElementById("tableSkill").textContent = getSkillLabel(skillCode);
      document.getElementById("tableAttendance").textContent = `${presentDays} Present / ${absentDays} Absent`;
      document.getElementById("tableWage").textContent = `â‚¹${formatMoney(payroll.net)}`;
      document.getElementById("tableLeave").textContent = leaveStatus;

      document.getElementById("attPresent").textContent = presentDays;
      document.getElementById("attAbsent").textContent = absentDays;
      document.getElementById("attWeeklyOff").textContent = weeklyOff;
      document.getElementById("attHolidays").textContent = holidays;

      const leaveStatusWrap = document.getElementById("tableLeaveStatusWrap");
      const approval = String(leaveApprovalStatus).toLowerCase();

      if (approval === "approved") {
        leaveStatusWrap.innerHTML = '<span class="status approved">Approved</span>';
      } else if (approval === "rejected") {
        leaveStatusWrap.innerHTML = '<span class="status rejected">Rejected</span>';
      } else {
        leaveStatusWrap.innerHTML = '<span class="status pending">Pending</span>';
      }

      document.getElementById("leaveNote").textContent = notification || "No new leave updates.";

      updateProgressBars(payroll, workerData);
      populateWageSheet(workerData, payroll);
      renderAttendanceChart(document.querySelector('input[name="chartType"]:checked')?.value || "bar");
    }

    async function fetchWorkerDashboard(silent = false) {
      try {
        const previousApproval = workerData?.leaveApprovalStatus || workerData?.leave_approval_status;
        const response = await fetch(`${WORKER_API_BASE}/api/worker/me`, {
          method: "GET",
          credentials: "include",
          headers: sessionHeaders()
        });

        if (response.status === 401) {
          if (!silent) {
            showToast("Session expired. Please login again.");
            setTimeout(() => {
              window.location.href = "index.html";
            }, 1200);
          }
          return;
        }

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "Failed to fetch worker data");
        }

        if (!data || Object.keys(data).length === 0) {
          showToast("No worker data found");
          return;
        }

        workerData = data;
        applyLocalLeaveToWorkerData();
        renderWorkerData();
        if (silent && previousApproval && previousApproval !== workerData.leaveApprovalStatus && workerData.leaveApprovalStatus !== "Pending") {
          showToast(workerData.leaveStatus || `Leave ${workerData.leaveApprovalStatus}`);
        }
      } catch (error) {
        console.error(error);
        if (!silent) showToast("Unable to load worker data");
      }
    }

    async function submitLeave() {
      const from = document.getElementById("leaveFrom").value;
      const to = document.getElementById("leaveTo").value;
      const reason = document.getElementById("leaveReason").value.trim();
      const applyTo = document.getElementById("leaveToWhom").value;

      if (!from || !to || !reason) {
        showToast("Please fill all leave details");
        return;
      }

      if (to < from) {
        showToast("To date cannot be before from date");
        return;
      }

      try {
        const response = await fetch(`${WORKER_API_BASE}/api/worker/leave`, {
          method: "POST",
          credentials: "include",
          headers: sessionHeaders(),
          body: JSON.stringify({
            fromDate: from,
            toDate: to,
            reason,
            applyTo
          })
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.message || "Leave request failed");
        }

        closeLeaveModal();
        document.getElementById("leaveFrom").value = "";
        document.getElementById("leaveTo").value = "";
        document.getElementById("leaveReason").value = "";

        showToast("Leave request submitted");
        await fetchWorkerDashboard();
      } catch (error) {
        console.error(error);
        if (error instanceof TypeError) {
          const leave = saveLocalLeaveRequest(from, to, reason, applyTo);
          workerData = {
            ...(workerData || {}),
            workerId: leave.workerId,
            name: leave.workerName,
            leaveStatus: leave.status,
            leaveApprovalStatus: leave.approval,
            appliedTo: leave.applyTo,
            notification: leave.notification,
            leaveUsed: 0,
            leavePendingCount: 1,
            leaveBalance: 12
          };
          closeLeaveModal();
          document.getElementById("leaveFrom").value = "";
          document.getElementById("leaveTo").value = "";
          document.getElementById("leaveReason").value = "";
          renderWorkerData();
          showToast("Backend offline. Leave saved for supervisor review locally.");
          return;
        }
        showToast(error.message || "Failed to submit leave");
      }
    }

    function switchPage(pageKey) {
      const pages = document.querySelectorAll(".page");
      const navLinks = document.querySelectorAll(".nav-link");

      pages.forEach(page => page.classList.remove("active"));
      navLinks.forEach(link => link.classList.remove("active"));

      const activePage = document.getElementById(`page-${pageKey}`) || document.getElementById("page-dashboard");
      activePage.classList.add("active");

      document.querySelector(`.nav-link[data-page="${pageKey}"]`)?.classList.add("active");

      const headings = {
        dashboard: {
          title: "My Dashboard",
          sub: "Your attendance, wage slip, and leave updates for this month."
        },
        attendance: {
          title: "My Attendance",
          sub: "View attendance records in different graph types."
        },
        wageslip: {
          title: "My Wage Slip",
          sub: "Generate, open, and print your wage sheet."
        },
        leave: {
          title: "My Leave",
          sub: "Apply for leave and track approval updates."
        }
      };

      const meta = headings[pageKey] || headings.dashboard;
      document.getElementById("pageHeading").textContent = meta.title;
      document.getElementById("pageSubheading").textContent = meta.sub;
    }

    function initRouting() {
      function applyRoute() {
        const hash = window.location.hash.replace("#", "") || "dashboard";
        switchPage(hash);
      }

      window.addEventListener("hashchange", applyRoute);
      applyRoute();
    }

    function setupActions() {
      document.getElementById("applyLeaveBtn").addEventListener("click", openLeaveModal);
      document.getElementById("openLeaveBtn").addEventListener("click", () => {
        window.location.hash = "leave";
        openLeaveModal();
      });
      document.getElementById("cancelLeaveBtn").addEventListener("click", closeLeaveModal);
      document.getElementById("submitLeaveBtn").addEventListener("click", submitLeave);

      document.getElementById("goAttendanceBtn").addEventListener("click", () => {
        window.location.hash = "attendance";
      });

      document.getElementById("goWageSlipBtn").addEventListener("click", () => {
        window.location.hash = "wageslip";
      });

      document.getElementById("toggleSheetBtn").addEventListener("click", () => {
        const panel = document.getElementById("sheetPanel");
        panel.classList.toggle("active");
        document.getElementById("toggleSheetBtn").textContent = panel.classList.contains("active")
          ? "Hide Wage Sheet"
          : "Open Wage Sheet";
      });

      document.getElementById("printWageSheetBtn").addEventListener("click", () => {
        const panel = document.getElementById("sheetPanel");
        if (!panel.classList.contains("active")) {
          panel.classList.add("active");
        }
        window.print();
      });

      document.getElementById("printQuickBtn").addEventListener("click", () => {
        window.location.hash = "wageslip";
        const panel = document.getElementById("sheetPanel");
        panel.classList.add("active");
        setTimeout(() => window.print(), 150);
      });

      document.querySelectorAll('input[name="chartType"]').forEach(radio => {
        radio.addEventListener("change", (e) => {
          renderAttendanceChart(e.target.value);
        });
      });

      document.getElementById("logoutBtn").addEventListener("click", async () => {
        try {
          await fetch(`${WORKER_API_BASE}/api/logout`, {
            method: "POST",
            credentials: "include"
          });
        } catch (error) {
          console.error(error);
        } finally {
          window.location.href = "index.html";
        }
      });

      document.getElementById("recordSearch").addEventListener("input", (e) => {
        const q = e.target.value.toLowerCase().trim();
        const rows = document.querySelectorAll(".worker-table tbody tr");

        rows.forEach(row => {
          const text = row.textContent.toLowerCase();
          row.style.display = text.includes(q) ? "" : "none";
        });
      });

      window.addEventListener("click", (e) => {
        if (e.target.id === "leaveModal") closeLeaveModal();
      });

      window.addEventListener("storage", (event) => {
        if (event.key === LOCAL_LEAVE_KEY) syncLocalLeaveDecision(true);
      });

      window.addEventListener("focus", () => syncLocalLeaveDecision(true));
      setInterval(() => syncLocalLeaveDecision(false), 3000);
      setInterval(() => fetchWorkerDashboard(true), 10000);
    }

    setupActions();
    initRouting();
    fetchWorkerDashboard();
