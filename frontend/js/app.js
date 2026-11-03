import { loadUser, state } from './auth.js';
import { route, go } from './router.js';
// Progress-bar widths are applied through CSSOM so the strict CSP (no inline styles) stays intact.
new MutationObserver(() => document.querySelectorAll('[data-w]:not([data-d])').forEach(e => { e.style.width = Math.min(100, +e.dataset.w || 0) + '%'; e.dataset.d = 1; })).observe(document.body, { childList: true, subtree: true });
window.addEventListener('hashchange', route);
window.addEventListener('session-expired', () => { state.user = null; go('/login'); route(); });
await loadUser();
route();
