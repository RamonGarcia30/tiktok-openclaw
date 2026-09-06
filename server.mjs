import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, readFile as readTextFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { randomBytes, createHash } from 'node:crypto';
import { URL } from 'node:url';

function loadEnv() {
  const envUrl = new URL('./.env', import.meta.url);
  if (!existsSync(envUrl)) return;
  const contents = requireText(envUrl);
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}

function requireText(fileUrl) {
  return requireTextCache.get(fileUrl.href) || '';
}

const requireTextCache = new Map();
if (existsSync(new URL('./.env', import.meta.url))) {
  const envText = await readTextFile(new URL('./.env', import.meta.url), 'utf8');
  requireTextCache.set(new URL('./.env', import.meta.url).href, envText);
}
loadEnv();

const PORT = Number(process.env.PORT || 3000);
const CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY;
const CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET;
const REDIRECT_URI = process.env.TIKTOK_REDIRECT_URI || `http://localhost:${PORT}/auth/tiktok/callback`;
const DATA_DIR = new URL('./.data/', import.meta.url);
const TOKEN_FILE = new URL('./.data/tiktok-token.json', import.meta.url);
const sessions = new Map();

function htmlPage(body, status = 200) {
  return { status, type: 'text/html; charset=utf-8', body: `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>OpenClaw TikTok Publisher</title><style>
:root{font-family:system-ui,sans-serif;color:#18202a;background:#f5f7fa}body{max-width:760px;margin:0 auto;padding:40px 22px;line-height:1.55}main{background:#fff;border:1px solid #dce2e8;border-radius:16px;padding:28px;box-shadow:0 8px 24px #16202a12}h1{font-size:clamp(2rem,6vw,3rem);line-height:1.05;margin:0 0 12px}h2{font-size:1.4rem;margin-top:30px}label{display:block;font-weight:650;margin-top:18px}input,select,button{box-sizing:border-box;width:100%;font:inherit;padding:11px 12px;border:1px solid #bbc5d0;border-radius:9px;margin-top:7px}button{background:#111827;color:#fff;border:0;cursor:pointer;font-weight:700;margin-top:22px}button:disabled{opacity:.55;cursor:wait}.muted{color:#566273}.status{margin-top:20px;padding:14px;border-radius:9px;background:#eef3f8;white-space:pre-wrap;overflow-wrap:anywhere}.ok{background:#e9f8ef;color:#14532d}.error{background:#fff0f0;color:#991b1b}.top{display:flex;justify-content:space-between;gap:16px;align-items:start}.top a{color:#0b63ce}.links{display:flex;gap:14px;flex-wrap:wrap;margin-top:28px;font-size:.95rem}code{background:#eef1f5;padding:2px 5px;border-radius:4px}
</style></head><body><main>${body}</main></body></html>` };
}

function send(res, result, extraHeaders = {}) {
  res.writeHead(result.status, { 'Content-Type': result.type, ...extraHeaders });
  res.end(result.body);
}

function redirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

async function readToken() {
  try { return JSON.parse(await readFile(TOKEN_FILE, 'utf8')); } catch { return null; }
}

async function saveToken(token) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(TOKEN_FILE, JSON.stringify(token, null, 2), { mode: 0o600 });
}

function requireConfig() {
  if (!CLIENT_KEY || !CLIENT_SECRET) throw new Error('Configure TIKTOK_CLIENT_KEY e TIKTOK_CLIENT_SECRET no arquivo .env.');
}

function pkceVerifier() { return randomBytes(48).toString('base64url'); }
// TikTok Login Kit for Desktop requires a hexadecimal SHA-256 PKCE challenge.
function pkceChallenge(verifier) { return createHash('sha256').update(verifier).digest('hex'); }

async function tiktok(path, token, body) {
  const response = await fetch(`https://open.tiktokapis.com${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify(body || {})
  });
  return { httpStatus: response.status, data: await response.json() };
}

async function homepage() {
  const token = await readToken();
  const connected = Boolean(token?.access_token);
  return htmlPage(`<div class="top"><div><h1>OpenClaw TikTok Publisher</h1><p class="muted">Demonstrador local para publicar imagens autorizadas diretamente no TikTok.</p></div>${connected ? '<a href="/logout">Desconectar</a>' : ''}</div>
${connected ? `<p class="status ok">Conta TikTok conectada.</p>
<form method="post" action="/publish" id="publish-form"><label for="image">URL pública verificada da imagem</label><input id="image" name="image" type="url" placeholder="https://ramongarcia30.github.io/tiktok-openclaw/imagem.jpg" required><img id="preview" alt="Prévia da imagem" style="display:none;max-width:100%;max-height:360px;margin-top:16px;border-radius:10px"><p class="muted">A URL precisa ser HTTPS, pública e estar dentro do prefixo verificado no TikTok.</p><p id="creator" class="muted">Consultando conta TikTok...</p><label for="title">Título</label><input id="title" name="title" maxlength="90" placeholder="Título da publicação" required><label for="description">Descrição</label><input id="description" name="description" maxlength="4000" placeholder="#arte #tiktok"><label for="privacy">Privacidade</label><select id="privacy" name="privacy" required><option value="" selected disabled>Selecione uma opção</option></select><label><input id="allow-comment" name="allow_comment" value="true" type="checkbox" style="width:auto;margin-right:8px"> Permitir comentários</label><label><input id="commercial" name="commercial" value="true" type="checkbox" style="width:auto;margin-right:8px"> Este conteúdo promove uma marca, produto ou serviço</label><div id="commercial-options" style="display:none"><label><input name="brand_organic" value="true" type="checkbox" style="width:auto;margin-right:8px"> Minha própria marca</label><label><input name="brand_content" value="true" type="checkbox" style="width:auto;margin-right:8px"> Marca de terceiros</label></div><label><input id="consent" name="consent" value="true" type="checkbox" style="width:auto;margin-right:8px" required> Ao publicar, concordo com a <a href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en" target="_blank" rel="noreferrer">Confirmação de Uso de Música do TikTok</a>.</label><button id="publish-button" type="submit" disabled>Publicar imagem diretamente</button></form><script>const image=document.getElementById('image'),preview=document.getElementById('preview'),form=document.getElementById('publish-form'),consent=document.getElementById('consent'),button=document.getElementById('publish-button'),commercial=document.getElementById('commercial'),options=document.getElementById('commercial-options');image.addEventListener('input',()=>{preview.src=image.value;preview.style.display=image.value?'block':'none'});commercial.addEventListener('change',()=>{options.style.display=commercial.checked?'block':'none'});consent.addEventListener('change',()=>{button.disabled=!consent.checked});fetch('/api/creator-info').then(r=>r.json()).then(({data,error})=>{if(error?.code!=='ok')throw Error(error.message);document.getElementById('creator').textContent='Conta conectada: @'+data.creator_username+' ('+data.creator_nickname+')';const select=document.getElementById('privacy');for(const value of data.privacy_level_options||[]){const option=document.createElement('option');option.value=value;option.textContent={PUBLIC_TO_EVERYONE:'Público',MUTUAL_FOLLOW_FRIENDS:'Amigos',FOLLOWER_OF_CREATOR:'Seguidores',SELF_ONLY:'Somente eu'}[value]||value;select.appendChild(option)}document.getElementById('allow-comment').disabled=Boolean(data.comment_disabled)}).catch(error=>{document.getElementById('creator').textContent='Não foi possível consultar as configurações da conta: '+error.message});</script>` : `<p>O login é feito pelo TikTok. O aplicativo só solicita as permissões configuradas e armazena o token localmente.</p><a href="/auth/tiktok"><button type="button">Conectar com TikTok</button></a>`}
<div class="links"><a href="/privacy.html">Privacidade</a><a href="/terms.html">Termos</a></div>`);
}

async function route(req, res) {
  const requestUrl = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (req.method === 'GET' && requestUrl.pathname === '/') return send(res, await homepage());
    if (req.method === 'GET' && requestUrl.pathname === '/auth/tiktok') {
      requireConfig();
      const state = randomBytes(24).toString('hex');
      const verifier = pkceVerifier();
      sessions.set(state, { verifier, createdAt: Date.now() });
      const auth = new URL('https://www.tiktok.com/v2/auth/authorize/');
      auth.search = new URLSearchParams({ client_key: CLIENT_KEY, response_type: 'code', scope: 'user.info.basic,video.publish', redirect_uri: REDIRECT_URI, state, code_challenge: pkceChallenge(verifier), code_challenge_method: 'S256' });
      return redirect(res, auth.toString());
    }
    if (req.method === 'GET' && requestUrl.pathname === '/auth/tiktok/callback') {
      requireConfig();
      const { code, state, error, error_description: errorDescription } = Object.fromEntries(requestUrl.searchParams);
      const session = sessions.get(state);
      sessions.delete(state);
      if (error) return send(res, htmlPage(`<h1>Autorização cancelada</h1><p>${errorDescription || error}</p><a href="/">Voltar</a>`, 400));
      if (!session || Date.now() - session.createdAt > 10 * 60 * 1000) throw new Error('Estado OAuth inválido ou expirado.');
      const response = await fetch('https://open.tiktokapis.com/v2/oauth/token/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_key: CLIENT_KEY, client_secret: CLIENT_SECRET, code, grant_type: 'authorization_code', redirect_uri: REDIRECT_URI, code_verifier: session.verifier }) });
      const token = await response.json();
      if (!response.ok || token.error) throw new Error(token.error_description || token.error || 'Não foi possível obter o token.');
      await saveToken(token);
      return redirect(res, '/');
    }
    if (req.method === 'GET' && requestUrl.pathname === '/api/creator-info') {
      const token = await readToken();
      if (!token?.access_token) return send(res, { status: 401, type: 'application/json; charset=utf-8', body: JSON.stringify({ error: { code: 'not_connected', message: 'Conta não conectada.' } }) });
      const creator = await tiktok('/v2/post/publish/creator_info/query/', token.access_token);
      return send(res, { status: creator.httpStatus, type: 'application/json; charset=utf-8', body: JSON.stringify(creator.data) });
    }
    if (req.method === 'GET' && requestUrl.pathname === '/logout') { try { await readFile(TOKEN_FILE); } catch {} return send(res, htmlPage('<h1>Desconectado</h1><p>Apague o arquivo local <code>.data/tiktok-token.json</code> para remover o token salvo.</p><a href="/">Voltar</a>')); }
    if (req.method === 'POST' && requestUrl.pathname === '/publish') {
      const raw = await new Promise((resolve, reject) => { let data = ''; req.on('data', chunk => { data += chunk; if (data.length > 100_000) reject(new Error('Formulário muito grande.')); }); req.on('end', () => resolve(data)); req.on('error', reject); });
      const form = new URLSearchParams(raw);
      const image = form.get('image');
      if (form.get('consent') !== 'true') throw new Error('É necessário confirmar a autorização antes de publicar.');
      const token = await readToken();
      if (!token?.access_token) return redirect(res, '/auth/tiktok');
      const creator = await tiktok('/v2/post/publish/creator_info/query/', token.access_token);
      if (creator.data?.error?.code !== 'ok') throw new Error(creator.data?.error?.message || 'Não foi possível consultar as configurações do criador.');
      const options = creator.data.data.privacy_level_options || [];
      const privacy = options.includes(form.get('privacy')) ? form.get('privacy') : options[0];
      const commercial = form.get('commercial') === 'true';
      const publish = await tiktok('/v2/post/publish/content/init/', token.access_token, { post_info: { title: form.get('title') || undefined, description: form.get('description') || undefined, privacy_level: privacy, disable_comment: form.get('allow_comment') !== 'true', auto_add_music: false, brand_content_toggle: commercial && form.get('brand_content') === 'true', brand_organic_toggle: commercial && form.get('brand_organic') === 'true' }, source_info: { source: 'PULL_FROM_URL', photo_cover_index: 0, photo_images: [image] }, post_mode: 'DIRECT_POST', media_type: 'PHOTO' });
      if (publish.data?.error?.code !== 'ok') throw new Error(publish.data?.error?.message || JSON.stringify(publish.data));
      return send(res, htmlPage(`<h1>Publicação enviada</h1><p class="status ok">O TikTok aceitou a solicitação de publicação.</p><p>Publish ID: <code>${publish.data.data.publish_id}</code></p><p class="muted">Em modo não auditado, o TikTok pode restringir a visibilidade da publicação.</p><a href="/">Publicar outra imagem</a>`));
    }
    if (req.method === 'GET' && (requestUrl.pathname === '/privacy.html' || requestUrl.pathname === '/terms.html' || requestUrl.pathname === '/index.html')) {
      const filename = requestUrl.pathname.slice(1);
      return send(res, { status: 200, type: 'text/html; charset=utf-8', body: await readFile(new URL(`./${filename}`, import.meta.url), 'utf8') });
    }
    return send(res, htmlPage('<h1>Não encontrado</h1><a href="/">Voltar</a>', 404));
  } catch (error) {
    return send(res, htmlPage(`<h1>Não foi possível continuar</h1><p class="status error">${String(error.message || error)}</p><a href="/">Voltar</a>`, 500));
  }
}

createServer(route).listen(PORT, () => console.log(`OpenClaw TikTok Publisher: http://localhost:${PORT}`));
