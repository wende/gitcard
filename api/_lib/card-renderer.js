import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

const RETINA_SCALE = 2;
const FONT_STACK = 'Inter, Noto Sans, Noto Sans CJK SC, Noto Sans Symbols 2, Noto Color Emoji, sans-serif';

const FONT_SOURCES = [
  { name: 'Inter', weight: 300, url: 'https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-300-normal.woff' },
  { name: 'Inter', weight: 400, url: 'https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-400-normal.woff' },
  { name: 'Inter', weight: 500, url: 'https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-500-normal.woff' },
  { name: 'Inter', weight: 600, url: 'https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-600-normal.woff' },
  { name: 'Noto Sans', weight: 400, url: 'https://github.com/notofonts/noto-fonts/raw/main/hinted/ttf/NotoSans/NotoSans-Regular.ttf' },
  { name: 'Noto Sans', weight: 500, url: 'https://github.com/notofonts/noto-fonts/raw/main/hinted/ttf/NotoSans/NotoSans-Medium.ttf' },
  { name: 'Noto Sans', weight: 600, url: 'https://github.com/notofonts/noto-fonts/raw/main/hinted/ttf/NotoSans/NotoSans-SemiBold.ttf' },
  { name: 'Noto Sans CJK SC', weight: 400, url: 'https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf' },
  { name: 'Noto Sans Symbols 2', weight: 400, url: 'https://github.com/notofonts/noto-fonts/raw/main/unhinted/ttf/NotoSansSymbols2/NotoSansSymbols2-Regular.ttf' },
  { name: 'Noto Color Emoji', weight: 400, url: 'https://raw.githubusercontent.com/googlefonts/noto-emoji/main/fonts/Noto-COLRv1.ttf' },
];

const CUSTOM_PALETTE = [
  '#DBD4DC',
  '#C9D3C0',
  '#EFD9CC',
  '#D4E4F1',
  '#EBD8DC',
  '#D5D5D7',
  '#F6EBC8',
];

const LOWER_PANEL_HEIGHT = '309px';

export const SECTION_DEFINITIONS = [
  { id: 'header', label: 'Header', width: 832 },
  { id: 'stats', label: 'Stats', width: 832 },
  { id: 'activity', label: 'Contribution Activity', width: 832 },
  { id: 'languages', label: 'Language Distribution', width: 404 },
  { id: 'repositories', label: 'Most Starred Repositories', width: 404 },
];

export const SECTION_TTL_SECONDS = 86400;
export const SECTION_STALE_SECONDS = 86400;
export const MANIFEST_TTL_SECONDS = 900;
export const MANIFEST_STALE_SECONDS = 900;

let fontCache = null;
let fontPromise = null;

function e(type, props, ...children) {
  const flat = children.flat(Infinity).filter((c) => c != null && c !== false);
  return {
    type,
    props: {
      ...props,
      children: flat.length === 0 ? undefined : flat.length === 1 ? flat[0] : flat,
    },
  };
}

export function getSectionDefinition(id) {
  return SECTION_DEFINITIONS.find((section) => section.id === id) || null;
}

function toIsoDate(date) {
  return date.toISOString().split('T')[0];
}

function normalizeRenderableText(value) {
  if (value == null) return '';

  const raw = String(value);
  const wellFormed = typeof raw.toWellFormed === 'function' ? raw.toWellFormed() : raw;

  return wellFormed
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/[\u200D\uFE0E\uFE0F]/g, '')
    .replace(/\p{Extended_Pictographic}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatNum(value) {
  return typeof value === 'number' ? value.toLocaleString() : String(value);
}

function formatCompact(value) {
  if (typeof value !== 'number') return String(value);
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    compactDisplay: 'short',
  }).format(value);
}

function buildDailySeries(fromDate, toDate, countsByDate = new Map()) {
  const series = [];
  const cursor = new Date(Date.UTC(
    fromDate.getUTCFullYear(),
    fromDate.getUTCMonth(),
    fromDate.getUTCDate(),
  ));

  const end = new Date(Date.UTC(
    toDate.getUTCFullYear(),
    toDate.getUTCMonth(),
    toDate.getUTCDate(),
  ));

  while (cursor <= end) {
    const date = toIsoDate(cursor);
    series.push({
      date,
      count: Number(countsByDate.get(date) || 0),
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return series;
}

async function fetchContributionSeries(username, fromDate, toDate, token) {
  const fallback = buildDailySeries(fromDate, toDate);

  if (!token) {
    return fallback;
  }

  const query = `
    query($login: String!, $from: DateTime!, $to: DateTime!) {
      user(login: $login) {
        contributionsCollection(from: $from, to: $to) {
          contributionCalendar {
            weeks {
              contributionDays {
                date
                contributionCount
              }
            }
          }
        }
      }
    }
  `;

  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      'User-Agent': 'GitMetrics-Image-Generator',
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      query,
      variables: {
        login: username,
        from: fromDate.toISOString(),
        to: toDate.toISOString(),
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`GraphQL request failed (${response.status})`);
  }

  const payload = await response.json();
  if (payload.errors?.length) {
    throw new Error(payload.errors[0].message || 'GraphQL contribution query failed');
  }

  const days = payload?.data?.user?.contributionsCollection?.contributionCalendar?.weeks
    ?.flatMap((week) => week.contributionDays || []) || [];

  const fromIso = toIsoDate(fromDate);
  const toIso = toIsoDate(toDate);
  const countsByDate = new Map();

  for (const day of days) {
    if (!day?.date) continue;
    if (day.date < fromIso || day.date > toIso) continue;
    countsByDate.set(day.date, Number(day.contributionCount || 0));
  }

  return buildDailySeries(fromDate, toDate, countsByDate);
}

async function imageToDataUri(url) {
  const response = await fetch(url);
  const buffer = Buffer.from(await response.arrayBuffer());
  const type = response.headers.get('content-type') || 'image/png';
  return `data:${type};base64,${buffer.toString('base64')}`;
}

async function fetchGitHubData(username, token) {
  const headers = {
    'User-Agent': 'GitMetrics-Image-Generator',
    'Accept': 'application/vnd.github+json',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const userRes = await fetch(`https://api.github.com/users/${username}`, { headers });
  if (userRes.status === 404) throw new Error('User not found');
  if (!userRes.ok) throw new Error('GitHub API Error');
  const profile = await userRes.json();

  const reposRes = await fetch(`https://api.github.com/users/${username}/repos?per_page=100&sort=pushed`, { headers });
  const repos = reposRes.ok ? await reposRes.json() : [];

  const activityTo = new Date();
  activityTo.setUTCHours(23, 59, 59, 999);
  const activityFrom = new Date(activityTo);
  activityFrom.setUTCDate(activityFrom.getUTCDate() - 364);
  activityFrom.setUTCHours(0, 0, 0, 0);
  const dateString = toIsoDate(activityFrom);

  let commitsLastYear = 'N/A';
  let prsLastYear = 'N/A';
  let issuesLastYear = 'N/A';
  let contributionSeries = buildDailySeries(activityFrom, activityTo);

  try {
    const [commitsRes, prsRes, issuesRes] = await Promise.all([
      fetch(`https://api.github.com/search/commits?q=${encodeURIComponent(`author:${username} committer-date:>${dateString}`)}`, {
        headers: {
          ...headers,
          'Accept': 'application/vnd.github+json',
        },
      }),
      fetch(`https://api.github.com/search/issues?q=${encodeURIComponent(`author:${username} type:pr created:>${dateString}`)}`, { headers }),
      fetch(`https://api.github.com/search/issues?q=${encodeURIComponent(`author:${username} type:issue created:>${dateString}`)}`, { headers }),
    ]);

    if (commitsRes.ok) commitsLastYear = (await commitsRes.json()).total_count;
    if (prsRes.ok) prsLastYear = (await prsRes.json()).total_count;
    if (issuesRes.ok) issuesLastYear = (await issuesRes.json()).total_count;
  } catch (_) {
    // Keep default N/A values if these queries fail.
  }

  try {
    contributionSeries = await fetchContributionSeries(username, activityFrom, activityTo, token);
  } catch (error) {
    console.warn(`Failed to fetch contribution calendar for ${username}: ${error.message}`);
  }

  const totalStars = repos.reduce((sum, repo) => sum + repo.stargazers_count, 0);
  const totalForks = repos.reduce((sum, repo) => sum + repo.forks_count, 0);

  const langCounts = {};
  repos.forEach((repo) => {
    if (repo.language && !repo.fork) {
      langCounts[repo.language] = (langCounts[repo.language] || 0) + 1;
    }
  });

  return {
    profile,
    repos,
    stats: {
      totalStars,
      totalForks,
      langCounts,
      commitsLastYear,
      prsLastYear,
      issuesLastYear,
    },
    contributionSeries,
  };
}

function buildActivityChartModel(timeSeries) {
  const weekly = [];

  for (let i = 0; i < timeSeries.length; i += 7) {
    const week = timeSeries.slice(i, i + 7);
    const sum = week.reduce((acc, day) => acc + day.count, 0);
    weekly.push({ date: week[0].date, count: sum });
  }

  const width = 760;
  const height = 110;
  const paddingLeft = 10;
  const paddingRight = 10;
  const paddingTop = 8;
  const paddingBottom = 8;
  const graphWidth = width - paddingLeft - paddingRight;
  const graphHeight = height - paddingTop - paddingBottom;
  const maxCount = Math.max(...weekly.map((w) => w.count), 1);
  const divisor = Math.max(weekly.length - 1, 1);

  const points = weekly.map((w, i) => {
    const x = paddingLeft + (i / divisor) * graphWidth;
    const y = paddingTop + graphHeight - (w.count / maxCount) * graphHeight;
    return { x, y };
  });

  let lineD = '';
  if (points.length > 0) {
    lineD = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i += 1) {
      const p0 = points[i - 1];
      const p1 = points[i];
      const xc = (p0.x + p1.x) / 2;
      lineD += ` C ${xc} ${p0.y}, ${xc} ${p1.y}, ${p1.x} ${p1.y}`;
    }
  }

  const areaD = lineD
    ? `${lineD} L ${paddingLeft + graphWidth} ${paddingTop + graphHeight} L ${paddingLeft} ${paddingTop + graphHeight} Z`
    : '';

  const gridSvg = [0, 0.5, 1].map((ratio) => {
    const y = paddingTop + graphHeight - (ratio * graphHeight);
    return `<line x1="${paddingLeft}" y1="${y}" x2="${paddingLeft + graphWidth}" y2="${y}" stroke="#f3f4f6" stroke-width="1" />`;
  }).join('');

  const numLabels = 6;
  const xLabels = Array.from({ length: numLabels }).map((_, i) => {
    const index = Math.floor((i * (weekly.length - 1)) / (numLabels - 1));
    const date = weekly[index]?.date;
    if (!date) return '';
    return new Date(date).toLocaleDateString('en-US', { month: 'short' });
  });

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
      <defs>
        <linearGradient id="gradientArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#9ca3af" stop-opacity="0.15"/>
          <stop offset="100%" stop-color="#9ca3af" stop-opacity="0"/>
        </linearGradient>
      </defs>
      ${gridSvg}
      ${areaD ? `<path d="${areaD}" fill="url(#gradientArea)" />` : ''}
      ${lineD ? `<path d="${lineD}" fill="none" stroke="#9ca3af" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />` : ''}
    </svg>
  `;

  return {
    uri: `data:image/svg+xml,${encodeURIComponent(svg)}`,
    maxCount,
    xLabels,
  };
}

function buildDoughnutDataUri(langCounts) {
  const entries = Object.entries(langCounts || {}).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  if (total === 0) return null;

  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let cumulative = 0;

  const circles = entries.map(([name, value], index) => {
    const percent = value / total;
    const dashArray = `${percent * circumference} ${circumference}`;
    const dashOffset = -(cumulative * circumference);
    cumulative += percent;
    const color = CUSTOM_PALETTE[index % CUSTOM_PALETTE.length];

    return `<circle cx="50" cy="50" r="${radius}" fill="transparent" stroke="${color}" stroke-width="6" stroke-dasharray="${dashArray}" stroke-dashoffset="${dashOffset}" stroke-linecap="round" />`;
  }).join('');

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="144" height="144">
      <g transform="rotate(-90 50 50)">
        <circle cx="50" cy="50" r="${radius}" fill="transparent" stroke="#f3f4f6" stroke-width="6" />
        ${circles}
      </g>
    </svg>
  `;

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function boxStyle() {
  return {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: '32px',
    border: '1px solid #f3f4f6',
    padding: '32px',
    fontFamily: FONT_STACK,
  };
}

function buildHeaderSection(profile, avatarUri) {
  const displayName = normalizeRenderableText(profile.name || profile.login) || 'Unknown';
  const login = normalizeRenderableText(profile.login);
  const bio = normalizeRenderableText(profile.bio);
  const company = normalizeRenderableText(profile.company);
  const location = normalizeRenderableText(profile.location);
  const twitter = normalizeRenderableText(profile.twitter_username);

  return e('div', { style: boxStyle() },
    e('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '24px' } },
      e('div', {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '24px',
          flexGrow: 1,
          minWidth: 0,
          maxWidth: '500px',
        },
      },
      e('img', {
        src: avatarUri,
        width: 96,
        height: 96,
        style: { borderRadius: '50%', border: '1px solid #f3f4f6', objectFit: 'cover' },
      }),
      e('div', { style: { display: 'flex', flexDirection: 'column', minWidth: 0 } },
        e('span', { style: { fontSize: '30px', fontWeight: 500, color: '#111827', letterSpacing: '-0.025em' } }, displayName),
        login ? e('span', { style: { fontSize: '14px', color: '#9ca3af', fontWeight: 300, marginTop: '4px' } }, `@${login}`) : null,
        bio
          ? e('div', {
              style: {
                fontSize: '14px',
                color: '#6b7280',
                fontWeight: 300,
                marginTop: '12px',
                lineHeight: '1.6',
                width: '100%',
                maxWidth: '360px',
                wordBreak: 'break-word',
              },
            }, bio)
          : null,
      ),
      ),
      e('div', {
        style: {
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          borderLeft: '1px solid #f3f4f6',
          paddingLeft: '24px',
          fontSize: '12px',
          color: '#6b7280',
          fontWeight: 300,
          minWidth: '180px',
        },
      },
      company ? e('span', {}, company) : null,
      location ? e('span', {}, location) : null,
      twitter ? e('span', {}, `@${twitter}`) : null,
      ),
    ),
  );
}

function buildStatsSection(profile, repos, stats) {
  const cells = [
    { label: 'Contributions', value: stats.commitsLastYear },
    { label: 'Total Stars', value: stats.totalStars },
    { label: 'Repositories', value: repos.length },
    { label: 'Followers', value: profile.followers },
  ];

  return e('div', { style: boxStyle() },
    e('div', { style: { display: 'flex', gap: '16px' } },
      ...cells.map((cell, index) =>
        e('div', {
          style: {
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            paddingLeft: '8px',
            paddingRight: '8px',
            ...(index < cells.length - 1 ? { borderRight: '1px solid #f3f4f6' } : {}),
          },
        },
        e('span', {
          style: {
            fontSize: '11px',
            fontWeight: 500,
            color: '#9ca3af',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            marginBottom: '10px',
          },
        }, cell.label),
        e('span', { style: { fontSize: '34px', fontWeight: 300, color: '#1f2937', letterSpacing: '-0.025em' } }, formatNum(cell.value)),
        ),
      ),
    ),
  );
}

function buildActivitySection(timeSeries) {
  const activity = buildActivityChartModel(timeSeries);
  const yAxisValues = [activity.maxCount, Math.round(activity.maxCount / 2), 0];

  return e('div', { style: boxStyle() },
    e('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' } },
      e('span', { style: { fontSize: '14px', fontWeight: 500, color: '#1f2937', letterSpacing: '0.02em' } }, 'Contribution Activity'),
      e('span', { style: { fontSize: '10px', color: '#9ca3af', letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: 'monospace' } }, 'Last 365 Days'),
    ),
    e('div', { style: { display: 'flex', alignItems: 'flex-start', gap: '8px' } },
      e('div', { style: { display: 'flex', flexDirection: 'column', flex: 1 } },
        e('img', {
          src: activity.uri,
          width: 760,
          height: 110,
          style: { width: '100%', height: '110px' },
        }),
        e('div', {
          style: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: '6px',
            padding: '0 2px',
          },
        },
        ...activity.xLabels.map((label, index) => e('span', {
          key: `activity-month-${index}`,
          style: { fontSize: '10px', color: '#9ca3af' },
        }, label || '')),
        ),
      ),
      e('div', {
        style: {
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          height: '110px',
          width: '28px',
          padding: '2px 0',
        },
      },
      ...yAxisValues.map((value, index) => e('span', {
        key: `activity-y-${index}`,
        style: { fontSize: '10px', color: '#9ca3af' },
      }, String(value))),
      ),
    ),
  );
}

function buildLanguageSection(stats) {
  const langEntries = Object.entries(stats.langCounts || {}).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const langTotal = langEntries.reduce((sum, [, value]) => sum + value, 0);
  const doughnutUri = langTotal > 0 ? buildDoughnutDataUri(stats.langCounts) : null;

  return e('div', { style: { ...boxStyle(), height: LOWER_PANEL_HEIGHT } },
    e('span', { style: { fontSize: '14px', fontWeight: 500, color: '#1f2937', letterSpacing: '0.02em', marginBottom: '24px' } }, 'Language Distribution'),
    e('div', { style: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' } },
      langEntries.length > 0
        ? e('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '26px', width: '100%' } },
            e('div', { style: { display: 'flex', position: 'relative', width: '144px', height: '144px', flexShrink: 0 } },
              e('img', { src: doughnutUri, width: 144, height: 144 }),
              e('div', {
                style: {
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '144px',
                  height: '144px',
                },
              },
              e('span', { style: { fontSize: '24px', fontWeight: 300, color: '#1f2937' } }, String(langTotal)),
              e('span', { style: { fontSize: '10px', fontWeight: 500, color: '#9ca3af', letterSpacing: '0.08em', textTransform: 'uppercase' } }, 'Repos'),
              ),
            ),
            e('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px', width: '160px' } },
              ...langEntries.map(([name, value], index) =>
                e('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px' } },
                  e('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                    e('div', {
                      style: {
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: CUSTOM_PALETTE[index % CUSTOM_PALETTE.length],
                      },
                    }),
                    e('span', { style: { color: '#4b5563' } }, normalizeRenderableText(name) || 'Unknown'),
                  ),
                  e('span', { style: { color: '#9ca3af', fontWeight: 300 } }, `${Math.round((value / langTotal) * 100)}%`),
                ),
              ),
            ),
          )
        : e('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: '14px' } }, 'No language data available'),
    ),
  );
}

function buildRepositoriesSection(repos) {
  const topRepos = repos
    .filter((repo) => repo.stargazers_count > 0)
    .sort((a, b) => b.stargazers_count - a.stargazers_count)
    .slice(0, 5);

  if (topRepos.length === 0) {
    return e('div', { style: { ...boxStyle(), height: LOWER_PANEL_HEIGHT } },
      e('span', { style: { fontSize: '16px', fontWeight: 500, color: '#1f2937', letterSpacing: '0.02em', marginBottom: '24px' } }, 'Most Starred Repositories'),
      e('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '170px', color: '#9ca3af', fontSize: '15px' } }, 'No starred repositories'),
    );
  }

  const maxStars = Math.max(...topRepos.map((repo) => repo.stargazers_count));
  const maxLog = Math.log10(maxStars || 1) || 1;

  return e('div', { style: { ...boxStyle(), height: LOWER_PANEL_HEIGHT } },
    e('span', { style: { fontSize: '16px', fontWeight: 500, color: '#1f2937', letterSpacing: '0.02em', marginBottom: '16px' } }, 'Most Starred Repositories'),
    e('div', {
      style: {
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: '8px',
        height: '210px',
        paddingTop: '24px',
      },
    },
    ...topRepos.map((repo) => {
      const logStars = Math.log10(repo.stargazers_count || 1);
      const heightPercent = Math.max((logStars / maxLog) * 100, 25);
      const repoName = normalizeRenderableText(repo.name) || 'repo';
      const maxChars = 14;
      const repoLabel = repoName.length > maxChars ? `${repoName.slice(0, maxChars - 1)}…` : repoName;

      return e('div', {
        style: {
          flex: 1,
          height: '100%',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
        },
      },
      e('div', {
        style: {
          width: '100%',
          maxWidth: '40px',
          height: `${heightPercent}%`,
          position: 'relative',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
        },
      },
      e('div', {
        style: {
          position: 'absolute',
          left: 0,
          bottom: '100%',
          marginBottom: '6px',
          width: '100%',
          display: 'flex',
          justifyContent: 'center',
        },
      },
      e('span', {
        style: {
          fontSize: '12px',
          color: '#6b7280',
          fontWeight: 500,
          textAlign: 'center',
        },
      }, formatCompact(repo.stargazers_count)),
      ),
      e('div', {
        style: {
          width: '100%',
          height: '100%',
          backgroundColor: '#f3f4f6',
          borderRadius: '12px 12px 0 0',
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        },
      },
      e('div', {
        style: {
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        },
      },
      e('span', {
        style: {
          display: 'flex',
          fontSize: '10px',
          color: '#6b7280',
          fontWeight: 600,
          lineHeight: 1,
          whiteSpace: 'nowrap',
          transform: 'rotate(-90deg)',
          transformOrigin: 'center',
        },
      }, repoLabel),
      ),
      )),
      );
    }),
    ),
  );
}

function buildSectionNode(sectionId, context) {
  switch (sectionId) {
    case 'header':
      return buildHeaderSection(context.profile, context.avatarUri);
    case 'stats':
      return buildStatsSection(context.profile, context.repos, context.stats);
    case 'activity':
      return buildActivitySection(context.activitySeries);
    case 'languages':
      return buildLanguageSection(context.stats);
    case 'repositories':
      return buildRepositoriesSection(context.repos);
    default:
      return null;
  }
}

async function loadFonts() {
  if (fontCache) return fontCache;
  if (fontPromise) return fontPromise;

  fontPromise = Promise.allSettled(
    FONT_SOURCES.map(async ({ name, weight, url }) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      return {
        name,
        data: await response.arrayBuffer(),
        weight,
        style: 'normal',
      };
    }),
  ).then((results) => {
    const loaded = results
      .map((result, index) => {
        if (result.status === 'fulfilled') return result.value;

        const source = FONT_SOURCES[index];
        console.warn(`Font load failed for ${source.name} (${source.weight}) from ${source.url}: ${result.reason?.message || result.reason}`);
        return null;
      })
      .filter(Boolean);

    const hasInter = loaded.some((font) => font.name === 'Inter' && font.weight === 400);
    if (!hasInter) {
      throw new Error('Failed to load required Inter base font.');
    }

    fontCache = loaded;
    return fontCache;
  }).finally(() => {
    fontPromise = null;
  });

  return fontPromise;
}

export async function createRenderContext(username) {
  const { profile, repos, stats, activitySeries } = await fetchCardData(username);
  const avatarUri = await imageToDataUri(profile.avatar_url);

  return {
    profile,
    repos,
    stats,
    avatarUri,
    activitySeries,
  };
}

export async function fetchCardData(username) {
  const token = process.env.GITHUB_TOKEN?.trim() || null;
  const { profile, repos, stats, contributionSeries } = await fetchGitHubData(username, token);
  return {
    profile,
    repos,
    stats,
    activitySeries: contributionSeries,
  };
}

export async function renderSectionPng(sectionId, context) {
  const definition = getSectionDefinition(sectionId);
  if (!definition) throw new Error(`Unknown section: ${sectionId}`);

  const node = buildSectionNode(sectionId, context);
  if (!node) throw new Error(`Failed to build section: ${sectionId}`);

  const fonts = await loadFonts();
  const svg = await satori(node, {
    width: definition.width,
    fonts,
  });

  const renderer = new Resvg(svg, {
    fitTo: { mode: 'width', value: definition.width * RETINA_SCALE },
    background: 'transparent',
  });

  const rendered = renderer.render();
  return {
    id: sectionId,
    label: definition.label,
    width: rendered.width,
    height: rendered.height,
    png: Buffer.from(rendered.asPng()),
  };
}

export async function renderPanelsPng(context) {
  const panelIds = ['stats', 'activity', 'languages', 'repositories'];
  const [stats, activity, languages, repositories] = await Promise.all(
    panelIds.map((id) => renderSectionPng(id, context)),
  );

  const gap = 32;
  const footerHeight = 42;
  const lowerRowWidth = languages.width + gap + repositories.width;
  const width = Math.max(stats.width, activity.width, lowerRowWidth);
  const lowerRowHeight = Math.max(languages.height, repositories.height);
  const yContentBottom = stats.height + gap + activity.height + gap + lowerRowHeight;
  const height = yContentBottom + footerHeight;

  const toDataUri = (buffer) => `data:image/png;base64,${buffer.toString('base64')}`;
  const node = e('div', {
    style: {
      display: 'flex',
      flexDirection: 'column',
      width: `${width}px`,
      height: `${height}px`,
      fontFamily: FONT_STACK,
      backgroundColor: 'transparent',
    },
  },
  e('img', {
    src: toDataUri(stats.png),
    width: stats.width,
    height: stats.height,
    style: { width: `${stats.width}px`, height: `${stats.height}px`, alignSelf: 'center' },
  }),
  e('img', {
    src: toDataUri(activity.png),
    width: activity.width,
    height: activity.height,
    style: { width: `${activity.width}px`, height: `${activity.height}px`, alignSelf: 'center', marginTop: `${gap}px` },
  }),
  e('div', {
    style: {
      display: 'flex',
      width: '100%',
      height: `${lowerRowHeight}px`,
      marginTop: `${gap}px`,
      justifyContent: 'center',
      alignItems: 'center',
      gap: `${gap}px`,
    },
  },
  e('img', {
    src: toDataUri(languages.png),
    width: languages.width,
    height: languages.height,
    style: { width: `${languages.width}px`, height: `${languages.height}px` },
  }),
  e('img', {
    src: toDataUri(repositories.png),
    width: repositories.width,
    height: repositories.height,
    style: { width: `${repositories.width}px`, height: `${repositories.height}px` },
  }),
  ),
  e('div', {
    style: {
      display: 'flex',
      width: '100%',
      height: `${footerHeight}px`,
      justifyContent: 'center',
      alignItems: 'center',
    },
  },
  e('span', {
    style: {
      fontSize: '18px',
      fontWeight: 500,
      color: '#9ca3af',
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
    },
  }, 'wende/gitcard infographic'),
  ),
  );

  const fonts = await loadFonts();
  const svg = await satori(node, {
    width,
    height,
    fonts,
  });

  const renderer = new Resvg(svg, { background: 'transparent' });
  const rendered = renderer.render();
  return {
    id: 'panels',
    label: 'Panels',
    width: rendered.width,
    height: rendered.height,
    png: Buffer.from(rendered.asPng()),
  };
}

export function setVercelCacheHeaders(res, ttlSeconds, staleSeconds) {
  const edgePolicy = `public, max-age=${ttlSeconds}, stale-while-revalidate=${staleSeconds}`;
  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  res.setHeader('CDN-Cache-Control', edgePolicy);
  res.setHeader('Vercel-CDN-Cache-Control', edgePolicy);
}

export function getRequestOrigin(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const protoRaw = req.headers['x-forwarded-proto'];
  const proto = typeof protoRaw === 'string' ? protoRaw.split(',')[0].trim() : 'https';
  return `${proto}://${host}`;
}

export function coerceParam(value) {
  if (Array.isArray(value)) return value[0] || '';
  return value || '';
}
