const loginPanel = document.querySelector('#login-panel');
const dashboard = document.querySelector('#dashboard');
const loginForm = document.querySelector('#login-form');
const loginMessage = document.querySelector('#login-message');
const adminList = document.querySelector('#admin-list');
const stats = document.querySelector('#stats');
const statusFilter = document.querySelector('#status-filter');
const passwordForm = document.querySelector('#password-form');
const passwordMessage = document.querySelector('#password-message');
let listings = [];

async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function showDashboard() { loginPanel.hidden = true; dashboard.hidden = false; loadListings(); }
async function loadListings() { try { const data = await request('/api/admin/donations'); listings = data.donations; render(); } catch (error) { if (error.message === 'Unauthorized') { loginPanel.hidden = false; dashboard.hidden = true; } } }
function render() {
  const filtered = statusFilter.value === 'all' ? listings : listings.filter((item) => item.status === statusFilter.value);
  const totals = listings.reduce((result, item) => { result[item.status] = (result[item.status] || 0) + 1; return result; }, {});
  stats.innerHTML = `<div class="stat"><strong>${listings.length}</strong><span>Total listings</span></div><div class="stat"><strong>${totals.pending || 0}</strong><span>Awaiting review</span></div><div class="stat"><strong>${totals.approved || 0}</strong><span>Live donations</span></div>`;
  adminList.innerHTML = filtered.length ? filtered.map((item) => `<article class="admin-card"><div><span class="status ${item.status}">${item.status}</span><h3>${escapeHtml(item.itemName)}</h3><p>${escapeHtml(item.description)}</p><p><strong>${escapeHtml(item.city)}</strong> · ${escapeHtml(item.whatsapp)}</p></div><div class="admin-actions">${item.status !== 'approved' ? `<button data-action="approve" data-id="${item.id}">Approve</button>` : ''}${item.status !== 'rejected' ? `<button class="reject" data-action="reject" data-id="${item.id}">Reject</button>` : ''}<button class="delete" data-action="delete" data-id="${item.id}">Delete</button></div></article>`).join('') : '<p class="muted">No listings in this view.</p>';
}
function escapeHtml(value) { const element = document.createElement('div'); element.textContent = value; return element.innerHTML; }
loginForm.addEventListener('submit', async (event) => { event.preventDefault(); loginMessage.textContent = ''; try { await request('/api/admin/login', { method: 'POST', body: JSON.stringify({ password: document.querySelector('#password').value }) }); loginForm.reset(); showDashboard(); } catch (error) { loginMessage.textContent = error.message; } });
statusFilter.addEventListener('change', render);
document.querySelector('#password-toggle').addEventListener('click', () => { passwordForm.hidden = !passwordForm.hidden; passwordMessage.textContent = ''; });
document.querySelector('#password-cancel').addEventListener('click', () => { passwordForm.reset(); passwordForm.hidden = true; passwordMessage.textContent = ''; });
passwordForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const newPassword = document.querySelector('#new-password').value;
  if (newPassword !== document.querySelector('#confirm-password').value) { passwordMessage.textContent = 'New passwords do not match.'; return; }
  try {
    await request('/api/admin/change-password', { method: 'POST', body: JSON.stringify({ currentPassword: document.querySelector('#current-password').value, newPassword }) });
    passwordForm.reset(); passwordForm.hidden = true; window.alert('Admin password updated successfully.');
  } catch (error) { passwordMessage.textContent = error.message; }
});
adminList.addEventListener('click', async (event) => { const button = event.target.closest('[data-action]'); if (!button) return; const action = button.dataset.action; if (action === 'delete' && !window.confirm('Delete this listing permanently?')) return; try { await request(`/api/admin/donations/${button.dataset.id}/${action}`, { method: 'POST' }); await loadListings(); } catch (error) { window.alert(error.message); } });
document.querySelector('#logout-button').addEventListener('click', async () => { await request('/api/admin/logout', { method: 'POST' }); loginPanel.hidden = false; dashboard.hidden = true; });
request('/api/admin/session').then(showDashboard).catch(() => {});
