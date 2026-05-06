import type { FormEvent } from 'react';

interface Props {
  input: string;
  setInput: (v: string) => void;
  isLoading: boolean;
  onSend: (q: string) => void;
  onReset: () => void;
  sessionId: string;
  userTurnCount: number;
  canReset: boolean;
}

export function Composer({
  input,
  setInput,
  isLoading,
  onSend,
  onReset,
  sessionId,
  userTurnCount,
  canReset,
}: Props) {
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSend(input);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="sticky bottom-3 z-20"
    >
      {/* Frosted-glass panel — floats over the wallpaper instead of sitting
          in a hard dark band.  backdrop-blur frosts whatever's behind, plus
          a subtle dark wash + neon-pink rim keeps it on-brand.            */}
      <div
        className={[
          'rounded-2xl p-3',
          'bg-[#0a0118]/40 backdrop-blur-xl',
          'border border-pink-500/25',
          'shadow-[0_18px_50px_-20px_rgba(0,0,0,0.7)]',
        ].join(' ')}
      >
        <div className="flex gap-2">
          {/* Input — single soft pink ring (less rainbow), brightens on focus */}
          <div className="flex-1 relative">
            <div className="absolute -inset-px rounded-xl bg-pink-500/20 blur-[3px] pointer-events-none transition-opacity" />
            <input
              type="text"
              placeholder="Ask about Vice City…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isLoading}
              autoFocus
              className={[
                'relative w-full bg-[#0a0118]/85 rounded-xl border border-pink-500/30',
                'px-4 py-3 text-sm text-pink-50 placeholder-pink-300/40',
                'focus:outline-none focus:border-pink-400/70 focus:shadow-[0_0_18px_-4px_rgba(255,46,136,0.45)]',
                'disabled:opacity-50 transition',
              ].join(' ')}
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className={[
              'relative font-vice text-base tracking-[0.18em] px-6 rounded-xl text-white',
              // softer gradient — same hues, less saturation, no orange punch
              'bg-gradient-to-r from-[#c2185b] to-[#9d2860]',
              'border border-pink-400/30',
              'hover:from-[#d61f6e] hover:to-[#ad2e6c] hover:border-pink-300/50',
              'disabled:opacity-40 disabled:cursor-not-allowed',
              'transition',
            ].join(' ')}
          >
            {isLoading ? '···' : 'SEND'}
          </button>

          <button
            type="button"
            onClick={onReset}
            disabled={isLoading || !canReset}
            title="Clear conversation history"
            className={[
              'font-mono text-xs px-4 rounded-xl whitespace-nowrap transition',
              'bg-[#0a0118]/40 border border-cyan-400/20 text-cyan-200/80',
              'hover:border-cyan-400/50 hover:text-cyan-100',
              'disabled:opacity-30 disabled:cursor-not-allowed',
            ].join(' ')}
          >
            ↺ RESET
          </button>
        </div>

        <div className="mt-2 px-1 text-[10px] text-pink-200/60 font-mono ctx-pill flex items-center justify-between">
          <span>
            session <span className="text-pink-300">{sessionId.substring(0, 8)}</span> · {userTurnCount} turn(s)
          </span>
          <span className="text-cyan-300/60">↵ to transmit</span>
        </div>
      </div>
    </form>
  );
}
