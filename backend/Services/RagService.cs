using System.Diagnostics;
using System.Globalization;
using Npgsql;
using Pgvector;
using ViceVector.Api.Models;

namespace ViceVector.Api.Services;

public class RagService
{
    /// <summary>
    /// The exact refusal sentence the model is instructed to emit for off-topic
    /// questions. Used both in the prompt (as the required output) and at runtime
    /// to detect that we're in the "out of scope" path.
    /// </summary>
    public const string OutOfScopeReply =
        "That's outside my context. I can only answer questions about Grand Theft Auto VI based on the articles I have indexed.";

    private readonly OllamaService _ollama;
    private readonly GeminiService _gemini;
    private readonly SessionService _sessions;
    private readonly HistoryService _history;
    private readonly ILogger<RagService> _logger;
    private readonly NpgsqlDataSource _dataSource;

    private readonly int _defaultTopK;
    private readonly int _oversample;
    private readonly double _recencyWeight;
    private readonly double _recencyHalfLifeDays;
    private readonly double _nullDateBoost;

    private readonly string _embedModel;
    private readonly string _chatModel;

    public RagService(
        OllamaService ollama,
        GeminiService gemini,
        SessionService sessions,
        HistoryService history,
        ILogger<RagService> logger,
        IConfiguration config,
        NpgsqlDataSource dataSource)
    {
        _ollama = ollama;
        _gemini = gemini;
        _sessions = sessions;
        _history = history;
        _logger = logger;
        _dataSource = dataSource;

        _defaultTopK = config.GetValue<int?>("Retrieval:DefaultTopK") ?? 3;
        _oversample = config.GetValue<int?>("Retrieval:Oversample") ?? 4;
        _recencyWeight = config.GetValue<double?>("Retrieval:RecencyWeight") ?? 0.25;
        _recencyHalfLifeDays = config.GetValue<double?>("Retrieval:RecencyHalfLifeDays") ?? 180;
        _nullDateBoost = config.GetValue<double?>("Retrieval:NullDateBoost") ?? 0.05;

        _embedModel = config["Ollama:EmbedModel"] ?? "nomic-embed-text";
        _chatModel = config["Gemini:Model"] ?? "gemini-flash-latest";
    }

    public async Task<QueryResponse> QueryAsync(QueryRequest request)
    {
        var totalSw = Stopwatch.StartNew();
        var stats = new PipelineStats();
        var topK = request.TopK ?? _defaultTopK;
        var sessionId = string.IsNullOrWhiteSpace(request.SessionId) ? null : request.SessionId;
        var history = _sessions.Get(sessionId);

        // Step 0: rewrite the question if there is prior context
        string searchQuestion = request.Question;
        string? rewritten = null;
        if (history.Count > 0)
        {
            var sw0 = Stopwatch.StartNew();
            try
            {
                searchQuestion = await RewriteQueryAsync(request.Question, history);
                rewritten = searchQuestion == request.Question ? null : searchQuestion;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Query rewrite failed; falling back to raw question");
                searchQuestion = request.Question;
            }
            stats.RewriteTimeMs = sw0.Elapsed.TotalMilliseconds;
        }

        // Step 1: embed
        var sw = Stopwatch.StartNew();
        var embedding = await _ollama.GetEmbeddingAsync(searchQuestion);
        stats.EmbeddingTimeMs = sw.Elapsed.TotalMilliseconds;

        // Step 2: similarity search + recency rerank
        sw.Restart();
        var sources = await SearchSimilarAsync(embedding, topK);
        stats.SearchTimeMs = sw.Elapsed.TotalMilliseconds;

        // Step 3: generate
        sw.Restart();
        var prompt = BuildAnswerPrompt(request.Question, sources, history);
        var (answer, outTokens) = await _gemini.GenerateAsync(prompt);
        stats.GenerationTimeMs = sw.Elapsed.TotalMilliseconds;
        stats.TokensGenerated = outTokens;
        var elapsedSec = stats.GenerationTimeMs / 1000.0;
        stats.TokensPerSecond = elapsedSec > 0 ? outTokens / elapsedSec : 0;

        // Step 4: persist conversation turn
        if (sessionId is not null)
        {
            _sessions.Append(sessionId, request.Question, answer);
        }

        stats.TotalTimeMs = totalSw.Elapsed.TotalMilliseconds;

        // Decide whether the answer actually used the corpus. Two signals:
        //  - exact match against the scripted refusal sentence  → out of scope
        //  - no [Source N] citation anywhere in the answer       → greeting or off-topic
        var trimmed = answer.Trim();
        var isRefusal = trimmed.Equals(OutOfScopeReply, StringComparison.Ordinal)
                     || trimmed.StartsWith(OutOfScopeReply, StringComparison.Ordinal);
        var citesSource = HasSourceCitation(answer);
        var inScope = !isRefusal && citesSource;

        _logger.LogInformation(
            "Q: \"{Q}\" → {Tokens} tok @ {TPS:F1} tok/s, total {Total:F0}ms, in_scope={InScope}",
            Truncate(request.Question, 60), stats.TokensGenerated, stats.TokensPerSecond, stats.TotalTimeMs, inScope);

        // Persist to query_history (best-effort, exceptions swallowed inside).
        _ = _history.LogAsync(sessionId, request.Question, rewritten, answer, sources, inScope, stats);

        // Public response: hide source cards when nothing was actually cited.
        // The full source list is still in the database for admin review.
        var publicSources = inScope ? sources : new List<SourceChunk>();

        return new QueryResponse
        {
            Answer = answer,
            Sources = publicSources,
            Stats = stats,
            SessionId = sessionId,
            RewrittenQuery = rewritten,
            InScope = inScope,
        };
    }

    private static bool HasSourceCitation(string answer)
    {
        // Matches "[Source 1]", "Source 2", "(Source 3)", "[Sources 1, 2]" etc.
        return System.Text.RegularExpressions.Regex.IsMatch(
            answer, @"\bSource[s]?\s*\d", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
    }

    public Task<List<HistoryEntry>> ListHistoryAsync(int limit = 100) =>
        _history.ListRecentAsync(limit);

    public async Task<List<ArticleSummary>> ListArticlesAsync(int limit = 200)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand("""
            SELECT title, source_url,
                   MAX(publish_date) AS publish_date,
                   COUNT(*) AS chunks,
                   SUM(word_count) AS words
            FROM gta6_articles
            GROUP BY source_url, title
            ORDER BY MAX(publish_date) DESC NULLS LAST
            LIMIT $1
        """, conn);
        cmd.Parameters.AddWithValue(limit);
        var results = new List<ArticleSummary>();
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            results.Add(new ArticleSummary
            {
                Title = reader.IsDBNull(0) ? "" : reader.GetString(0),
                Url = reader.IsDBNull(1) ? "" : reader.GetString(1),
                PublishDate = reader.IsDBNull(2) ? null : reader.GetString(2),
                TotalChunks = reader.IsDBNull(3) ? 0 : Convert.ToInt32(reader.GetInt64(3)),
                TotalWords = reader.IsDBNull(4) ? 0 : Convert.ToInt32(reader.GetInt64(4)),
            });
        }
        return results;
    }

    public async Task<StatsResponse> GetStatsAsync()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand("""
            SELECT
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE embedding IS NOT NULL) AS with_emb,
                COUNT(DISTINCT source_url) AS distinct_articles,
                COUNT(*) FILTER (WHERE publish_date IS NOT NULL AND publish_date <> '') AS with_date,
                MIN(publish_date) FILTER (WHERE publish_date IS NOT NULL AND publish_date <> '') AS oldest,
                MAX(publish_date) FILTER (WHERE publish_date IS NOT NULL AND publish_date <> '') AS newest
            FROM gta6_articles
        """, conn);
        await using var reader = await cmd.ExecuteReaderAsync();
        await reader.ReadAsync();
        return new StatsResponse
        {
            TotalChunks = Convert.ToInt32(reader.GetInt64(0)),
            ChunksWithEmbeddings = Convert.ToInt32(reader.GetInt64(1)),
            DistinctArticles = Convert.ToInt32(reader.GetInt64(2)),
            ArticlesWithDate = Convert.ToInt32(reader.GetInt64(3)),
            OldestArticleDate = reader.IsDBNull(4) ? null : reader.GetString(4),
            NewestArticleDate = reader.IsDBNull(5) ? null : reader.GetString(5),
            EmbedModel = _embedModel,
            ChatModel = _chatModel,
        };
    }

    public async Task<bool> CanReachPostgresAsync()
    {
        try
        {
            await using var conn = await _dataSource.OpenConnectionAsync();
            await using var cmd = new NpgsqlCommand("SELECT 1", conn);
            await cmd.ExecuteScalarAsync();
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Postgres health check failed");
            return false;
        }
    }

    private async Task<string> RewriteQueryAsync(string question, List<ChatTurn> history)
    {
        var historyText = FormatHistory(history);
        var prompt = $$"""
        Rewrite the user's latest message as a standalone question that can be understood without the prior conversation. Preserve the user's intent. If the latest message is already self-contained, return it unchanged. Output ONLY the rewritten question, nothing else.

        Conversation so far:
        {{historyText}}

        Latest message: {{question}}

        Standalone question:
        """;

        var (text, _) = await _gemini.GenerateAsync(prompt);
        var trimmed = text.Trim().Trim('"').Trim('\'');
        return string.IsNullOrWhiteSpace(trimmed) ? question : trimmed;
    }

    private async Task<List<SourceChunk>> SearchSimilarAsync(float[] embedding, int topK)
    {
        var vector = new Vector(embedding);

        await using var conn = await _dataSource.OpenConnectionAsync();

        await using var cmd = new NpgsqlCommand("""
            SELECT title, source_url, text, chunk_index, publish_date,
                   1 - (embedding <=> $1::vector) AS similarity
            FROM gta6_articles
            WHERE embedding IS NOT NULL
            ORDER BY embedding <=> $1::vector
            LIMIT $2
        """, conn);

        cmd.Parameters.AddWithValue(vector);
        cmd.Parameters.AddWithValue(topK * _oversample);

        var candidates = new List<SourceChunk>();
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            var publishDate = reader.IsDBNull(4) ? null : reader.GetString(4);
            var sim = reader.GetDouble(5);
            var boost = RecencyBoost(publishDate);
            candidates.Add(new SourceChunk
            {
                Title = reader.IsDBNull(0) ? "" : reader.GetString(0),
                Url = reader.IsDBNull(1) ? "" : reader.GetString(1),
                Text = reader.IsDBNull(2) ? "" : reader.GetString(2),
                ChunkIndex = reader.IsDBNull(3) ? 0 : reader.GetInt32(3),
                PublishDate = publishDate,
                Similarity = sim,
                RecencyBoost = boost,
                FinalScore = sim + boost,
            });
        }

        return candidates
            .OrderByDescending(c => c.FinalScore)
            .Take(topK)
            .ToList();
    }

    private double RecencyBoost(string? publishDate)
    {
        var dt = ParsePublishDate(publishDate);
        if (dt is null) return _nullDateBoost;
        var ageDays = Math.Max(0.0, (DateTime.UtcNow - dt.Value.UtcDateTime).TotalDays);
        return _recencyWeight * Math.Pow(0.5, ageDays / _recencyHalfLifeDays);
    }

    private static DateTimeOffset? ParsePublishDate(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        var s = raw.Trim();
        if (DateTimeOffset.TryParse(s, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var dt))
            return dt;
        if (DateTime.TryParse(s, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var d))
            return new DateTimeOffset(d, TimeSpan.Zero);
        return null;
    }

    private static string FormatHistory(List<ChatTurn> history)
    {
        if (history.Count == 0) return "(empty)";
        return string.Join("\n", history.Select(t =>
            $"{(t.Role == "user" ? "User" : "Assistant")}: {t.Content}"));
    }

    private static string BuildAnswerPrompt(string question, List<SourceChunk> sources, List<ChatTurn> history)
    {
        var today = DateTime.UtcNow.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        var context = "";
        for (var i = 0; i < sources.Count; i++)
        {
            var s = sources[i];
            var dateLabel = string.IsNullOrWhiteSpace(s.PublishDate) ? "unknown date" : s.PublishDate;
            context += $"\n[Source {i + 1}] {s.Title}  (published: {dateLabel})\n{s.Text}\n";
        }

        var historySection = history.Count == 0
            ? ""
            : $"\nPrior conversation:\n{FormatHistory(history)}\n";

        return $$"""
        You are a GTA 6 knowledge assistant. Today is {{today}}. Your scope is strictly Grand Theft Auto VI: its release, story, characters, gameplay, map, trailers, leaks, development, marketing, Rockstar / Take-Two business news directly tied to GTA 6, and similar GTA-franchise context that helps interpret a GTA 6 question.

        SCOPE GUARD — apply this BEFORE anything else:
        - If the user's question is NOT about GTA 6 (or directly related GTA / Rockstar context), do NOT attempt to answer. Examples that are out of scope: world news, politics, wars, other video games, programming, math, personal advice, general knowledge, celebrities unrelated to GTA, etc.
        - In that case, reply with EXACTLY this short message and nothing else:
          "That's outside my context. I can only answer questions about Grand Theft Auto VI based on the articles I have indexed."
        - Do not invent that the sources cover it. Do not apologize at length. Do not list the sources. Just the one sentence above.
        - Greetings or trivial small talk like "hi", "thanks" — reply with one friendly sentence inviting a GTA 6 question; no sources needed.

        If the question IS in scope, answer it based ONLY on the provided sources. Always mention which sources you used.

        CRITICAL RULES FOR TIME-SENSITIVE FACTS (release dates, delays, prices, current status):
        - When sources disagree, the MOST RECENTLY PUBLISHED source wins. Older articles are stale and should be treated as superseded.
        - Lead with the latest confirmed information. If you cite older info, label it as "previously" or "originally".
        - If the latest source predates today by more than ~3 months, mention that the info may have changed since.

        Use the prior conversation only to understand what the user is referring to — do not treat earlier answers as facts.
        {{historySection}}
        Sources:
        {{context}}

        Question: {{question}}

        Answer:
        """;
    }

    private static string Truncate(string s, int n) => s.Length <= n ? s : s[..n] + "…";
}
