import { state }        from '../state.js';
import { showToast }    from '../components/toast.js';
import { escHtml, avatarFallback, formatDuration } from '../utils.js';

export class InstancesPage {
  constructor() {
    this._interval = null;
  }

  render() {
    return `
      <div style="max-width:800px;">
        <div class="flex items-center justify-between mb-7">
          <div>
            <h1 style="font-size:22px;font-weight:700;color:white;letter-spacing:-0.3px;">Instances</h1>
            <p style="color:rgba(255,255,255,0.38);font-size:13px;margin-top:4px;">Live Roblox processes</p>
          </div>
          <button id="refresh-instances-btn" class="btn-ghost" style="display:flex;align-items:center;gap:7px;font-size:13px;">
            <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
              <polyline points="23 4 23 10 17 10"/>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
            Refresh
          </button>
        </div>

        <div id="instances-list">
          ${renderList(state.instances)}
        </div>
      </div>
    `;
  }

  init() {
    document.getElementById('refresh-instances-btn')?.addEventListener('click', () => this.refresh());

    // Auto-refresh durations every second
    this._interval = setInterval(() => updateDurations(), 1000);

    attachKillListeners();

    return () => clearInterval(this._interval);
  }

  async refresh() {
    try {
      state.instances = await window.api.instances.list();
      const list = document.getElementById('instances-list');
      if (list) list.innerHTML = renderList(state.instances);
      attachKillListeners();
    } catch (err) {
      showToast('Failed to refresh', 'error');
    }
  }

  onInstancesUpdate(instances) {
    const list = document.getElementById('instances-list');
    if (list) {
      list.innerHTML = renderList(instances);
      attachKillListeners();
    }
  }
}

function renderList(instances) {
  if (!instances || instances.length === 0) {
    return `
      <div style="text-align:center;padding:72px 0;color:rgba(255,255,255,0.2);">
        <svg width="52" height="52" style="margin:0 auto 16px;opacity:0.25;" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
          <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
        </svg>
        <p style="font-size:14px;">No Roblox instances running</p>
        <p style="font-size:12px;margin-top:6px;color:rgba(255,255,255,0.15);">Launch accounts from the Accounts page</p>
      </div>
    `;
  }

  return `
    <div style="display:flex;flex-direction:column;gap:10px;">
      ${instances.map(inst => instanceRow(inst)).join('')}
    </div>
  `;
}

function instanceRow(inst) {
  const account = state.accounts.find(a => a.id === inst.accountId);
  const name    = account ? (account.displayName || account.username) : 'Unknown Account';
  const fb      = account ? avatarFallback(name) : avatarFallback('?');
  const avatar  = account?.avatarUrl || fb;

  return `
    <div class="card" style="display:flex;align-items:center;gap:14px;padding:14px 18px;">
      <div style="position:relative;flex-shrink:0;">
        <img src="${escHtml(avatar)}" style="width:38px;height:38px;border-radius:50%;background:rgba(255,255,255,0.08);"
             onerror="this.src='${fb}'">
        <div class="status-dot-green" style="position:absolute;bottom:0;right:0;width:9px;height:9px;border:2px solid #080812;"></div>
      </div>

      <div style="flex:1;min-width:0;">
        <div style="font-size:14px;font-weight:600;color:white;">${escHtml(name)}</div>
        <div style="display:flex;align-items:center;gap:10px;margin-top:3px;">
          <span style="font-size:12px;color:rgba(255,255,255,0.35);">PID ${inst.pid}</span>
          <span style="color:rgba(255,255,255,0.15);">·</span>
          <span class="duration-counter" data-start="${escHtml(inst.startTime || '')}"
                style="font-size:12px;color:rgba(255,255,255,0.35);">
            ${inst.startTime ? formatDuration(inst.startTime) : '—'}
          </span>
          ${inst.cpu > 0 ? `
            <span style="color:rgba(255,255,255,0.15);">·</span>
            <span style="font-size:12px;color:rgba(255,255,255,0.3);">CPU: ${inst.cpu.toFixed(1)}%</span>
          ` : ''}
        </div>
      </div>

      <button class="btn-danger kill-btn" data-pid="${inst.pid}" style="font-size:12px;padding:6px 12px;flex-shrink:0;">
        <span style="display:flex;align-items:center;gap:6px;">
          <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
          Kill
        </span>
      </button>
    </div>
  `;
}

function updateDurations() {
  document.querySelectorAll('.duration-counter').forEach(el => {
    const start = el.dataset.start;
    if (start) el.textContent = formatDuration(start);
  });
}

function attachKillListeners() {
  document.querySelectorAll('.kill-btn').forEach(btn => {
    btn.addEventListener('click', () => handleKill(btn));
  });
}

async function handleKill(btn) {
  const pid = parseInt(btn.dataset.pid, 10);
  if (!Number.isFinite(pid)) return;

  btn.disabled = true;
  btn.textContent = 'Killing…';

  try {
    await window.api.instances.kill(pid);
    state.instances = state.instances.filter(i => i.pid !== pid);
    showToast(`Instance ${pid} killed`, 'success');
    const row = btn.closest('.card');
    if (row) {
      row.style.transition = 'opacity 0.2s, transform 0.2s';
      row.style.opacity = '0';
      row.style.transform = 'translateX(12px)';
      setTimeout(() => row.remove(), 200);
    }
  } catch (err) {
    showToast(err.message || 'Failed to kill instance', 'error');
    btn.disabled = false;
    btn.textContent = 'Kill';
  }
}
