import type {
  ArticleSummary,
  HealthResponse,
  HistoryEntry,
  QueryResponse,
  StatsResponse,
} from './types';

// Empty default → relative paths → Vite dev proxy or same-origin in prod.
// Override via VITE_API_BASE_URL in .env when the API lives on a different host.
const BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

const url = (path: string) => `${BASE}${path}`;

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = body.detail || body.error || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return res.json();
}

export const api = {
  async health(): Promise<HealthResponse> {
    return asJson(await fetch(url('/api/health')));
  },

  async stats(): Promise<StatsResponse> {
    return asJson(await fetch(url('/api/stats')));
  },

  async sources(limit = 200): Promise<ArticleSummary[]> {
    return asJson(await fetch(url(`/api/sources?limit=${limit}`)));
  },

  async query(question: string, sessionId: string): Promise<QueryResponse> {
    const res = await fetch(url('/api/query'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, sessionId }),
    });
    return asJson(res);
  },

  async resetSession(sessionId: string): Promise<void> {
    await fetch(url('/api/session/reset'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    });
  },

  async history(limit = 100): Promise<HistoryEntry[]> {
    return asJson(await fetch(url(`/api/admin/history?limit=${limit}`)));
  },
};
