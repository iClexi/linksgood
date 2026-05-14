import { createHmac, pbkdf2Sync, randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dns from 'node:dns/promises';
import net from 'node:net';
import { Pool } from 'pg';
import QRCode from 'qrcode';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number.parseInt(process.env.LINKS_PORT || '9827', 10);
const PUBLIC_URL = (process.env.LINKS_PUBLIC_URL || `http://127.0.0.1:${PORT}`).replace(/\/+$/, '');
const DATABASE_URL = process.env.LINKS_DATABASE_URL || '';
const APP_SECRET = process.env.LINKS_APP_SECRET || '';
const BRAND_NAME = 'Linksgood';
const AUTH_COOKIE = 'atajo_session';
const ASSET_VERSION = '20260514-linksgood-videodrop-red3';
const SESSION_TTL_SECONDS = Math.max(3600, Number.parseInt(process.env.LINKS_SESSION_TTL_SECONDS || '2592000', 10));
const PASSWORD_ITERATIONS = Math.max(120000, Number.parseInt(process.env.LINKS_PASSWORD_ITERATIONS || '210000', 10));
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

function validationError(message) {
  const error = new Error(message);
  error.code = 'VALIDATION_ERROR';
  return error;
}

function routeError(req, res, error) {
  if (res.headersSent) {
    console.error(error);
    res.destroy();
    return;
  }
  const message = error?.message || 'Error interno.';
  if (message === 'BODY_TOO_LARGE') return badRequest(res, 'Solicitud demasiado grande.');
  if (error?.code === 'VALIDATION_ERROR') return badRequest(res, message);
  if (error?.code === '23505') {
    if (error.constraint === 'links_alias_path_key') return jsonResponse(res, 409, { error: 'Ese alias ya está en uso.' });
    if (error.constraint === 'users_email_normalized_key') return jsonResponse(res, 409, { error: 'Ese correo ya está registrado.' });
    if (error.constraint === 'users_username_lower_idx') return jsonResponse(res, 409, { error: 'Ese usuario ya está en uso.' });
    return jsonResponse(res, 409, { error: 'Ese dato ya existe.' });
  }
  if (message.includes('duplicate key')) return jsonResponse(res, 409, { error: 'Ese alias ya está en uso.' });
  if (message.includes('invalid input syntax')) return badRequest(res, 'Datos inválidos.');
  console.error(error);
  return jsonResponse(res, 500, { error: message.length < 180 ? message : 'Error interno.' });
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

function setCookie(req, res, name, value, maxAge) {
  const secure = isSecureRequest(req) ? '; Secure' : '';
  res.setHeader('set-cookie', `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}`);
}

function clearCookie(res, name) {
  res.setHeader('set-cookie', `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function cleanUsername(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 40);
}

function validatePassword(value) {
  const password = String(value || '');
  if (password.length < 8) throw validationError('La contraseña debe tener al menos 8 caracteres.');
  if (password.length > 200) throw validationError('La contraseña es demasiado larga.');
  return password;
}

function passwordDigest(password, salt, iterations = PASSWORD_ITERATIONS) {
  return pbkdf2Sync(password, salt, iterations, 64, 'sha512').toString('hex');
}

function hashPassword(password) {
  const salt = randomBytes(18).toString('base64url');
  return {
    salt,
    iterations: PASSWORD_ITERATIONS,
    hash: passwordDigest(password, salt, PASSWORD_ITERATIONS),
  };
}

function compareDigest(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  return hmac(`compare:${a}`) === hmac(`compare:${b}`);
}

function verifyPassword(password, user) {
  const digest = passwordDigest(password, user.password_salt, Number(user.password_iterations || PASSWORD_ITERATIONS));
  return compareDigest(digest, user.password_hash);
}

function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    role: row.role,
    created_at: row.created_at,
  };
}

function describeUserAgent(userAgent = '') {
  const ua = String(userAgent);
  const lower = ua.toLowerCase();
  const device = /ipad|tablet/.test(lower) ? 'tablet' : /mobi|android|iphone/.test(lower) ? 'mobile' : 'desktop';
  const browser = /edg\//i.test(ua) ? 'Edge' :
    /chrome|chromium|crios/i.test(ua) ? 'Chrome' :
      /firefox|fxios/i.test(ua) ? 'Firefox' :
        /safari/i.test(ua) ? 'Safari' : 'Browser';
  const os = /windows/i.test(ua) ? 'Windows' :
    /android/i.test(ua) ? 'Android' :
      /iphone|ipad|ios/i.test(ua) ? 'iOS' :
        /mac os|macintosh/i.test(ua) ? 'macOS' :
          /linux/i.test(ua) ? 'Linux' : 'Sistema';
  return `${browser} · ${os} · ${device}`;
}

function sessionTokenHash(token) {
  return hmac(`session:${token}`);
}

async function createSession(req, res, user) {
  const token = randomBytes(32).toString('base64url');
  const session = {
    id: randomUUID(),
    token_hash: sessionTokenHash(token),
    ip: clientIp(req).slice(0, 80),
    user_agent: String(req.headers['user-agent'] || '').slice(0, 700),
  };
  await pool.query(
    `INSERT INTO user_sessions (id, user_id, token_hash, device_label, ip, user_agent, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6, now() + ($7::int * interval '1 second'))`,
    [session.id, user.id, session.token_hash, describeUserAgent(session.user_agent), session.ip, session.user_agent, SESSION_TTL_SECONDS],
  );
  setCookie(req, res, AUTH_COOKIE, token, SESSION_TTL_SECONDS);
  return session.id;
}

async function currentAuth(req) {
  const token = parseCookies(req.headers.cookie || '')[AUTH_COOKIE] || '';
  if (!token) return null;
  const result = await pool.query(
    `SELECT s.id AS session_id, s.created_at AS session_created_at, s.last_seen_at, s.expires_at,
            u.id, u.username, u.email, u.role, u.created_at
     FROM user_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()
     LIMIT 1`,
    [sessionTokenHash(token)],
  );
  const row = result.rows[0];
  if (!row) return null;
  await pool.query('UPDATE user_sessions SET last_seen_at = now(), ip = $2, user_agent = $3 WHERE id = $1', [
    row.session_id,
    clientIp(req).slice(0, 80),
    String(req.headers['user-agent'] || '').slice(0, 700),
  ]).catch(() => {});
  return {
    session_id: row.session_id,
    user: publicUser(row),
  };
}

function isAdmin(auth) {
  return auth?.user?.role === 'admin';
}

async function logUserEvent(auth, req, eventType, entityType = '', entityId = '', details = {}) {
  if (!auth?.user?.id) return;
  await pool.query(
    `INSERT INTO user_events (user_id, event_type, entity_type, entity_id, ip, user_agent, details)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      auth.user.id,
      eventType,
      entityType,
      entityId,
      clientIp(req).slice(0, 80),
      String(req.headers['user-agent'] || '').slice(0, 700),
      JSON.stringify(details),
    ],
  ).catch(() => {});
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

function parsePublicHttpUrl(value, message, baseUrl = '') {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const candidate = raw.startsWith('//') ? `https:${raw}` : raw;
  let parsed;
  try {
    parsed = baseUrl ? new URL(candidate, baseUrl) : new URL(candidate);
  } catch {
    throw validationError(message);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw validationError(message);
  if (parsed.username || parsed.password) throw validationError(message);
  if (parsed.href.length > 700) throw validationError('La URL de imagen es demasiado larga.');
  parsed.hash = '';
  return parsed;
}

async function cleanImageUrl(value, baseUrl = '') {
  const parsed = parsePublicHttpUrl(value, 'La imagen debe ser una URL pública http/https.', baseUrl);
  if (!parsed) return '';
  try {
    await assertPublicUrl(parsed);
  } catch {
    throw validationError('La imagen debe ser una URL pública http/https.');
  }
  return parsed.href;
}

function normalizeUrl(value) {
  let raw = String(value || '').trim();
  if (!raw) throw validationError('URL requerida.');
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw validationError('URL inválida.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw validationError('Sólo se permiten enlaces http/https.');
  if (parsed.username || parsed.password) throw validationError('No se permiten URLs con usuario o contraseña.');
  if (parsed.href.length > 2048) throw validationError('URL demasiado larga.');
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
    if (isPrivateIp(parsed.hostname)) throw validationError('No se permiten enlaces a redes privadas o locales.');
    return;
  }
  if (!parsed.hostname.includes('.')) throw validationError('El host del enlace no es válido.');
  const records = await dns.lookup(parsed.hostname, { all: true, verbatim: true });
  if (!records.length || records.some((record) => isPrivateIp(record.address))) {
    throw validationError('No se permiten enlaces a redes privadas o locales.');
  }
}

function sanitizeAlias(value, mode) {
  const raw = String(value || '').trim().replace(/^\/+/, '').replace(/\/+$/, '');
  if (!raw) return '';
  if (mode === 'short') {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{2,58}$/.test(raw)) {
      throw validationError('El alias corto debe tener 3-59 caracteres alfanuméricos, guion, punto o guion bajo.');
    }
    return raw;
  }
  if (raw.length > 180 || !/^[A-Za-z0-9][A-Za-z0-9._~=/+-]*$/.test(raw) || raw.includes('//')) {
    throw validationError('La ruta larga tiene caracteres inválidos o es demasiado extensa.');
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

function isPreviewCrawler(req) {
  const ua = String(req.headers['user-agent'] || '').toLowerCase();
  if (!ua) return false;
  return [
    'facebookexternalhit',
    'facebot',
    'twitterbot',
    'linkedinbot',
    'slackbot',
    'discordbot',
    'telegrambot',
    'whatsapp',
    'skypeuripreview',
    'pinterest',
    'embedly',
    'quora link preview',
    'vkshare',
    'applebot',
    'redditbot',
    'tumblr',
    'mastodon',
    'misskey',
    'line-poker',
  ].some((token) => ua.includes(token));
}

function jsonScript(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function linkPreviewPage(link) {
  const previewUrl = `${PUBLIC_URL}/${link.alias_path}`;
  const title = cleanText(link.meta_title || link.owner_label || link.target_host || BRAND_NAME, 140);
  const description = cleanText(link.meta_description || `Enlace creado con ${BRAND_NAME}.`, 240);
  const image = cleanText(link.meta_image, 700);
  const imageTags = image ? `
  <meta property="og:image" content="${escapeAttr(image)}">
  <meta property="og:image:secure_url" content="${escapeAttr(image)}">
  <meta property="og:image:alt" content="${escapeAttr(title)}">
  <meta name="twitter:image" content="${escapeAttr(image)}">` : '';
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeAttr(description)}">
  <link rel="canonical" href="${escapeAttr(previewUrl)}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="${escapeAttr(BRAND_NAME)}">
  <meta property="og:title" content="${escapeAttr(title)}">
  <meta property="og:description" content="${escapeAttr(description)}">
  <meta property="og:url" content="${escapeAttr(previewUrl)}">${imageTags}
  <meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">
  <meta name="twitter:title" content="${escapeAttr(title)}">
  <meta name="twitter:description" content="${escapeAttr(description)}">
</head>
<body>
  <main>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(description)}</p>
    <p><a href="${escapeAttr(link.target_url)}">Abrir enlace</a></p>
  </main>
</body>
</html>`;
}

function pageShell({ title, description = '', body, scripts = '', head = '' }) {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeAttr(description || 'Acorta, alarga, convierte a QR y administra enlaces con actividad visible.')}" />
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
    title: `${BRAND_NAME} - links rápidos, QR y actividad visible`,
    body: '<div id="root"></div>',
    scripts: `<script src="/assets/app.js?v=${ASSET_VERSION}" type="module"></script>`,
  });
}

function legalPage(kind) {
  const isTerms = kind === 'terms';
  return pageShell({
    title: isTerms ? `Términos - ${BRAND_NAME}` : `Privacidad - ${BRAND_NAME}`,
    body: `<main class="doc-page">
  <nav class="topbar compact"><a class="brand" href="/"><span class="brand-mark">LG</span><span>${BRAND_NAME}</span></a><a class="nav-link" href="/">Crear enlace</a></nav>
  <article class="doc">
    <span class="eyebrow">Legal</span>
    <h1>${isTerms ? 'Términos y condiciones' : 'Privacidad'}</h1>
    <p>${BRAND_NAME} permite crear enlaces cortos, rutas largas presentables y códigos QR que redirigen al destino configurado. No necesitas cuenta para usar la función principal; una cuenta sólo añade historial, sesiones y administración de tus enlaces.</p>
    <p>La promesa del servicio es simple: crear enlaces limpios, sin anuncios intrusivos y con actividad visible para el creador. Esa actividad existe para detectar alcance, errores, abuso o bots; no para espiar de forma oculta.</p>
    <h2>Uso permitido</h2>
    <p>Puedes usar ${BRAND_NAME} para documentos, clases, campañas personales, pruebas, QR impresos y enlaces que quieras recordar o compartir mejor. No se permite usarlo para phishing, robo de credenciales, acoso, doxxing, suplantación, malware, evasión de bloqueos o rastreo encubierto.</p>
    <h2>Datos de enlaces y QR</h2>
    <p>Cuando una persona abre un enlace o escanea un QR, el servidor puede registrar fecha, ruta, origen de la visita (link o QR), IP pública recibida por el proxy, user-agent, referrer, idioma aceptado y datos técnicos de entrega como host, protocolo reenviado o identificador del proxy.</p>
    <p>El dispositivo mostrado en paneles se infiere desde el user-agent cuando es posible. ${BRAND_NAME} no ejecuta una pantalla intermedia para capturar viewport, resolución, zona horaria, batería, sensores ni fingerprinting antes de redirigir.</p>
    <h2>Cuentas opcionales</h2>
    <p>Si te registras, guardamos usuario, email, contraseña hasheada, sesiones activas, IP/user-agent de sesión y el historial de enlaces creados mientras estabas logueado. Puedes seguir creando enlaces anónimos sin cuenta.</p>
    <h2>Preview social</h2>
    <p>Cuando pides detectar preview, ${BRAND_NAME} consulta metadatos públicos del destino, incluyendo title, description y og:image cuando existen. Si editas esos campos, se guardan para el preview del enlace creado.</p>
    <h2>Retención y control</h2>
    <p>La retención operativa por defecto es de ${RETENTION_DAYS} días, salvo ajustes administrativos. Los administradores pueden bloquear IPs abusivas y revisar actividad para mantener el servicio estable.</p>
    <h2>Responsabilidad</h2>
    <p>Quien crea y comparte un enlace debe hacerlo de forma transparente, proporcional y legal. Este texto es informativo y no sustituye asesoría legal profesional.</p>
  </article>
</main>`,
  });
}

function statsPage(id, key) {
  return pageShell({
    title: `Actividad del enlace - ${BRAND_NAME}`,
    body: `<main class="dashboard">
  <nav class="topbar compact"><a class="brand" href="/"><span class="brand-mark">LG</span><span>${BRAND_NAME}</span></a><a class="nav-link" href="/">Crear</a></nav>
  <section class="panel lead-panel">
    <span class="eyebrow">Actividad</span>
    <h1 id="stats-title">Cargando...</h1>
    <div id="stats-summary" class="summary-grid"></div>
  </section>
  <section class="panel">
    <div class="panel-heading"><h2>Visitas registradas</h2></div>
    <div id="visits" class="table-wrap"></div>
  </section>
</main>`,
    scripts: `<script>window.LINKSGOOD_STATS=${jsonScript({ id, key })}</script><script src="/assets/stats.js" type="module"></script>`,
  });
}

function adminPage() {
  return pageShell({
    title: `Admin - ${BRAND_NAME}`,
    body: `<main class="dashboard">
  <nav class="topbar compact"><a class="brand" href="/"><span class="brand-mark">LG</span><span>${BRAND_NAME}</span></a><a class="nav-link" href="/cuenta">Cuenta</a><span class="nav-link active">Admin</span></nav>
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

function accountPage() {
  return pageShell({
    title: `Cuenta - ${BRAND_NAME}`,
    body: `<main class="dashboard">
  <nav class="topbar compact"><a class="brand" href="/"><span class="brand-mark">LG</span><span>${BRAND_NAME}</span></a><a class="nav-link" href="/">Crear</a></nav>
  <section class="panel lead-panel">
    <span class="eyebrow">Cuenta</span>
    <h1 id="account-title">Cargando...</h1>
    <div id="account-summary" class="summary-grid"></div>
  </section>
  <section class="panel">
    <div class="panel-heading"><h2>Historial de enlaces</h2></div>
    <div id="account-history" class="table-wrap"></div>
  </section>
  <section class="panel">
    <div class="panel-heading"><h2>Sesiones y dispositivos</h2><button id="logout-all" class="secondary" type="button">Cerrar otras sesiones</button></div>
    <div id="account-sessions" class="table-wrap"></div>
  </section>
</main>`,
    scripts: '<script src="/assets/account.js" type="module"></script>',
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
    qr_url: `${PUBLIC_URL}/q/${row.alias_path}`,
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

function withOwnerUrls(row, ownerKey) {
  return {
    ...toPublicLink(row),
    stats_url: `${PUBLIC_URL}/stats/${row.id}/${ownerKey}`,
    qr_svg_url: `${PUBLIC_URL}/qr/${row.id}/${ownerKey}.svg`,
    qr_png_url: `${PUBLIC_URL}/qr/${row.id}/${ownerKey}.png`,
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

async function handleCreateLink(req, res, auth) {
  const payload = await readJson(req);
  const mode = payload.mode === 'long' ? 'long' : 'short';
  const parsed = normalizeUrl(payload.target_url);
  await assertPublicUrl(parsed);
  const hasCustomAlias = Boolean(String(payload.custom_alias || '').trim());
  const ownerKey = randomBytes(24).toString('base64url');
  const ownerKeyHash = hmac(`owner:${ownerKey}`);
  const id = randomUUID();
  let preview = {};
  if (!payload.meta_title || !payload.meta_description || !payload.meta_image) {
    preview = await fetchMetadata(parsed.href).catch(() => ({}));
  }
  const suppliedImage = cleanText(payload.meta_image, 700);
  let metaImage = '';
  if (suppliedImage) {
    metaImage = await cleanImageUrl(suppliedImage);
  } else if (preview.image) {
    metaImage = await cleanImageUrl(preview.image, parsed.href).catch(() => '');
  }
  let result;
  let lastInsertError;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const aliasPath = await createAlias(mode, hasCustomAlias ? payload.custom_alias : '');
    const values = [
      id,
      auth?.user?.id || null,
      aliasPath,
      mode,
      parsed.href,
      parsed.hostname,
      ownerKeyHash,
      cleanText(payload.owner_label, 80),
      cleanText(payload.meta_title || preview.title, 140),
      cleanText(payload.meta_description || preview.description, 240),
      metaImage,
      clientIp(req),
      String(req.headers['user-agent'] || '').slice(0, 500),
    ];
    try {
      result = await pool.query(
        `INSERT INTO links (
          id, user_id, alias_path, mode, target_url, target_host, owner_key_hash, owner_label,
          meta_title, meta_description, meta_image, created_ip, created_user_agent
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        RETURNING *`,
        values,
      );
      break;
    } catch (error) {
      lastInsertError = error;
      if (!hasCustomAlias && error?.code === '23505' && error.constraint === 'links_alias_path_key') continue;
      throw error;
    }
  }
  if (!result) throw lastInsertError || new Error('No se pudo crear el enlace.');
  const row = result.rows[0];
  await logUserEvent(auth, req, 'link_created', 'link', row.id, { mode, alias_path: row.alias_path, target_host: row.target_host });
  jsonResponse(res, 201, {
    ok: true,
    link: withOwnerUrls(row, ownerKey),
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
  const image = firstMatch(html, [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
  ]);
  let imageUrl = '';
  if (image) {
    try {
      imageUrl = parsePublicHttpUrl(image, 'Imagen inválida.', parsed.href)?.href || '';
    } catch {
      imageUrl = '';
    }
  }
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
    image: imageUrl,
  };
}

async function handlePreview(req, res) {
  const payload = await readJson(req);
  const parsed = normalizeUrl(payload.target_url);
  const data = await fetchMetadata(parsed.href);
  jsonResponse(res, 200, { ok: true, preview: data });
}

async function qrSvgResponse(res, text) {
  const svg = await QRCode.toString(text, {
    type: 'svg',
    margin: 1,
    color: {
      dark: '#050609',
      light: '#edf2f4',
    },
  });
  res.writeHead(200, {
    'content-type': 'image/svg+xml; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(svg);
}

async function qrPngResponse(res, text) {
  const png = await QRCode.toBuffer(text, {
    type: 'png',
    margin: 2,
    width: 1024,
    color: {
      dark: '#050609',
      light: '#edf2f4',
    },
  });
  res.writeHead(200, {
    'content-type': 'image/png',
    'content-disposition': 'attachment; filename="linksgood-qr.png"',
    'cache-control': 'no-store',
  });
  res.end(png);
}

async function ownerQr(req, res, id, key, format = 'svg') {
  const keyHash = hmac(`owner:${key}`);
  const result = await pool.query('SELECT * FROM links WHERE id = $1 AND owner_key_hash = $2', [id, keyHash]);
  const link = result.rows[0];
  if (!link) return notFound(res);
  const target = `${PUBLIC_URL}/q/${link.alias_path}`;
  return format === 'png' ? qrPngResponse(res, target) : qrSvgResponse(res, target);
}

async function accountQr(req, res, auth, id, format = 'svg') {
  if (!auth?.user?.id) return notFound(res);
  const result = await pool.query('SELECT * FROM links WHERE id = $1 AND user_id = $2', [id, auth.user.id]);
  const link = result.rows[0];
  if (!link) return notFound(res);
  const target = `${PUBLIC_URL}/q/${link.alias_path}`;
  return format === 'png' ? qrPngResponse(res, target) : qrSvgResponse(res, target);
}

async function recordDirectVisit(req, link, source = 'link') {
  await pool.query(
    `INSERT INTO link_visits (link_id, source, consented, ip, public_ip, user_agent, referer, accept_language, browser, server)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      link.id,
      source,
      false,
      clientIp(req).slice(0, 80),
      publicIp(req).slice(0, 80),
      String(req.headers['user-agent'] || '').slice(0, 700),
      String(req.headers.referer || '').slice(0, 700),
      String(req.headers['accept-language'] || '').slice(0, 200),
      JSON.stringify({}),
      JSON.stringify({
        host: req.headers.host || '',
        forwarded_proto: req.headers['x-forwarded-proto'] || '',
        cf_ray: req.headers['cf-ray'] || '',
        redirect: 'direct',
        source,
      }),
    ],
  );
  await pool.query('UPDATE links SET clicks = clicks + 1, updated_at = now() WHERE id = $1', [link.id]);
}

async function redirectToLink(req, res, link, source = 'link') {
  if (await isIpBlocked(publicIp(req))) return jsonResponse(res, 403, { error: 'Acceso denegado.' });
  if (req.method === 'GET') await recordDirectVisit(req, link, source);
  return redirect(res, link.target_url);
}

async function resolveLinkRequest(req, res, link, source = 'link') {
  if (req.method === 'GET' && isPreviewCrawler(req)) {
    return htmlResponse(res, 200, linkPreviewPage(link));
  }
  return redirectToLink(req, res, link, source);
}

async function isIpBlocked(ip) {
  if (!ip) return false;
  const result = await pool.query('SELECT 1 FROM blocked_ips WHERE ip = $1', [ip]);
  return result.rowCount > 0;
}

function formatVisit(row) {
  return {
    ...row,
    source: row.source || 'link',
    device: describeUserAgent(row.user_agent || ''),
  };
}

async function ownerStats(req, res, id, key) {
  const keyHash = hmac(`owner:${key}`);
  const linkResult = await pool.query('SELECT * FROM links WHERE id = $1 AND owner_key_hash = $2', [id, keyHash]);
  const link = linkResult.rows[0];
  if (!link) return jsonResponse(res, 404, { error: 'No encontrado.' });
  const visits = await pool.query(
    `SELECT id, visited_at, source, public_ip, ip, user_agent, referer, accept_language, browser
     FROM link_visits WHERE link_id = $1 ORDER BY visited_at DESC LIMIT 250`,
    [id],
  );
  const summary = await pool.query(
    `SELECT
       count(*)::int AS total,
       count(*) FILTER (WHERE source = 'qr')::int AS qr,
       count(*) FILTER (WHERE source <> 'qr')::int AS link
     FROM link_visits WHERE link_id = $1`,
    [id],
  );
  jsonResponse(res, 200, {
    ok: true,
    link: {
      ...toPublicLink(link),
      qr_svg_url: `${PUBLIC_URL}/qr/${link.id}/${key}.svg`,
      qr_png_url: `${PUBLIC_URL}/qr/${link.id}/${key}.png`,
    },
    summary: summary.rows[0],
    visits: visits.rows.map(formatVisit),
  });
}

async function adminOverview(req, res, auth) {
  if (!isAdmin(auth)) return notFound(res);
  const [counts, links, visits] = await Promise.all([
    pool.query('SELECT (SELECT count(*) FROM links)::int AS links, (SELECT count(*) FROM link_visits)::int AS visits, (SELECT count(*) FROM users)::int AS users'),
    pool.query(`SELECT l.id, l.alias_path, l.mode, l.target_url, l.target_host, l.owner_label, l.clicks, l.created_ip, l.created_at,
                       u.username AS owner_username
                FROM links l LEFT JOIN users u ON u.id = l.user_id
                ORDER BY l.created_at DESC LIMIT 120`),
    pool.query(`SELECT v.id, v.visited_at, v.source, v.public_ip, v.ip, v.user_agent, v.referer, v.accept_language, v.browser,
                       l.alias_path, l.owner_label, l.target_host
                FROM link_visits v JOIN links l ON l.id = v.link_id
                ORDER BY v.visited_at DESC LIMIT 180`),
  ]);
  jsonResponse(res, 200, { ok: true, counts: counts.rows[0], links: links.rows, visits: visits.rows.map(formatVisit) });
}

async function blockIp(req, res, auth) {
  if (!isAdmin(auth)) return notFound(res);
  const payload = await readJson(req);
  const ip = cleanText(payload.ip, 80);
  if (!ip) return badRequest(res, 'Falta IP.');
  await pool.query(
    `INSERT INTO blocked_ips (ip, reason, blocked_by) VALUES ($1,$2,$3)
     ON CONFLICT (ip) DO UPDATE SET reason = excluded.reason, blocked_by = excluded.blocked_by`,
    [ip, cleanText(payload.reason, 200) || 'Bloqueo admin', auth.user.email],
  );
  jsonResponse(res, 201, { ok: true });
}

async function handleRegister(req, res) {
  const payload = await readJson(req);
  const username = cleanUsername(payload.username);
  const email = cleanText(payload.email, 160);
  const emailNormalized = normalizeEmail(email);
  const password = validatePassword(payload.password);
  if (username.length < 2) return badRequest(res, 'El usuario debe tener al menos 2 caracteres.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNormalized)) return badRequest(res, 'Email inválido.');
  const digest = hashPassword(password);
  const user = await pool.query(
    `INSERT INTO users (id, username, email, email_normalized, password_hash, password_salt, password_iterations, created_ip, created_user_agent)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id, username, email, role, created_at`,
    [
      randomUUID(),
      username,
      email,
      emailNormalized,
      digest.hash,
      digest.salt,
      digest.iterations,
      clientIp(req).slice(0, 80),
      String(req.headers['user-agent'] || '').slice(0, 700),
    ],
  );
  const authUser = publicUser(user.rows[0]);
  await createSession(req, res, authUser);
  jsonResponse(res, 201, { ok: true, user: authUser });
}

async function handleLogin(req, res) {
  const payload = await readJson(req);
  const emailNormalized = normalizeEmail(payload.email);
  const password = String(payload.password || '');
  const result = await pool.query('SELECT * FROM users WHERE email_normalized = $1 LIMIT 1', [emailNormalized]);
  const user = result.rows[0];
  if (!user || !verifyPassword(password, user)) {
    return jsonResponse(res, 401, { error: 'Email o contraseña incorrectos.' });
  }
  const authUser = publicUser(user);
  await createSession(req, res, authUser);
  await logUserEvent({ user: authUser }, req, 'login');
  jsonResponse(res, 200, { ok: true, user: authUser });
}

async function handleLogout(req, res, auth) {
  if (auth?.session_id) {
    await pool.query('UPDATE user_sessions SET revoked_at = now() WHERE id = $1', [auth.session_id]);
  }
  clearCookie(res, AUTH_COOKIE);
  jsonResponse(res, 200, { ok: true });
}

async function handleMe(req, res, auth) {
  jsonResponse(res, 200, { ok: true, user: auth?.user || null });
}

async function accountHistory(req, res, auth) {
  if (!auth?.user?.id) return jsonResponse(res, 401, { error: 'Inicia sesión.' });
  const links = await pool.query(
    `SELECT l.*,
            count(v.id)::int AS total_visits,
            count(v.id) FILTER (WHERE v.source = 'qr')::int AS qr_visits,
            count(v.id) FILTER (WHERE v.source <> 'qr')::int AS link_visits
     FROM links l
     LEFT JOIN link_visits v ON v.link_id = l.id
     WHERE l.user_id = $1
     GROUP BY l.id
     ORDER BY l.created_at DESC
     LIMIT 150`,
    [auth.user.id],
  );
  jsonResponse(res, 200, {
    ok: true,
    links: links.rows.map((row) => ({
      ...toPublicLink(row),
      total_visits: row.total_visits,
      qr_visits: row.qr_visits,
      link_visits: row.link_visits,
      qr_svg_url: `${PUBLIC_URL}/api/account/links/${row.id}/qr.svg`,
      qr_png_url: `${PUBLIC_URL}/api/account/links/${row.id}/qr.png`,
    })),
  });
}

async function accountSessions(req, res, auth) {
  if (!auth?.user?.id) return jsonResponse(res, 401, { error: 'Inicia sesión.' });
  const sessions = await pool.query(
    `SELECT id, device_label, ip, user_agent, created_at, last_seen_at, expires_at,
            revoked_at, (id = $2) AS current
     FROM user_sessions
     WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
     ORDER BY last_seen_at DESC`,
    [auth.user.id, auth.session_id],
  );
  jsonResponse(res, 200, { ok: true, sessions: sessions.rows });
}

async function revokeSession(req, res, auth, sessionId) {
  if (!auth?.user?.id) return jsonResponse(res, 401, { error: 'Inicia sesión.' });
  await pool.query('UPDATE user_sessions SET revoked_at = now() WHERE id = $1 AND user_id = $2 AND id <> $3', [sessionId, auth.user.id, auth.session_id]);
  jsonResponse(res, 200, { ok: true });
}

async function logoutOtherSessions(req, res, auth) {
  if (!auth?.user?.id) return jsonResponse(res, 401, { error: 'Inicia sesión.' });
  await pool.query('UPDATE user_sessions SET revoked_at = now() WHERE user_id = $1 AND id <> $2 AND revoked_at IS NULL', [auth.user.id, auth.session_id]);
  jsonResponse(res, 200, { ok: true });
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
    const auth = await currentAuth(req);
    if (req.method === 'GET' && pathname === '/') return htmlResponse(res, 200, appPage());
    if (req.method === 'GET' && pathname === '/terminos') return htmlResponse(res, 200, legalPage('terms'));
    if (req.method === 'GET' && pathname === '/privacidad') return htmlResponse(res, 200, legalPage('privacy'));
    if (req.method === 'GET' && pathname === '/cuenta') return auth?.user ? htmlResponse(res, 200, accountPage()) : redirect(res, '/');
    if (req.method === 'GET' && pathname === '/admin') return isAdmin(auth) ? htmlResponse(res, 200, adminPage()) : notFound(res);
    if (req.method === 'GET' && pathname === '/api/health') return jsonResponse(res, 200, { ok: true, service: 'linksgood', database: 'postgresql', time: nowIso() });
    if (req.method === 'GET' && pathname === '/api/admin-eligible') return jsonResponse(res, 200, { eligible: isAdmin(auth) });
    if (req.method === 'GET' && pathname === '/api/auth/me') return handleMe(req, res, auth);
    if (req.method === 'POST' && pathname === '/api/auth/register') return handleRegister(req, res);
    if (req.method === 'POST' && pathname === '/api/auth/login') return handleLogin(req, res);
    if (req.method === 'POST' && pathname === '/api/auth/logout') return handleLogout(req, res, auth);
    if (req.method === 'GET' && pathname === '/api/account/history') return accountHistory(req, res, auth);
    if (req.method === 'GET' && pathname === '/api/account/sessions') return accountSessions(req, res, auth);
    if (req.method === 'POST' && pathname === '/api/account/sessions/logout-others') return logoutOtherSessions(req, res, auth);
    const revokeMatch = pathname.match(/^\/api\/account\/sessions\/([0-9a-f-]{36})\/revoke$/);
    if (req.method === 'POST' && revokeMatch) return revokeSession(req, res, auth, revokeMatch[1]);
    const accountQrMatch = pathname.match(/^\/api\/account\/links\/([0-9a-f-]{36})\/qr\.(svg|png)$/);
    if (req.method === 'GET' && accountQrMatch) return accountQr(req, res, auth, accountQrMatch[1], accountQrMatch[2]);
    if (req.method === 'GET' && pathname === '/api/admin/overview') return adminOverview(req, res, auth);
    if (req.method === 'POST' && pathname === '/api/admin/block-ip') return blockIp(req, res, auth);
    if (req.method === 'POST' && pathname === '/api/links') return handleCreateLink(req, res, auth);
    if (req.method === 'POST' && pathname === '/api/preview') return handlePreview(req, res);
    const ownerMatch = pathname.match(/^\/api\/owner\/([0-9a-f-]{36})\/([A-Za-z0-9_-]{20,80})$/);
    if (req.method === 'GET' && ownerMatch) return ownerStats(req, res, ownerMatch[1], ownerMatch[2]);
    const statsMatch = pathname.match(/^\/stats\/([0-9a-f-]{36})\/([A-Za-z0-9_-]{20,80})$/);
    if (req.method === 'GET' && statsMatch) return htmlResponse(res, 200, statsPage(statsMatch[1], statsMatch[2]));
    const ownerQrMatch = pathname.match(/^\/qr\/([0-9a-f-]{36})\/([A-Za-z0-9_-]{20,80})\.(svg|png)$/);
    if (req.method === 'GET' && ownerQrMatch) return ownerQr(req, res, ownerQrMatch[1], ownerQrMatch[2], ownerQrMatch[3]);
    if ((req.method === 'GET' || req.method === 'HEAD') && pathname.startsWith('/q/')) {
      const alias = pathname.slice(3);
      const link = await findLink(alias);
      return link ? resolveLinkRequest(req, res, link, 'qr') : notFound(res);
    }
    if ((req.method === 'GET' || req.method === 'HEAD') && (pathname.startsWith('/s/') || pathname.startsWith('/go/'))) {
      const alias = pathname.slice(1);
      const link = await findLink(alias);
      return link ? resolveLinkRequest(req, res, link) : notFound(res);
    }
    return notFound(res);
  } catch (error) {
    return routeError(req, res, error);
  }
}

await migrate();
cleanupOldVisits().catch((error) => console.warn('cleanup failed', error));

createServer((req, res) => {
  handleRoute(req, res).catch((error) => routeError(req, res, error));
}).listen(PORT, '0.0.0.0', () => {
  console.log(`${BRAND_NAME} listening on ${PORT}`);
});
