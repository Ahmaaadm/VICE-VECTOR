import { Link } from 'react-router-dom';

export function PublicHeader() {
  return (
    <header className="border-b border-pink-500/15 bg-[#0a0118]/30 backdrop-blur-md sticky top-0 z-30">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
        <Link to="/" className="group inline-flex items-center gap-3 min-w-0">
          {/* Animated neon "V" tile */}
          <div className="relative w-11 h-11 flex-shrink-0 flex items-center justify-center">
            <div className="absolute inset-0 rounded-md bg-gradient-to-br from-[#ff2e88] via-[#ff006e] to-[#9d4edd] animate-neon glow-pink-shadow" />
            <div className="absolute inset-[2px] rounded-[5px] bg-[#0a0118]/30" />
            <span className="relative font-vice text-2xl text-white">V</span>
          </div>

          <div className="min-w-0">
            <div className="flex items-baseline gap-2 leading-none">
              <span className="font-vice text-3xl sm:text-4xl tracking-[0.18em] text-white neon-pink">
                VICE
              </span>
              <span className="font-vice text-3xl sm:text-4xl tracking-[0.18em] text-[#00e0ff] neon-cyan">
                VECTOR
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2 text-[10px] sm:text-[11px] uppercase tracking-[0.32em] text-pink-200/70 font-medium">
              <span className="px-1.5 py-0.5 rounded-sm bg-[#ff2e88] text-[#0a0118] font-bold tracking-[0.1em]">
                GTA VI
              </span>
              <span>Knowledge Engine</span>
            </div>
          </div>
        </Link>
      </div>
    </header>
  );
}
