import express from 'express';
import cardPageHandler from '../api/card/[username].js';
import sectionHandler from '../api/card/[username]/[sectionId].js';
import panelsHandler from '../api/card/[username]/panels.js';
import activityDataHandler from '../api/card/[username]/activity-data.js';

const app = express();
const port = Number(process.env.PORT || 3000);

app.disable('x-powered-by');

app.use((req, _res, next) => {
  if (!req.headers['x-forwarded-host']) {
    req.headers['x-forwarded-host'] = req.headers.host || `localhost:${port}`;
  }
  if (!req.headers['x-forwarded-proto']) {
    req.headers['x-forwarded-proto'] = 'http';
  }
  next();
});

function asVercelLike(handler, queryFromParams = () => ({})) {
  return async (req, res) => {
    req.query = {
      ...(req.query || {}),
      ...queryFromParams(req.params || {}),
    };

    try {
      await handler(req, res);
    } catch (error) {
      console.error('[dev-api] Unhandled route error:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal dev API error' });
      }
    }
  };
}

app.get('/api/card/:username/activity-data', asVercelLike(activityDataHandler, (params) => ({
  username: params.username,
})));

app.get('/api/card/:username/panels', asVercelLike(panelsHandler, (params) => ({
  username: params.username,
})));

app.get('/api/card/:username/:sectionId.png', asVercelLike(sectionHandler, (params) => ({
  username: params.username,
  sectionId: `${params.sectionId}.png`,
})));

app.get('/api/card/:username/:sectionId', asVercelLike(sectionHandler, (params) => ({
  username: params.username,
  sectionId: params.sectionId,
})));

app.get('/api/card/:username/', asVercelLike(cardPageHandler, (params) => ({
  username: params.username,
})));

app.get('/api/card/:username', asVercelLike(cardPageHandler, (params) => ({
  username: params.username,
})));

app.listen(port, () => {
  console.log(`[dev-api] Listening on http://localhost:${port}`);
});
