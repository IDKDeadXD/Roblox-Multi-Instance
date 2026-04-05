import { state }     from '../state.js';
import { showToast } from '../components/toast.js';

export class SettingsPage {
  render() {
    const s = state.settings;
    return `
      <div style="max-width:580px;">
        <div class="mb-7">
          <h1 style="font-size:20px;font-weight:700;color:white;letter-spacing:-0.4px;">Settings</h1>
          <p style="color:rgba(255,255,255,0.3);font-size:12px;margin-top:3px;">Configure the instance manager</p>
        </div>

        <!-- Multi-instance -->
        <div class="card mb-4">
          <div style="margin-bottom:16px;">
            <h2 style="font-size:11px;font-weight:600;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:.08em;">Multi-Instance</h2>
          </div>

          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:20px;margin-bottom:20px;">
            <div style="flex:1;">
              <div style="font-size:13.5px;font-weight:600;color:white;margin-bottom:4px;">Enable Multi-Instance</div>
              <div style="font-size:12px;color:rgba(255,255,255,0.35);line-height:1.55;">
                Holds the <code style="background:rgba(255,255,255,0.07);padding:1px 5px;border-radius:4px;font-size:11px;">ROBLOX_singletonEvent</code> mutex for the lifetime of the app so each Roblox client skips the singleton check. Windows only.
              </div>
            </div>
            <button id="toggle-multi" class="toggle-track ${s?.multiInstanceEnabled ? 'on' : ''}" title="Toggle multi-instance">
              <div class="toggle-thumb"></div>
            </button>
          </div>

          <div style="display:flex;align-items:center;gap:14px;">
            <div style="flex:1;">
              <label for="launch-delay" style="font-size:13px;font-weight:500;color:white;display:block;margin-bottom:4px;">
                Launch Delay
              </label>
              <div style="font-size:12px;color:rgba(255,255,255,0.35);margin-bottom:8px;">
                Milliseconds to wait between successive launches. Increase if instances conflict on startup.
              </div>
            </div>
            <div>
              <input id="launch-delay" class="input-field" type="number" min="0" max="5000" step="100"
                     value="${s?.launchDelay ?? 800}"
                     style="width:100px;text-align:right;font-family:'Geist Mono',monospace;">
            </div>
          </div>
        </div>

        <!-- Security -->
        <div class="card mb-4">
          <div style="margin-bottom:16px;">
            <h2 style="font-size:11px;font-weight:600;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:.08em;">Security</h2>
          </div>
          <div style="display:flex;flex-direction:column;gap:8px;font-size:13px;">
            ${securityRow('AES-256-GCM encryption', 'All session tokens encrypted at rest')}
            ${securityRow('Machine-bound key', 'Encryption key derived from hardware ID')}
            ${securityRow('Context isolation', 'Renderer sandboxed from Node.js APIs')}
            ${securityRow('CSP enforced', 'Content Security Policy applied to renderer')}
          </div>
        </div>

        <!-- Danger zone -->
        <div class="card" style="border-color:rgba(255,255,255,0.10);">
          <div style="margin-bottom:16px;">
            <h2 style="font-size:11px;font-weight:600;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:.08em;">Danger Zone</h2>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;">
            <div>
              <div style="font-size:13.5px;font-weight:600;color:white;margin-bottom:3px;">Clear All Data</div>
              <div style="font-size:12px;color:rgba(255,255,255,0.3);">Remove all accounts and reset settings. This cannot be undone.</div>
            </div>
            <button id="clear-data-btn" class="btn-danger" style="flex-shrink:0;">Clear All Data</button>
          </div>
        </div>

        <!-- Save -->
        <div style="display:flex;justify-content:flex-end;margin-top:20px;">
          <button id="save-settings-btn" class="btn-primary" style="padding:10px 24px;">
            Save Settings
          </button>
        </div>
      </div>
    `;
  }

  init() {
    document.getElementById('toggle-multi')?.addEventListener('click', function () {
      this.classList.toggle('on');
    });
    document.getElementById('save-settings-btn')?.addEventListener('click', saveSettings);
    document.getElementById('clear-data-btn')?.addEventListener('click', clearData);
  }
}

async function saveSettings() {
  const btn = document.getElementById('save-settings-btn');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  const multiEnabled = document.getElementById('toggle-multi')?.classList.contains('on');
  const launchDelay  = parseInt(document.getElementById('launch-delay')?.value || '800', 10);

  try {
    const updated = await window.api.settings.set({
      multiInstanceEnabled: multiEnabled,
      launchDelay: Math.max(0, Math.min(5000, launchDelay || 800))
    });
    state.settings = updated;
    showToast('Settings saved', 'success');
  } catch (err) {
    showToast(err.message || 'Failed to save', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Settings';
  }
}

async function clearData() {
  if (!confirm('Are you sure? This will remove ALL accounts and reset settings. This cannot be undone.')) return;

  try {
    for (const acc of [...state.accounts]) {
      await window.api.accounts.remove(acc.id);
    }
    state.accounts = [];

    const defaults = await window.api.settings.set({
      multiInstanceEnabled: true,
      launchDelay: 800
    });
    state.settings = defaults;

    showToast('All data cleared', 'info');

    const content = document.getElementById('page-content');
    const page = new SettingsPage();
    content.innerHTML = page.render();
    page.init();
  } catch (err) {
    showToast(err.message || 'Failed to clear data', 'error');
  }
}

function securityRow(title, desc) {
  return `
    <div style="display:flex;align-items:center;gap:12px;padding:10px 12px;background:rgba(255,255,255,0.02);border-radius:8px;border:1px solid rgba(255,255,255,0.06);">
      <div style="width:18px;height:18px;flex-shrink:0;display:flex;align-items:center;justify-content:center;border-radius:50%;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);">
        <svg width="9" height="9" fill="none" stroke="rgba(255,255,255,0.7)" stroke-width="3" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      <div>
        <div style="font-size:13px;font-weight:500;color:rgba(255,255,255,0.75);">${title}</div>
        <div style="font-size:11px;color:rgba(255,255,255,0.28);margin-top:1px;">${desc}</div>
      </div>
    </div>
  `;
}
