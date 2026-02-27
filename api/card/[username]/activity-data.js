import {
  fetchCardData,
  setVercelCacheHeaders,
  MANIFEST_TTL_SECONDS,
  MANIFEST_STALE_SECONDS,
  coerceParam,
} from '../../_lib/card-renderer.js';

export default async function handler(req, res) {
  const username = coerceParam(req.query.username);

  if (!username) {
    res.status(400).json({ error: 'Missing username' });
    return;
  }

  try {
    const data = await fetchCardData(username);

    setVercelCacheHeaders(res, MANIFEST_TTL_SECONDS, MANIFEST_STALE_SECONDS);
    res.status(200).json({
      username,
      profile: data.profile,
      repos: data.repos,
      stats: data.stats,
      activitySeries: data.activitySeries,
    });
  } catch (error) {
    console.error(`Error fetching activity data for ${username}:`, error);
    res.status(500).json({ error: 'Failed to fetch activity data.' });
  }
}
