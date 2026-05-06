using System.Text.Json;
using Npgsql;
using ViceVector.Api.Models;

namespace ViceVector.Api.Services;

/// <summary>
/// Persists every /api/query call to the query_history table for admin review.
/// Inserts are best-effort — a logging failure must NEVER fail the user's query.
/// </summary>
public class HistoryService
{
    private readonly NpgsqlDataSource _dataSource;
    private readonly ILogger<HistoryService> _logger;

    private static readonly JsonSerializerOptions SourcesJsonOpts = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    public HistoryService(NpgsqlDataSource dataSource, ILogger<HistoryService> logger)
    {
        _dataSource = dataSource;
        _logger = logger;
    }

    public async Task LogAsync(
        string? sessionId,
        string question,
        string? rewrittenQuery,
        string answer,
        IReadOnlyList<SourceChunk> sources,
        bool inScope,
        PipelineStats stats)
    {
        try
        {
            var sourcesJson = JsonSerializer.Serialize(sources, SourcesJsonOpts);

            await using var conn = await _dataSource.OpenConnectionAsync();
            await using var cmd = new NpgsqlCommand("""
                INSERT INTO query_history
                  (session_id, question, rewritten_query, answer, sources, in_scope,
                   embed_ms, search_ms, rewrite_ms, gen_ms, total_ms, tokens, tokens_per_sec)
                VALUES
                  ($1, $2, $3, $4, $5::jsonb, $6,
                   $7, $8, $9, $10, $11, $12, $13)
            """, conn);

            cmd.Parameters.AddWithValue((object?)sessionId ?? DBNull.Value);
            cmd.Parameters.AddWithValue(question);
            cmd.Parameters.AddWithValue((object?)rewrittenQuery ?? DBNull.Value);
            cmd.Parameters.AddWithValue(answer);
            cmd.Parameters.AddWithValue(sourcesJson);
            cmd.Parameters.AddWithValue(inScope);
            cmd.Parameters.AddWithValue(stats.EmbeddingTimeMs);
            cmd.Parameters.AddWithValue(stats.SearchTimeMs);
            cmd.Parameters.AddWithValue(stats.RewriteTimeMs);
            cmd.Parameters.AddWithValue(stats.GenerationTimeMs);
            cmd.Parameters.AddWithValue(stats.TotalTimeMs);
            cmd.Parameters.AddWithValue(stats.TokensGenerated);
            cmd.Parameters.AddWithValue(stats.TokensPerSecond);

            await cmd.ExecuteNonQueryAsync();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to log query history (non-fatal)");
        }
    }

    public async Task<List<HistoryEntry>> ListRecentAsync(int limit = 100)
    {
        var entries = new List<HistoryEntry>();

        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand("""
            SELECT id, session_id, question, rewritten_query, answer, sources,
                   in_scope, embed_ms, search_ms, rewrite_ms, gen_ms, total_ms,
                   tokens, tokens_per_sec, created_at
            FROM query_history
            ORDER BY created_at DESC
            LIMIT $1
        """, conn);
        cmd.Parameters.AddWithValue(limit);

        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            var sourcesJson = reader.IsDBNull(5) ? "[]" : reader.GetString(5);
            List<SourceChunk> sources;
            try
            {
                sources = JsonSerializer.Deserialize<List<SourceChunk>>(sourcesJson, SourcesJsonOpts) ?? [];
            }
            catch
            {
                sources = [];
            }

            entries.Add(new HistoryEntry
            {
                Id = reader.GetInt64(0),
                SessionId = reader.IsDBNull(1) ? null : reader.GetString(1),
                Question = reader.GetString(2),
                RewrittenQuery = reader.IsDBNull(3) ? null : reader.GetString(3),
                Answer = reader.GetString(4),
                Sources = sources,
                InScope = reader.GetBoolean(6),
                EmbedMs = reader.IsDBNull(7) ? null : reader.GetDouble(7),
                SearchMs = reader.IsDBNull(8) ? null : reader.GetDouble(8),
                RewriteMs = reader.IsDBNull(9) ? null : reader.GetDouble(9),
                GenMs = reader.IsDBNull(10) ? null : reader.GetDouble(10),
                TotalMs = reader.IsDBNull(11) ? null : reader.GetDouble(11),
                Tokens = reader.IsDBNull(12) ? null : reader.GetInt32(12),
                TokensPerSec = reader.IsDBNull(13) ? null : reader.GetDouble(13),
                CreatedAt = reader.GetFieldValue<DateTimeOffset>(14),
            });
        }

        return entries;
    }
}
