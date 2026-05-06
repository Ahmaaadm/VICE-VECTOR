export type Role = 'user' | 'assistant';

export interface PipelineStats {
  embeddingTimeMs: number;
  searchTimeMs: number;
  rewriteTimeMs: number;
  generationTimeMs: number;
  totalTimeMs: number;
  tokensGenerated: number;
  tokensPerSecond: number;
}

export interface SourceChunk {
  title: string;
  url: string;
  text: string;
  chunkIndex: number;
  publishDate: string | null;
  similarity: number;
  recencyBoost: number;
  finalScore: number;
}

export interface QueryResponse {
  answer: string;
  sources: SourceChunk[];
  stats: PipelineStats;
  sessionId?: string | null;
  rewrittenQuery?: string | null;
  inScope: boolean;
}

export interface HistoryEntry {
  id: number;
  sessionId: string | null;
  question: string;
  rewrittenQuery: string | null;
  answer: string;
  sources: SourceChunk[];
  inScope: boolean;
  embedMs: number | null;
  searchMs: number | null;
  rewriteMs: number | null;
  genMs: number | null;
  totalMs: number | null;
  tokens: number | null;
  tokensPerSec: number | null;
  createdAt: string;
}

export interface ChatMessage {
  role: Role;
  content: string;
  sources?: SourceChunk[];
  stats?: PipelineStats;
  rewrittenQuery?: string | null;
}

export interface ArticleSummary {
  title: string;
  url: string;
  publishDate: string | null;
  totalChunks: number;
  totalWords: number;
}

export interface DependencyStatus {
  ok: boolean;
  detail: string | null;
}

export interface HealthResponse {
  status: string;
  service: string;
  postgres: DependencyStatus;
  ollama: DependencyStatus;
  gemini: DependencyStatus;
}

export interface StatsResponse {
  totalChunks: number;
  chunksWithEmbeddings: number;
  distinctArticles: number;
  articlesWithDate: number;
  oldestArticleDate: string | null;
  newestArticleDate: string | null;
  embedModel: string;
  chatModel: string;
}
