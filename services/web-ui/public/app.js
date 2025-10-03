const form = document.getElementById('search-form');
const startInput = document.getElementById('start');
const durationInput = document.getElementById('duration');
const statusEl = document.getElementById('status');
const resultsEl = document.getElementById('results');
const videoEl = document.getElementById('player');
const fetchAllBtn = document.getElementById('fetch-all');

const toLocalInputValue = (date) => {
  const tzOffsetMinutes = date.getTimezoneOffset();
  const local = new Date(date.getTime() - tzOffsetMinutes * 60000);
  return local.toISOString().slice(0, 16);
};

const setStatus = (message, variant = 'info') => {
  statusEl.textContent = message ?? '';
  statusEl.dataset.variant = variant;
};

const clearPlayer = () => {
  videoEl.pause();
  videoEl.removeAttribute('src');
  videoEl.load();
};

const fetchClipUrl = async (sessionId) => {
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/clip?format=mp4`);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Error al recuperar el clip');
  }
  const payload = await response.json();
  if (!payload.playbackUrl) {
    throw new Error('El Session Store no devolvió una URL de reproducción');
  }
  return payload.playbackUrl;
};

const playSession = async (session) => {
  try {
    setStatus(`Generando clip para ${session.session_id}...`, 'info');
    const playbackUrl = await fetchClipUrl(session.session_id);
    clearPlayer();
    videoEl.src = playbackUrl;
    await videoEl.play().catch((error) => {
      console.warn('Fallo al auto-reproducir, intentando cargar manualmente.', error);
      videoEl.load();
    });
    setStatus(`Reproduciendo ${session.session_id}`, 'success');
  } catch (error) {
    console.error('Error al reproducir la sesión', error);
    setStatus('No se pudo reproducir la sesión seleccionada. Revisá los logs.', 'error');
    clearPlayer();
  }
};

const formatDateTime = (iso) => {
  if (!iso) {
    return '—';
  }
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return iso;
  }
  return parsed.toLocaleString();
};

const renderSessions = (sessions) => {
  resultsEl.innerHTML = '';

  if (!sessions.length) {
    const empty = document.createElement('p');
    empty.textContent = 'No se encontraron sesiones en la franja solicitada.';
    resultsEl.appendChild(empty);
    clearPlayer();
    return;
  }

  sessions.forEach((session) => {
    const card = document.createElement('article');
    card.className = 'session-card';

    const title = document.createElement('h3');
    title.textContent = session.session_id;
    card.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'session-meta';
    meta.innerHTML = `
      <strong>Dispositivo:</strong> ${session.device_id}<br>
      <strong>Path:</strong> ${session.path}<br>
      <strong>Inicio:</strong> ${formatDateTime(session.start_ts)}<br>
      <strong>Fin:</strong> ${session.end_ts ? formatDateTime(session.end_ts) : 'en curso'}
    `;
    card.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'session-actions';

    const playBtn = document.createElement('button');
    playBtn.type = 'button';
    playBtn.textContent = 'Reproducir clip';
    playBtn.addEventListener('click', () => playSession(session));
    actions.appendChild(playBtn);

    card.appendChild(actions);
    resultsEl.appendChild(card);
  });
};

const fetchSessionsRange = async (fromIso, toIso) => {
  const params = new URLSearchParams({ from: fromIso, to: toIso, mode: 'range' });
  const response = await fetch(`/api/sessions?${params.toString()}`);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Error en la consulta');
  }
  return response.json();
};

const fetchAllSessions = async () => {
  const response = await fetch('/api/sessions?mode=all');
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Error en la consulta');
  }
  return response.json();
};

const initializeForm = () => {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  startInput.value = toLocalInputValue(now);
  setStatus('Ingresá una hora y presioná "Buscar grabaciones".');
};

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  setStatus('Buscando grabaciones...', 'info');

  try {
    const startValue = startInput.value;
    if (!startValue) {
      setStatus('Seleccioná una fecha y hora válidas.', 'error');
      return;
    }

    const startDate = new Date(startValue);
    if (Number.isNaN(startDate.getTime())) {
      setStatus('La fecha seleccionada no es válida.', 'error');
      return;
    }

    const durationMinutes = Number.parseInt(durationInput.value, 10) || 60;
    const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);

    const { sessions } = await fetchSessionsRange(startDate.toISOString(), endDate.toISOString());
    renderSessions(sessions ?? []);
    setStatus(`Mostrando resultados entre ${startDate.toLocaleString()} y ${endDate.toLocaleString()}.`, 'success');
  } catch (error) {
    console.error('Failed to fetch sessions', error);
    setStatus('No se pudieron obtener las sesiones. Revisá los logs.', 'error');
    resultsEl.innerHTML = '';
    clearPlayer();
  }
});

fetchAllBtn.addEventListener('click', async () => {
  setStatus('Buscando todas las grabaciones...', 'info');
  try {
    const { sessions } = await fetchAllSessions();
    renderSessions(sessions ?? []);
    setStatus('Mostrando todas las sesiones registradas.', 'success');
  } catch (error) {
    console.error('Failed to fetch all sessions', error);
    setStatus('No se pudieron obtener las sesiones. Revisá los logs.', 'error');
    resultsEl.innerHTML = '';
    clearPlayer();
  }
});

initializeForm();
