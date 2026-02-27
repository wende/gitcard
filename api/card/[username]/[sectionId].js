import {
  SECTION_DEFINITIONS,
  SECTION_TTL_SECONDS,
  SECTION_STALE_SECONDS,
  createRenderContext,
  renderFullCardPng,
  renderPanelsPng,
  renderSectionPng,
  setVercelCacheHeaders,
  coerceParam,
  isUserNotFoundError,
} from '../../_lib/card-renderer.js';

export default async function handler(req, res) {
  const username = coerceParam(req.query.username);
  const rawSectionId = coerceParam(req.query.sectionId);
  const sectionId = rawSectionId.endsWith('.png') ? rawSectionId.slice(0, -4) : rawSectionId;

  if (!username || !sectionId) {
    res.status(400).json({ error: 'Missing username or section id' });
    return;
  }

  if (sectionId === 'panels') {
    try {
      const context = await createRenderContext(username);
      const rendered = await renderPanelsPng(context);

      res.setHeader('Content-Type', 'image/png');
      setVercelCacheHeaders(res, SECTION_TTL_SECONDS, SECTION_STALE_SECONDS);
      res.status(200).send(rendered.png);
    } catch (error) {
      console.error(`Error generating section ${sectionId}:`, error);
      if (isUserNotFoundError(error)) {
        res.status(404).json({ error: 'User not found' });
        return;
      }
      res.status(500).json({ error: 'Failed to generate section image.' });
    }
    return;
  }

  if (sectionId === 'full') {
    try {
      const context = await createRenderContext(username);
      const rendered = await renderFullCardPng(context);

      res.setHeader('Content-Type', 'image/png');
      setVercelCacheHeaders(res, SECTION_TTL_SECONDS, SECTION_STALE_SECONDS);
      res.status(200).send(rendered.png);
    } catch (error) {
      console.error(`Error generating section ${sectionId}:`, error);
      if (isUserNotFoundError(error)) {
        res.status(404).json({ error: 'User not found' });
        return;
      }
      res.status(500).json({ error: 'Failed to generate section image.' });
    }
    return;
  }

  const section = SECTION_DEFINITIONS.find((item) => item.id === sectionId);
  if (!section) {
    res.status(404).json({
      error: 'Unknown section id',
      availableSections: [...SECTION_DEFINITIONS.map((item) => item.id), 'panels', 'full'],
    });
    return;
  }

  try {
    const context = await createRenderContext(username);
    const rendered = await renderSectionPng(sectionId, context);

    res.setHeader('Content-Type', 'image/png');
    setVercelCacheHeaders(res, SECTION_TTL_SECONDS, SECTION_STALE_SECONDS);
    res.status(200).send(rendered.png);
  } catch (error) {
    console.error(`Error generating section ${sectionId}:`, error);
    if (isUserNotFoundError(error)) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.status(500).json({ error: 'Failed to generate section image.' });
  }
}
