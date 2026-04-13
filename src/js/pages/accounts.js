import { state }                from '../state.js';
import { refreshBadges }        from '../app.js';
import { showToast }            from '../components/toast.js';
import { showModal, hideModal } from '../components/modal.js';
import { escHtml, avatarFallback, timeAgo, formatDuration } from '../utils.js';

// ── Sort / filter state (persists across rerenders) ───────────────────────────
let sortBy   = 'addedAt'; // 'addedAt' | 'name' | 'lastLaunched' | 'running'
let filterBy = 'all';     // 'all' | 'running' | 'idle'

const LABEL_COLORS = [
  { hex: '#ef4444', name: 'Red'    },
  { hex: '#f97316', name: 'Orange' },
  { hex: '#eab308', name: 'Yellow' },
  { hex: '#22c55e', name: 'Green'  },
  { hex: '#3b82f6', name: 'Blue'   },
  { hex: '#8b5cf6', name: 'Purple' },
  { hex: '#ec4899', name: 'Pink'   },
  { hex: '#94a3b8', name: 'Slate'  },
];

// ── Page class ────────────────────────────────────────────────────────────────

export class AccountsPage {
  render() {
    const { accounts } = state;
    const visible = sortAndFilter(accounts);

    return `
      <div style="max-width:900px;">
        <!-- Header -->
        <div class="flex items-center justify-between mb-5">
          <div>
            <h1 style="font-size:20px;font-weight:700;color:white;letter-spacing:-0.4px;">Accounts</h1>
            <p style="color:rgba(255,255,255,0.3);font-size:12px;margin-top:3px;">
              ${accounts.length} account${accounts.length !== 1 ? 's' : ''}
              ${filterBy !== 'all' ? ` &middot; ${visible.length} shown` : ''}
            </p>
          </div>
          <button class="btn-primary" id="add-account-btn" style="display:flex;align-items:center;gap:6px;">
            <svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add Account
          </button>
        </div>

        ${accounts.length > 0 ? `
          <!-- Sort & Filter bar -->
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px;">
            <div style="display:flex;background:rgba(255,255,255,0.04);border-radius:8px;padding:3px;gap:2px;">
              ${['all','running','idle'].map(f => `
                <button class="filter-tab" data-filter="${f}"
                        style="padding:5px 12px;font-size:12px;border-radius:6px;border:none;cursor:pointer;
                               background:${filterBy===f?'rgba(255,255,255,0.12)':'none'};
                               color:${filterBy===f?'white':'rgba(255,255,255,0.4)'};
                               font-weight:${filterBy===f?'600':'400'};transition:all 0.15s;">
                  ${f.charAt(0).toUpperCase()+f.slice(1)}
                </button>
              `).join('')}
            </div>
            <select id="sort-select"
                    style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);
                           border-radius:8px;color:rgba(255,255,255,0.55);font-size:12px;
                           padding:6px 10px;cursor:pointer;outline:none;">
              <option value="addedAt"      ${sortBy==='addedAt'     ?'selected':''}>Sort: Added</option>
              <option value="name"         ${sortBy==='name'        ?'selected':''}>Sort: Name</option>
              <option value="lastLaunched" ${sortBy==='lastLaunched'?'selected':''}>Sort: Last Launched</option>
              <option value="running"      ${sortBy==='running'     ?'selected':''}>Sort: Running First</option>
            </select>
          </div>

          <div id="accounts-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;">
            ${visible.length > 0 ? visible.map(acc => accountCard(acc)).join('') : `
              <div style="grid-column:1/-1;text-align:center;padding:60px 0;color:rgba(255,255,255,0.2);font-size:13px;">
                No ${filterBy} accounts
              </div>
            `}
          </div>
        ` : emptyState()}
      </div>
    `;
  }

  init() {
    document.getElementById('add-account-btn')?.addEventListener('click', openAddModal);
    document.getElementById('add-account-btn-empty')?.addEventListener('click', openAddModal);
    document.getElementById('sort-select')?.addEventListener('change', (e) => {
      sortBy = e.target.value;
      rerenderGrid();
    });
    document.querySelectorAll('.filter-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        filterBy = btn.dataset.filter;
        rerenderGrid();
      });
    });
    bindCardButtons();

    // Tick session timers every second; cleaned up when navigating away
    const timerInterval = setInterval(() => {
      document.querySelectorAll('.session-timer').forEach(el => {
        if (el.dataset.start) el.textContent = formatDuration(el.dataset.start);
      });
    }, 1000);
    return () => clearInterval(timerInterval);
  }
}

// ── Sort & Filter ─────────────────────────────────────────────────────────────

function sortAndFilter(accounts) {
  let list = [...accounts];

  if (filterBy === 'running') {
    list = list.filter(a => state.instances.some(i => i.accountId === a.id));
  } else if (filterBy === 'idle') {
    list = list.filter(a => !state.instances.some(i => i.accountId === a.id));
  }

  if (sortBy === 'name') {
    list.sort((a, b) =>
      (a.displayName || a.username).localeCompare(b.displayName || b.username));
  } else if (sortBy === 'lastLaunched') {
    list.sort((a, b) => {
      if (!a.lastLaunchedAt && !b.lastLaunchedAt) return 0;
      if (!a.lastLaunchedAt) return 1;
      if (!b.lastLaunchedAt) return -1;
      return new Date(b.lastLaunchedAt) - new Date(a.lastLaunchedAt);
    });
  } else if (sortBy === 'running') {
    list.sort((a, b) => {
      const ar = state.instances.some(i => i.accountId === a.id) ? 0 : 1;
      const br = state.instances.some(i => i.accountId === b.id) ? 0 : 1;
      return ar - br;
    });
  } else {
    // Default: newest added first
    list.sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt));
  }

  return list;
}

// ── Account Card ──────────────────────────────────────────────────────────────

function accountCard(acc) {
  const runningInst  = state.instances.find(i => i.accountId === acc.id);
  const isRunning    = !!runningInst;
  const labelColor   = acc.labelColor || '';
  const labelText    = acc.label || '';
  const launchCount  = acc.launchCount || 0;
  const tokenStatus  = acc.tokenStatus; // 'valid' | 'expired' | 'unknown' | undefined

  // Colored top border accent when a label color is set
  const headerBorderTop = labelColor
    ? `border-top:2px solid ${escHtml(labelColor)};`
    : '';

  // Token health badge
  const healthBadge = tokenStatus === 'valid'
    ? `<span style="font-size:10px;color:#4ade80;display:inline-flex;align-items:center;gap:3px;">
         <span style="width:5px;height:5px;border-radius:50%;background:currentColor;display:inline-block;"></span>Valid
       </span>`
    : tokenStatus === 'expired'
    ? `<span style="font-size:10px;color:#ef4444;display:inline-flex;align-items:center;gap:3px;">
         <span style="width:5px;height:5px;border-radius:50%;background:currentColor;display:inline-block;"></span>Expired
       </span>`
    : tokenStatus === 'unknown'
    ? `<span style="font-size:10px;color:rgba(255,255,255,0.25);display:inline-flex;align-items:center;gap:3px;">
         <span style="width:5px;height:5px;border-radius:50%;background:currentColor;display:inline-block;"></span>Unknown
       </span>`
    : '';

  // Launch history line
  const historyLine = launchCount > 0
    ? `<div style="font-size:10.5px;color:rgba(255,255,255,0.22);margin-top:5px;">
         ↻ ${launchCount} launch${launchCount !== 1 ? 'es' : ''} &middot; last ${timeAgo(acc.lastLaunchedAt)}
       </div>`
    : '';

  return `
    <div class="card" style="padding:0;overflow:hidden;">
      <!-- Header strip -->
      <div style="height:50px;background:rgba(255,255,255,0.03);border-bottom:1px solid rgba(255,255,255,0.07);position:relative;${headerBorderTop}">
        <div style="position:absolute;bottom:-19px;left:14px;">
          <div style="position:relative;display:inline-block;">
            <img id="avatar-img-${acc.id}"
                 src="${escHtml(acc.avatarUrl || '')}"
                 style="width:40px;height:40px;border-radius:50%;border:1.5px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.06);display:block;"
                 onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
            <div style="display:none;width:40px;height:40px;border-radius:50%;border:1.5px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.06);align-items:center;justify-content:center;">
              <svg width="20" height="20" viewBox="0 0 40 40" fill="none">
                <circle cx="20" cy="15" r="8" fill="rgba(255,255,255,0.55)"/>
                <path d="M6 36c0-7.732 6.268-14 14-14s14 6.268 14 14" fill="rgba(255,255,255,0.55)"/>
              </svg>
            </div>
            ${isRunning ? `<div style="position:absolute;bottom:1px;right:1px;width:9px;height:9px;border-radius:50%;background:#ffffff;border:2px solid #000000;box-shadow:0 0 5px rgba(255,255,255,0.6);"></div>` : ''}
          </div>
        </div>
        ${labelColor ? `<div style="position:absolute;top:10px;right:12px;width:8px;height:8px;border-radius:50%;background:${escHtml(labelColor)};"></div>` : ''}
      </div>

      <!-- Body -->
      <div style="padding:26px 14px 14px;">
        <div style="margin-bottom:8px;">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
            <div style="font-size:14px;font-weight:700;color:white;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:-0.2px;">
              ${escHtml(acc.displayName || acc.username)}
            </div>
            ${labelText ? `<span style="font-size:10px;font-weight:600;padding:2px 7px;border-radius:20px;background:${labelColor?escHtml(labelColor)+'22':'rgba(255,255,255,0.08)'};color:${labelColor?escHtml(labelColor):'rgba(255,255,255,0.5)'};border:1px solid ${labelColor?escHtml(labelColor)+'44':'rgba(255,255,255,0.12)'};">${escHtml(labelText)}</span>` : ''}
          </div>
          <div style="font-size:11px;color:rgba(255,255,255,0.28);margin-top:2px;font-family:'Geist Mono',monospace;">
            @${escHtml(acc.username)} &middot; ${acc.userId}
          </div>
        </div>

        <!-- Status row -->
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:4px;">
          ${isRunning
            ? `<span class="tag tag-active"><div style="width:5px;height:5px;border-radius:50%;background:currentColor;"></div>Running</span>`
            : `<span class="tag tag-grey">Idle</span>`}
          ${isRunning && runningInst.startTime ? `
            <span style="color:rgba(255,255,255,0.15);font-size:11px;">&middot;</span>
            <span class="session-timer" data-start="${escHtml(runningInst.startTime)}"
                  style="font-size:10.5px;color:rgba(255,255,255,0.45);font-family:'Geist Mono',monospace;">
              ${formatDuration(runningInst.startTime)}
            </span>
          ` : ''}
          ${healthBadge ? `<span style="color:rgba(255,255,255,0.15);font-size:11px;">&middot;</span>${healthBadge}` : ''}
          <span style="color:rgba(255,255,255,0.15);font-size:11px;">&middot;</span>
          <span style="font-size:10.5px;color:rgba(255,255,255,0.18);">Added ${timeAgoShort(acc.addedAt)}</span>
        </div>

        ${historyLine}

        <!-- Actions -->
        <div style="display:flex;gap:6px;margin-top:12px;">
          <!-- Split launch button -->
          <div style="display:flex;flex:1;position:relative;">
            <button class="btn-primary launch-btn" data-id="${acc.id}"
                    style="flex:1;padding:7px 10px;font-size:12.5px;border-radius:8px 0 0 8px;border-right:1px solid rgba(0,0,0,0.25);">
              Launch
            </button>
            <button class="launch-menu-btn btn-primary" data-id="${acc.id}"
                    title="More launch options"
                    style="padding:7px 9px;border-radius:0 8px 8px 0;font-size:9px;flex-shrink:0;">
              ▾
            </button>
            <div class="launch-dropdown" data-id="${acc.id}"
                 style="display:none;position:absolute;bottom:calc(100% + 5px);left:0;right:0;
                        background:#111111;border:1px solid rgba(255,255,255,0.12);
                        border-radius:8px;overflow:hidden;z-index:200;box-shadow:0 8px 24px rgba(0,0,0,0.6);">
              <button class="launch-direct-opt" data-id="${acc.id}"
                      style="width:100%;padding:9px 12px;text-align:left;background:none;border:none;
                             color:white;font-size:12px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.07);"
                      onmouseenter="this.style.background='rgba(255,255,255,0.06)'"
                      onmouseleave="this.style.background='none'">
                Launch (Direct)
              </button>
              <button class="launch-bloxstrap-opt" data-id="${acc.id}"
                      style="width:100%;padding:9px 12px;text-align:left;background:none;border:none;
                             color:rgba(255,255,255,0.55);font-size:12px;cursor:pointer;"
                      onmouseenter="this.style.background='rgba(255,255,255,0.06)'"
                      onmouseleave="this.style.background='none'">
                Launch via Bloxstrap
              </button>
            </div>
          </div>

          <!-- Health check -->
          <button class="btn-ghost health-check-btn" data-id="${acc.id}"
                  title="Check token health"
                  style="width:31px;height:31px;padding:0;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </button>

          <!-- Label edit -->
          <button class="btn-ghost label-edit-btn" data-id="${acc.id}"
                  title="Edit label"
                  style="width:31px;height:31px;padding:0;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
              <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
              <line x1="7" y1="7" x2="7.01" y2="7"/>
            </svg>
          </button>

          <!-- Refresh avatar -->
          <button class="btn-ghost refresh-avatar-btn" data-id="${acc.id}"
                  title="Refresh avatar"
                  style="width:31px;height:31px;padding:0;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
              <polyline points="23 4 23 10 17 10"/>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
          </button>

          <!-- Remove -->
          <button class="btn-danger remove-btn" data-id="${acc.id}" title="Remove account"
                  style="width:31px;height:31px;padding:0;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
              <path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  `;
}

function emptyState() {
  return `
    <div style="text-align:center;padding:80px 0;color:rgba(255,255,255,0.15);">
      <svg width="48" height="48" style="margin:0 auto 16px;opacity:0.2;" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
        <circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/>
        <line x1="16" y1="11" x2="22" y2="11"/><line x1="19" y1="8" x2="19" y2="14"/>
      </svg>
      <p style="font-size:13.5px;margin-bottom:20px;color:rgba(255,255,255,0.25);">No accounts added yet</p>
      <button class="btn-primary" id="add-account-btn-empty">Add Your First Account</button>
    </div>
  `;
}

// ── Add Account Modal ─────────────────────────────────────────────────────────

function openAddModal() {
  showModal(`
    <div class="card" style="padding:28px;border-radius:14px;background:#000000;border:1px solid rgba(255,255,255,0.14);width:420px;max-width:100%;">
      <div class="flex items-center justify-between mb-6">
        <div>
          <h2 style="font-size:15px;font-weight:700;color:white;letter-spacing:-0.2px;">Add Account</h2>
          <p style="font-size:11.5px;color:rgba(255,255,255,0.28);margin-top:3px;">Login with browser or paste a session token</p>
        </div>
        <button id="modal-close" class="btn-ghost" style="padding:5px 10px;font-size:12px;">✕</button>
      </div>

      <!-- Browser login -->
      <button id="browser-login-btn" class="btn-primary"
              style="width:100%;padding:11px;display:flex;align-items:center;justify-content:center;gap:8px;font-size:13px;">
        <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10"/>
          <line x1="2" y1="12" x2="22" y2="12"/>
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
        </svg>
        Login with Browser
      </button>
      <p style="font-size:11px;color:rgba(255,255,255,0.18);margin-top:7px;margin-bottom:20px;text-align:center;line-height:1.5;">
        Opens an isolated mini browser — your existing sessions are never affected.
      </p>

      <!-- Divider -->
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px;">
        <div style="flex:1;height:1px;background:rgba(255,255,255,0.08);"></div>
        <span style="font-size:11px;color:rgba(255,255,255,0.2);letter-spacing:.05em;text-transform:uppercase;">or paste token</span>
        <div style="flex:1;height:1px;background:rgba(255,255,255,0.08);"></div>
      </div>

      <div style="margin-bottom:8px;">
        <label style="font-size:11px;font-weight:600;color:rgba(255,255,255,0.45);display:block;margin-bottom:6px;letter-spacing:.06em;text-transform:uppercase;">
          Session Token
        </label>
        <input id="token-input" class="input-field" type="password"
               placeholder="_|WARNING:-DO-NOT-SHARE-THIS..."
               autocomplete="off" spellcheck="false"
               style="font-family:'Geist Mono',monospace;font-size:12.5px;">
        <p style="font-size:11px;color:rgba(255,255,255,0.20);margin-top:7px;line-height:1.55;">
          Open roblox.com &rarr; DevTools &rarr; Application &rarr; Cookies &rarr; copy
          <code style="background:rgba(255,255,255,0.07);padding:1px 5px;border-radius:4px;">.ROBLOSECURITY</code>.
          Stored encrypted with AES-256-GCM, bound to this machine.
        </p>
      </div>

      <div id="modal-error" style="display:none;font-size:12.5px;color:rgba(255,255,255,0.7);background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:10px 12px;margin-bottom:12px;"></div>

      <button id="add-token-btn" class="btn-ghost" style="width:100%;padding:10px;margin-top:8px;font-size:12.5px;">
        Add via Token
      </button>
    </div>
  `);

  document.getElementById('modal-close')?.addEventListener('click', hideModal);
  document.getElementById('browser-login-btn')?.addEventListener('click', handleBrowserLogin);
  document.getElementById('add-token-btn')?.addEventListener('click', handleTokenAdd);
  document.getElementById('token-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleTokenAdd();
  });
}

async function handleBrowserLogin() {
  const btn = document.getElementById('browser-login-btn');
  if (!btn) return;

  btn.disabled = true;
  btn.innerHTML = `<span class="spinner" style="width:13px;height:13px;border-width:2px;"></span> Waiting for login…`;

  try {
    const token = await window.api.accounts.loginBrowser();
    if (!token) {
      btn.disabled = false;
      btn.innerHTML = browserLoginBtnHtml();
      return;
    }
    await addAccount(token);
  } catch (err) {
    showError(err.message || 'Browser login failed');
    btn.disabled = false;
    btn.innerHTML = browserLoginBtnHtml();
  }
}

function browserLoginBtnHtml() {
  return `
    <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10"/>
      <line x1="2" y1="12" x2="22" y2="12"/>
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
    </svg>
    Login with Browser
  `;
}

async function handleTokenAdd() {
  const input = document.getElementById('token-input');
  const token = input?.value?.trim();
  if (!token) { showError('Please enter a token.'); return; }
  if (token.length < 50) { showError('Token appears too short — please check and try again.'); return; }

  const btn = document.getElementById('add-token-btn');
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner" style="width:14px;height:14px;border-width:2px;"></span>`;

  await addAccount(token);
  btn.disabled = false;
  btn.textContent = 'Add via Token';
}

async function addAccount(token) {
  try {
    const account = await window.api.accounts.add({ token });
    state.accounts.push(account);
    hideModal();
    showToast(`@${account.username} added`, 'success');
    refreshBadges();
    rerenderGrid();
  } catch (err) {
    showError(err.message || 'Failed to add account');
  }
}

function showError(msg) {
  const el = document.getElementById('modal-error');
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
}

// ── Action handlers ───────────────────────────────────────────────────────────

function bindCardButtons() {
  document.querySelectorAll('.launch-btn').forEach(btn =>
    btn.addEventListener('click', () => handleLaunch(btn, false)));
  document.querySelectorAll('.remove-btn').forEach(btn =>
    btn.addEventListener('click', () => handleRemove(btn)));
  document.querySelectorAll('.refresh-avatar-btn').forEach(btn =>
    btn.addEventListener('click', () => handleRefreshAvatar(btn)));
  document.querySelectorAll('.health-check-btn').forEach(btn =>
    btn.addEventListener('click', () => handleHealthCheck(btn)));
  document.querySelectorAll('.label-edit-btn').forEach(btn =>
    btn.addEventListener('click', () => handleEditLabel(btn)));
  bindLaunchDropdowns();
}

function bindLaunchDropdowns() {
  document.querySelectorAll('.launch-menu-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const dropdown = document.querySelector(`.launch-dropdown[data-id="${id}"]`);
      if (!dropdown) return;
      const isOpen = dropdown.style.display !== 'none';
      document.querySelectorAll('.launch-dropdown').forEach(d => { d.style.display = 'none'; });
      dropdown.style.display = isOpen ? 'none' : 'block';
    });
  });

  document.querySelectorAll('.launch-direct-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.launch-dropdown').forEach(d => { d.style.display = 'none'; });
      const launchBtn = document.querySelector(`.launch-btn[data-id="${btn.dataset.id}"]`);
      if (launchBtn) handleLaunch(launchBtn, false);
    });
  });

  document.querySelectorAll('.launch-bloxstrap-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.launch-dropdown').forEach(d => { d.style.display = 'none'; });
      const launchBtn = document.querySelector(`.launch-btn[data-id="${btn.dataset.id}"]`);
      if (launchBtn) handleLaunch(launchBtn, true);
    });
  });

  document.addEventListener('click', () => {
    document.querySelectorAll('.launch-dropdown').forEach(d => { d.style.display = 'none'; });
  }, { capture: true });
}

async function handleLaunch(btn, useBloxstrap = false) {
  const accountId = btn.dataset.id;
  btn.disabled = true;
  const menuBtn = document.querySelector(`.launch-menu-btn[data-id="${accountId}"]`);
  if (menuBtn) menuBtn.disabled = true;
  const orig = btn.textContent;
  btn.innerHTML = `<span class="spinner" style="width:13px;height:13px;border-width:2px;"></span>`;

  try {
    const updatedAcc = await window.api.instances.launch(accountId, useBloxstrap);

    // Sync updated launch history into state
    if (updatedAcc) {
      const idx = state.accounts.findIndex(a => a.id === accountId);
      if (idx !== -1) Object.assign(state.accounts[idx], updatedAcc);
    }

    showToast(useBloxstrap ? 'Launched via Bloxstrap' : 'Roblox launched', 'success');

    // Auto-hide to tray after launch (1.2s so toast is readable)
    setTimeout(() => window.api.window.hide(), 1200);

    btn.textContent = 'Done';
    setTimeout(() => {
      btn.disabled = false;
      if (menuBtn) menuBtn.disabled = false;
      btn.textContent = orig;
      rerenderGrid(); // refresh launch history display
    }, 3000);
  } catch (err) {
    showToast(err.message || 'Launch failed', 'error');
    btn.disabled = false;
    if (menuBtn) menuBtn.disabled = false;
    btn.textContent = orig;
  }
}

async function handleRemove(btn) {
  const accountId = btn.dataset.id;
  const account   = state.accounts.find(a => a.id === accountId);
  if (!account) return;

  if (!confirm(`Remove @${account.username}? This cannot be undone.`)) return;

  try {
    await window.api.accounts.remove(accountId);
    state.accounts = state.accounts.filter(a => a.id !== accountId);
    showToast(`@${account.username} removed`, 'info');
    refreshBadges();
    rerenderGrid();
  } catch (err) {
    showToast(err.message || 'Failed to remove account', 'error');
  }
}

async function handleRefreshAvatar(btn) {
  const accountId = btn.dataset.id;
  btn.disabled = true;
  try {
    const avatarUrl = await window.api.accounts.refreshAvatar(accountId);
    const img = document.getElementById(`avatar-img-${accountId}`);
    if (img && avatarUrl) { img.src = avatarUrl; img.style.display = 'block'; }
    const acc = state.accounts.find(a => a.id === accountId);
    if (acc) acc.avatarUrl = avatarUrl;
    showToast('Avatar refreshed', 'success');
  } catch {
    showToast('Could not refresh avatar', 'error');
  } finally {
    btn.disabled = false;
  }
}

async function handleHealthCheck(btn) {
  const accountId = btn.dataset.id;
  btn.disabled = true;
  const origHtml = btn.innerHTML;
  btn.innerHTML = `<span class="spinner" style="width:10px;height:10px;border-width:1.5px;"></span>`;

  try {
    const status = await window.api.accounts.checkHealth(accountId);
    const acc = state.accounts.find(a => a.id === accountId);
    if (acc) {
      acc.tokenStatus    = status;
      acc.tokenCheckedAt = new Date().toISOString();
    }
    const msg  = { valid: 'Token is valid', expired: 'Token has expired', unknown: 'Could not verify token' }[status] || 'Check complete';
    const type = status === 'valid' ? 'success' : status === 'expired' ? 'error' : 'info';
    showToast(msg, type);
    rerenderGrid();
  } catch (err) {
    showToast(err.message || 'Health check failed', 'error');
    btn.disabled = false;
    btn.innerHTML = origHtml;
  }
}

function handleEditLabel(btn) {
  const accountId = btn.dataset.id;
  const acc = state.accounts.find(a => a.id === accountId);
  if (!acc) return;

  const currentLabel = acc.label || '';
  const currentColor = acc.labelColor || '';

  showModal(`
    <div class="card" style="padding:24px;border-radius:14px;background:#000000;border:1px solid rgba(255,255,255,0.14);width:360px;max-width:100%;">
      <div class="flex items-center justify-between mb-5">
        <h2 style="font-size:14px;font-weight:700;color:white;">Edit Label — @${escHtml(acc.username)}</h2>
        <button id="label-modal-close" class="btn-ghost" style="padding:5px 10px;font-size:12px;">✕</button>
      </div>

      <label style="font-size:11px;font-weight:600;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:.06em;display:block;margin-bottom:6px;">
        Label Text
      </label>
      <input id="label-text-input" class="input-field" type="text" maxlength="20"
             value="${escHtml(currentLabel)}" placeholder="e.g. Main, Alt, Farm…"
             style="margin-bottom:16px;">

      <label style="font-size:11px;font-weight:600;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:.06em;display:block;margin-bottom:8px;">
        Color
      </label>
      <div style="display:flex;gap:7px;flex-wrap:wrap;margin-bottom:20px;">
        <!-- "None" swatch -->
        <button class="color-swatch" data-color=""
                style="width:28px;height:28px;border-radius:6px;border:2px solid ${!currentColor?'white':'rgba(255,255,255,0.2)'};
                       background:rgba(255,255,255,0.08);cursor:pointer;display:flex;align-items:center;justify-content:center;">
          <svg width="12" height="12" stroke="rgba(255,255,255,0.45)" stroke-width="2.5" viewBox="0 0 24 24">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
        ${LABEL_COLORS.map(c => `
          <button class="color-swatch" data-color="${c.hex}" title="${c.name}"
                  style="width:28px;height:28px;border-radius:6px;background:${c.hex};cursor:pointer;
                         border:2px solid ${currentColor===c.hex?'white':'transparent'};
                         transition:border-color 0.1s;box-sizing:border-box;">
          </button>
        `).join('')}
      </div>

      <div style="display:flex;gap:8px;">
        <button id="label-save-btn" class="btn-primary" style="flex:1;padding:10px;">Save</button>
        <button id="label-cancel-btn" class="btn-ghost" style="padding:10px 16px;">Cancel</button>
      </div>
    </div>
  `);

  let selectedColor = currentColor;

  document.querySelectorAll('.color-swatch').forEach(swatch => {
    swatch.addEventListener('click', () => {
      selectedColor = swatch.dataset.color;
      document.querySelectorAll('.color-swatch').forEach(s => {
        s.style.borderColor = s.dataset.color === selectedColor
          ? 'white'
          : s.dataset.color === '' ? 'rgba(255,255,255,0.2)' : 'transparent';
      });
    });
  });

  document.getElementById('label-modal-close')?.addEventListener('click', hideModal);
  document.getElementById('label-cancel-btn')?.addEventListener('click', hideModal);
  document.getElementById('label-save-btn')?.addEventListener('click', async () => {
    const labelText = (document.getElementById('label-text-input')?.value || '').trim().slice(0, 20);
    const saveBtn = document.getElementById('label-save-btn');
    saveBtn.disabled = true;
    saveBtn.innerHTML = `<span class="spinner" style="width:13px;height:13px;border-width:2px;"></span>`;
    try {
      const updated = await window.api.accounts.updateLabel(accountId, labelText, selectedColor);
      const a = state.accounts.find(a => a.id === accountId);
      if (a && updated) {
        a.label      = updated.label;
        a.labelColor = updated.labelColor;
      }
      hideModal();
      showToast('Label updated', 'success');
      rerenderGrid();
    } catch (err) {
      showToast(err.message || 'Failed to update label', 'error');
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save';
    }
  });
}

// ── Grid rerender ─────────────────────────────────────────────────────────────

function rerenderGrid() {
  const grid = document.getElementById('accounts-grid');
  if (grid) {
    const visible = sortAndFilter(state.accounts);
    grid.innerHTML = visible.length > 0
      ? visible.map(acc => accountCard(acc)).join('')
      : `<div style="grid-column:1/-1;text-align:center;padding:60px 0;color:rgba(255,255,255,0.2);font-size:13px;">
           No ${filterBy} accounts
         </div>`;
    bindCardButtons();
  } else {
    const content = document.getElementById('page-content');
    const page = new AccountsPage();
    content.innerHTML = page.render();
    page.init();
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgoShort(iso) {
  if (!iso) return '';
  const diff = Math.floor((Date.now() - new Date(iso)) / 86400000);
  if (diff === 0) return 'today';
  if (diff === 1) return 'yesterday';
  return `${diff}d ago`;
}
