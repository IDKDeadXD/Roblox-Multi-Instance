import { state }       from './state.js';
import { AccountsPage } from './pages/accounts.js';
import { SettingsPage } from './pages/settings.js';

const PAGES = {
  accounts: AccountsPage,
  settings: SettingsPage
};

let currentPage    = null;
let currentCleanup = null;

// ── Navigation ────────────────────────────────────────────────────────────────

export async function navigate(pageName) {
  const PageClass = PAGES[pageName];
  if (!PageClass) return;

  if (currentCleanup) { currentCleanup(); currentCleanup = null; }

  const content = document.getElementById('page-content');
  content.className = 'flex-1 overflow-y-auto p-6 page-enter';

  const page = new PageClass();
  currentPage = page;
  content.innerHTML = page.render();

  if (page.init) {
    const cleanup = page.init();
    if (typeof cleanup === 'function') currentCleanup = cleanup;
  }

  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === pageName);
  });
}

// ── Badges ────────────────────────────────────────────────────────────────────

export function refreshBadges() {
  const ba = document.getElementById('badge-accounts');
  if (ba) {
    ba.textContent = state.accounts.length;
    ba.classList.toggle('hidden', state.accounts.length === 0);
  }
}

// ── Boot ──────────────────────────────────────────────────────────────────────

async function init() {
  // Window controls
  document.getElementById('btn-minimize')?.addEventListener('click', () => window.api.window.minimize());
  document.getElementById('btn-maximize')?.addEventListener('click', () => window.api.window.maximize());
  document.getElementById('btn-close')   ?.addEventListener('click', () => window.api.window.close());

  // Sidebar navigation
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', () => navigate(el.dataset.page));
  });

  // Load initial data in parallel
  try {
    const [accounts, settings] = await Promise.all([
      window.api.accounts.list(),
      window.api.settings.get()
    ]);
    state.accounts = accounts;
    state.settings = settings;
  } catch (err) {
    console.error('Boot error:', err);
  }

  refreshBadges();
  await navigate('accounts');
}

document.addEventListener('DOMContentLoaded', init);
