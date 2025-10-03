type OpenSessionRequest = {
  sessionId: string;
  devId: string;
  startTs: string;
  path?: string;
  reason?: string;
};

type CloseSessionRequest = {
  sessionId: string;
  endTs: string;
  postrollSec?: number;
};

const headers = { "Content-Type": "application/json" };

export async function openSession(
  sessionStoreUrl: string,
  payload: OpenSessionRequest
): Promise<void> {
  const response = await fetch(`${sessionStoreUrl}/sessions/open`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to open session (${response.status}): ${text}`);
  }
}

export async function closeSession(
  sessionStoreUrl: string,
  payload: CloseSessionRequest
): Promise<void> {
  const response = await fetch(`${sessionStoreUrl}/sessions/close`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to close session (${response.status}): ${text}`);
  }
}
