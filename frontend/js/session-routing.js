const ROLE_DESTINATIONS = [
  { page: 'admin.html', match: ['admin', 'hr / admin', 'hr', 'administrator'] },
  { page: 'engineerincharge.html', match: ['engineer incharge', 'engineer-incharge', 'engineer', 'incharge'] },
  { page: 'contractor.html', match: ['contractor', 'contractor representative'] },
  { page: 'workers.html', match: ['worker', 'workers', 'supervisor', 'skilled worker', 'skilled labor', 'semi-skilled worker', 'semi-skilled labor', 'unskilled worker', 'unskilled labor'] }
];

function roleDestination(role) {
  const normalized = String(role || '').trim().toLowerCase();
  return ROLE_DESTINATIONS.find((item) => item.match.includes(normalized))?.page || 'workers.html';
}

function currentSession() {
  try {
    return JSON.parse(localStorage.getItem('rinlSession') || 'null');
  } catch (error) {
    return null;
  }
}

function applySessionToPage(expectedPage) {
  const session = currentSession();
  if (!session) {
    window.location.href = 'index.html';
    return null;
  }

  const destination = roleDestination(session.employee?.role);
  if (expectedPage && destination !== expectedPage) {
    window.location.href = destination;
    return null;
  }

  const name = session.employee?.name || 'User';
  const role = session.employee?.role || '';
  const initials = name.trim().slice(0, 2).toUpperCase() || 'U';

  document.querySelectorAll('[data-session-name], #userNameDisplay').forEach((node) => {
    node.textContent = name;
  });
  document.querySelectorAll('[data-session-role]').forEach((node) => {
    node.textContent = role;
  });
  document.querySelectorAll('[data-session-initials], .user-avatar').forEach((node) => {
    node.textContent = initials;
  });

  return session;
}

async function logoutSession() {
  const session = currentSession();
  try {
    if (session && window.apiRequest) {
      await apiRequest('/logout', {
        method: 'POST',
        body: JSON.stringify({
          sessionId: session.sessionId,
          empId: session.employee?.empId,
          role: session.employee?.role
        })
      });
    }
  } catch (error) {
    // Logout should still clear local state if the server is unavailable.
  }
  localStorage.removeItem('rinlSession');
  localStorage.removeItem('rinlSelectedRole');
  window.location.href = 'index.html';
}

function bindLogoutButtons() {
  document.querySelectorAll('[data-logout]').forEach((button) => {
    button.addEventListener('click', logoutSession);
  });
}
