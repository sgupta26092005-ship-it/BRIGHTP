// Lightweight auth/navigation handler for index.html
// Shows/hides the selection, login and dashboard sections.
document.addEventListener('DOMContentLoaded', () => {
  const ownerBtn = document.getElementById('ownerBtn');
  const employeeBtn = document.getElementById('employeeBtn');
  const selectionScreen = document.getElementById('selectionScreen');
  const loginScreen = document.getElementById('loginScreen');
  const dashboard = document.getElementById('dashboard');
  const loginBtn = document.getElementById('loginBtn');
  const loginEmail = document.getElementById('loginEmail');
  const loginPassword = document.getElementById('loginPassword');
  const loginError = document.getElementById('loginError');

  function safeHide(el) { if (el) el.style.display = 'none'; }
  function safeShowFlex(el) { if (el) el.style.display = 'flex'; }
  function safeShowBlock(el) { if (el) el.style.display = 'block'; }

  // Owner button: show login screen
  if (ownerBtn) {
    ownerBtn.addEventListener('click', (e) => {
      e.preventDefault();
      safeHide(selectionScreen);
      safeShowFlex(loginScreen);
      safeHide(dashboard);
    });
  }

  // Employee button: go straight to dashboard (no login for now)
  if (employeeBtn) {
    employeeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      safeHide(selectionScreen);
      safeHide(loginScreen);
      safeShowBlock(dashboard);
    });
  }

  // Login button: basic validation and navigate to dashboard
  if (loginBtn) {
    loginBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (!loginEmail || !loginPassword) return;
      const email = loginEmail.value.trim();
      const pass = loginPassword.value;
      if (!email || !pass) {
        if (loginError) loginError.textContent = 'Please enter email and password.';
        return;
      }
      // NOTE: This is a placeholder auth flow. Replace with real auth as needed.
      if (loginError) loginError.textContent = '';
      safeHide(loginScreen);
      safeShowBlock(dashboard);
    });
  }
});
