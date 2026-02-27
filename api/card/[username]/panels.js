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

function sectionImageLink(href, label) {
  return `<a class="panel-link" href="${href}" target="_blank" rel="noreferrer noopener" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11 4"></path>
      <path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07L13 19"></path>
    </svg>
  </a>`;
}

export default async function handler(req, res) {
  const sectionVersion = '15';
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
  const statsLink = sectionImageLink(`${baseUrl}/stats.png`, 'Open stats panel image');
  const activityLink = sectionImageLink(`${baseUrl}/activity.png`, 'Open contribution activity image');
  const languagesLink = sectionImageLink(`${baseUrl}/languages.png`, 'Open language distribution image');
  const repositoriesLink = sectionImageLink(`${baseUrl}/repositories.png`, 'Open most starred repositories image');

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
      img.panel{display:block;width:100%;height:auto;border:0;background:transparent;opacity:0;transition:opacity .22s ease;position:relative;z-index:1}
      .panel-shell{position:relative}
      .panel-shell[data-loading="true"]{min-height:var(--panel-min-height,220px)}
      .panel-shell.is-loaded img.panel{opacity:1}
      .panel-loader{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:transparent;z-index:2;pointer-events:none}
      .panel-shell.is-loaded .panel-loader,.panel-shell.is-error .panel-loader{display:none}
      .spinner{width:26px;height:26px;border:2px solid #e2e8f0;border-top-color:#94a3b8;border-radius:999px;animation:spin .75s linear infinite}
      .panel-shell.is-error::after{content:'Failed to load';position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:12px;font-weight:500;letter-spacing:.02em}
      .panel-link{position:absolute;top:10px;right:10px;width:30px;height:30px;display:inline-flex;align-items:center;justify-content:center;border:1px solid #e5e7eb;border-radius:999px;background:#fff;color:#94a3b8;text-decoration:none;box-shadow:0 1px 2px rgba(15,23,42,.06);z-index:3}
      .panel-link:hover{background:#f8fafc;color:#64748b}
      .panel-link svg{width:14px;height:14px}
      @keyframes spin{to{transform:rotate(360deg)}}
      @media (min-width:900px){.charts{grid-template-columns:1fr 1fr}}
    </style>
  </head>
  <body>
    <main class="wrap">
      <section class="panel-shell" style="--panel-min-height:178px;" data-loading="true">
        ${statsLink}
        <div class="panel-loader" aria-hidden="true"><span class="spinner"></span></div>
        <img class="panel" src="${baseUrl}/stats.png?v=${sectionVersion}" alt="Stats panel" />
      </section>
      <section class="panel-shell" style="margin-top:16px;--panel-min-height:220px;" data-loading="true">
        ${activityLink}
        <div class="panel-loader" aria-hidden="true"><span class="spinner"></span></div>
        <img class="panel" src="${baseUrl}/activity.png?v=${sectionVersion}" alt="Contribution activity panel" />
      </section>
      <section class="charts">
        <article class="panel-shell" style="--panel-min-height:309px;" data-loading="true">
          ${languagesLink}
          <div class="panel-loader" aria-hidden="true"><span class="spinner"></span></div>
          <img class="panel" src="${baseUrl}/languages.png?v=${sectionVersion}" alt="Language distribution panel" />
        </article>
        <article class="panel-shell" style="--panel-min-height:309px;" data-loading="true">
          ${repositoriesLink}
          <div class="panel-loader" aria-hidden="true"><span class="spinner"></span></div>
          <img class="panel" src="${baseUrl}/repositories.png?v=${sectionVersion}" alt="Most starred repositories panel" />
        </article>
      </section>
      <footer style="display:flex;justify-content:space-between;gap:12px;align-items:center;color:#9ca3af;font-size:11px;text-transform:uppercase;letter-spacing:.1em;margin-top:14px;padding:6px 6px 0;">
        <span>wende/gitcard infographic</span>
        <span>Generated ${escapeHtml(generatedDate)}</span>
      </footer>
    </main>
    <script>
      (() => {
        const images = document.querySelectorAll('.panel-shell[data-loading="true"] img.panel');
        images.forEach((img) => {
          const shell = img.closest('.panel-shell[data-loading="true"]');
          if (!shell) return;

          const finish = (ok) => {
            shell.classList.remove('is-error');
            shell.classList.remove('is-loaded');
            if (ok) {
              shell.classList.add('is-loaded');
              return;
            }
            shell.classList.add('is-error');
          };

          if (img.complete) {
            finish(img.naturalWidth > 0);
            return;
          }

          img.addEventListener('load', () => finish(true), { once: true });
          img.addEventListener('error', () => finish(false), { once: true });
        });
      })();
    </script>
  </body>
</html>`;

  setVercelCacheHeaders(res, MANIFEST_TTL_SECONDS, MANIFEST_STALE_SECONDS);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(html);
}
