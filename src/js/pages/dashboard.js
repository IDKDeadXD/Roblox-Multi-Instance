import { state }          from '../state.js';
import { navigate }       from '../app.js';
import { showToast }      from '../components/toast.js';
import { avatarFallback } from '../utils.js';

export class DashboardPage {
  render() {
    const { accounts, instances, settings } = state;
    const multiOn = settings?.multiInstanceEnabled;

    return `
      <div style="max-width:780px;">
        <div class="mb-7">
          <h1 style="font-size:22px; font-weight:700; color:white; letter-spacing:-0.3px;">Dashboard</h1>
          <p style="color:rgba(255,255,255,0.38); font-size:13px; margin-top:4px;">Overview of your Roblox sessions</p>
        </div>

        <!-- Stats -->
        <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:14px; margin-bottom:22px;">
          ${statCard(accounts.length, 'Accounts', '#818cf8', accountIcon())}
          ${statCard(instances.length, 'Running', '#4ade80', instanceIcon(), instances.length > 0)}
          ${statCard(multiOn ? 'ON' : 'OFF', 'Multi-Instance', multiOn ? '#4ade80' : 'rgba(255,255,255,0.3)', multiIcon())}
        </div>

        <!-- Quick launch -->
        <div class="card mb-5">
          <div class="flex items-center justify-between mb-4">
            <h2 style="font-size:11px; font-weight:600; color:rgba(255,255,255,0.4); letter-spacing:.08em; text-transform:uppercase;">Quick Launch</h2>
            ${accounts.length > 0 ? `
              <div class="flex items-center gap-2">
                <input id="ql-place-id" class="input-field" placeholder="Place ID (optional)"
                       style="width:180px; padding:6px 12px; font-size:13px;"
                       value="${escHtml(settings?.defaultPlaceId || '')}">
              </div>
            ` : ''}
          </div>

          ${accounts.length === 0 ? emptyAccounts() : `
            <div id="ql-list" style="display:flex; flex-direction:column; gap:8px;">
              ${accounts.map(acc => quickLaunchRow(acc)).join('')}
            </div>
          `}
        </div>

        <!-- System info -->
        <div class="card">
          <h2 style="font-size:11px; font-weight:600; color:rgba(255,255,255,0.4); letter-spacing:.08em; text-transform:uppercase; margin-bottom:14px;">System</h2>
          <div style="display:flex; flex-direction:column; gap:10px;">
            ${infoRow('Version',        '1.0.0')}
            ${infoRow('Platform',       navigator.platform)}
            ${infoRow('Multi-Instance', multiOn
              ? '<span style="color:#4ade80">Enabled</span>'
              : '<span style="color:rgba(255,255,255,0.3)">Disabled</span>')}
            ${infoRow('Launch Delay',   `${settings?.launchDelay || 800}ms`)}
          </div>
        </div>
      </div>
    `;
  }

  init() {
    document.getElementById('add-account-link')?.addEventListener('click', () => navigate('accounts'));

    document.querySelectorAll('.ql-launch-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const accountId = btn.dataset.id;
        const placeId   = document.getElementById('ql-place-id')?.value?.trim() || '';
        await launchAccount(btn, accountId, placeId);
      });
    });
  }
}

async function launchAccount(btn, accountId, placeId) {
  if (!placeId || !/^\d+$/.test(placeId)) {
    showToast('Enter a Place ID first (or set one in Settings)', 'error');
    return;
  }
  btn.disabled = true;
  const orig = btn.innerHTML;
  btn.innerHTML = `<span class="spinner" style="width:14px;height:14px;border-width:2px;"></span>`;
  try {
    await window.api.instances.launch(accountId, placeId);
    showToast('Roblox launched!', 'success');
    btn.innerHTML = `✓`;
    setTimeout(() => { btn.disabled = false; btn.innerHTML = orig; }, 3000);
  } catch (err) {
    showToast(err.message || 'Launch failed', 'error');
    btn.innerHTML = orig;
    btn.disabled = false;
  }
}

function quickLaunchRow(acc) {
  return `
    <div style="display:flex; align-items:center; gap:12px; padding:10px 12px;
                background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06);
                border-radius:10px; transition:background 0.15s;"
         onmouseenter="this.style.background='rgba(255,255,255,0.055)'"
         onmouseleave="this.style.background='rgba(255,255,255,0.03)'">
      <img src="${escHtml(acc.avatarUrl || avatarFallback(acc.displayName || acc.username))}"
           class="rounded-full" style="width:34px;height:34px;background:rgba(255,255,255,0.1);flex-shrink:0;"
           onerror="this.src='${avatarFallback(acc.displayName || acc.username)}'">
      <div style="flex:1;min-width:0;">
        <div style="font-size:14px;font-weight:600;color:white;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
          ${escHtml(acc.displayName || acc.username)}
        </div>
        <div style="font-size:11px;color:rgba(255,255,255,0.35);">@${escHtml(acc.username)} · ${acc.userId}</div>
      </div>
      <button class="btn-primary ql-launch-btn" data-id="${acc.id}"
              style="padding:6px 14px; font-size:13px;">Launch</button>
    </div>
  `;
}

function emptyAccounts() {
  return `
    <div style="text-align:center;padding:32px 0;color:rgba(255,255,255,0.25);">
      <svg width="40" height="40" style="margin:0 auto 12px;opacity:0.3;" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
        <circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/>
      </svg>
      <p style="font-size:13px;margin-bottom:14px;">No accounts yet</p>
      <button class="btn-primary" id="add-account-link" style="font-size:13px;">Add Account</button>
    </div>
  `;
}

function statCard(value, label, color, icon, pulse = false) {
  return `
    <div class="card" style="padding:16px;">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:10px;">
        <div style="color:${color};opacity:0.7;">${icon}</div>
        ${pulse ? `<div style="width:7px;height:7px;border-radius:50%;background:#4ade80;box-shadow:0 0 8px #4ade80;animation:pulse 2s infinite;"></div>` : ''}
      </div>
      <div style="font-size:26px;font-weight:700;color:${color};letter-spacing:-0.5px;">${value}</div>
      <div style="font-size:12px;color:rgba(255,255,255,0.35);margin-top:3px;">${label}</div>
    </div>
  `;
}

function infoRow(label, value) {
  return `
    <div style="display:flex;justify-content:space-between;align-items:center;font-size:13px;">
      <span style="color:rgba(255,255,255,0.38);">${label}</span>
      <span style="color:rgba(255,255,255,0.7);">${value}</span>
    </div>
  `;
}

function accountIcon()  { return `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/></svg>`; }
function instanceIcon() { return `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>`; }
function multiIcon()    { return `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>`; }

function escHtml(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
