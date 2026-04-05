let _onClose = null;

export function showModal(html, onClose) {
  const overlay = document.getElementById('modal-overlay');
  const box     = document.getElementById('modal-box');
  if (!overlay || !box) return;

  _onClose = onClose || null;
  box.innerHTML = html;
  overlay.classList.add('open');

  // Allow closing by clicking outside the box
  overlay.addEventListener('click', _handleOverlayClick);
}

export function hideModal() {
  const overlay = document.getElementById('modal-overlay');
  if (!overlay) return;
  overlay.classList.remove('open');
  overlay.removeEventListener('click', _handleOverlayClick);
  if (_onClose) { _onClose(); _onClose = null; }
}

function _handleOverlayClick(e) {
  if (e.target === document.getElementById('modal-overlay')) hideModal();
}

export function modalBox() {
  return document.getElementById('modal-box');
}
