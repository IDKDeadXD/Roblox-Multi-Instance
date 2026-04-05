import { state }              from '../state.js';
import { refreshBadges }      from '../app.js';
import { showToast }          from '../components/toast.js';
import { showModal, hideModal } from '../components/modal.js';
import { escHtml, avatarFallback } from '../utils.js';

export class AccountsPage {
  render() {
    const { accounts } = state;
    return `
      <div style="max-width:900px;">
        <div class="flex items-center justify-between mb-7">
          <div>
            <h1 style="font-size:20px;font-weight:700;color:white;letter-spacing:-0.4px;">Accounts</h1>
            <p style="color:rgba(255,255,255,0.3);font-size:12px;margin-top:3px;">${accounts.length} account${accounts.length !== 1 ? 's' : ''} saved</p>
          </div>
          <button class="btn-primary" id="add-account-btn" style="display:flex;align-items:center;gap:6px;">
            <svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add Account
          </button>
        </div>

        ${accounts.length === 0 ? emptyState() : `
          <div id="accounts-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;">
            ${accounts.map(acc => accountCard(acc)).join('')}
          </div>
        `}
      </div>
    `;
  }

  init() {
    document.getElementById('add-account-btn')?.addEventListener('click', openAddModal);
    document.getElementById('add-account-btn-empty')?.addEventListener('click', openAddModal);
    document.querySelectorAll('.launch-btn').forEach(btn => btn.addEventListener('click', () => handleLaunch(btn)));
    document.querySelectorAll('.remove-btn').forEach(btn => btn.addEventListener('click', () => handleRemove(btn)));
    document.querySelectorAll('.refresh-avatar-btn').forEach(btn => btn.addEventListener('click', () => handleRefreshAvatar(btn)));
  }
}

// ── Account Card ──────────────────────────────────────────────────────────────

function accountCard(acc) {
  const isRunning = state.instances.some(i => i.accountId === acc.id);

  return `
    <div class="card" style="padding:0;overflow:hidden;">
      <!-- Header strip -->
      <div style="height:50px;background:rgba(255,255,255,0.03);border-bottom:1px solid rgba(255,255,255,0.07);position:relative;">
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
      </div>

      <!-- Body -->
      <div style="padding:26px 14px 14px;">
        <div style="margin-bottom:10px;">
          <div style="font-size:14px;font-weight:700;color:white;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:-0.2px;">
            ${escHtml(acc.displayName || acc.username)}
          </div>
          <div style="font-size:11px;color:rgba(255,255,255,0.28);margin-top:2px;font-family:'Geist Mono',monospace;">
            @${escHtml(acc.username)} · ${acc.userId}
          </div>
        </div>

        <div style="display:flex;align-items:center;gap:6px;margin-bottom:12px;">
          ${isRunning
            ? `<span class="tag tag-active"><div style="width:5px;height:5px;border-radius:50%;background:currentColor;"></div>Running</span>`
            : `<span class="tag tag-grey">Idle</span>`}
          <span style="color:rgba(255,255,255,0.15);font-size:11px;">·</span>
          <span style="font-size:10.5px;color:rgba(255,255,255,0.18);">Added ${timeAgoShort(acc.addedAt)}</span>
        </div>

        <!-- Actions -->
        <div style="display:flex;gap:6px;">
          <button class="btn-primary launch-btn" data-id="${acc.id}" style="flex:1;padding:7px 10px;font-size:12.5px;">
            Launch
          </button>
          <button class="btn-ghost refresh-avatar-btn" data-id="${acc.id}"
                  title="Refresh avatar"
                  style="width:31px;height:31px;padding:0;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
              <polyline points="23 4 23 10 17 10"/>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
          </button>
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
    <div class="card" style="padding:28px;border-radius:14px;background:#000000;border:1px solid rgba(255,255,255,0.14);">
      <div class="flex items-center justify-between mb-6">
        <div>
          <h2 style="font-size:15px;font-weight:700;color:white;letter-spacing:-0.2px;">Add Account</h2>
          <p style="font-size:11.5px;color:rgba(255,255,255,0.28);margin-top:3px;">Paste your .ROBLOSECURITY session token</p>
        </div>
        <button id="modal-close" class="btn-ghost" style="padding:5px 10px;font-size:12px;">✕</button>
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
          Open roblox.com &rarr; DevTools &rarr; Application &rarr; Cookies &rarr; copy <code style="background:rgba(255,255,255,0.07);padding:1px 5px;border-radius:4px;">.ROBLOSECURITY</code>.
          Stored encrypted with AES-256-GCM, bound to this machine.
        </p>
      </div>

      <div id="modal-error" style="display:none;font-size:12.5px;color:rgba(255,255,255,0.7);background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:10px 12px;margin-bottom:12px;"></div>

      <button id="add-token-btn" class="btn-primary" style="width:100%;padding:11px;margin-top:16px;">
        Add Account
      </button>
    </div>
  `);

  document.getElementById('modal-close')?.addEventListener('click', hideModal);
  document.getElementById('add-token-btn')?.addEventListener('click', handleTokenAdd);
  document.getElementById('token-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleTokenAdd();
  });
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
  btn.textContent = 'Add Account';
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

async function handleLaunch(btn) {
  const accountId = btn.dataset.id;
  btn.disabled = true;
  const orig = btn.textContent;
  btn.innerHTML = `<span class="spinner" style="width:13px;height:13px;border-width:2px;"></span>`;

  try {
    await window.api.instances.launch(accountId);
    showToast('Roblox launched', 'success');
    btn.textContent = 'Done';
    setTimeout(() => { btn.disabled = false; btn.textContent = orig; }, 3000);
  } catch (err) {
    showToast(err.message || 'Launch failed', 'error');
    btn.disabled = false;
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

function rerenderGrid() {
  const grid = document.getElementById('accounts-grid');
  if (grid) {
    grid.innerHTML = state.accounts.map(acc => accountCard(acc)).join('');
    document.querySelectorAll('.launch-btn').forEach(btn => btn.addEventListener('click', () => handleLaunch(btn)));
    document.querySelectorAll('.remove-btn').forEach(btn => btn.addEventListener('click', () => handleRemove(btn)));
    document.querySelectorAll('.refresh-avatar-btn').forEach(btn => btn.addEventListener('click', () => handleRefreshAvatar(btn)));
  } else {
    const content = document.getElementById('page-content');
    const page = new AccountsPage();
    content.innerHTML = page.render();
    page.init();
  }
}

function timeAgoShort(iso) {
  if (!iso) return '';
  const diff = Math.floor((Date.now() - new Date(iso)) / 86400000);
  if (diff === 0) return 'today';
  if (diff === 1) return 'yesterday';
  return `${diff}d ago`;
}
