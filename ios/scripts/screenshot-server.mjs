// Static-server + reverse-proxy used only for screenshot capture.
// Serves dist-web/ on / and proxies /api/* and /r/* to the prod SKB backend
// so the web bundle can talk to it without CORS.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', 'dist-web');
const UPSTREAM = 'https://skb-waitlist.azurewebsites.net';
const PORT = 8088;

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2', '.map': 'application/json' };

function serveStatic(req, res) {
  let p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  try {
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
    if (!fs.existsSync(p)) p = path.join(ROOT, 'index.html');
    const buf = fs.readFileSync(p);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'text/plain', 'Cache-Control': 'no-store' });
    res.end(buf);
  } catch {
    res.writeHead(404); res.end('404');
  }
}

async function proxy(req, res) {
  const upstream = UPSTREAM + req.url;
  const headers = { ...req.headers };
  delete headers['host'];
  delete headers['connection'];
  // Read the request body so we can forward it.
  const body = await new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(chunks.length ? Buffer.concat(chunks) : undefined));
    req.on('error', reject);
  });
  try {
    const r = await fetch(upstream, {
      method: req.method,
      headers,
      body: body && req.method !== 'GET' && req.method !== 'HEAD' ? body : undefined,
      redirect: 'manual',
    });
    // Forward all response headers, but strip "Secure" from Set-Cookie so the
    // browser will send it back to our HTTP-only localhost proxy.
    const setCookies = r.headers.getSetCookie?.() ?? [];
    const respHeaders = {};
    r.headers.forEach((v, k) => {
      if (k.toLowerCase() === 'set-cookie') return;
      respHeaders[k] = v;
    });
    res.writeHead(r.status, {
      ...respHeaders,
      ...(setCookies.length ? { 'set-cookie': setCookies.map((c) => c.replace(/;\s*Secure/gi, '').replace(/;\s*SameSite=None/gi, '; SameSite=Lax')) } : {}),
    });
    if (r.body) {
      Readable.fromWeb(r.body).pipe(res);
    } else {
      res.end();
    }
  } catch (e) {
    res.writeHead(502); res.end('proxy error: ' + e.message);
  }
}

http.createServer((req, res) => {
  if (req.url.startsWith('/api/') || req.url.startsWith('/r/')) {
    proxy(req, res).catch(e => { try { res.writeHead(500); res.end(String(e)); } catch {} });
  } else {
    serveStatic(req, res);
  }
}).listen(PORT, () => console.log('http://localhost:' + PORT));
