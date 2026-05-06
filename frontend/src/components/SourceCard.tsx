import type { SourceChunk } from '../types';

interface Props {
  source: SourceChunk;
  index: number;
}

export function SourceCard({ source, index }: Props) {
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className={[
        'block p-3 rounded-lg transition-all group',
        'bg-[#13031f]/85 border border-pink-500/20 backdrop-blur-sm',
        'hover:border-[#00e0ff] hover:shadow-[0_0_22px_-4px_rgba(0,224,255,0.55)]',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="text-[10px] text-cyan-300/70 uppercase tracking-[0.2em] font-medium">
          src {String(index + 1).padStart(2, '0')}
        </div>
        <div
          className="text-[11px] ctx-pill font-mono text-[#ff2e88] font-semibold"
          title={`similarity ${source.similarity.toFixed(3)} + recency ${source.recencyBoost.toFixed(3)}`}
        >
          {source.finalScore.toFixed(2)}
        </div>
      </div>

      <div className="text-xs font-semibold text-pink-50 line-clamp-2 group-hover:text-cyan-200 transition mb-2">
        {source.title}
      </div>

      <div className="flex items-center justify-between text-[10px] text-pink-300/60 ctx-pill font-mono">
        <span>
          {source.publishDate ? source.publishDate.substring(0, 10) : 'unknown'}
        </span>
        <span>chunk #{source.chunkIndex}</span>
      </div>
    </a>
  );
}
