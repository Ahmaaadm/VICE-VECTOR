import { useEffect, useRef } from 'react';
import { useRag } from '../useRag';
import { PublicHeader } from '../components/PublicHeader';
import { Composer } from '../components/Composer';
import { ChatTurn } from '../components/ChatTurn';
import { EmptyState } from '../components/EmptyState';
import { ViceScene } from '../components/ViceScene';
import { WallpaperCarousel } from '../components/WallpaperCarousel';
import { wallpaperUrls } from '../wallpapers';

const EXAMPLES = [
  'When is GTA 6 releasing?',
  'Who is Lucia?',
  'What platforms will it be on?',
  'What do we know about the story?',
];

export default function ChatPage() {
  const rag = useRag();
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [rag.messages.length, rag.isLoading]);

  // If you've dropped images into src/assets/wallpapers/ they take over the
  // background; otherwise the SVG sunset stays as a stylish fallback.
  const hasWallpapers = wallpaperUrls.length > 0;

  return (
    <div className="vice-bg text-pink-50 min-h-screen flex flex-col">
      {hasWallpapers ? <WallpaperCarousel /> : <ViceScene />}
      <PublicHeader />

      <main className="relative z-10 flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6 flex flex-col gap-5 min-w-0">
        {rag.messages.length === 0 && !rag.isLoading && (
          <EmptyState examples={EXAMPLES} onPick={rag.ask} />
        )}

        {rag.messages.map((msg, idx) => (
          <ChatTurn key={idx} message={msg} />
        ))}

        {rag.isLoading && (
          <div className="flex gap-3">
            <div className="w-9 h-9 rounded-md flex-shrink-0 bg-gradient-to-br from-[#0a0118] to-[#2b0a52] border border-cyan-400/40 flex items-center justify-center text-base">
              🤖
            </div>
            <div className="bg-[#13031f]/85 border border-pink-500/15 rounded-2xl rounded-tl-md px-4 py-3 text-sm flex items-center gap-3 backdrop-blur-sm">
              <div className="flex gap-1">
                <span className="dot w-1.5 h-1.5 rounded-full bg-[#ff2e88]" />
                <span className="dot w-1.5 h-1.5 rounded-full bg-[#9d4edd]" />
                <span className="dot w-1.5 h-1.5 rounded-full bg-[#00e0ff]" />
              </div>
              <span className="text-pink-200/80 font-mono text-xs uppercase tracking-[0.2em]">
                {rag.loadingStage}
              </span>
            </div>
          </div>
        )}

        {rag.error && (
          <div className="bg-rose-950/60 border border-rose-500/40 rounded-lg px-4 py-3 text-sm text-rose-100 backdrop-blur-sm">
            <div className="font-semibold mb-1 font-vice tracking-[0.15em]">SIGNAL LOST</div>
            <div className="text-rose-200/80 text-xs font-mono">{rag.error}</div>
          </div>
        )}

        <div ref={bottomRef} />

        <Composer
          input={rag.input}
          setInput={rag.setInput}
          isLoading={rag.isLoading}
          onSend={rag.ask}
          onReset={rag.reset}
          sessionId={rag.sessionId}
          userTurnCount={rag.userTurnCount}
          canReset={rag.messages.length > 0}
        />
      </main>
    </div>
  );
}
