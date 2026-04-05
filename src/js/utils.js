export function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function avatarFallback(name) {
  const letter = (name || '?')[0].toUpperCase();
  const palette = ['4F46E5', '7C3AED', '2563EB', '0891B2', '059669', 'B45309', 'BE185D'];
  const color = palette[(name || '').charCodeAt(0) % palette.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
    <circle cx="24" cy="24" r="24" fill="#${color}33"/>
    <text x="50%" y="50%" dy=".35em" text-anchor="middle"
          fill="#fff" font-family="system-ui,sans-serif"
          font-size="20" font-weight="700">${letter}</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function timeAgo(isoString) {
  if (!isoString) return 'Unknown';
  const diff = Math.floor((Date.now() - new Date(isoString)) / 1000);
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export function formatDuration(startIso) {
  if (!startIso) return '—';
  const secs = Math.floor((Date.now() - new Date(startIso)) / 1000);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
