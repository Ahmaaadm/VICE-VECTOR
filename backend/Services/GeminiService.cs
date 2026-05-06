using System.Net.Http.Json;
using System.Text.Json;
using ViceVector.Api.Models;

namespace ViceVector.Api.Services;

public class GeminiService
{
    private readonly HttpClient _http;
    private readonly ILogger<GeminiService> _logger;
    private readonly string _model;
    private readonly string _apiKey;

    public GeminiService(HttpClient http, ILogger<GeminiService> logger, IConfiguration config)
    {
        _http = http;
        _logger = logger;
        _model = config["Gemini:Model"] ?? "gemini-flash-latest";
        // Prefer env var so the key never lives in appsettings on disk.
        _apiKey = Environment.GetEnvironmentVariable("GEMINI_API_KEY")
                  ?? config["Gemini:ApiKey"]
                  ?? "";
    }

    public bool HasApiKey => !string.IsNullOrWhiteSpace(_apiKey);

    public async Task<(string text, int outTokens)> GenerateAsync(string prompt, double? temperature = null, int? maxOutputTokens = null)
    {
        if (!HasApiKey)
        {
            throw new InvalidOperationException(
                "GEMINI_API_KEY is not set. Export it in the shell or set Gemini:ApiKey in appsettings.json.");
        }

        var body = new GeminiGenerateRequest
        {
            Contents = [new GeminiContent { Role = "user", Parts = [new GeminiPart { Text = prompt }] }],
            GenerationConfig = (temperature is null && maxOutputTokens is null) ? null : new GeminiGenerationConfig
            {
                Temperature = temperature,
                MaxOutputTokens = maxOutputTokens,
            },
        };

        var url = $"/v1beta/models/{_model}:generateContent?key={_apiKey}";
        _logger.LogInformation("→ Gemini {Model} (prompt {Chars} chars)", _model, prompt.Length);

        using var response = await _http.PostAsJsonAsync(url, body);
        if (!response.IsSuccessStatusCode)
        {
            var errBody = await response.Content.ReadAsStringAsync();
            _logger.LogError("Gemini API error {Status}: {Body}", (int)response.StatusCode, errBody);
            throw new HttpRequestException($"Gemini API returned {(int)response.StatusCode}: {Truncate(errBody, 400)}");
        }

        var result = await response.Content.ReadFromJsonAsync<GeminiGenerateResponse>();
        var text = result?.Candidates?.FirstOrDefault()?.Content?.Parts?.FirstOrDefault()?.Text ?? "";
        var outTokens = result?.UsageMetadata?.CandidatesTokenCount ?? 0;
        return (text, outTokens);
    }

    private static string Truncate(string s, int n) => s.Length <= n ? s : s[..n] + "…";
}
