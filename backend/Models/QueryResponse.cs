namespace ViceVector.Api.Models;

public class QueryResponse
{
    public string Answer { get; set; } = "";
    public List<SourceChunk> Sources { get; set; } = [];
    public PipelineStats Stats { get; set; } = new();
    public string? SessionId { get; set; }
    public string? RewrittenQuery { get; set; }
    /// <summary>
    /// True when the question was answered from the RAG corpus.
    /// False for refusals (off-topic) and greetings — the frontend uses this
    /// to decide whether to render source cards on the public chat.
    /// </summary>
    public bool InScope { get; set; } = true;
}

public class HistoryEntry
{
    public long Id { get; set; }
    public string? SessionId { get; set; }
    public string Question { get; set; } = "";
    public string? RewrittenQuery { get; set; }
    public string Answer { get; set; } = "";
    public List<SourceChunk> Sources { get; set; } = [];
    public bool InScope { get; set; }
    public double? EmbedMs { get; set; }
    public double? SearchMs { get; set; }
    public double? RewriteMs { get; set; }
    public double? GenMs { get; set; }
    public double? TotalMs { get; set; }
    public int? Tokens { get; set; }
    public double? TokensPerSec { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

public class SourceChunk
{
    public string Title { get; set; } = "";
    public string Url { get; set; } = "";
    public string Text { get; set; } = "";
    public int ChunkIndex { get; set; }
    public string? PublishDate { get; set; }
    public double Similarity { get; set; }
    public double RecencyBoost { get; set; }
    public double FinalScore { get; set; }
}

public class PipelineStats
{
    public double EmbeddingTimeMs { get; set; }
    public double SearchTimeMs { get; set; }
    public double RewriteTimeMs { get; set; }
    public double GenerationTimeMs { get; set; }
    public double TotalTimeMs { get; set; }
    public int TokensGenerated { get; set; }
    public double TokensPerSecond { get; set; }
}

public class ArticleSummary
{
    public string Title { get; set; } = "";
    public string Url { get; set; } = "";
    public string? PublishDate { get; set; }
    public int TotalChunks { get; set; }
    public int TotalWords { get; set; }
}

public class StatsResponse
{
    public int TotalChunks { get; set; }
    public int ChunksWithEmbeddings { get; set; }
    public int DistinctArticles { get; set; }
    public int ArticlesWithDate { get; set; }
    public string? OldestArticleDate { get; set; }
    public string? NewestArticleDate { get; set; }
    public string EmbedModel { get; set; } = "";
    public string ChatModel { get; set; } = "";
}

public class HealthResponse
{
    public string Status { get; set; } = "ok";
    public string Service { get; set; } = "ViceVector RAG API";
    public DependencyStatus Postgres { get; set; } = new();
    public DependencyStatus Ollama { get; set; } = new();
    public DependencyStatus Gemini { get; set; } = new();
}

public class DependencyStatus
{
    public bool Ok { get; set; }
    public string? Detail { get; set; }
}

public class ErrorResponse
{
    public string Error { get; set; } = "";
    public string? Detail { get; set; }
}
