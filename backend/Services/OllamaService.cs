using System.Net.Http.Json;
using ViceVector.Api.Models;

namespace ViceVector.Api.Services;

/// <summary>
/// Embedding-only Ollama client. Chat generation now goes through GeminiService.
/// We keep Ollama in the loop because (1) it runs fully locally so embeds are free,
/// and (2) the existing pgvector DB is built with nomic-embed-text — switching
/// embed providers would require re-embedding every chunk.
/// </summary>
public class OllamaService
{
    private readonly HttpClient _http;
    private readonly ILogger<OllamaService> _logger;
    private readonly string _embedModel;

    public OllamaService(HttpClient http, ILogger<OllamaService> logger, IConfiguration config)
    {
        _http = http;
        _logger = logger;
        _embedModel = config["Ollama:EmbedModel"] ?? "nomic-embed-text";
    }

    public async Task<float[]> GetEmbeddingAsync(string text)
    {
        var request = new OllamaEmbedRequest { Model = _embedModel, Input = text };
        var response = await _http.PostAsJsonAsync("/api/embed", request);
        response.EnsureSuccessStatusCode();

        var result = await response.Content.ReadFromJsonAsync<OllamaEmbedResponse>();
        return result!.Embeddings[0].ToArray();
    }

    public async Task<bool> IsReachableAsync()
    {
        try
        {
            var response = await _http.GetAsync("/api/tags", HttpCompletionOption.ResponseHeadersRead);
            return response.IsSuccessStatusCode;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Ollama reachability check failed");
            return false;
        }
    }
}
