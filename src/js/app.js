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

  // Check if Roblox was already running before our app started.
  // We invoke (pull) rather than listen (push) so there's no race condition
  // between main sending the event and the renderer registering the listener.
  try {
    const count = await window.api.roblox.checkStartup();
    if (count > 0) showRobloxWarning(count);
  } catch (_) {}
}

function showRobloxWarning(count) {
  // Remove any existing overlay
  document.getElementById('roblox-startup-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'roblox-startup-overlay';
  overlay.style.cssText = `
    position:fixed;inset:0;z-index:9999;
    display:flex;align-items:center;justify-content:center;
    background:rgba(0,0,0,0.75);backdrop-filter:blur(6px);
  `;

  overlay.innerHTML = `
    <div style="
      background:#0a0a0a;border:1px solid rgba(255,255,255,0.14);
      border-radius:16px;padding:32px;max-width:400px;width:90%;
      box-shadow:0 24px 64px rgba(0,0,0,0.8);
    ">
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:20px;">
        <div style="
          width:40px;height:40px;border-radius:10px;flex-shrink:0;
          background:rgba(255,200,0,0.1);border:1px solid rgba(255,200,0,0.25);
          display:flex;align-items:center;justify-content:center;
        ">
          <svg width="20" height="20" fill="none" stroke="#fbbf24" stroke-width="2" viewBox="0 0 24 24">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </div>
        <div>
          <div style="font-size:15px;font-weight:700;color:white;letter-spacing:-0.2px;">Roblox is Already Open</div>
          <div style="font-size:12px;color:rgba(255,255,255,0.4);margin-top:2px;">
            ${count} instance${count !== 1 ? 's' : ''} detected
          </div>
        </div>
      </div>

      <p style="font-size:13px;color:rgba(255,255,255,0.55);line-height:1.65;margin-bottom:24px;">
        Multi-instance requires this app to start <em style="color:rgba(255,255,255,0.75);">before</em> Roblox so it can hold the singleton mutex.
        Close all Roblox windows now, then launch from here.
      </p>

      <div style="display:flex;flex-direction:column;gap:8px;">
        <button id="roblox-warn-close" class="btn-primary" style="width:100%;padding:11px;font-size:13.5px;">
          Close Roblox &amp; Continue
        </button>
        <button id="roblox-warn-quit" class="btn-ghost" style="width:100%;padding:11px;font-size:13px;color:rgba(255,255,255,0.4);">
          Quit App
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  document.getElementById('roblox-warn-close').addEventListener('click', async () => {
    const btn = document.getElementById('roblox-warn-close');
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner" style="width:14px;height:14px;border-width:2px;"></span> Closing Roblox…`;
    try {
      await window.api.roblox.closeAll();
      overlay.remove();
    } catch {
      btn.disabled = false;
      btn.textContent = 'Close Roblox & Continue';
    }
  });

  document.getElementById('roblox-warn-quit').addEventListener('click', () => {
    window.api.window.close();
  });
}

document.addEventListener('DOMContentLoaded', init);
