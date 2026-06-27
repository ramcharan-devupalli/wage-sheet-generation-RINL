const leaveRequests = new Map();

function daysBetween(fromDate, toDate) {
  const from = new Date(fromDate);
  const to = new Date(toDate);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 0;
  return Math.max(1, Math.floor((to - from) / 86400000) + 1);
}

function saveLeaveRequest(worker, details) {
  const request = {
    id: `${worker.worker_id}-${Date.now()}`,
    workerId: worker.worker_id,
    workerName: worker.name || worker.worker_id,
    category: worker.category || "-",
    contractorId: worker.contractor_id || "-",
    fromDate: details.fromDate,
    toDate: details.toDate,
    reason: details.reason,
    applyTo: details.applyTo || "Supervisor",
    status: `Applied from ${details.fromDate} to ${details.toDate}`,
    approval: "Pending",
    notification: "Leave request sent to supervisor and pending review.",
    requestedDays: daysBetween(details.fromDate, details.toDate),
    used: 0,
    submittedAt: new Date().toISOString(),
    reviewedAt: null,
  };

  leaveRequests.set(worker.worker_id, request);
  return request;
}

function getLeaveRequest(workerId) {
  return leaveRequests.get(workerId) || null;
}

function getLeaveRequests() {
  return Array.from(leaveRequests.values()).sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)));
}

function reviewLeaveRequest(workerId, decision) {
  const request = leaveRequests.get(workerId);
  if (!request) return null;

  const approved = decision === "approved";
  const reviewed = {
    ...request,
    status: approved ? "Leave Approved" : "Leave Rejected",
    approval: approved ? "Approved" : "Rejected",
    notification: approved
      ? "Your leave request was approved by supervisor."
      : "Your leave request was rejected by supervisor.",
    used: approved ? request.requestedDays : 0,
    reviewedAt: new Date().toISOString(),
  };

  leaveRequests.set(workerId, reviewed);
  return reviewed;
}

module.exports = {
  getLeaveRequest,
  getLeaveRequests,
  reviewLeaveRequest,
  saveLeaveRequest,
};
