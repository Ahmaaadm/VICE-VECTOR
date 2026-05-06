using System.Text.Json;
using DotNetEnv;
using Npgsql;
using ViceVector.Api.Models;
using ViceVector.Api.Services;

// Load .env (if present) BEFORE CreateBuilder so the values become real
// environment variables and ASP.NET Core's config system picks them up
// automatically. NoClobber: a real OS-level env var wins over the file —
// this is what you want in production where secrets come from the platform.
Env.NoClobber().TraversePath().Load();

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddOpenApi();
builder.Services.AddMemoryCache();

// Postgres data source with pgvector type mapping registered once at startup.
// We need this rather than per-connection ReloadTypes() so Npgsql knows how to
// serialize Pgvector.Vector parameters without a manually-set DataTypeName.
var connString = builder.Configuration.GetConnectionString("Postgres")
    ?? "Host=localhost;Port=5432;Database=gta6_rag;Username=postgres;Password=postgres";
var dataSourceBuilder = new NpgsqlDataSourceBuilder(connString);
dataSourceBuilder.UseVector();
builder.Services.AddSingleton(dataSourceBuilder.Build());

// Ollama (embeddings only) — local, fast, free.
builder.Services.AddHttpClient<OllamaService>(client =>
{
    var baseUrl = builder.Configuration["Ollama:BaseUrl"] ?? "http://localhost:11434";
    client.BaseAddress = new Uri(baseUrl);
    client.Timeout = TimeSpan.FromSeconds(30);
});

// Gemini (chat generation) — answer + query rewrite.
builder.Services.AddHttpClient<GeminiService>(client =>
{
    var baseUrl = builder.Configuration["Gemini:BaseUrl"] ?? "https://generativelanguage.googleapis.com";
    client.BaseAddress = new Uri(baseUrl);
    client.Timeout = TimeSpan.FromMinutes(2);
});

builder.Services.AddSingleton<SessionService>();
builder.Services.AddScoped<HistoryService>();
builder.Services.AddScoped<RagService>();

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
        policy.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader());
});

builder.Services.ConfigureHttpJsonOptions(opt =>
{
    opt.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
});

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseCors();

// Serve the static SPA from wwwroot/. Falls through to index.html for client routes.
app.UseDefaultFiles();
app.UseStaticFiles();

// ---------- API ----------

app.MapGet("/api/health", async (RagService rag, OllamaService ollama, GeminiService gemini) =>
{
    var pgOk = await rag.CanReachPostgresAsync();
    var ollamaOk = await ollama.IsReachableAsync();
    var geminiOk = gemini.HasApiKey;

    var resp = new HealthResponse
    {
        Status = (pgOk && ollamaOk && geminiOk) ? "ok" : "degraded",
        Postgres = new DependencyStatus { Ok = pgOk, Detail = pgOk ? null : "cannot connect" },
        Ollama = new DependencyStatus { Ok = ollamaOk, Detail = ollamaOk ? null : "ollama serve not running?" },
        Gemini = new DependencyStatus { Ok = geminiOk, Detail = geminiOk ? null : "GEMINI_API_KEY not set" },
    };
    return Results.Ok(resp);
});

app.MapGet("/api/stats", async (RagService rag, ILogger<Program> log) =>
{
    try
    {
        return Results.Ok(await rag.GetStatsAsync());
    }
    catch (Exception ex)
    {
        log.LogError(ex, "/api/stats failed");
        return Results.Problem(title: "stats failed", detail: ex.Message, statusCode: 500);
    }
});

app.MapGet("/api/sources", async (RagService rag, int? limit, ILogger<Program> log) =>
{
    try
    {
        return Results.Ok(await rag.ListArticlesAsync(limit ?? 200));
    }
    catch (Exception ex)
    {
        log.LogError(ex, "/api/sources failed");
        return Results.Problem(title: "sources failed", detail: ex.Message, statusCode: 500);
    }
});

app.MapPost("/api/query", async (QueryRequest request, RagService rag, ILogger<Program> log) =>
{
    if (string.IsNullOrWhiteSpace(request.Question))
        return Results.BadRequest(new ErrorResponse { Error = "Question is required" });
    if (request.Question.Length < 2)
        return Results.BadRequest(new ErrorResponse { Error = "Question is too short" });
    if (request.Question.Length > 2000)
        return Results.BadRequest(new ErrorResponse { Error = "Question exceeds 2000 character limit" });
    if (request.TopK is < 1 or > 10)
        return Results.BadRequest(new ErrorResponse { Error = "topK must be between 1 and 10" });

    try
    {
        var result = await rag.QueryAsync(request);
        return Results.Ok(result);
    }
    catch (InvalidOperationException ex)
    {
        log.LogWarning(ex, "/api/query config error");
        return Results.Problem(title: "configuration error", detail: ex.Message, statusCode: 500);
    }
    catch (HttpRequestException ex)
    {
        log.LogError(ex, "/api/query upstream failure");
        return Results.Problem(title: "upstream service failed", detail: ex.Message, statusCode: 502);
    }
    catch (Exception ex)
    {
        log.LogError(ex, "/api/query unhandled");
        return Results.Problem(title: "query failed", detail: ex.Message, statusCode: 500);
    }
});

app.MapPost("/api/session/reset", (ResetSessionRequest request, SessionService sessions) =>
{
    if (string.IsNullOrWhiteSpace(request.SessionId))
        return Results.BadRequest(new ErrorResponse { Error = "sessionId is required" });
    sessions.Reset(request.SessionId);
    return Results.Ok(new { ok = true, sessionId = request.SessionId });
});

// Admin: paged query history (newest first).
// TODO: gate behind auth before exposing publicly. For now it's a private dashboard.
app.MapGet("/api/admin/history", async (RagService rag, int? limit, ILogger<Program> log) =>
{
    var capped = Math.Clamp(limit ?? 100, 1, 500);
    try
    {
        var entries = await rag.ListHistoryAsync(capped);
        return Results.Ok(entries);
    }
    catch (Exception ex)
    {
        log.LogError(ex, "/api/admin/history failed");
        return Results.Problem(title: "history failed", detail: ex.Message, statusCode: 500);
    }
});

// SPA fallback — anything that didn't match an /api/* route falls through to index.html
app.MapFallbackToFile("index.html");

app.Run();
