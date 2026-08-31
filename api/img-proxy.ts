// Same-origin image relay so the analytics dashboard can draw a remote news photo onto a <canvas>
// without tainting it (RSS image hosts don't send CORS headers). Fetches the upstream image
// server-side and re-serves the bytes with `Access-Control-Allow-Origin: *`.
//
// SSRF guards: http(s) only, private / link-local / loopback hosts blocked, response must be an
// `image/*` content-type (or sniff as a known image format), hard size cap and request timeout.
// The dashboard is auth-gated and the only caller; this is not a general-purpose proxy.

const BLOCKED_HOST =
  /^(localhost|0\.0\.0\.0|\[?::1\]?|127(\.\d{1,3}){3}|10(\.\d{1,3}){3}|192\.168(\.\d{1,3}){2}|169\.254(\.\d{1,3}){2}|172\.(1[6-9]|2\d|3[01])(\.\d{1,3}){2})$/i;

// Original hi-res article photos from the Israeli outlets run large — Globes/Cloudinary full-size
// frames are ~1.5 MB. 15 MB leaves generous headroom without opening a memory-abuse vector.
const MAX_BYTES = 15 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 12_000;

function setCors(res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

/** Sniffs the leading bytes for a known raster/vector image signature. News CDNs occasionally
 * serve a real JPEG/PNG with `application/octet-stream` or no `Content-Type` at all — without this
 * the relay would 415 a perfectly good original and the caller would fall back to a stock photo. */
function sniffImageType(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  // ISO-BMFF: AVIF / HEIC carry an `ftyp` box with a brand code at offset 8.
  if (buf.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buf.toString('ascii', 8, 12);
    if (brand.startsWith('avif') || brand.startsWith('avis')) return 'image/avif';
    if (brand.startsWith('heic') || brand.startsWith('heix') || brand.startsWith('mif1')) return 'image/heic';
  }
  if (buf[0] === 0x42 && buf[1] === 0x4d) return 'image/bmp';
  const head = buf.toString('utf8', 0, 256).trimStart().toLowerCase();
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return 'image/svg+xml';
  return null;
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
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    // Present as a real browser fetching an <img>: full UA, a same-origin Referer (defeats the
    // hotlink protection some Israeli news CDNs apply), and the Sec-Fetch-* / Accept-Language a
    // Chrome image request actually sends. `Accept: image/*,*/*` (no avif/webp preference) asks the
    // origin for its native encoding rather than a content-negotiated re-compress — keeps full
    // sharpness. This fetches publicly-published feed images, not paywalled or auth-gated content.
    const upstream = await fetch(target.toString(), {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        Accept: 'image/*,*/*;q=0.8',
        'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7',
        Referer: `${target.origin}/`,
        'Sec-Fetch-Dest': 'image',
        'Sec-Fetch-Mode': 'no-cors',
        'Sec-Fetch-Site': 'cross-site',
      },
    });

    if (!upstream.ok) {
      res.status(502).json({ error: `upstream ${upstream.status}` });
      return;
    }

    const buf = Buffer.from(await upstream.arrayBuffer());
    if (buf.length === 0) {
      res.status(502).json({ error: 'empty upstream body' });
      return;
    }
    if (buf.length > MAX_BYTES) {
      res.status(413).json({ error: 'image too large' });
      return;
    }
    // Guard against a truncated download (aborted stream, flaky CDN): if the origin declared a
    // length and we received fewer bytes, fail loudly so the caller retries — never cache a
    // half-decoded image at the edge.
    const declared = Number(upstream.headers.get('content-length') || 0);
    if (declared > 0 && buf.length < declared) {
      res.status(502).json({ error: `truncated: got ${buf.length} of ${declared}` });
      return;
    }

    const rawType = (upstream.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    let contentType = rawType.startsWith('image/') ? rawType : '';
    if (!contentType) {
      const sniffed = sniffImageType(buf);
      if (!sniffed) {
        res.status(415).json({ error: `not an image (content-type: ${rawType || 'none'})` });
        return;
      }
      contentType = sniffed;
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', String(buf.length));
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400');
    res.status(200).send(buf);
  } catch (err) {
    const msg = (err as Error)?.name === 'AbortError' ? `timeout after ${FETCH_TIMEOUT_MS}ms` : (err as Error)?.message ?? String(err);
    console.error('[api/img-proxy] fetch failed:', msg, '·', target.toString());
    res.status(502).json({ error: 'fetch failed', detail: msg });
  } finally {
    clearTimeout(timer);
  }
}
