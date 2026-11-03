import { html } from '../js/utils.js';
export function render(root) { root.innerHTML = String(html`<div class="card empty"><strong>Page not found</strong><p><a href="#/">Go to your dashboard</a></p></div>`); }
