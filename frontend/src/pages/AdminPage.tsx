import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import type {
  ArticleSummary,
  DependencyStatus,
  HealthResponse,
  HistoryEntry,
  StatsResponse,
} from '../types';
import { AdminHeader } from '../components/AdminHeader';
import { HistoryTable } from '../components/HistoryTable';

interface AdminData {
  health: HealthResponse | null;
  stats: StatsResponse | null;
  sources: ArticleSummary[];
  history: HistoryEntry[];
  loaded: boolean;
  error: string | null;
}

const initialData: AdminData = {
  health: null,
  stats: null,
  sources: [],
  history: [],
  loaded: false,
  error: null,
};

export default function AdminPage() {
  const [data, setData] = useState<AdminData>(initialData);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [health, stats, sources, history] = await Promise.all([
        api.health(),
        api.stats(),
        api.sources(500),
        api.history(200),
      ]);
      setData({ health, stats, sources, history, loaded: true, error: null });
    } catch (e) {
      setData((d) => ({
        ...d,
        loaded: true,
        error: e instanceof Error ? e.message : String(e),
      }));
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="bg-slate-950 text-slate-100 min-h-screen flex flex-col">
      <AdminHeader onRefresh={load} refreshing={refreshing} />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {data.error && (
          <div className="bg-rose-950/40 border border-rose-800 rounded-lg px-4 py-3 text-sm text-rose-200">
            <div className="font-semibold mb-1">Failed to load admin data</div>
            <div className="text-rose-300/90 text-xs">{data.error}</div>
          </div>
        )}

        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <HealthCard health={data.health} loaded={data.loaded} />
          <StatsCard stats={data.stats} loaded={data.loaded} />
        </section>

        <HistoryTable history={data.history} loaded={data.loaded} />

        <SourcesSection sources={data.sources} loaded={data.loaded} />

        {/* Reserved for future admin tools — keeps the page balanced and signals "more to come" */}
        <section className="bg-slate-900/40 border border-dashed border-slate-800 rounded-xl p-6 text-center text-slate-500 text-sm">
          More admin tools coming here — sessions, scrape triggers, query playground, logs.
        </section>
      </main>

      <footer className="text-center text-[11px] text-slate-600 py-3 border-t border-slate-800">
        admin · {data.stats ? `${data.stats.distinctArticles} articles` : '…'} · embed{' '}
        {data.stats?.embedModel ?? '…'} · chat {data.stats?.chatModel ?? '…'}
      </footer>
    </div>
  );
}

// ---------- Cards ----------

function HealthCard({ health, loaded }: { health: HealthResponse | null; loaded: boolean }) {
  const overall = health?.status ?? (loaded ? 'unknown' : 'loading…');
  const tone =
    overall === 'ok'
      ? 'text-emerald-400 bg-emerald-900/30 border-emerald-800'
      : overall === 'degraded'
      ? 'text-amber-400 bg-amber-900/30 border-amber-800'
      : 'text-slate-400 bg-slate-800 border-slate-700';

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-slate-200">System health</h2>
        <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border ${tone}`}>
          {overall}
        </span>
      </div>

      <div className="space-y-2.5">
        <DepRow label="Postgres + pgvector" status={health?.postgres} loaded={loaded} />
        <DepRow label="Ollama (embeddings)" status={health?.ollama} loaded={loaded} />
        <DepRow label="Gemini API (chat)" status={health?.gemini} loaded={loaded} />
      </div>
    </div>
  );
}

function DepRow({
  label,
  status,
  loaded,
}: {
  label: string;
  status: DependencyStatus | undefined;
  loaded: boolean;
}) {
  if (!loaded) {
    return (
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-300">{label}</span>
        <span className="text-slate-500 font-mono">checking…</span>
      </div>
    );
  }
  if (!status) {
    return (
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-300">{label}</span>
        <span className="text-slate-500 font-mono">no data</span>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-slate-300">{label}</span>
      <span
        className={`font-mono inline-flex items-center gap-1.5 ${
          status.ok ? 'text-emerald-400' : 'text-rose-400'
        }`}
        title={status.detail ?? ''}
      >
        <span aria-hidden>●</span>
        {status.ok ? 'reachable' : status.detail ?? 'unreachable'}
      </span>
    </div>
  );
}

function StatsCard({ stats, loaded }: { stats: StatsResponse | null; loaded: boolean }) {
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
      <h2 className="text-sm font-semibold text-slate-200 mb-4">Corpus stats</h2>
      {!loaded && <div className="text-xs text-slate-500">loading…</div>}
      {loaded && !stats && <div className="text-xs text-slate-500">no data</div>}
      {stats && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs">
          <Stat label="Articles" value={stats.distinctArticles} />
          <Stat label="Total chunks" value={stats.totalChunks} />
          <Stat
            label="Embedded"
            value={`${stats.chunksWithEmbeddings} / ${stats.totalChunks}`}
            hint={`${Math.round((stats.chunksWithEmbeddings / Math.max(1, stats.totalChunks)) * 100)}%`}
          />
          <Stat label="With dates" value={stats.articlesWithDate} />
          <Stat
            label="Oldest"
            value={stats.oldestArticleDate ? stats.oldestArticleDate.substring(0, 10) : '—'}
          />
          <Stat
            label="Newest"
            value={stats.newestArticleDate ? stats.newestArticleDate.substring(0, 10) : '—'}
          />
          <Stat label="Embed model" value={stats.embedModel} mono />
          <Stat label="Chat model" value={stats.chatModel} mono />
        </dl>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  mono,
}: {
  label: string;
  value: string | number;
  hint?: string;
  mono?: boolean;
}) {
  return (
    <>
      <dt className="text-slate-500">{label}</dt>
      <dd className={`text-slate-200 text-right ${mono ? 'font-mono text-[11px]' : ''}`}>
        {value}
        {hint && <span className="text-slate-500 ml-1.5">({hint})</span>}
      </dd>
    </>
  );
}

// ---------- Sources ----------

function SourcesSection({ sources, loaded }: { sources: ArticleSummary[]; loaded: boolean }) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return sources;
    const q = search.toLowerCase();
    return sources.filter(
      (s) =>
        (s.title ?? '').toLowerCase().includes(q) ||
        (s.url ?? '').toLowerCase().includes(q)
    );
  }, [search, sources]);

  return (
    <section className="bg-slate-900/60 border border-slate-800 rounded-xl">
      <div className="p-5 border-b border-slate-800 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-slate-200">Indexed articles</h2>
          <div className="text-xs text-slate-500 mt-0.5">
            {loaded
              ? `${filtered.length}${filtered.length !== sources.length ? ` of ${sources.length}` : ''} sources, sorted newest first`
              : 'loading…'}
          </div>
        </div>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter by title or URL…"
          className="bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-xs w-64 placeholder-slate-500 focus:outline-none focus:border-pink-500"
        />
      </div>

      {loaded && filtered.length === 0 ? (
        <div className="p-5 text-xs text-slate-500">No articles match.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-900/40 text-slate-400 text-left">
              <tr>
                <th className="px-5 py-2 font-medium">Title</th>
                <th className="px-3 py-2 font-medium whitespace-nowrap">Published</th>
                <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Chunks</th>
                <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Words</th>
                <th className="px-5 py-2 font-medium whitespace-nowrap">Source</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr
                  key={a.url}
                  className="border-t border-slate-800 hover:bg-slate-800/40 transition"
                >
                  <td className="px-5 py-2.5 text-slate-200">
                    <div className="line-clamp-1 max-w-2xl" title={a.title}>
                      {a.title || '(untitled)'}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-slate-400 font-mono whitespace-nowrap">
                    {a.publishDate ? a.publishDate.substring(0, 10) : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-slate-300 text-right font-mono">
                    {a.totalChunks}
                  </td>
                  <td className="px-3 py-2.5 text-slate-300 text-right font-mono">
                    {a.totalWords.toLocaleString()}
                  </td>
                  <td className="px-5 py-2.5 whitespace-nowrap">
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-pink-400 hover:text-pink-300"
                    >
                      open ↗
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
