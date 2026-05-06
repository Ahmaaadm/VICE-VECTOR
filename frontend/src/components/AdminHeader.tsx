import { Link } from 'react-router-dom';

interface Props {
  onRefresh?: () => void;
  refreshing?: boolean;
}

export function AdminHeader({ onRefresh, refreshing }: Props) {
  return (
    <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur sticky top-0 z-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-sm flex-shrink-0">
            ⚙
          </div>
          <div className="min-w-0">
            <div className="font-semibold leading-tight">VICE-VECTOR · admin</div>
            <div className="text-xs text-slate-400 leading-tight">
              System status &amp; corpus management
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={refreshing}
              className="text-xs px-2.5 py-1 rounded border border-slate-700 hover:border-slate-500 disabled:opacity-50 transition whitespace-nowrap"
            >
              {refreshing ? '↻ refreshing…' : '↻ refresh'}
            </button>
          )}
          <Link
            to="/"
            className="text-xs text-slate-500 hover:text-slate-300 transition whitespace-nowrap"
            title="Back to chat"
          >
            ← back to chat
          </Link>
        </div>
      </div>
    </header>
  );
}
