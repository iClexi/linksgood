const title = document.getElementById('account-title');
const summary = document.getElementById('account-summary');
const historyEl = document.getElementById('account-history');
const sessionsEl = document.getElementById('account-sessions');
const logoutAll = document.getElementById('logout-all');

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const formatDate = (value) => new Date(value).toLocaleString();

const table = (headers, rows) => `<table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;

const post = async (url) => {
  const response = await fetch(url, { method: 'POST', credentials: 'same-origin' });
  if (!response.ok) throw new Error('No se pudo completar la acción.');
};

const load = async () => {
  const [meResponse, historyResponse, sessionsResponse] = await Promise.all([
    fetch('/api/auth/me', { credentials: 'same-origin' }),
    fetch('/api/account/history', { credentials: 'same-origin' }),
    fetch('/api/account/sessions', { credentials: 'same-origin' }),
  ]);
  const me = await meResponse.json().catch(() => ({}));
  const history = await historyResponse.json().catch(() => ({}));
  const sessions = await sessionsResponse.json().catch(() => ({}));
  if (!me.user) {
    window.location.href = '/';
    return;
  }

  title.textContent = `Hola, ${me.user.username}`;
  const totalVisits = (history.links || []).reduce((sum, link) => sum + Number(link.total_visits || 0), 0);
  const qrVisits = (history.links || []).reduce((sum, link) => sum + Number(link.qr_visits || 0), 0);
  summary.innerHTML = `
    <div><strong>${history.links?.length || 0}</strong><span>Enlaces creados</span></div>
    <div><strong>${totalVisits}</strong><span>Visitas totales</span></div>
    <div><strong>${qrVisits}</strong><span>Scans QR</span></div>
    <div><strong>${sessions.sessions?.length || 0}</strong><span>Sesiones activas</span></div>
  `;

  if (!history.links?.length) {
    historyEl.innerHTML = '<p class="empty">Todavía no has creado enlaces estando logueado.</p>';
  } else {
    historyEl.innerHTML = table(['Creado', 'Alias', 'Destino', 'Link', 'QR', 'Visitas', 'Actividad'], history.links.map((link) => `
      <tr>
        <td data-label="Creado">${escapeHtml(formatDate(link.created_at))}</td>
        <td data-label="Alias">${escapeHtml(link.alias_path)}</td>
        <td data-label="Destino">${escapeHtml(link.target_host)}</td>
        <td data-label="Link"><a href="${escapeHtml(link.short_url)}" target="_blank" rel="noreferrer">Abrir</a></td>
        <td data-label="QR"><a href="${escapeHtml(link.qr_svg_url)}" target="_blank" rel="noreferrer">SVG</a></td>
        <td data-label="Visitas">${escapeHtml(link.total_visits)} (${escapeHtml(link.qr_visits)} QR)</td>
        <td data-label="Actividad"><a class="table-action" href="${escapeHtml(link.activity_url || link.stats_url)}">Ver</a></td>
      </tr>
    `));
  }

  sessionsEl.innerHTML = table(['Dispositivo', 'IP', 'Creada', 'Última vez', 'Acción'], (sessions.sessions || []).map((session) => `
    <tr>
      <td data-label="Dispositivo">${escapeHtml(session.device_label || 'Dispositivo')}</td>
      <td data-label="IP">${escapeHtml(session.ip || '')}</td>
      <td data-label="Creada">${escapeHtml(formatDate(session.created_at))}</td>
      <td data-label="Última vez">${escapeHtml(formatDate(session.last_seen_at))}</td>
      <td data-label="Acción">${session.current ? '<span class="pill">Actual</span>' : `<button class="table-action" data-revoke="${escapeHtml(session.id)}" type="button">Cerrar</button>`}</td>
    </tr>
  `));

  sessionsEl.querySelectorAll('[data-revoke]').forEach((button) => {
    button.addEventListener('click', async () => {
      button.disabled = true;
      await post(`/api/account/sessions/${button.dataset.revoke}/revoke`);
      await load();
    });
  });
};

logoutAll?.addEventListener('click', async () => {
  logoutAll.disabled = true;
  await post('/api/account/sessions/logout-others');
  await load();
  logoutAll.disabled = false;
});

load().catch((error) => {
  title.textContent = 'No se pudo cargar la cuenta';
  historyEl.innerHTML = `<p class="empty">${escapeHtml(error.message)}</p>`;
});
