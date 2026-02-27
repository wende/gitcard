import {
  fetchCardData,
  MANIFEST_TTL_SECONDS,
  MANIFEST_STALE_SECONDS,
  setVercelCacheHeaders,
  getRequestOrigin,
  coerceParam,
} from '../_lib/card-renderer.js';

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

  try {
    const data = await fetchCardData(username);
    const baseUrl = `${getRequestOrigin(req)}/api/card/${encodeURIComponent(username)}`;

    if (format === 'json') {
      setVercelCacheHeaders(res, MANIFEST_TTL_SECONDS, MANIFEST_STALE_SECONDS);
      res.status(200).json({
        username,
        profile: data.profile,
        repos: data.repos,
        stats: data.stats,
        activitySeries: data.activitySeries,
      });
      return;
    }

    const profileName = escapeHtml(data.profile?.name || data.profile?.login || username);
    const profileLogin = escapeHtml(data.profile?.login || username);
    const profileBio = escapeHtml(data.profile?.bio || '');
    const profileCompany = escapeHtml(data.profile?.company || '');
    const profileLocation = escapeHtml(data.profile?.location || '');
    const avatarUrl = escapeHtml(data.profile?.avatar_url || '');
    const commits = data.stats?.commitsLastYear;
    const commitsLabel = typeof commits === 'number' ? commits.toLocaleString() : escapeHtml(commits ?? 'N/A');
    const stars = Number(data.stats?.totalStars || 0).toLocaleString();
    const repoCount = Number((data.repos || []).length || 0).toLocaleString();
    const followers = Number(data.profile?.followers || 0).toLocaleString();
    const generatedDate = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>GitCard · ${profileLogin}</title>
    <style>
      body{margin:0;background:#e5e7eb;font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:24px}
      .wrap{max-width:896px;margin:0 auto;background:#f8f9fa;border:1px solid rgba(209,213,219,.7);border-radius:40px;padding:24px;box-shadow:0 12px 40px -12px rgba(0,0,0,.1)}
      .box{background:#fff;border:1px solid #f3f4f6;border-radius:28px;padding:24px}
      .row{display:grid;grid-template-columns:1fr;gap:16px}
      .stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
      .charts{display:grid;grid-template-columns:1fr;gap:16px}
      .muted{color:#9ca3af}
      .meta{font-size:12px;color:#6b7280}
      .stat-label{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;font-weight:600}
      .stat-value{font-size:32px;line-height:1.1;color:#1f2937;font-weight:300}
      .title{font-size:14px;color:#1f2937;font-weight:600;letter-spacing:.02em;margin:0 0 10px}
      img.chart{display:block;width:100%;height:auto;border:0;background:transparent}
      @media (min-width:900px){
        .stats{grid-template-columns:repeat(4,minmax(0,1fr))}
        .charts{grid-template-columns:1fr 1fr}
      }
    </style>
  </head>
  <body>
    <main class="wrap">
      <section class="box" style="display:flex;justify-content:space-between;gap:20px;align-items:flex-start;flex-wrap:wrap;">
        <div style="display:flex;gap:16px;min-width:320px;">
          <img src="${avatarUrl}" alt="${profileLogin}" width="96" height="96" style="border-radius:999px;border:1px solid #f3f4f6;object-fit:cover;" />
          <div>
            <h1 style="margin:0 0 6px;font-size:34px;line-height:1.1;color:#111827;font-weight:500;letter-spacing:-.02em;">${profileName}</h1>
            <div class="muted" style="font-size:15px;">@${profileLogin}</div>
            ${profileBio ? `<p style="margin:10px 0 0;max-width:520px;color:#6b7280;font-size:14px;line-height:1.6;">${profileBio}</p>` : ''}
          </div>
        </div>
        <div class="meta" style="min-width:220px;line-height:1.8;">
          ${profileCompany ? `<div>${profileCompany}</div>` : ''}
          ${profileLocation ? `<div>${profileLocation}</div>` : ''}
        </div>
      </section>

      <section class="box stats" style="margin-top:16px;">
        <div><div class="stat-label">Contributions</div><div class="stat-value">${commitsLabel}</div></div>
        <div><div class="stat-label">Total Stars</div><div class="stat-value">${stars}</div></div>
        <div><div class="stat-label">Repositories</div><div class="stat-value">${repoCount}</div></div>
        <div><div class="stat-label">Followers</div><div class="stat-value">${followers}</div></div>
      </section>

      <section style="margin-top:16px;">
        <img class="chart" src="${baseUrl}/activity.png?v=${sectionVersion}" alt="Contribution activity chart" />
      </section>

      <section class="charts" style="margin-top:16px;">
        <article>
          <img class="chart" src="${baseUrl}/languages.png?v=${sectionVersion}" alt="Language distribution chart" />
        </article>
        <article>
          <img class="chart" src="${baseUrl}/repositories.png?v=${sectionVersion}" alt="Most starred repositories chart" />
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
  } catch (error) {
    console.error('Error generating card page:', error);
    res.status(500).json({ error: 'Failed to generate card page. User may not exist or rate limits exceeded.' });
  }
}
