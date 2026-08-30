// Same-origin image relay so the analytics dashboard can draw a remote news photo onto a <canvas>
// without tainting it (RSS image hosts don't send CORS headers). Fetches the upstream image
// server-side and re-serves the bytes with `Access-Control-Allow-Origin: *`.
//
// SSRF guards: http(s) only, private / link-local / loopback hosts blocked, response must be an
// `image/*` content-type, hard size cap and request timeout. The dashboard is auth-gated and the
// only caller; this is not a general-purpose proxy.

const BLOCKED_HOST =
  /^(localhost|0\.0\.0\.0|\[?::1\]?|127(\.\d{1,3}){3}|10(\.\d{1,3}){3}|192\.168(\.\d{1,3}){2}|169\.254(\.\d{1,3}){2}|172\.(1[6-9]|2\d|3[01])(\.\d{1,3}){2})$/i;

const MAX_BYTES = 8 * 1024 * 1024;

function setCors(res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req: any, res: any) {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const raw =
    (typeof req.query?.url === 'string' && req.query.url) ||
    new URL(req.url ?? '/', 'http://localhost').searchParams.get('url');

  if (!raw) {
    res.status(400).json({ error: 'missing ?url' });
    return;
  }

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    res.status(400).json({ error: 'invalid url' });
    return;
  }

  if (target.protocol !== 'https:' && target.protocol !== 'http:') {
    res.status(400).json({ error: 'unsupported protocol' });
    return;
  }
  if (BLOCKED_HOST.test(target.hostname)) {
    res.status(403).json({ error: 'blocked host' });
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const upstream = await fetch(target.toString(), {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8',
      },
    });

    if (!upstream.ok) {
      res.status(502).json({ error: `upstream ${upstream.status}` });
      return;
    }
    const contentType = upstream.headers.get('content-type') ?? '';
    if (!contentType.startsWith('image/')) {
      res.status(415).json({ error: 'not an image' });
      return;
    }
    const buf = Buffer.from(await upstream.arrayBuffer());
    if (buf.length > MAX_BYTES) {
      res.status(413).json({ error: 'image too large' });
      return;
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400');
    res.status(200).send(buf);
  } catch (err) {
    console.error('[api/img-proxy] fetch failed:', (err as Error)?.message ?? err);
    res.status(502).json({ error: 'fetch failed' });
  } finally {
    clearTimeout(timer);
  }
}
