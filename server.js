import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dns from 'node:dns/promises';
import net from 'node:net';
import { Pool } from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number.parseInt(process.env.LINKS_PORT || '9827', 10);
const PUBLIC_URL = (process.env.LINKS_PUBLIC_URL || `http://127.0.0.1:${PORT}`).replace(/\/+$/, '');
const DATABASE_URL = process.env.LINKS_DATABASE_URL || '';
const APP_SECRET = process.env.LINKS_APP_SECRET || '';
const ADMIN_SECRET = (process.env.LINKS_ADMIN_ENTRY_SECRET || '').trim();
const ADMIN_COOKIE = 'linksgood_admin';
const ASSET_VERSION = '20260513-redesign';
const ADMIN_TTL_SECONDS = Math.max(300, Number.parseInt(process.env.LINKS_ADMIN_SESSION_TTL_SECONDS || '21600', 10));
const ADMIN_IP = process.env.LINKS_ADMIN_IP || '192.168.200.1';
const RETENTION_DAYS = Math.max(1, Number.parseInt(process.env.LINKS_RETENTION_DAYS || '90', 10));
const MAX_BODY = 96 * 1024;
const MAX_HTML_BYTES = 240 * 1024;

if (!DATABASE_URL) {
  console.error('LINKS_DATABASE_URL is required.');
  process.exit(1);
}

if (!APP_SECRET || APP_SECRET.length < 24) {
  console.error('LINKS_APP_SECRET is required and must be at least 24 characters.');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL, max: 8, idleTimeoutMillis: 30000 });

const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.ico', 'image/x-icon'],
]);

const shortAlphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const longWords = [
  'root', 'kernel', 'zero-day', 'payload', 'terminal', 'cipher', 'ghost', 'access',
  'matrix', 'override', 'proxy', 'vault', 'signal', 'packet', 'sudo', 'shadow',
  'node', 'exploit-lab', 'hash', 'trace', 'quantum', 'backdoor-looking', 'neon',
];

function nowIso() {
  return new Date().toISOString();
}

function hmac(value) {
  return createHmac('sha256', APP_SECRET).update(value).digest('hex');
}

function jsonResponse(res, status, data, headers = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...headers,
  });
  res.end(body);
}

function htmlResponse(res, status, html, headers = {}) {
  res.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    ...headers,
  });
  res.end(html);
}

function redirect(res, location) {
  res.writeHead(302, { location, 'cache-control': 'no-store' });
  res.end();
}

function notFound(res) {
  htmlResponse(res, 404, pageShell({ title: 'No encontrado', body: '<main class="center"><h1>No encontrado</h1><p>Ese enlace no existe o fue desactivado.</p><a class="button" href="/">Crear otro enlace</a></main>' }));
}

function badRequest(res, message) {
  jsonResponse(res, 400, { error: message });
}

function parseCookies(header = '') {
  const cookies = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
  }
  return cookies;
}

function clientIp(req) {
  const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xff || req.socket.remoteAddress || '';
}

function publicIp(req) {
  return String(req.headers['cf-connecting-ip'] || '').trim() || clientIp(req);
}

function isSecureRequest(req) {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  return forwardedProto === 'https' || Boolean(req.headers['cf-ray']);
}

function adminSessionToken() {
  const issued = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({ iat: issued, exp: issued + ADMIN_TTL_SECONDS, scope: 'admin' })).toString('base64url');
  return `${payload}.${hmac(`admin:${payload}`)}`;
}

function hasAdminSession(req) {
  if (!ADMIN_SECRET) return false;
  const token = parseCookies(req.headers.cookie || '')[ADMIN_COOKIE] || '';
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return false;
  const expected = hmac(`admin:${payload}`);
  if (signature.length !== expected.length || signature !== expected) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data.scope === 'admin' && Number(data.exp || 0) >= Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

function isLocalAdmin(req) {
  if (req.headers['cf-ray'] || req.headers['cf-connecting-ip']) return false;
  return clientIp(req) === ADMIN_IP;
}

function isAdmin(req) {
  return isLocalAdmin(req) || hasAdminSession(req);
}

function setAdminCookie(req, res) {
  const secure = isSecureRequest(req) ? '; Secure' : '';
  res.setHeader('set-cookie', `${ADMIN_COOKIE}=${encodeURIComponent(adminSessionToken())}; Path=/; Max-Age=${ADMIN_TTL_SECONDS}; HttpOnly; SameSite=Lax${secure}`);
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Error('BODY_TOO_LARGE');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function cleanText(value, max = 240) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function normalizeUrl(value) {
  let raw = String(value || '').trim();
  if (!raw) throw new Error('URL requerida.');
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('URL inválida.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Sólo se permiten enlaces http/https.');
  if (parsed.username || parsed.password) throw new Error('No se permiten URLs con usuario o contraseña.');
  if (parsed.href.length > 2048) throw new Error('URL demasiado larga.');
  parsed.hash = '';
  return parsed;
}

function isPrivateIp(address) {
  if (!address) return true;
  if (net.isIPv4(address)) {
    const parts = address.split('.').map((part) => Number.parseInt(part, 10));
    const [a, b] = parts;
    return a === 10 ||
      a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      a === 0 ||
      a >= 224;
  }
  if (net.isIPv6(address)) {
    const lower = address.toLowerCase();
    return lower === '::1' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80:') || lower === '::';
  }
  return true;
}

async function assertPublicUrl(parsed) {
  if (net.isIP(parsed.hostname)) {
    if (isPrivateIp(parsed.hostname)) throw new Error('No se permiten enlaces a redes privadas o locales.');
    return;
  }
  if (!parsed.hostname.includes('.')) throw new Error('El host del enlace no es válido.');
  const records = await dns.lookup(parsed.hostname, { all: true, verbatim: true });
  if (!records.length || records.some((record) => isPrivateIp(record.address))) {
    throw new Error('No se permiten enlaces a redes privadas o locales.');
  }
}

function sanitizeAlias(value, mode) {
  const raw = String(value || '').trim().replace(/^\/+/, '').replace(/\/+$/, '');
  if (!raw) return '';
  if (mode === 'short') {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{2,58}$/.test(raw)) {
      throw new Error('El alias corto debe tener 3-59 caracteres alfanuméricos, guion, punto o guion bajo.');
    }
    return raw;
  }
  if (raw.length > 180 || !/^[A-Za-z0-9][A-Za-z0-9._~=/+-]*$/.test(raw) || raw.includes('//')) {
    throw new Error('La ruta larga tiene caracteres inválidos o es demasiado extensa.');
  }
  return raw;
}

function randomShortCode(size = 7) {
  let code = '';
  for (let i = 0; i < size; i += 1) {
    code += shortAlphabet[randomBytes(1)[0] % shortAlphabet.length];
  }
  return code;
}

function randomLongPath() {
  const segments = [];
  const count = 5 + (randomBytes(1)[0] % 4);
  for (let i = 0; i < count; i += 1) {
    const word = longWords[randomBytes(1)[0] % longWords.length];
    const suffix = randomBytes(2).toString('hex');
    segments.push(i % 2 === 0 ? word : `${word}-${suffix}`);
  }
  return segments.join('/');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

function jsonScript(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function pageShell({ title, description = '', body, scripts = '', head = '' }) {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeAttr(description || 'Acorta, alarga y administra enlaces con analítica transparente.')}" />
  <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/assets/styles.css?v=${ASSET_VERSION}">
  ${head}
</head>
<body>
${body}
${scripts}
</body>
</html>`;
}

function appPage() {
  return pageShell({
    title: 'Linksgood',
    body: `<main class="app-page">
  <nav class="topbar">
    <a class="brand" href="/" aria-label="Linksgood inicio"><span class="brand-mark">LG</span><span>Linksgood</span></a>
    <div class="nav-actions">
      <a class="nav-link" href="/terminos">Términos</a>
      <a class="nav-link" href="/privacidad">Privacidad</a>
      <a id="admin-link" class="nav-link admin-entry hidden" href="/admin">Admin</a>
    </div>
  </nav>
  <section class="studio-grid">
    <section class="workbench">
      <div class="workbench-title">
        <span class="eyebrow">Acortador + alargador</span>
        <h1>Convierte cualquier URL en un enlace con carácter.</h1>
      </div>
      <form id="link-form" class="creator" autocomplete="off">
        <label class="field primary-field">
          <span>Link destino</span>
          <input id="target-url" name="target" type="text" inputmode="url" placeholder="https://youtube.com/watch?v=..." required>
        </label>
        <div class="mode-row" role="tablist" aria-label="Modo">
          <button class="mode active" type="button" data-mode="short"><span>Corto</span><small>/s/9Kx2</small></button>
          <button class="mode" type="button" data-mode="long"><span>Largo</span><small>/go/root/kernel</small></button>
        </div>
        <div class="grid two">
          <label class="field">
            <span>Alias</span>
            <input id="custom-alias" type="text" placeholder="mi-link">
          </label>
          <label class="field">
            <span>Etiqueta privada</span>
            <input id="owner-label" type="text" placeholder="campaña, clase, prueba">
          </label>
        </div>
        <details class="preview-editor">
          <summary><span>Preview social</span><small>título, descripción e imagen</small></summary>
          <div class="grid two">
            <label class="field">
              <span>Título</span>
              <input id="meta-title" type="text" maxlength="140">
            </label>
            <label class="field">
              <span>Imagen</span>
              <input id="meta-image" type="url" placeholder="https://...">
            </label>
          </div>
          <label class="field">
            <span>Descripción</span>
            <textarea id="meta-description" maxlength="240"></textarea>
          </label>
          <button id="load-preview" class="secondary" type="button">Cargar preview</button>
        </details>
        <div class="actions">
          <button id="submit" class="button" type="submit">Crear enlace</button>
          <p id="status" class="status" role="status"></p>
        </div>
      </form>
      <section id="result" class="result hidden" aria-live="polite">
        <span class="eyebrow">Enlace listo</span>
        <a id="result-url" class="result-link" href="#" target="_blank" rel="noreferrer"></a>
        <div class="result-actions">
          <button id="copy-link" class="secondary" type="button">Copiar</button>
          <a id="stats-url" class="secondary" href="#">Actividad</a>
        </div>
      </section>
    </section>
    <aside class="signal-panel" aria-label="Vista visual de enlace">
      <div class="signal-header">
        <span class="eyebrow">Salida</span>
        <strong id="sample-path">/s/7kP9xQ2</strong>
      </div>
      <img class="signal-art" src="/assets/link-map.svg" alt="">
      <div class="social-preview" aria-label="Preview social de ejemplo">
        <div class="preview-image"></div>
        <div>
          <span id="sample-host" class="preview-host">linksgood</span>
          <strong id="sample-title">Preview social editable</strong>
          <p id="sample-description">Título, descripción e imagen quedan definidos por el creador del enlace.</p>
        </div>
      </div>
      <div class="audit-strip">
        <span>Visita con aviso</span>
        <strong>IP y navegador se muestran sólo tras consentimiento.</strong>
      </div>
    </aside>
  </section>
</main>`,
    scripts: `<script src="/assets/app.js?v=${ASSET_VERSION}" type="module"></script>`,
  });
}

function legalPage(kind) {
  const isTerms = kind === 'terms';
  return pageShell({
    title: isTerms ? 'Términos - Linksgood' : 'Privacidad - Linksgood',
    body: `<main class="doc-page">
  <nav class="topbar compact"><a class="brand" href="/"><span class="brand-mark">lg</span><span>Linksgood</span></a></nav>
  <article class="doc">
    <span class="eyebrow">Legal</span>
    <h1>${isTerms ? 'Términos y condiciones' : 'Privacidad'}</h1>
    <p>Linksgood crea enlaces cortos o largos con una pantalla intermedia de consentimiento. El servicio no debe usarse para acoso, phishing, robo de credenciales, engaño, doxxing ni rastreo encubierto.</p>
    <p>Cuando una persona abre un enlace, primero ve un aviso. Si decide continuar, se registra una visita asociada al enlace para que su creador pueda verla.</p>
    <h2>Datos que puede registrar una visita consentida</h2>
    <p>IP pública recibida por el servidor, fecha, user-agent, idioma, referrer, viewport, pantalla, zona horaria y otros datos técnicos enviados por el navegador.</p>
    <h2>Responsabilidad del usuario</h2>
    <p>Quien crea un enlace debe usarlo de forma transparente, proporcional y legal. No se permite presentarlo como una herramienta de captura secreta.</p>
    <h2>Retención</h2>
    <p>La retención operativa por defecto es de ${RETENTION_DAYS} días, salvo ajustes administrativos. Este texto es informativo y no sustituye asesoría legal profesional.</p>
  </article>
</main>`,
  });
}

function linkVisitPage(link) {
  const title = link.meta_title || `Enlace a ${link.target_host}`;
  const description = link.meta_description || 'Este enlace usa Linksgood y muestra un aviso antes de redirigir.';
  const image = link.meta_image || '';
  const head = `
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeAttr(title)}">
  <meta property="og:description" content="${escapeAttr(description)}">
  <meta property="og:url" content="${escapeAttr(`${PUBLIC_URL}/${link.alias_path}`)}">
  ${image ? `<meta property="og:image" content="${escapeAttr(image)}">` : ''}
  <meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">`;
  return pageShell({
    title,
    description,
    head,
    body: `<main class="consent-page">
  <section class="consent-box">
    <div class="consent-media">${image ? `<img src="${escapeAttr(image)}" alt="">` : '<img src="/assets/link-map.svg" alt="">'} </div>
    <div class="consent-body">
      <span class="eyebrow">Salida externa</span>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(description)}</p>
      <div class="destination">${escapeHtml(link.target_host)}</div>
      <div class="consent-copy">
        <strong>Antes de continuar</strong>
        <span>Si aceptas, este enlace registrará IP pública, navegador, referrer, idioma, viewport, zona horaria y hora de acceso para el creador del enlace y el administrador.</span>
      </div>
      <div class="actions">
        <button id="continue" class="button" type="button">Aceptar y continuar</button>
        <a class="secondary" href="/">Cancelar</a>
      </div>
      <p id="visit-status" class="status"></p>
    </div>
  </section>
</main>`,
    scripts: `<script>window.LINKSGOOD_VISIT=${jsonScript({ id: link.id })}</script><script src="/assets/visit.js" type="module"></script>`,
  });
}

function statsPage(id, key) {
  return pageShell({
    title: 'Actividad del enlace - Linksgood',
    body: `<main class="dashboard">
  <nav class="topbar compact"><a class="brand" href="/"><span class="brand-mark">lg</span><span>Linksgood</span></a><a class="nav-link" href="/">Crear</a></nav>
  <section class="panel lead-panel">
    <span class="eyebrow">Actividad</span>
    <h1 id="stats-title">Cargando...</h1>
    <div id="stats-summary" class="summary-grid"></div>
  </section>
  <section class="panel">
    <div class="panel-heading"><h2>Visitas consentidas</h2></div>
    <div id="visits" class="table-wrap"></div>
  </section>
</main>`,
    scripts: `<script>window.LINKSGOOD_STATS=${jsonScript({ id, key })}</script><script src="/assets/stats.js" type="module"></script>`,
  });
}

function adminPage() {
  return pageShell({
    title: 'Admin - Linksgood',
    body: `<main class="dashboard">
  <nav class="topbar compact"><a class="brand" href="/"><span class="brand-mark">lg</span><span>Linksgood</span></a><span class="nav-link active">Admin</span></nav>
  <section class="panel lead-panel">
    <span class="eyebrow">Control</span>
    <h1>Panel admin</h1>
    <div id="admin-summary" class="summary-grid"></div>
  </section>
  <section class="panel">
    <div class="panel-heading"><h2>Enlaces recientes</h2></div>
    <div id="admin-links" class="table-wrap"></div>
  </section>
  <section class="panel">
    <div class="panel-heading"><h2>Visitas recientes</h2></div>
    <div id="admin-visits" class="table-wrap"></div>
  </section>
</main>`,
    scripts: '<script src="/assets/admin.js" type="module"></script>',
  });
}

async function migrate() {
  const schema = await fs.readFile(path.join(__dirname, 'sql/schema.sql'), 'utf8');
  await pool.query(schema);
}

async function cleanupOldVisits() {
  await pool.query('DELETE FROM link_visits WHERE visited_at < now() - ($1::int * interval \'1 day\')', [RETENTION_DAYS]);
}

async function findLink(aliasPath) {
  const result = await pool.query('SELECT * FROM links WHERE alias_path = $1 AND active = true', [aliasPath]);
  return result.rows[0] || null;
}

function toPublicLink(row) {
  return {
    id: row.id,
    mode: row.mode,
    alias_path: row.alias_path,
    short_url: `${PUBLIC_URL}/${row.alias_path}`,
    stats_url: `${PUBLIC_URL}/stats/${row.id}`,
    target_url: row.target_url,
    target_host: row.target_host,
    owner_label: row.owner_label,
    meta_title: row.meta_title,
    meta_description: row.meta_description,
    meta_image: row.meta_image,
    clicks: row.clicks,
    created_at: row.created_at,
  };
}

async function createAlias(mode, customAlias) {
  if (customAlias) return `${mode === 'short' ? 's' : 'go'}/${sanitizeAlias(customAlias, mode)}`;
  for (let i = 0; i < 12; i += 1) {
    const alias = mode === 'short' ? `s/${randomShortCode(i > 7 ? 9 : 7)}` : `go/${randomLongPath()}`;
    const exists = await pool.query('SELECT 1 FROM links WHERE alias_path = $1', [alias]);
    if (!exists.rowCount) return alias;
  }
  throw new Error('No se pudo generar un alias único.');
}

async function handleCreateLink(req, res) {
  const payload = await readJson(req);
  const mode = payload.mode === 'long' ? 'long' : 'short';
  const parsed = normalizeUrl(payload.target_url);
  await assertPublicUrl(parsed);
  const aliasPath = await createAlias(mode, payload.custom_alias);
  const ownerKey = randomBytes(24).toString('base64url');
  const ownerKeyHash = hmac(`owner:${ownerKey}`);
  const id = randomUUID();
  const values = [
    id,
    aliasPath,
    mode,
    parsed.href,
    parsed.hostname,
    ownerKeyHash,
    cleanText(payload.owner_label, 80),
    cleanText(payload.meta_title, 140),
    cleanText(payload.meta_description, 240),
    cleanText(payload.meta_image, 700),
    clientIp(req),
    String(req.headers['user-agent'] || '').slice(0, 500),
  ];
  const result = await pool.query(
    `INSERT INTO links (
      id, alias_path, mode, target_url, target_host, owner_key_hash, owner_label,
      meta_title, meta_description, meta_image, created_ip, created_user_agent
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    RETURNING *`,
    values,
  );
  const row = result.rows[0];
  jsonResponse(res, 201, {
    ok: true,
    link: {
      ...toPublicLink(row),
      stats_url: `${PUBLIC_URL}/stats/${row.id}/${ownerKey}`,
    },
  });
}

async function validateRedirectChain(startUrl) {
  let current = startUrl;
  for (let i = 0; i < 4; i += 1) {
    const parsed = normalizeUrl(current);
    await assertPublicUrl(parsed);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    try {
      const response = await fetch(parsed.href, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'user-agent': 'LinksgoodPreview/1.0',
          accept: 'text/html,application/xhtml+xml',
        },
      });
      if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
        current = new URL(response.headers.get('location'), parsed.href).href;
        continue;
      }
      return response;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error('Demasiados redirects.');
}

function firstMatch(html, patterns) {
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return cleanText(match[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'"), 500);
  }
  return '';
}

async function fetchMetadata(targetUrl) {
  const parsed = normalizeUrl(targetUrl);
  await assertPublicUrl(parsed);
  if (/(^|\.)youtube\.com$/i.test(parsed.hostname) || /(^|\.)youtu\.be$/i.test(parsed.hostname)) {
    const oembed = new URL('https://www.youtube.com/oembed');
    oembed.searchParams.set('format', 'json');
    oembed.searchParams.set('url', parsed.href);
    const response = await validateRedirectChain(oembed.href);
    const data = await response.json();
    return {
      title: cleanText(data.title, 140),
      description: `Video de ${cleanText(data.author_name, 100)}`,
      image: cleanText(data.thumbnail_url, 700),
    };
  }
  const response = await validateRedirectChain(parsed.href);
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) return { title: parsed.hostname, description: '', image: '' };
  const reader = response.body.getReader();
  let received = 0;
  const chunks = [];
  while (received < MAX_HTML_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
  }
  const html = Buffer.concat(chunks).toString('utf8');
  return {
    title: firstMatch(html, [
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i,
      /<title[^>]*>([^<]+)/i,
    ]) || parsed.hostname,
    description: firstMatch(html, [
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i,
      /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i,
    ]),
    image: firstMatch(html, [
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    ]),
  };
}

async function handlePreview(req, res) {
  const payload = await readJson(req);
  const parsed = normalizeUrl(payload.target_url);
  const data = await fetchMetadata(parsed.href);
  jsonResponse(res, 200, { ok: true, preview: data });
}

async function handleVisit(req, res, id) {
  const linkResult = await pool.query('SELECT * FROM links WHERE id = $1 AND active = true', [id]);
  const link = linkResult.rows[0];
  if (!link) return jsonResponse(res, 404, { error: 'Enlace no encontrado.' });
  if (await isIpBlocked(publicIp(req))) return jsonResponse(res, 403, { error: 'Acceso denegado.' });
  const payload = await readJson(req);
  const browser = typeof payload.browser === 'object' && payload.browser ? payload.browser : {};
  await pool.query(
    `INSERT INTO link_visits (link_id, ip, public_ip, user_agent, referer, accept_language, browser, server)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      link.id,
      clientIp(req).slice(0, 80),
      publicIp(req).slice(0, 80),
      String(req.headers['user-agent'] || '').slice(0, 700),
      String(req.headers.referer || '').slice(0, 700),
      String(req.headers['accept-language'] || '').slice(0, 200),
      JSON.stringify(browser),
      JSON.stringify({
        host: req.headers.host || '',
        forwarded_proto: req.headers['x-forwarded-proto'] || '',
        cf_ray: req.headers['cf-ray'] || '',
      }),
    ],
  );
  await pool.query('UPDATE links SET clicks = clicks + 1, updated_at = now() WHERE id = $1', [link.id]);
  jsonResponse(res, 200, { ok: true, redirect: link.target_url });
}

async function isIpBlocked(ip) {
  if (!ip) return false;
  const result = await pool.query('SELECT 1 FROM blocked_ips WHERE ip = $1', [ip]);
  return result.rowCount > 0;
}

async function ownerStats(req, res, id, key) {
  const keyHash = hmac(`owner:${key}`);
  const linkResult = await pool.query('SELECT * FROM links WHERE id = $1 AND owner_key_hash = $2', [id, keyHash]);
  const link = linkResult.rows[0];
  if (!link) return jsonResponse(res, 404, { error: 'No encontrado.' });
  const visits = await pool.query(
    `SELECT id, visited_at, public_ip, ip, user_agent, referer, accept_language, browser
     FROM link_visits WHERE link_id = $1 ORDER BY visited_at DESC LIMIT 250`,
    [id],
  );
  jsonResponse(res, 200, { ok: true, link: toPublicLink(link), visits: visits.rows });
}

async function adminOverview(req, res) {
  if (!isAdmin(req)) return notFound(res);
  const [counts, links, visits] = await Promise.all([
    pool.query('SELECT (SELECT count(*) FROM links)::int AS links, (SELECT count(*) FROM link_visits)::int AS visits'),
    pool.query(`SELECT id, alias_path, mode, target_url, target_host, owner_label, clicks, created_ip, created_at
                FROM links ORDER BY created_at DESC LIMIT 120`),
    pool.query(`SELECT v.id, v.visited_at, v.public_ip, v.ip, v.user_agent, v.referer, v.accept_language, v.browser,
                       l.alias_path, l.owner_label, l.target_host
                FROM link_visits v JOIN links l ON l.id = v.link_id
                ORDER BY v.visited_at DESC LIMIT 180`),
  ]);
  jsonResponse(res, 200, { ok: true, counts: counts.rows[0], links: links.rows, visits: visits.rows });
}

async function blockIp(req, res) {
  if (!isAdmin(req)) return notFound(res);
  const payload = await readJson(req);
  const ip = cleanText(payload.ip, 80);
  if (!ip) return badRequest(res, 'Falta IP.');
  await pool.query(
    `INSERT INTO blocked_ips (ip, reason, blocked_by) VALUES ($1,$2,$3)
     ON CONFLICT (ip) DO UPDATE SET reason = excluded.reason, blocked_by = excluded.blocked_by`,
    [ip, cleanText(payload.reason, 200) || 'Bloqueo admin', clientIp(req)],
  );
  jsonResponse(res, 201, { ok: true });
}

async function adminShortcut(req, res) {
  if (!ADMIN_SECRET) return notFound(res);
  const payload = await readJson(req);
  const secret = String(payload.secret || '');
  if (!secret || secret.length > 200 || !timingSafeEqual(secret, ADMIN_SECRET)) {
    return jsonResponse(res, 403, { error: 'No autorizado.' });
  }
  setAdminCookie(req, res);
  jsonResponse(res, 200, { ok: true, redirect: '/admin' });
}

function timingSafeEqual(a, b) {
  const ah = hmac(`compare:${a}`);
  const bh = hmac(`compare:${b}`);
  return ah === bh;
}

async function serveStatic(req, res, pathname) {
  const name = pathname.replace('/assets/', '');
  if (!/^[A-Za-z0-9._-]+$/.test(name)) return notFound(res);
  const filePath = path.join(__dirname, 'public', name);
  try {
    const body = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, {
      'content-type': mimeTypes.get(ext) || 'application/octet-stream',
      'cache-control': 'public, max-age=3600',
    });
    res.end(body);
  } catch {
    notFound(res);
  }
}

async function handleRoute(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(url.pathname);
  try {
    if ((req.method === 'GET' || req.method === 'HEAD') && pathname === '/favicon.ico') return redirect(res, '/assets/favicon.svg');
    if (req.method === 'GET' && pathname.startsWith('/assets/')) return serveStatic(req, res, pathname);
    if (req.method === 'GET' && pathname === '/') return htmlResponse(res, 200, appPage());
    if (req.method === 'GET' && pathname === '/terminos') return htmlResponse(res, 200, legalPage('terms'));
    if (req.method === 'GET' && pathname === '/privacidad') return htmlResponse(res, 200, legalPage('privacy'));
    if (req.method === 'GET' && pathname === '/admin') return isAdmin(req) ? htmlResponse(res, 200, adminPage()) : notFound(res);
    if (req.method === 'GET' && pathname === '/api/health') return jsonResponse(res, 200, { ok: true, service: 'linksgood', database: 'postgresql', time: nowIso() });
    if (req.method === 'GET' && pathname === '/api/admin-eligible') return jsonResponse(res, 200, { eligible: isAdmin(req) });
    if (req.method === 'POST' && pathname === '/api/admin-shortcut') return adminShortcut(req, res);
    if (req.method === 'GET' && pathname === '/api/admin/overview') return adminOverview(req, res);
    if (req.method === 'POST' && pathname === '/api/admin/block-ip') return blockIp(req, res);
    if (req.method === 'POST' && pathname === '/api/links') return handleCreateLink(req, res);
    if (req.method === 'POST' && pathname === '/api/preview') return handlePreview(req, res);
    const ownerMatch = pathname.match(/^\/api\/owner\/([0-9a-f-]{36})\/([A-Za-z0-9_-]{20,80})$/);
    if (req.method === 'GET' && ownerMatch) return ownerStats(req, res, ownerMatch[1], ownerMatch[2]);
    const visitMatch = pathname.match(/^\/api\/visit\/([0-9a-f-]{36})$/);
    if (req.method === 'POST' && visitMatch) return handleVisit(req, res, visitMatch[1]);
    const statsMatch = pathname.match(/^\/stats\/([0-9a-f-]{36})\/([A-Za-z0-9_-]{20,80})$/);
    if (req.method === 'GET' && statsMatch) return htmlResponse(res, 200, statsPage(statsMatch[1], statsMatch[2]));
    if (req.method === 'GET' && (pathname.startsWith('/s/') || pathname.startsWith('/go/'))) {
      const alias = pathname.slice(1);
      const link = await findLink(alias);
      return link ? htmlResponse(res, 200, linkVisitPage(link)) : notFound(res);
    }
    return notFound(res);
  } catch (error) {
    const message = error?.message || 'Error interno.';
    if (message === 'BODY_TOO_LARGE') return badRequest(res, 'Solicitud demasiado grande.');
    if (message.includes('duplicate key')) return jsonResponse(res, 409, { error: 'Ese alias ya está en uso.' });
    if (message.includes('invalid input syntax')) return badRequest(res, 'Datos inválidos.');
    console.error(error);
    return jsonResponse(res, 500, { error: message.length < 180 ? message : 'Error interno.' });
  }
}

await migrate();
cleanupOldVisits().catch((error) => console.warn('cleanup failed', error));

createServer(handleRoute).listen(PORT, '0.0.0.0', () => {
  console.log(`Linksgood listening on ${PORT}`);
});
