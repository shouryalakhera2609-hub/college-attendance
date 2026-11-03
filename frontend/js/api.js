const BASE = '/api/v1';
const csrf = () => (document.cookie.split('; ').find(c => c.startsWith('ca_csrf=')) || '').split('=')[1] || '';
export async function api(path, { method = 'GET', body } = {}) {
  const r = await fetch(BASE + path, { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf() }, body: body ? JSON.stringify(body) : undefined });
  return readResponse(r, path);
}
export async function apiFile(path, file) {
  const r = await fetch(BASE + path, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/octet-stream', 'X-CSRF-Token': csrf() }, body: file });
  return readResponse(r, path);
}
export async function apiDownload(path) {
  const r = await fetch(BASE + path, { credentials: 'same-origin' });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event('session-expired'));
    throw new Error(j.message || 'Request failed');
  }
  return r.blob();
}
async function readResponse(r, path) {
  if (r.ok && path.startsWith('/reports/attendance/export.csv')) return r.blob();
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event('session-expired'));
  if (!r.ok) { const e = new Error(j.errors?.length ? j.errors.map(x => x.field + ': ' + x.message).join('; ') : j.message || 'Request failed'); e.status = r.status; throw e; }
  return j.data;
}
