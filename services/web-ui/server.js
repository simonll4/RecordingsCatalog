import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const SESSION_STORE_URL = process.env.SESSION_STORE_URL ?? 'http://localhost:8080';

const forwardParams = (targetUrl, sourceQuery, keys) => {
  for (const key of keys) {
    const value = sourceQuery[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      targetUrl.searchParams.set(key, value);
    }
  }
};

const forwardRangeParams = (targetUrl, sourceQuery) => {
  forwardParams(targetUrl, sourceQuery, ['from', 'to', 'limit']);
};

const forwardListParams = (targetUrl, sourceQuery) => {
  forwardParams(targetUrl, sourceQuery, ['limit']);
};

const forwardClipParams = (targetUrl, sourceQuery) => {
  forwardParams(targetUrl, sourceQuery, ['format']);
};

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/config', (_req, res) => {
  res.json({
    sessionStoreBase: SESSION_STORE_URL
  });
});

app.get('/api/sessions', async (req, res) => {
  try {
    const mode = typeof req.query.mode === 'string' ? req.query.mode : 'range';
    let target;

    if (mode === 'all') {
      target = new URL('/sessions', SESSION_STORE_URL);
      forwardListParams(target, req.query);
    } else {
      target = new URL('/sessions/range', SESSION_STORE_URL);
      forwardRangeParams(target, req.query);
    }

    const response = await fetch(target, {
      headers: { Accept: 'application/json' }
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({
        error: 'Session store request failed',
        details: text
      });
    }

    const data = await response.json();
    const sessions = Array.isArray(data.sessions) ? data.sessions : [];

    res.json({
      mode,
      from: data.from,
      to: data.to,
      sessions
    });
  } catch (error) {
    console.error('Failed to proxy sessions request', error);
    res.status(500).json({ error: 'Failed to reach session store' });
  }
});

app.get('/api/sessions/:sessionId/clip', async (req, res) => {
  try {
    const target = new URL(`/sessions/${encodeURIComponent(req.params.sessionId)}/clip`, SESSION_STORE_URL);
    forwardClipParams(target, req.query);

    const response = await fetch(target, {
      headers: { Accept: 'application/json' }
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({
        error: 'Session store request failed',
        details: text
      });
    }

    const payload = await response.json();
    res.json(payload);
  } catch (error) {
    console.error('Failed to proxy clip request', error);
    res.status(500).json({ error: 'Failed to reach session store' });
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const port = Number.parseInt(process.env.PORT ?? '3000', 10);

app.listen(port, () => {
  console.log(JSON.stringify({ event: 'web-ui-started', port }));
});
