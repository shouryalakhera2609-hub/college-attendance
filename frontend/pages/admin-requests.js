import { api } from '../js/api.js';
import { html } from '../js/utils.js';
import { toast } from '../js/components.js';

export async function render(root) {
  const statuses = [
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Reject' },
    { value: 'pending', label: 'Pending' }
  ];
  let selected = 'pending';
  let requests = [];
  let loading = true;
  let loadId = 0;

  const loadRequests = async () => {
    const requestId = ++loadId;
    try {
      const result = await api(`/admin/requests?status=${encodeURIComponent(selected)}`);
      if (requestId === loadId) requests = result;
    } catch (error) {
      if (requestId === loadId) {
        requests = [];
        toast(error.message, 'error');
      }
    } finally {
      if (requestId === loadId) {
        loading = false;
        draw();
      }
    }
  };

  const draw = () => {
    const currentStatus = statuses.find(status => status.value === selected);
    root.innerHTML = String(html`<div class="page-head"><div><h2>Requests</h2><p>Select a request status to view its list.</p></div></div>
      <nav class="admin-request-tabs" aria-label="Request status">
        ${statuses.map(status => html`<button class="btn ${selected === status.value ? 'primary' : ''} ${status.value === 'pending' && selected === status.value && requests.length > 0 ? 'pending-alert' : ''}" type="button" data-status="${status.value}" aria-pressed="${selected === status.value}">${status.label}</button>`)}
      </nav>
      ${selected ? html`<section class="card admin-request-list" aria-live="polite"><h3>${currentStatus.label === 'Reject' ? 'Rejected' : currentStatus.label} Requests</h3>
        ${loading ? html`<div class="empty">Loading requests…</div>` : requests.length ? html`<div class="admin-request-items">${requests.map(request => html`<article class="admin-request-item">
          <div><strong>${request.name}</strong><p>${request.email} · Employee ID: ${request.instId || '-'}</p><small>${request.department?.name || 'Department not available'} · ${request.campus}</small></div>
          ${selected === 'pending' ? html`<div class="admin-request-actions"><button class="btn sm primary" type="button" data-decision="approved" data-id="${request.id}">Approve</button><button class="btn sm danger" type="button" data-decision="rejected" data-id="${request.id}">Reject</button></div>` : ''}
        </article>`)}</div>` : html`<div class="empty"><strong>No ${currentStatus.label === 'Reject' ? 'rejected' : currentStatus.label.toLowerCase()} requests.</strong></div>`}
      </section>` : ''}`);

    root.querySelectorAll('[data-status]').forEach(button => {
      button.onclick = () => {
        selected = button.dataset.status;
        requests = [];
        loading = true;
        draw();
        loadRequests();
      };
    });
    root.querySelectorAll('[data-decision]').forEach(button => {
      button.onclick = async () => {
        button.disabled = true;
        try {
          await api(`/admin/requests/${encodeURIComponent(button.dataset.id)}`, {
            method: 'PATCH',
            body: { decision: button.dataset.decision }
          });
          toast(button.dataset.decision === 'approved' ? 'HOD request approved.' : 'HOD request rejected.');
          await loadRequests();
        } catch (error) {
          button.disabled = false;
          toast(error.message, 'error');
        }
      };
    });
  };

  draw();
  loadRequests();
}
