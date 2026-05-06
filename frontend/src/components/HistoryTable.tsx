import { useMemo, useState } from 'react';
import type { HistoryEntry, SourceChunk } from '../types';

type ScopeFilter = 'all' | 'in_scope' | 'out_of_scope';

interface Props {
  history: HistoryEntry[];
  loaded: boolean;
}

export function HistoryTable({ history, loaded }: Props) {
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState<ScopeFilter>('all');
  const [expanded, setExpanded] = useState<number | null>(null);

  const filtered = useMemo(() => {
    let rows = history;
    if (scope === 'in_scope') rows = rows.filter((r) => r.inScope);
    else if (scope === 'out_of_scope') rows = rows.filter((r) => !r.inScope);
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.question.toLowerCase().includes(q) ||
          r.answer.toLowerCase().includes(q) ||
          (r.rewrittenQuery ?? '').toLowerCase().includes(q) ||
          (r.sessionId ?? '').toLowerCase().includes(q)
      );
    }
    return rows;
  }, [history, search, scope]);

  return (
    <section className="bg-slate-900/60 border border-slate-800 rounded-xl">
      <div className="p-5 border-b border-slate-800 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-slate-200">Query history</h2>
          <div className="text-xs text-slate-500 mt-0.5">
            {loaded
              ? `${filtered.length}${filtered.length !== history.length ? ` of ${history.length}` : ''} queries · click a row to expand`
              : 'loading…'}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <ScopeButton current={scope} value="all" set={setScope}>
            all
          </ScopeButton>
          <ScopeButton current={scope} value="in_scope" set={setScope}>
            <span className="text-emerald-400">●</span> in scope
          </ScopeButton>
          <ScopeButton current={scope} value="out_of_scope" set={setScope}>
            <span className="text-amber-400">●</span> out of scope
          </ScopeButton>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by question, answer, session…"
            className="bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-xs w-72 placeholder-slate-500 focus:outline-none focus:border-pink-500"
          />
        </div>
      </div>

      {loaded && filtered.length === 0 ? (
        <div className="p-5 text-xs text-slate-500">No queries match.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-900/40 text-slate-400 text-left">
              <tr>
                <th className="px-5 py-2 font-medium whitespace-nowrap">When</th>
                <th className="px-3 py-2 font-medium">Question</th>
                <th className="px-3 py-2 font-medium whitespace-nowrap">Scope</th>
                <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Total</th>
                <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Tokens</th>
                <th className="px-5 py-2 font-medium whitespace-nowrap">Session</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <Row
                  key={r.id}
                  entry={r}
                  isExpanded={expanded === r.id}
                  onToggle={() => setExpanded(expanded === r.id ? null : r.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ScopeButton({
  current,
  value,
  set,
  children,
}: {
  current: ScopeFilter;
  value: ScopeFilter;
  set: (v: ScopeFilter) => void;
  children: React.ReactNode;
}) {
  const active = current === value;
  return (
    <button
      onClick={() => set(value)}
      className={`text-[11px] px-2.5 py-1 rounded border transition whitespace-nowrap inline-flex items-center gap-1 ${
        active
          ? 'border-pink-500 bg-pink-500/10 text-pink-200'
          : 'border-slate-700 text-slate-400 hover:border-slate-500'
      }`}
    >
      {children}
    </button>
  );
}

function Row({
  entry,
  isExpanded,
  onToggle,
}: {
  entry: HistoryEntry;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        className="border-t border-slate-800 hover:bg-slate-800/40 transition cursor-pointer"
      >
        <td className="px-5 py-2.5 text-slate-400 font-mono whitespace-nowrap">
          {formatRelative(entry.createdAt)}
        </td>
        <td className="px-3 py-2.5 text-slate-200 max-w-md">
          <div className="line-clamp-1" title={entry.question}>
            {isExpanded ? '▾' : '▸'} {entry.question}
          </div>
        </td>
        <td className="px-3 py-2.5 whitespace-nowrap">
          {entry.inScope ? (
            <span className="text-emerald-400 inline-flex items-center gap-1">
              <span aria-hidden>●</span> in scope
            </span>
          ) : (
            <span className="text-amber-400 inline-flex items-center gap-1">
              <span aria-hidden>●</span> out of scope
            </span>
          )}
        </td>
        <td className="px-3 py-2.5 text-slate-300 text-right font-mono">
          {entry.totalMs != null ? `${(entry.totalMs / 1000).toFixed(2)}s` : '—'}
        </td>
        <td className="px-3 py-2.5 text-slate-300 text-right font-mono">
          {entry.tokens ?? '—'}
        </td>
        <td className="px-5 py-2.5 text-slate-500 font-mono whitespace-nowrap">
          {entry.sessionId ? entry.sessionId.substring(0, 10) : '—'}
        </td>
      </tr>
      {isExpanded && (
        <tr className="bg-slate-950/60">
          <td colSpan={6} className="px-5 py-4">
            <ExpandedDetail entry={entry} />
          </td>
        </tr>
      )}
    </>
  );
}

function ExpandedDetail({ entry }: { entry: HistoryEntry }) {
  return (
    <div className="space-y-4 text-xs">
      {entry.rewrittenQuery && (
        <div>
          <div className="text-slate-500 uppercase tracking-wider text-[10px] mb-1">Rewritten standalone query</div>
          <div className="text-violet-300 italic">{entry.rewrittenQuery}</div>
        </div>
      )}

      <div>
        <div className="text-slate-500 uppercase tracking-wider text-[10px] mb-1">Answer</div>
        <div className="text-slate-200 whitespace-pre-wrap leading-relaxed bg-slate-900/40 border border-slate-800 rounded p-3 max-h-64 overflow-auto">
          {entry.answer}
        </div>
      </div>

      <div>
        <div className="text-slate-500 uppercase tracking-wider text-[10px] mb-1">Pipeline timing</div>
        <div className="flex flex-wrap gap-2 text-slate-300 ctx-pill">
          {entry.rewriteMs != null && entry.rewriteMs > 0 && (
            <Pill>rewrite {(entry.rewriteMs / 1000).toFixed(2)}s</Pill>
          )}
          {entry.embedMs != null && <Pill>embed {(entry.embedMs / 1000).toFixed(2)}s</Pill>}
          {entry.searchMs != null && <Pill>search {entry.searchMs.toFixed(0)}ms</Pill>}
          {entry.genMs != null && (
            <Pill>
              gen {(entry.genMs / 1000).toFixed(2)}s
              {entry.tokens != null && ` · ${entry.tokens} tok`}
              {entry.tokensPerSec != null && ` @ ${entry.tokensPerSec.toFixed(0)} tok/s`}
            </Pill>
          )}
          {entry.totalMs != null && (
            <Pill emerald>total {(entry.totalMs / 1000).toFixed(2)}s</Pill>
          )}
        </div>
      </div>

      <div>
        <div className="text-slate-500 uppercase tracking-wider text-[10px] mb-1">
          Retrieved sources ({entry.sources.length})
        </div>
        {entry.sources.length === 0 ? (
          <div className="text-slate-500">No sources logged for this query.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {entry.sources.map((src, i) => (
              <SourceCardCompact key={i} source={src} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Pill({ children, emerald }: { children: React.ReactNode; emerald?: boolean }) {
  return (
    <span
      className={`px-2 py-0.5 rounded border ${
        emerald
          ? 'bg-emerald-900/40 border-emerald-800 text-emerald-300'
          : 'bg-slate-800 border-slate-700'
      }`}
    >
      {children}
    </span>
  );
}

function SourceCardCompact({ source, index }: { source: SourceChunk; index: number }) {
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block p-2.5 bg-slate-900 border border-slate-700 rounded hover:border-pink-500 transition"
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <span className="text-[10px] text-slate-500 uppercase tracking-wide">
          Source {index + 1}
        </span>
        <span
          className="text-[10px] ctx-pill text-pink-400 font-mono"
          title={`similarity ${source.similarity.toFixed(3)} + recency ${source.recencyBoost.toFixed(3)}`}
        >
          {source.finalScore.toFixed(2)}
        </span>
      </div>
      <div className="text-xs font-medium text-slate-200 line-clamp-2 mb-1">{source.title}</div>
      <div className="flex items-center justify-between text-[10px] text-slate-500 ctx-pill">
        <span>{source.publishDate ? source.publishDate.substring(0, 10) : 'unknown'}</span>
        <span>chunk #{source.chunkIndex}</span>
      </div>
    </a>
  );
}

function formatRelative(iso: string): string {
  try {
    const then = new Date(iso).getTime();
    const now = Date.now();
    const sec = Math.floor((now - then) / 1000);
    if (sec < 60) return `${sec}s ago`;
    if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
    if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso.substring(0, 16);
  }
}
