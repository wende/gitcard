import express from 'express';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { execFileSync } from 'node:child_process';

const app = express();
const PORT = process.env.PORT || 3000;
const RETINA_SCALE = 2;
const SECTION_TTL_SECONDS = 86400;
const SECTION_STALE_SECONDS = 86400;
const MANIFEST_TTL_SECONDS = 900;
const MANIFEST_STALE_SECONDS = 900;

const CUSTOM_PALETTE = [
  '#DBD4DC',
  '#C9D3C0',
  '#EFD9CC',
  '#D4E4F1',
  '#EBD8DC',
  '#D5D5D7',
  '#F6EBC8',
];

const SECTION_DEFINITIONS = [
  { id: 'header', label: 'Header', width: 832 },
  { id: 'stats', label: 'Stats', width: 832 },
  { id: 'activity', label: 'Contribution Activity', width: 832 },
  { id: 'languages', label: 'Language Distribution', width: 404 },
  { id: 'repositories', label: 'Most Starred Repositories', width: 404 },
];

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

// --- Element helper (React.createElement without React) ---
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

function getSectionDefinition(id) {
  return SECTION_DEFINITIONS.find((section) => section.id === id) || null;
}

function setVercelCacheHeaders(res, ttlSeconds, staleSeconds) {
  const edgePolicy = `public, max-age=${ttlSeconds}, stale-while-revalidate=${staleSeconds}`;
  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  res.setHeader('CDN-Cache-Control', edgePolicy);
  res.setHeader('Vercel-CDN-Cache-Control', edgePolicy);
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

function toIsoDate(date) {
  return date.toISOString().split('T')[0];
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

async function fetchContributionSeries(username, fromDate, toDate) {
  const fallback = buildDailySeries(fromDate, toDate);

  if (!GITHUB_TOKEN) {
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
      Authorization: `Bearer ${GITHUB_TOKEN}`,
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

function buildActivityDataUri(timeSeries) {
  const weekly = [];

  for (let i = 0; i < timeSeries.length; i += 7) {
    const week = timeSeries.slice(i, i + 7);
    const sum = week.reduce((acc, day) => acc + day.count, 0);
    weekly.push({ date: week[0].date, count: sum });
  }

  const width = 760;
  const height = 130;
  const paddingLeft = 10;
  const paddingRight = 35;
  const paddingTop = 10;
  const paddingBottom = 24;
  const graphWidth = width - paddingLeft - paddingRight;
  const graphHeight = height - paddingTop - paddingBottom;
  const maxCount = Math.max(...weekly.map((w) => w.count), 1);

  const points = weekly.map((w, i) => {
    const x = paddingLeft + (i / (weekly.length - 1)) * graphWidth;
    const y = paddingTop + graphHeight - (w.count / maxCount) * graphHeight;
    return { x, y };
  });

  let lineD = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i += 1) {
    const p0 = points[i - 1];
    const p1 = points[i];
    const xc = (p0.x + p1.x) / 2;
    lineD += ` C ${xc} ${p0.y}, ${xc} ${p1.y}, ${p1.x} ${p1.y}`;
  }

  const areaD = `${lineD} L ${paddingLeft + graphWidth} ${paddingTop + graphHeight} L ${paddingLeft} ${paddingTop + graphHeight} Z`;

  const yAxisSvg = [0, 0.5, 1].map((ratio) => {
    const y = paddingTop + graphHeight - (ratio * graphHeight);
    const value = Math.round(ratio * maxCount);
    return `
      <text x="${paddingLeft + graphWidth + 8}" y="${y + 4}" fill="#9ca3af" font-size="10" font-family="${FONT_STACK}" text-anchor="start">${value}</text>
      <line x1="${paddingLeft}" y1="${y}" x2="${paddingLeft + graphWidth}" y2="${y}" stroke="#f3f4f6" stroke-width="1" />
    `;
  }).join('');

  const numLabels = 6;
  const xAxisSvg = Array.from({ length: numLabels }).map((_, i) => {
    const index = Math.floor((i * (weekly.length - 1)) / (numLabels - 1));
    const point = points[index];
    const label = new Date(weekly[index].date).toLocaleDateString('en-US', { month: 'short' });
    return `<text x="${point.x}" y="${paddingTop + graphHeight + 18}" fill="#9ca3af" font-size="10" font-family="${FONT_STACK}" text-anchor="middle">${label}</text>`;
  }).join('');

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
      <defs>
        <linearGradient id="gradientArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#9ca3af" stop-opacity="0.15"/>
          <stop offset="100%" stop-color="#9ca3af" stop-opacity="0"/>
        </linearGradient>
      </defs>
      ${yAxisSvg}
      ${xAxisSvg}
      <path d="${areaD}" fill="url(#gradientArea)" />
      <path d="${lineD}" fill="none" stroke="#9ca3af" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  `;

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
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
  const activityUri = buildActivityDataUri(timeSeries);

  return e('div', { style: boxStyle() },
    e('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' } },
      e('span', { style: { fontSize: '14px', fontWeight: 500, color: '#1f2937', letterSpacing: '0.02em' } }, 'Contribution Activity'),
      e('span', { style: { fontSize: '10px', color: '#9ca3af', letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: 'monospace' } }, 'Last 365 Days'),
    ),
    e('img', {
      src: activityUri,
      width: 760,
      height: 130,
      style: { width: '100%', height: '130px' },
    }),
  );
}

function buildLanguageSection(stats) {
  const langEntries = Object.entries(stats.langCounts || {}).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const langTotal = langEntries.reduce((sum, [, value]) => sum + value, 0);
  const doughnutUri = langTotal > 0 ? buildDoughnutDataUri(stats.langCounts) : null;

  return e('div', { style: boxStyle() },
    e('span', { style: { fontSize: '14px', fontWeight: 500, color: '#1f2937', letterSpacing: '0.02em', marginBottom: '24px' } }, 'Language Distribution'),
    langEntries.length > 0
      ? e('div', { style: { display: 'flex', alignItems: 'center', gap: '26px' } },
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
      : e('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '170px', color: '#9ca3af', fontSize: '14px' } }, 'No language data available'),
  );
}

function buildRepositoriesSection(repos) {
  const topRepos = repos
    .filter((repo) => repo.stargazers_count > 0)
    .sort((a, b) => b.stargazers_count - a.stargazers_count)
    .slice(0, 5);

  if (topRepos.length === 0) {
    return e('div', { style: boxStyle() },
      e('span', { style: { fontSize: '14px', fontWeight: 500, color: '#1f2937', letterSpacing: '0.02em', marginBottom: '24px' } }, 'Most Starred Repositories'),
      e('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '170px', color: '#9ca3af', fontSize: '14px' } }, 'No starred repositories'),
    );
  }

  const maxStars = Math.max(...topRepos.map((repo) => repo.stargazers_count));
  const maxLog = Math.log10(maxStars || 1) || 1;

  return e('div', { style: boxStyle() },
    e('span', { style: { fontSize: '14px', fontWeight: 500, color: '#1f2937', letterSpacing: '0.02em', marginBottom: '16px' } }, 'Most Starred Repositories'),
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

      return e('div', {
        style: {
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-end',
          flex: 1,
          height: '100%',
        },
      },
      e('span', { style: { fontSize: '10px', color: '#6b7280', marginBottom: '8px', fontWeight: 500 } }, formatCompact(repo.stargazers_count)),
      e('div', {
        style: {
          width: '100%',
          maxWidth: '40px',
          height: `${heightPercent}%`,
          backgroundColor: '#f3f4f6',
          borderRadius: '12px 12px 0 0',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          paddingBottom: '10px',
        },
      },
      e('span', {
        style: {
          fontSize: '10px',
          color: '#6b7280',
          fontWeight: 600,
          letterSpacing: '0.08em',
          writingMode: 'vertical-rl',
          transform: 'rotate(180deg)',
        },
      }, repoName),
      ),
      e('span', {
        style: {
          marginTop: '8px',
          fontSize: '10px',
          color: '#6b7280',
          maxWidth: '60px',
          textAlign: 'center',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        },
      }, repoName),
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

async function renderSectionPng(sectionId, context) {
  const definition = getSectionDefinition(sectionId);
  if (!definition) throw new Error(`Unknown section: ${sectionId}`);

  const node = buildSectionNode(sectionId, context);
  if (!node) throw new Error(`Failed to build section: ${sectionId}`);

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

async function loadRenderContext(username) {
  const { profile, repos, stats, contributionSeries } = await fetchGitHubData(username);
  const avatarUri = await imageToDataUri(profile.avatar_url);
  const activitySeries = contributionSeries;

  return { profile, repos, stats, avatarUri, activitySeries };
}

function resolveGitHubToken() {
  const envToken = process.env.GITHUB_TOKEN?.trim();
  if (envToken) {
    console.log('Using GitHub token from GITHUB_TOKEN environment variable.');
    return envToken;
  }

  try {
    const ghToken = execFileSync('gh', ['auth', 'token'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();

    if (ghToken) {
      console.log('Using GitHub token from gh auth.');
      return ghToken;
    }
  } catch (_) {
    // No gh auth available; continue unauthenticated.
  }

  console.warn('No GitHub token detected (env or gh auth). Requests may hit API rate limits.');
  return null;
}

const GITHUB_TOKEN = resolveGitHubToken();

// --- Font Loading ---
let fonts = [];

async function loadFonts() {
  const results = await Promise.allSettled(
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
  );

  fonts = results
    .map((result, index) => {
      if (result.status === 'fulfilled') return result.value;

      const source = FONT_SOURCES[index];
      console.warn(`Font load failed for ${source.name} (${source.weight}) from ${source.url}: ${result.reason?.message || result.reason}`);
      return null;
    })
    .filter(Boolean);

  const hasInter = fonts.some((font) => font.name === 'Inter' && font.weight === 400);
  if (!hasInter) {
    throw new Error('Failed to load required Inter base font.');
  }

  console.log(`Fonts loaded successfully (${fonts.length}/${FONT_SOURCES.length})`);
}

// --- Image helpers ---
async function imageToDataUri(url) {
  const response = await fetch(url);
  const buffer = Buffer.from(await response.arrayBuffer());
  const type = response.headers.get('content-type') || 'image/png';
  return `data:${type};base64,${buffer.toString('base64')}`;
}

// --- GitHub Data Fetching ---
async function fetchGitHubData(username) {
  const headers = {
    'User-Agent': 'GitMetrics-Image-Generator',
    'Accept': 'application/vnd.github+json',
  };

  if (GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
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
    // Preserve N/A defaults if activity stats fail.
  }

  try {
    contributionSeries = await fetchContributionSeries(username, activityFrom, activityTo);
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

// --- API Endpoints ---
app.get('/api/card/:username/:sectionId.png', async (req, res) => {
  const { username, sectionId } = req.params;
  const section = getSectionDefinition(sectionId);

  if (!section) {
    res.status(404).json({
      error: 'Unknown section id',
      availableSections: SECTION_DEFINITIONS.map((s) => s.id),
    });
    return;
  }

  try {
    const context = await loadRenderContext(username);
    const rendered = await renderSectionPng(sectionId, context);

    res.setHeader('Content-Type', 'image/png');
    setVercelCacheHeaders(res, SECTION_TTL_SECONDS, SECTION_STALE_SECONDS);
    res.send(rendered.png);
  } catch (error) {
    console.error(`Error generating section ${sectionId}:`, error);
    res.status(500).json({ error: 'Failed to generate section image.' });
  }
});

app.get('/api/card/:username', async (req, res) => {
  const { username } = req.params;
  const includeInline = req.query.inline === '1' || req.query.inline === 'true';

  try {
    const context = await loadRenderContext(username);

    const renderedSections = await Promise.all(
      SECTION_DEFINITIONS.map((section) => renderSectionPng(section.id, context)),
    );

    const baseUrl = `${req.protocol}://${req.get('host')}/api/card/${encodeURIComponent(username)}`;

    setVercelCacheHeaders(res, MANIFEST_TTL_SECONDS, MANIFEST_STALE_SECONDS);
    res.json({
      username,
      generatedAt: new Date().toISOString(),
      sections: renderedSections.map((section) => ({
        id: section.id,
        label: section.label,
        width: section.width,
        height: section.height,
        url: `${baseUrl}/${section.id}.png`,
        ...(includeInline ? { dataUri: `data:image/png;base64,${section.png.toString('base64')}` } : {}),
      })),
    });
  } catch (error) {
    console.error('Error generating bento sections:', error);
    res.status(500).json({ error: 'Failed to generate bento section images. User may not exist or rate limits exceeded.' });
  }
});

// --- Start ---
loadFonts().then(() => {
  app.listen(PORT, () => {
    console.log(`GitMetrics Image Server running on http://localhost:${PORT}`);
    console.log(`Manifest: http://localhost:${PORT}/api/card/torvalds`);
    console.log(`Single section: http://localhost:${PORT}/api/card/torvalds/header.png`);
  });
}).catch((err) => {
  console.error('Failed to load fonts:', err);
  process.exit(1);
});
