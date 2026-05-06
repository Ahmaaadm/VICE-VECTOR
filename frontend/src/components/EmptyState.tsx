interface Props {
  examples: string[];
  onPick: (q: string) => void;
}

export function EmptyState({ examples, onPick }: Props) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 sm:py-20 px-4">
      {/* Tagline above title */}
      <div className="text-[10px] sm:text-xs uppercase tracking-[0.4em] text-cyan-300/80 neon-cyan mb-4">
        Welcome to Leonida
      </div>

      {/* Massive headline — Bebas Neue */}
      <h1 className="font-vice text-5xl sm:text-7xl md:text-8xl leading-none tracking-[0.04em] text-white mb-3">
        <span className="neon-pink">Ask anything</span>{' '}
        <span className="block sm:inline neon-cyan">about GTA VI</span>
      </h1>

      {/* Pink → orange ribbon under the title for that horizon-line look */}
      <div className="h-[2px] w-44 mt-1 mb-7 bg-gradient-to-r from-transparent via-[#ff006e] to-transparent" />

      <p className="max-w-xl text-sm sm:text-base text-pink-100/80 mb-9 leading-relaxed">
        Grounded answers from <span className="text-cyan-300">scraped news, leaks &amp; breakdowns</span>.
        Newer reports get a recency boost — release dates and current status stay fresh.
      </p>

      {/* Example pill buttons */}
      <div className="flex flex-wrap gap-2 sm:gap-3 justify-center max-w-2xl">
        {examples.map((ex, i) => (
          <button
            key={ex}
            onClick={() => onPick(ex)}
            className={[
              'group relative px-4 py-2 rounded-full text-xs sm:text-sm font-medium transition-all',
              'bg-white/5 border border-white/15 text-pink-50 backdrop-blur-sm',
              'hover:bg-[#ff006e]/15 hover:border-[#ff2e88] hover:text-white hover:shadow-[0_0_20px_rgba(255,46,136,0.5)]',
              i % 2 === 0 ? 'hover:[--accent:var(--vice-pink)]' : 'hover:[--accent:var(--vice-cyan)]',
            ].join(' ')}
          >
            {ex}
          </button>
        ))}
      </div>
    </div>
  );
}
