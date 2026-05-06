import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import type { ChatMessage } from './types';

const SESSION_KEY = 'vv_session';

function newSessionId(): string {
  return 's_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function useRag() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState('thinking…');
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string>('');

  const stageTimer = useRef<number | null>(null);

  // Boot: load or create session id. Health/stats/sources moved to AdminPage.
  useEffect(() => {
    const existing = localStorage.getItem(SESSION_KEY);
    const sid = existing ?? newSessionId();
    if (!existing) localStorage.setItem(SESSION_KEY, sid);
    setSessionId(sid);
  }, []);

  const ask = useCallback(
    async (raw: string) => {
      const question = raw.trim();
      if (!question || isLoading || !sessionId) return;

      setError(null);
      setInput('');
      setMessages((prev) => [...prev, { role: 'user', content: question }]);
      setLoading(true);

      // Two-phase loading copy that doesn't leak provider/pipeline jargon to
      // end users. Admins still see the full breakdown in /admin > history.
      setLoadingStage('Searching articles…');
      stageTimer.current = window.setTimeout(() => {
        setLoadingStage('Generating answer…');
      }, 1500);

      try {
        const data = await api.query(question, sessionId);
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: data.answer,
            sources: data.sources,
            stats: data.stats,
            rewrittenQuery: data.rewrittenQuery,
          },
        ]);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (stageTimer.current) {
          window.clearTimeout(stageTimer.current);
          stageTimer.current = null;
        }
        setLoading(false);
      }
    },
    [isLoading, sessionId]
  );

  const reset = useCallback(async () => {
    if (!sessionId || messages.length === 0) return;
    try {
      await api.resetSession(sessionId);
    } catch {
      // best-effort — clearing the UI is the important part
    }
    setMessages([]);
    setError(null);
    const sid = newSessionId();
    localStorage.setItem(SESSION_KEY, sid);
    setSessionId(sid);
  }, [sessionId, messages.length]);

  const userTurnCount = messages.filter((m) => m.role === 'user').length;

  return {
    messages,
    input,
    setInput,
    isLoading,
    loadingStage,
    error,
    sessionId,
    userTurnCount,
    ask,
    reset,
  };
}
