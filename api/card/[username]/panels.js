import {
  SECTION_DEFINITIONS,
  MANIFEST_TTL_SECONDS,
  MANIFEST_STALE_SECONDS,
  setVercelCacheHeaders,
  getRequestOrigin,
  coerceParam,
} from '../../_lib/card-renderer.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export default async function handler(req, res) {
  const sectionVersion = '11';
  const username = coerceParam(req.query.username);
  const format = coerceParam(req.query.format).toLowerCase();

  if (!username) {
    res.status(400).json({ error: 'Missing username' });
    return;
  }

  const baseUrl = `${getRequestOrigin(req)}/api/card/${encodeURIComponent(username)}`;
  const panels = SECTION_DEFINITIONS
    .filter((section) => section.id !== 'header')
    .map((section) => ({
      id: section.id,
      label: section.label,
      url: `${baseUrl}/${section.id}.png`,
    }));

  if (format === 'json') {
    setVercelCacheHeaders(res, MANIFEST_TTL_SECONDS, MANIFEST_STALE_SECONDS);
    res.status(200).json({ username, panels });
    return;
  }

  const generatedDate = new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>GitCard Panels · ${escapeHtml(username)}</title>
    <style>
      body{margin:0;background:#e5e7eb;font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:24px}
      .wrap{max-width:896px;margin:0 auto;background:#f8f9fa;border:1px solid rgba(209,213,219,.7);border-radius:40px;padding:24px;box-shadow:0 12px 40px -12px rgba(0,0,0,.1)}
      .charts{display:grid;grid-template-columns:1fr;gap:16px;margin-top:16px}
      img.panel{display:block;width:100%;height:auto;border:0;background:transparent}
      @media (min-width:900px){.charts{grid-template-columns:1fr 1fr}}
    </style>
  </head>
  <body>
    <main class="wrap">
      <section>
        <img class="panel" src="${baseUrl}/stats.png?v=${sectionVersion}" alt="Stats panel" />
      </section>
      <section style="margin-top:16px;">
        <img class="panel" src="${baseUrl}/activity.png?v=${sectionVersion}" alt="Contribution activity panel" />
      </section>
      <section class="charts">
        <article>
          <img class="panel" src="${baseUrl}/languages.png?v=${sectionVersion}" alt="Language distribution panel" />
        </article>
        <article>
          <img class="panel" src="${baseUrl}/repositories.png?v=${sectionVersion}" alt="Most starred repositories panel" />
        </article>
      </section>
      <footer style="display:flex;justify-content:space-between;gap:12px;align-items:center;color:#9ca3af;font-size:11px;text-transform:uppercase;letter-spacing:.1em;margin-top:14px;padding:6px 6px 0;">
        <span>wende/gitcard infographic</span>
        <span>Generated ${escapeHtml(generatedDate)}</span>
      </footer>
    </main>
  </body>
</html>`;

  setVercelCacheHeaders(res, MANIFEST_TTL_SECONDS, MANIFEST_STALE_SECONDS);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(html);
}
