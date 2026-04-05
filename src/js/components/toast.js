const ICONS = {
  success: `<svg width="14" height="14" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>`,
  error:   `<svg width="14" height="14" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="2.5" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  info:    `<svg width="14" height="14" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="2.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
};

export function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const el = document.createElement('div');
  el.style.cssText = `
    display: flex; align-items: center; gap: 10px;
    background: #000000;
    border: 1px solid rgba(255,255,255,0.18);
    border-radius: 9px; padding: 10px 14px;
    font-size: 13px; color: rgba(255,255,255,0.85);
    font-family: 'DM Sans', system-ui, sans-serif;
    box-shadow: 0 8px 32px rgba(0,0,0,0.6);
    pointer-events: all; max-width: 300px;
    animation: slideUp 0.18s ease-out;
    transition: opacity 0.18s, transform 0.18s;
  `;
  el.innerHTML = `${ICONS[type] || ICONS.info}<span>${escapeHtml(message)}</span>`;
  container.appendChild(el);

  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(6px)';
    setTimeout(() => el.remove(), 200);
  }, duration);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
