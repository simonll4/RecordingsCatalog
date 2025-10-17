const rawHost = window.location.hostname || 'localhost';
const defaultHost = rawHost === '0.0.0.0' ? '127.0.0.1' : rawHost;
const defaultProtocol = window.location.protocol || 'http:';

const buildUrl = (port: number, path = ''): string => {
  const url = new URL(`${defaultProtocol}//${defaultHost}`);
  url.port = String(port);
  url.pathname = path;
  return url.toString().replace(/\/$/, '');
};

const rawSessionStore =
  import.meta.env.VITE_SESSION_STORE_BASE_URL ??
  buildUrl(8080);
const rawMediaMtx =
  import.meta.env.VITE_MEDIAMTX_BASE_URL ??
  buildUrl(9996);

export const SESSION_STORE_BASE_URL = rawSessionStore.replace(/\/$/, '');
export const MEDIAMTX_BASE_URL = rawMediaMtx.replace(/\/$/, '');

export const mediamtxGetUrl = (search: string): string => {
  const base = new URL(MEDIAMTX_BASE_URL);
  base.pathname = '/get';
  base.search = search;
  return base.toString();
};
