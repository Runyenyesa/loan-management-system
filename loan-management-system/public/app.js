const state = {
  token: localStorage.getItem('loanAppToken') || '',
  username: localStorage.getItem('loanAppUser') || '',
  clients: [],
  loans: []
};

const els = {
  loginView: document.getElementById('loginView'),
  appView: document.getElementById('appView'),
  loginForm: document.getElementById('loginForm'),
  registerForm: document.getElementById('registerForm'),
  forgotForm: document.getElementById('forgotForm'),
  resetForm: document.getElementById('resetForm'),
  loginError: document.getElementById('loginError'),
  authInfo: document.getElementById('authInfo'),
  authTitle: document.getElementById('authTitle'),
  authSubtitle: document.getElementById('authSubtitle'),
  welcomeUser: document.getElementById('welcomeUser'),
  logoutBtn: document.getElementById('logoutBtn'),
  toast: document.getElementById('toast')
};

function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  return fetch(path, { ...options, headers }).then(async (res) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  });
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.remove('hidden');
  setTimeout(() => els.toast.classList.add('hidden'), 2200);
}

function currency(value) {
  return Number(value || 0).toLocaleString();
}

function setTodayDefaults() {
  const today = new Date().toISOString().slice(0, 10);
  ['loanDateIssued', 'loanDueDate', 'repaymentDate', 'collateralDate'].forEach((id) => {
    const el = document.getElementById(id);
    if (el && !el.value) el.value = today;
  });
}

function renderTabs() {
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab).classList.add('active');
    });
  });
}

function populateClientSelects() {
  const options = ['<option value="">Select client</option>']
    .concat(state.clients.map(c => `<option value="${c.id}">${c.full_name} (${c.phone})</option>`))
    .join('');
  document.getElementById('loanClient').innerHTML = options;
  document.getElementById('collateralClient').innerHTML = options;
}

function populateLoanSelect() {
  const options = ['<option value="">Select loan</option>']
    .concat(state.loans.map(l => `<option value="${l.id}">#${l.id} - ${l.full_name} | Balance: ${currency(l.balance)}</option>`))
    .join('');
  document.getElementById('repaymentLoan').innerHTML = options;
}

async function loadDashboard() {
  const data = await api('/api/dashboard/summary');
  document.getElementById('totalClients').textContent = data.totalClients;
  document.getElementById('activeLoans').textContent = data.activeLoans;
  document.getElementById('overdueLoans').textContent = data.overdueLoans;
  document.getElementById('paidLoans').textContent = data.paidLoans;
  document.getElementById('totalOutstanding').textContent = currency(data.totalOutstanding);
  document.getElementById('repaymentsToday').textContent = currency(data.repaymentsToday);
}

async function loadClients() {
  state.clients = await api('/api/clients');
  document.getElementById('clientsTable').innerHTML = state.clients.map(c => `
    <tr>
      <td>${c.full_name}</td>
      <td>${c.phone}</td>
      <td>${c.address || '-'}</td>
    </tr>
  `).join('');
  populateClientSelects();
}

async function loadLoans() {
  state.loans = await api('/api/loans');
  document.getElementById('loansTable').innerHTML = state.loans.map(l => `
    <tr>
      <td>${l.full_name}</td>
      <td>${currency(l.principal)}</td>
      <td>${currency(l.total_amount)}</td>
      <td>${currency(l.balance)}</td>
      <td><span class="status ${l.status}">${l.status}</span></td>
      <td>${l.due_date}</td>
    </tr>
  `).join('');
  populateLoanSelect();
}

async function loadRepayments() {
  const repayments = await api('/api/repayments');
  document.getElementById('repaymentsTable').innerHTML = repayments.map(r => `
    <tr>
      <td>${r.full_name}</td>
      <td>#${r.loan_id}</td>
      <td>${currency(r.amount_paid)}</td>
      <td>${r.payment_method}</td>
      <td>${r.payment_date}</td>
    </tr>
  `).join('');
}

async function loadCollateral() {
  const items = await api('/api/collateral');
  document.getElementById('collateralTable').innerHTML = items.map(i => `
    <tr>
      <td>${i.full_name}</td>
      <td>${i.item_name}</td>
      <td>${currency(i.estimated_value)}</td>
      <td>${i.status}</td>
    </tr>
  `).join('');
}

async function loadCompany() {
  const company = await api('/api/company');
  if (!company) return;
  document.getElementById('companyName').value = company.business_name || '';
  document.getElementById('companyPhone').value = company.phone || '';
  document.getElementById('companyEmail').value = company.email || '';
  document.getElementById('companyLocation').value = company.location || '';
  document.getElementById('companyDescription').value = company.description || '';
  document.getElementById('companyTerms').value = company.repayment_terms || '';
  document.getElementById('companyInstructions').value = company.payment_instructions || '';
}

async function loadAll() {
  await Promise.all([loadDashboard(), loadClients(), loadLoans(), loadRepayments(), loadCollateral(), loadCompany()]);
}

function setAuthMessage(message = '', isError = false) {
  els.loginError.textContent = isError ? message : '';
  els.authInfo.textContent = isError ? '' : message;
  els.authInfo.classList.toggle('show', Boolean(message && !isError));
}

function showAuthMode(mode) {
  document.querySelectorAll('.auth-mode').forEach(panel => {
    panel.classList.toggle('active', panel.dataset.authPanel === mode);
  });
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.auth === mode);
  });
  const titles = {
    login: ['Sign in securely', 'Use your email and password to access the lender dashboard.'],
    register: ['Create lender account', 'Register with email and password before using the system.'],
    forgot: ['Recover password', 'Enter your account email to generate a reset code.'],
    reset: ['Set a new password', 'Use the reset code to create a new password.']
  };
  els.authTitle.textContent = titles[mode]?.[0] || titles.login[0];
  els.authSubtitle.textContent = titles[mode]?.[1] || titles.login[1];
  setAuthMessage('');
}

function saveSession(data) {
  state.token = data.token;
  state.username = data.username || data.user?.username || 'User';
  localStorage.setItem('loanAppToken', state.token);
  localStorage.setItem('loanAppUser', state.username);
}

async function finishAuth(data, message = 'Login successful') {
  saveSession(data);
  showApp();
  await loadAll();
  showToast(message);
}

async function handleGoogleCredential(response) {
  try {
    const data = await api('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify({ credential: response.credential })
    });
    await finishAuth(data, 'Google sign-in successful');
  } catch (error) {
    setAuthMessage(error.message, true);
  }
}

async function initGoogleAuth() {
  try {
    const config = await api('/api/config');
    const buttons = [document.getElementById('googleLoginBtn'), document.getElementById('googleRegisterBtn')];
    if (!config.googleClientId) {
      buttons.forEach(btn => btn?.addEventListener('click', () => {
        setAuthMessage('Google sign-in needs GOOGLE_CLIENT_ID on your hosting settings. Email/password already works now.', true);
      }));
      return;
    }
    const waitForGoogle = setInterval(() => {
      if (!window.google?.accounts?.id) return;
      clearInterval(waitForGoogle);
      window.google.accounts.id.initialize({ client_id: config.googleClientId, callback: handleGoogleCredential });
      buttons.forEach(btn => btn?.addEventListener('click', () => window.google.accounts.id.prompt()));
    }, 300);
  } catch {
    // ignore config loading errors
  }
}

function bindForms() {
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => showAuthMode(tab.dataset.auth));
  });

  document.getElementById('showForgotBtn').addEventListener('click', () => showAuthMode('forgot'));
  document.getElementById('backToLoginBtn').addEventListener('click', () => showAuthMode('login'));
  document.getElementById('resetBackBtn').addEventListener('click', () => showAuthMode('login'));

  els.loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    setAuthMessage('');
    try {
      const username = document.getElementById('username').value.trim();
      const password = document.getElementById('password').value;
      const data = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });
      await finishAuth(data, 'Login successful');
    } catch (error) {
      setAuthMessage(error.message, true);
    }
  });

  els.registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    setAuthMessage('');
    try {
      const data = await api('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          full_name: document.getElementById('registerName').value,
          email: document.getElementById('registerEmail').value,
          password: document.getElementById('registerPassword').value
        })
      });
      await finishAuth(data, 'Account created successfully');
    } catch (error) {
      setAuthMessage(error.message, true);
    }
  });

  els.forgotForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    setAuthMessage('');
    try {
      const email = document.getElementById('forgotEmail').value;
      const data = await api('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email })
      });
      document.getElementById('resetEmail').value = email;
      if (data.resetCode) document.getElementById('resetCode').value = data.resetCode;
      showAuthMode('reset');
      setAuthMessage('Demo reset code generated. In a real hosted version, this code should be emailed. Code: ' + data.resetCode);
    } catch (error) {
      setAuthMessage(error.message, true);
    }
  });

  els.resetForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    setAuthMessage('');
    try {
      await api('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({
          email: document.getElementById('resetEmail').value,
          code: document.getElementById('resetCode').value,
          new_password: document.getElementById('resetPassword').value
        })
      });
      showAuthMode('login');
      setAuthMessage('Password reset successfully. You can now log in.');
    } catch (error) {
      setAuthMessage(error.message, true);
    }
  });

  document.getElementById('clientForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await api('/api/clients', {
      method: 'POST',
      body: JSON.stringify({
        full_name: document.getElementById('clientName').value,
        phone: document.getElementById('clientPhone').value,
        address: document.getElementById('clientAddress').value
      })
    });
    e.target.reset();
    await loadClients();
    await loadDashboard();
    showToast('Client saved');
  });

  document.getElementById('loanForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await api('/api/loans', {
      method: 'POST',
      body: JSON.stringify({
        client_id: document.getElementById('loanClient').value,
        principal: document.getElementById('loanPrincipal').value,
        interest_rate: document.getElementById('loanInterestRate').value,
        repayment_plan: document.getElementById('loanRepaymentPlan').value,
        date_issued: document.getElementById('loanDateIssued').value,
        due_date: document.getElementById('loanDueDate').value,
        notes: document.getElementById('loanNotes').value
      })
    });
    e.target.reset();
    setTodayDefaults();
    await loadLoans();
    await loadDashboard();
    showToast('Loan saved');
  });

  document.getElementById('repaymentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await api('/api/repayments', {
      method: 'POST',
      body: JSON.stringify({
        loan_id: document.getElementById('repaymentLoan').value,
        amount_paid: document.getElementById('repaymentAmount').value,
        payment_method: document.getElementById('repaymentMethod').value,
        payment_date: document.getElementById('repaymentDate').value,
        notes: document.getElementById('repaymentNotes').value
      })
    });
    e.target.reset();
    setTodayDefaults();
    await Promise.all([loadRepayments(), loadLoans(), loadDashboard()]);
    showToast('Repayment recorded');
  });

  document.getElementById('collateralForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await api('/api/collateral', {
      method: 'POST',
      body: JSON.stringify({
        client_id: document.getElementById('collateralClient').value,
        item_name: document.getElementById('collateralItem').value,
        estimated_value: document.getElementById('collateralValue').value,
        condition_notes: document.getElementById('collateralCondition').value,
        received_date: document.getElementById('collateralDate').value,
        status: document.getElementById('collateralStatus').value
      })
    });
    e.target.reset();
    setTodayDefaults();
    await loadCollateral();
    showToast('Collateral saved');
  });

  document.getElementById('companyForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await api('/api/company', {
      method: 'PUT',
      body: JSON.stringify({
        business_name: document.getElementById('companyName').value,
        phone: document.getElementById('companyPhone').value,
        email: document.getElementById('companyEmail').value,
        location: document.getElementById('companyLocation').value,
        description: document.getElementById('companyDescription').value,
        repayment_terms: document.getElementById('companyTerms').value,
        payment_instructions: document.getElementById('companyInstructions').value
      })
    });
    showToast('Company details updated');
  });

  els.logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('loanAppToken');
    localStorage.removeItem('loanAppUser');
    state.token = '';
    state.username = '';
    els.appView.classList.add('hidden');
    els.loginView.classList.remove('hidden');
  });
}

function showApp() {
  els.loginView.classList.add('hidden');
  els.appView.classList.remove('hidden');
  els.welcomeUser.textContent = state.username || 'User';
}

async function init() {
  renderTabs();
  bindForms();
  showAuthMode('login');
  initGoogleAuth();
  setTodayDefaults();

  if (state.token) {
    try {
      showApp();
      await loadAll();
    } catch (error) {
      localStorage.removeItem('loanAppToken');
      localStorage.removeItem('loanAppUser');
      state.token = '';
      state.username = '';
      els.loginView.classList.remove('hidden');
      els.appView.classList.add('hidden');
    }
  }
}

init();
