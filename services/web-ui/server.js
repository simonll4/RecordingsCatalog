import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import toml from '@iarna/toml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load TOML configuration
const configPath = path.join(__dirname, 'config.toml');
const config = toml.parse(readFileSync(configPath, 'utf-8'));

const app = express();

const SESSION_STORE_URL = config.backend.session_store_url;
const MEDIAMTX_URL = config.backend.mediamtx_url;

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

const proxySessionStoreJson = async (res, targetUrl) => {
  const response = await fetch(targetUrl, {
    headers: { Accept: 'application/json' }
  });

  if (!response.ok) {
    const text = await response.text();
    return {
      ok: false,
      status: response.status,
      body: {
        error: 'Session store request failed',
        details: text
      }
    };
  }

  const cacheControl = response.headers.get('cache-control');
  if (cacheControl) {
    res.set('Cache-Control', cacheControl);
  }

  const payload = await response.json();
  return { ok: true, payload };
};

app.get('/api/sessions/:sessionId/meta', async (req, res) => {
  try {
    const target = new URL(`/sessions/${encodeURIComponent(req.params.sessionId)}/meta`, SESSION_STORE_URL);
    const result = await proxySessionStoreJson(res, target);

    if (!result.ok) {
      return res.status(result.status).json(result.body);
    }

    res.json(result.payload);
  } catch (error) {
    console.error('Failed to proxy session meta', error);
    res.status(500).json({ error: 'Failed to reach session store' });
  }
});

app.get('/api/sessions/:sessionId/index', async (req, res) => {
  try {
    const target = new URL(`/sessions/${encodeURIComponent(req.params.sessionId)}/index`, SESSION_STORE_URL);
    const result = await proxySessionStoreJson(res, target);

    if (!result.ok) {
      return res.status(result.status).json(result.body);
    }

    res.json(result.payload);
  } catch (error) {
    console.error('Failed to proxy session index', error);
    res.status(500).json({ error: 'Failed to reach session store' });
  }
});

app.get('/api/sessions/:sessionId/segment/:segmentId', async (req, res) => {
  try {
    const target = new URL(
      `/sessions/${encodeURIComponent(req.params.sessionId)}/segment/${encodeURIComponent(req.params.segmentId)}`,
      SESSION_STORE_URL
    );
    const response = await fetch(target);

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({
        error: 'Session store request failed',
        details: text
      });
    }

    const headersToForward = ['content-type', 'content-length', 'cache-control', 'content-encoding'];
    for (const header of headersToForward) {
      const value = response.headers.get(header);
      if (value) {
        res.set(header, value);
      }
    }

    if (!response.body) {
      return res.status(502).json({ error: 'Session store returned empty body' });
    }

    for await (const chunk of response.body) {
      res.write(chunk);
    }
    res.end();
  } catch (error) {
    console.error('Failed to proxy track segment', error);
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
    
    // Reescribir playbackUrl para que apunte al proxy local
    if (payload.playbackUrl) {
      const originalUrl = new URL(payload.playbackUrl);
      // Cambiar de http://mediamtx:9996/get?... a /api/playback?...
      payload.playbackUrl = `/api/playback${originalUrl.search}`;
    }
    
    res.json(payload);
  } catch (error) {
    console.error('Failed to proxy clip request', error);
    res.status(500).json({ error: 'Failed to reach session store' });
  }
});

// Proxy para playback de MediaMTX (grabaciones)
app.get('/api/playback', async (req, res) => {
  try {
    // Construir URL de MediaMTX
    const target = new URL('/get', MEDIAMTX_URL);
    
    // Copiar todos los query params (path, start, duration, format)
    for (const [key, value] of Object.entries(req.query)) {
      target.searchParams.set(key, value);
    }

    console.log('Proxying playback request to:', target.toString());

    const videoResponse = await fetch(target.toString());
    
    if (!videoResponse.ok) {
      console.error('MediaMTX returned error:', videoResponse.status);
      return res.status(videoResponse.status).send('Failed to fetch video from MediaMTX');
    }

    // Copiar headers importantes
    const contentType = videoResponse.headers.get('Content-Type');
    const contentLength = videoResponse.headers.get('Content-Length');
    
    if (contentType) res.set('Content-Type', contentType);
    if (contentLength) res.set('Content-Length', contentLength);
    res.set('Accept-Ranges', 'bytes');

    // Stream del video al cliente
    for await (const chunk of videoResponse.body) {
      res.write(chunk);
    }
    res.end();
  } catch (error) {
    console.error('Failed to proxy playback request', error);
    res.status(500).send('Failed to reach playback service');
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const port = config.server.port;

app.listen(port, () => {
  console.log(JSON.stringify({ event: 'web-ui-started', port }));
});
