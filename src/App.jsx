import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Code, GitCommit, Github, MapPin, Star, Users } from 'lucide-react';

const CUSTOM_PALETTE = [
  '#DBD4DC',
  '#C9D3C0',
  '#EFD9CC',
  '#D4E4F1',
  '#EBD8DC',
  '#D5D5D7',
  '#F6EBC8',
];

const DEFAULT_USERNAME = 'torvalds';

const mockRepos = [
  { name: 'linux', stargazers_count: 172045 },
  { name: 'git', stargazers_count: 15400 },
  { name: 'libdc-for-dirk', stargazers_count: 8500 },
  { name: 'pesconvert', stargazers_count: 1200 },
  { name: 'test-tlb', stargazers_count: 1050 },
];

const profile = {
  avatar_url: 'https://avatars.githubusercontent.com/u/1024025?v=4',
  name: 'Linus Torvalds',
  login: 'torvalds',
  bio: 'Creator of Linux and Git. Just for fun.',
  company: 'Linux Foundation',
  location: 'Portland, OR',
};

const fallbackLangCounts = { C: 52, Makefile: 18, Shell: 15, 'C++': 10, Python: 5 };

function buildFallbackSeries(days = 365) {
  return Array.from({ length: days }, (_, i) => ({
    date: new Date(Date.now() - (days - i) * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0],
    count: 0,
  }));
}

function buildActivityChart(timeSeries) {
  const weekly = [];

  for (let i = 0; i < timeSeries.length; i += 7) {
    const week = timeSeries.slice(i, i + 7);
    const sum = week.reduce((acc, day) => acc + day.count, 0);
    weekly.push({ date: week[0].date, count: sum });
  }

  const width = 800;
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

  const yTicks = [0, 0.5, 1].map((ratio) => {
    const y = paddingTop + graphHeight - ratio * graphHeight;
    const value = Math.round(ratio * maxCount);
    return { ratio, y, value };
  });

  const numLabels = 6;
  const xLabels = Array.from({ length: numLabels }).map((_, i) => {
    const index = Math.floor((i * (weekly.length - 1)) / (numLabels - 1));
    const point = points[index];
    const label = new Date(weekly[index].date).toLocaleDateString('en-US', { month: 'short' });

    return { index, x: point.x, label };
  });

  return {
    width,
    height,
    lineD,
    areaD,
    yTicks,
    xLabels,
    paddingLeft,
    graphWidth,
  };
}

function buildDoughnutChart(langCounts) {
  const entries = Object.entries(langCounts).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((acc, [, value]) => acc + value, 0);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;

  let cumulativePercent = 0;
  const segments = entries.map(([name, value], index) => {
    const percent = value / total;
    const dashArray = `${percent * circumference} ${circumference}`;
    const dashOffset = -(cumulativePercent * circumference);
    cumulativePercent += percent;

    return {
      name,
      value,
      dashArray,
      dashOffset,
      color: CUSTOM_PALETTE[index % CUSTOM_PALETTE.length],
    };
  });

  return { entries, total, radius, segments };
}

export default function App() {
  const [runtimeProfile, setRuntimeProfile] = useState(profile);
  const [runtimeRepos, setRuntimeRepos] = useState(mockRepos);
  const [runtimeLangCounts, setRuntimeLangCounts] = useState(fallbackLangCounts);
  const [activitySeries, setActivitySeries] = useState(() => buildFallbackSeries());
  const [runtimeStats, setRuntimeStats] = useState({
    commitsLastYear: 3492,
    totalStars: 198241,
    repos: 7,
    followers: 215830,
  });

  useEffect(() => {
    let cancelled = false;

    const loadActivityData = async () => {
      try {
        const response = await fetch(`/api/card/${DEFAULT_USERNAME}/activity-data`);
        if (!response.ok) return;

        const payload = await response.json();
        if (cancelled) return;

        if (payload?.profile) {
          setRuntimeProfile(payload.profile);
        }

        if (Array.isArray(payload?.repos) && payload.repos.length > 0) {
          setRuntimeRepos(payload.repos);
        }

        if (payload?.stats?.langCounts && Object.keys(payload.stats.langCounts).length > 0) {
          setRuntimeLangCounts(payload.stats.langCounts);
        }

        if (Array.isArray(payload?.activitySeries) && payload.activitySeries.length > 0) {
          setActivitySeries(payload.activitySeries);
        }

        setRuntimeStats({
          commitsLastYear: payload?.stats?.commitsLastYear ?? 'N/A',
          totalStars: payload?.stats?.totalStars ?? 0,
          repos: Array.isArray(payload?.repos) ? payload.repos.length : 0,
          followers: payload?.profile?.followers ?? 0,
        });
      } catch (_) {
        // Keep static preview fallback values.
      }
    };

    loadActivityData();
    return () => {
      cancelled = true;
    };
  }, []);

  const dateLabel = useMemo(
    () =>
      new Date().toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
    []
  );

  const activityChart = useMemo(() => buildActivityChart(activitySeries), [activitySeries]);
  const doughnutChart = useMemo(() => buildDoughnutChart(runtimeLangCounts), [runtimeLangCounts]);

  const topRepos = useMemo(
    () =>
      [...runtimeRepos]
        .filter((repo) => repo.stargazers_count > 0)
        .sort((a, b) => b.stargazers_count - a.stargazers_count)
        .slice(0, 5),
    [runtimeRepos]
  );

  const maxStars = Math.max(...topRepos.map((repo) => repo.stargazers_count), 1);
  const maxLog = Math.log10(maxStars || 1);

  return (
    <div id="infographic-card" className="w-full max-w-[896px] bg-[#f8f9fa] rounded-[2.5rem] p-6 sm:p-8 flex flex-col gap-6 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.1)] border border-gray-200/60">
      <div className="bg-white rounded-[2rem] p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-8 border border-gray-100 shadow-sm">
        <div className="flex items-center gap-6">
          <img
            src={runtimeProfile.avatar_url}
            alt={runtimeProfile.name}
            className="w-24 h-24 rounded-full border border-gray-100 shadow-sm object-cover"
          />
          <div>
            <h2 className="text-3xl font-medium tracking-tight text-gray-900">{runtimeProfile.name}</h2>
            <span className="text-sm text-gray-400 font-light mt-1">@{runtimeProfile.login}</span>
            <p className="mt-3 text-sm text-gray-500 font-light max-w-md leading-relaxed">{runtimeProfile.bio}</p>
          </div>
        </div>

        <div className="flex flex-col gap-3 text-xs font-light text-gray-500 sm:border-l border-gray-50 sm:pl-6 py-2">
          <div className="flex items-center gap-2">
            <Code className="w-3.5 h-3.5 text-gray-300" />
            <span>{runtimeProfile.company}</span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="w-3.5 h-3.5 text-gray-300" />
            <span>{runtimeProfile.location}</span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-[2rem] p-6 sm:p-8 grid grid-cols-2 sm:grid-cols-4 gap-6 border border-gray-100 shadow-sm">
        <div className="flex flex-col items-start px-2">
          <div className="flex items-center gap-2 text-gray-400 mb-2">
            <GitCommit className="w-3.5 h-3.5" />
            <span className="text-[11px] font-medium tracking-wider uppercase">Contributions</span>
          </div>
          <span className="text-3xl font-light tracking-tight text-gray-800">
            {typeof runtimeStats.commitsLastYear === 'number' ? runtimeStats.commitsLastYear.toLocaleString() : runtimeStats.commitsLastYear}
          </span>
        </div>
        <div className="flex flex-col items-start px-2">
          <div className="flex items-center gap-2 text-gray-400 mb-2">
            <Star className="w-3.5 h-3.5" />
            <span className="text-[11px] font-medium tracking-wider uppercase">Total Stars</span>
          </div>
          <span className="text-3xl font-light tracking-tight text-gray-800">{runtimeStats.totalStars.toLocaleString()}</span>
        </div>
        <div className="flex flex-col items-start px-2">
          <div className="flex items-center gap-2 text-gray-400 mb-2">
            <BookOpen className="w-3.5 h-3.5" />
            <span className="text-[11px] font-medium tracking-wider uppercase">Repositories</span>
          </div>
          <span className="text-3xl font-light tracking-tight text-gray-800">{runtimeStats.repos.toLocaleString()}</span>
        </div>
        <div className="flex flex-col items-start px-2">
          <div className="flex items-center gap-2 text-gray-400 mb-2">
            <Users className="w-3.5 h-3.5" />
            <span className="text-[11px] font-medium tracking-wider uppercase">Followers</span>
          </div>
          <span className="text-3xl font-light tracking-tight text-gray-800">{runtimeStats.followers.toLocaleString()}</span>
        </div>
      </div>

      <div className="bg-white rounded-[2rem] p-6 sm:p-8 border border-gray-100 shadow-sm flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-gray-800 flex items-center gap-2 tracking-wide">Contribution Activity</h3>
          <span className="text-[10px] text-gray-400 font-mono tracking-widest uppercase">Last 365 Days</span>
        </div>
        <div className="h-32 w-full">
          <svg viewBox={`0 0 ${activityChart.width} ${activityChart.height}`} className="w-full h-full overflow-visible">
            <defs>
              <linearGradient id="gradientArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#9ca3af" stopOpacity="0.15" />
                <stop offset="100%" stopColor="#9ca3af" stopOpacity="0" />
              </linearGradient>
            </defs>

            {activityChart.yTicks.map((tick) => (
              <g key={tick.ratio}>
                <text
                  x={activityChart.paddingLeft + activityChart.graphWidth + 8}
                  y={tick.y + 4}
                  fill="#9ca3af"
                  fontSize="10"
                  fontFamily="Inter, sans-serif"
                  textAnchor="start"
                >
                  {tick.value}
                </text>
                <line
                  x1={activityChart.paddingLeft}
                  y1={tick.y}
                  x2={activityChart.paddingLeft + activityChart.graphWidth}
                  y2={tick.y}
                  stroke="#f3f4f6"
                  strokeWidth="1"
                />
              </g>
            ))}

            {activityChart.xLabels.map((item) => (
              <text
                key={item.index}
                x={item.x}
                y={114}
                fill="#9ca3af"
                fontSize="10"
                fontFamily="Inter, sans-serif"
                textAnchor="middle"
              >
                {item.label}
              </text>
            ))}

            <path d={activityChart.areaD} fill="url(#gradientArea)" />
            <path d={activityChart.lineD} fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="bg-white rounded-[2rem] p-6 sm:p-8 border border-gray-100 shadow-sm flex flex-col">
          <h3 className="text-sm font-medium text-gray-800 mb-6 flex items-center gap-2 tracking-wide">Language Distribution</h3>
          <div className="h-48 flex-grow">
            <div className="flex flex-col sm:flex-row items-center justify-center gap-8 h-full">
              <div className="relative w-36 h-36 flex-shrink-0">
                <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
                  <circle cx="50" cy="50" r={doughnutChart.radius} fill="transparent" stroke="#f3f4f6" strokeWidth="6" />
                  {doughnutChart.segments.map((segment) => (
                    <circle
                      key={segment.name}
                      cx="50"
                      cy="50"
                      r={doughnutChart.radius}
                      fill="transparent"
                      stroke={segment.color}
                      strokeWidth="6"
                      strokeDasharray={segment.dashArray}
                      strokeDashoffset={segment.dashOffset}
                      strokeLinecap="round"
                    />
                  ))}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center rotate-0">
                  <span className="text-2xl font-light text-gray-800">{doughnutChart.total}</span>
                  <span className="text-[10px] font-medium tracking-wide text-gray-400 uppercase">Repos</span>
                </div>
              </div>

              <div className="flex flex-col gap-2.5 w-full max-w-[160px]">
                {doughnutChart.entries.map(([name, value], index) => (
                  <div key={name} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: CUSTOM_PALETTE[index % CUSTOM_PALETTE.length] }}
                      />
                      <span className="text-gray-600 truncate max-w-[90px]">{name}</span>
                    </div>
                    <span className="text-gray-400 font-light">{Math.round((value / doughnutChart.total) * 100)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-[2rem] p-6 sm:p-8 border border-gray-100 shadow-sm flex flex-col">
          <h3 className="text-sm font-medium text-gray-800 mb-2 flex items-center gap-2 tracking-wide">Most Starred Repositories</h3>
          <div className="h-56 flex-grow">
            <div className="flex items-end justify-between h-56 pt-8 gap-2 w-full px-1">
              {topRepos.map((repo) => {
                const logStars = Math.log10(repo.stargazers_count || 1);
                const heightPercent = Math.max((logStars / maxLog) * 100, 25);
                const formattedStars = Intl.NumberFormat('en-US', {
                  notation: 'compact',
                  compactDisplay: 'short',
                }).format(repo.stargazers_count);

                return (
                  <div key={repo.name} className="flex flex-col items-center flex-1 relative h-full justify-end">
                    <div className="w-full max-w-[40px] h-full flex items-end justify-center relative">
                      <div
                        className="absolute w-full text-center text-[10px] text-gray-500 font-medium z-10"
                        style={{ bottom: `calc(${heightPercent}% + 6px)` }}
                      >
                        {formattedStars}
                      </div>

                      <div
                        className="w-full bg-gray-100 rounded-t-lg flex flex-col justify-end items-center pb-3 overflow-hidden"
                        style={{ height: `${heightPercent}%` }}
                      >
                        <span
                          className="text-[11px] font-semibold text-gray-500 tracking-wider"
                          style={{
                            writingMode: 'vertical-rl',
                            transform: 'rotate(180deg)',
                            maxHeight: '100%',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {repo.name}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 pt-2 flex justify-between items-center text-[10px] text-gray-400 uppercase tracking-widest font-medium">
        <span className="flex items-center gap-1.5">
          <Github className="w-3 h-3" /> GitMetrics Infographic
        </span>
        <span>Generated {dateLabel}</span>
      </div>
    </div>
  );
}
