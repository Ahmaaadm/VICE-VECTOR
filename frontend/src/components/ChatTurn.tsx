import { marked } from 'marked';
import type { ChatMessage } from '../types';
import { SourceCard } from './SourceCard';

function renderMarkdown(text: string): string {
  try {
    return marked.parse(text, { async: false }) as string;
  } catch {
    return text;
  }
}

interface Props {
  message: ChatMessage;
}

export function ChatTurn({ message }: Props) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div
          className={[
            'max-w-[85%] px-4 py-2.5 rounded-2xl rounded-tr-md text-sm font-medium text-white',
            'bg-gradient-to-r from-[#ff006e] via-[#ff2e88] to-[#ff7a3d]',
            'shadow-[0_8px_24px_-8px_rgba(255,46,136,0.7)]',
            'border border-white/10',
          ].join(' ')}
        >
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        {/* Cyan-rim avatar — distinguishes the assistant from the pink user */}
        <div className="w-9 h-9 rounded-md flex-shrink-0 bg-gradient-to-br from-[#0a0118] to-[#2b0a52] border border-cyan-400/40 flex items-center justify-center text-base shadow-[0_0_12px_rgba(0,224,255,0.25)]">
          🤖
        </div>

        <div className="relative flex-1">
          {/* Top neon strip */}
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[#00e0ff] via-[#ff2e88] to-[#ff7a3d] rounded-t-2xl opacity-90" />

          <div
            className={[
              'bg-[#13031f]/85 backdrop-blur-sm border border-pink-500/15 rounded-2xl rounded-tl-md',
              'px-4 py-3.5 text-sm leading-relaxed markdown text-pink-50',
              'shadow-[0_10px_30px_-10px_rgba(0,0,0,0.7)]',
            ].join(' ')}
            dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
          />
        </div>
      </div>

      {message.sources && message.sources.length > 0 && (
        <div>
          <div className="ml-12 mb-2 text-[10px] uppercase tracking-[0.3em] text-cyan-300/70 font-medium">
            sources cited
          </div>
          <div className="ml-12 grid grid-cols-1 md:grid-cols-3 gap-2">
            {message.sources.map((src, i) => (
              <SourceCard key={`${src.url}-${src.chunkIndex}`} source={src} index={i} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
