# .NET Core Backend Guide (for Node/Flask devs)

This guide explains the backend code using comparisons to Node.js (Express) and Python (Flask) so you can learn .NET Core faster.

---

## Project Structure

```
backend/
├── Program.cs                  # Entry point (like app.js or app.py)
├── ViceVector.Api.csproj       # Project config (like package.json or requirements.txt)
├── appsettings.json            # Config file (like .env or config.json)
├── Properties/
│   └── launchSettings.json     # Dev server settings (port, environment)
├── Models/                     # Data classes (like TypeScript interfaces or Python dataclasses)
│   ├── QueryRequest.cs
│   ├── QueryResponse.cs
│   └── OllamaModels.cs
└── Services/                   # Business logic (like controllers/services in Express)
    ├── RagService.cs           # RAG pipeline logic
    └── OllamaService.cs       # Ollama API client
```

---

## File-by-File Breakdown

### 1. `Program.cs` — The Entry Point

This is like `app.js` in Express or `app.py` in Flask. It sets up the server and defines routes.

```csharp
var builder = WebApplication.CreateBuilder(args);  // like: const app = express()
```

**In Node (Express):**
```js
const app = express();
app.use(cors());
app.post('/api/query', handler);
app.listen(5035);
```

**In Flask:**
```python
app = Flask(__name__)
CORS(app)

@app.route('/api/query', methods=['POST'])
def query(): ...

app.run(port=5035)
```

**In .NET Core (what we have):**
```csharp
var builder = WebApplication.CreateBuilder(args);
// ... register services ...
var app = builder.Build();
app.UseCors();
app.MapPost("/api/query", async (QueryRequest request, RagService rag) => { ... });
app.Run();
```

Key difference: .NET uses **Dependency Injection (DI)** built-in. You register services once, and .NET automatically creates and passes them to your endpoints. In Express you'd `require()` them manually, in Flask you'd import them.

---

### 2. `ViceVector.Api.csproj` — Project File

This is your `package.json` (Node) or `requirements.txt` (Python).

```xml
<PackageReference Include="Npgsql" Version="10.0.2" />       <!-- like: npm install pg -->
<PackageReference Include="Pgvector" Version="0.3.2" />       <!-- like: pip install pgvector -->
```

- `Npgsql` = PostgreSQL driver (like `pg` in Node or `psycopg2` in Python)
- `Pgvector` = pgvector support for .NET

To add a package: `dotnet add package PackageName` (like `npm install` or `pip install`)

---

### 3. `appsettings.json` — Configuration

This is like `.env` or `config.json`. It stores database connection strings and Ollama settings.

```json
{
  "ConnectionStrings": {
    "Postgres": "Host=localhost;Port=5432;Database=gta6_rag;Username=postgres;Password=postgres"
  },
  "Ollama": {
    "BaseUrl": "http://localhost:11434",
    "EmbedModel": "nomic-embed-text",
    "ChatModel": "mistral"
  }
}
```

You access these values with `IConfiguration`:
```csharp
config["Ollama:ChatModel"]           // returns "mistral"
config.GetConnectionString("Postgres") // returns the connection string
```

**Flask equivalent:** `os.environ.get("CHAT_MODEL")` or `app.config["CHAT_MODEL"]`
**Node equivalent:** `process.env.CHAT_MODEL` or `config.chatModel`

---

### 4. `Models/` — Data Shapes

Models are like **TypeScript interfaces** or **Python dataclasses**. They define the shape of your data.

#### `QueryRequest.cs` — What the user sends
```csharp
public class QueryRequest
{
    public required string Question { get; set; }  // must have a question
    public int TopK { get; set; } = 3;             // optional, defaults to 3
}
```

**TypeScript equivalent:**
```ts
interface QueryRequest {
  question: string;
  topK?: number; // defaults to 3
}
```

**Python equivalent:**
```python
@dataclass
class QueryRequest:
    question: str
    topK: int = 3
```

#### `QueryResponse.cs` — What we send back
```csharp
public class QueryResponse
{
    public string Answer { get; set; }          // The LLM's answer
    public List<SourceChunk> Sources { get; set; }  // Which chunks were used
    public PipelineStats Stats { get; set; }    // Timing/performance info
}
```

This is the JSON the frontend/Thunder Client receives.

#### `OllamaModels.cs` — Ollama API shapes
These match the JSON that Ollama's REST API expects and returns. Same API you used in Python, just typed in C#.

---

### 5. `Services/OllamaService.cs` — Ollama API Client

This wraps the HTTP calls to Ollama. It does exactly what your Python `requests.post()` calls did.

**Python (what you had):**
```python
def get_embedding(text):
    response = requests.post("http://localhost:11434/api/embed",
        json={"model": "nomic-embed-text", "input": text})
    return response.json()["embeddings"][0]
```

**C# (what we have):**
```csharp
public async Task<float[]> GetEmbeddingAsync(string text)
{
    var request = new OllamaEmbedRequest { Model = _embedModel, Input = text };
    var response = await _http.PostAsJsonAsync("/api/embed", request);
    response.EnsureSuccessStatusCode();
    var result = await response.Content.ReadFromJsonAsync<OllamaEmbedResponse>();
    return result!.Embeddings[0].ToArray();
}
```

Key .NET concepts here:
- `async Task<float[]>` = async function that returns `float[]` (like `async function(): Promise<number[]>` in TS)
- `await` = same as JS/Python `await`
- `PostAsJsonAsync` = like `requests.post(json=...)` — sends JSON automatically
- `ReadFromJsonAsync<T>` = parses JSON into a typed object (no manual `response.json()["key"]` needed)
- `HttpClient` = like `axios` in Node or `requests.Session()` in Python

---

### 6. `Services/RagService.cs` — The RAG Pipeline

This is the core logic — the C# version of `query_rag.py`. Same 3 steps:

| Step | Python version | C# version |
|------|---------------|-------------|
| 1. Embed question | `requests.post(OLLAMA_EMBED_URL, ...)` | `_ollama.GetEmbeddingAsync(question)` |
| 2. Search DB | `cursor.execute("SELECT ... ORDER BY embedding <=> ...")` | `NpgsqlCommand` with same SQL |
| 3. Generate answer | `requests.post(OLLAMA_CHAT_URL, ...)` | `_ollama.GenerateAsync(prompt)` |

**Database query in Python:**
```python
conn = psycopg2.connect(**DB_CONFIG)
cursor = conn.cursor()
cursor.execute("SELECT ... FROM gta6_articles WHERE ...", (params,))
results = cursor.fetchall()
conn.close()
```

**Database query in C#:**
```csharp
await using var conn = new NpgsqlConnection(_connectionString);
await conn.OpenAsync();
await using var cmd = new NpgsqlCommand("SELECT ... FROM gta6_articles WHERE ...", conn);
cmd.Parameters.AddWithValue(vector);
await using var reader = await cmd.ExecuteReaderAsync();
while (await reader.ReadAsync()) { /* read each row */ }
```

Key differences:
- `await using` = auto-closes the connection when done (like Python's `with` statement)
- `Parameters.AddWithValue` = safe parameter binding (prevents SQL injection, like `%s` in psycopg2)
- You read columns by index: `reader.GetString(0)` instead of `row[0]`

---

## Key .NET Concepts (vs Node/Flask)

### Dependency Injection (DI)
The biggest difference. In Node/Flask you import and create things manually. In .NET, you **register** services once and the framework gives them to you.

```csharp
// Register (in Program.cs):
builder.Services.AddScoped<RagService>();

// Use (in endpoint — .NET injects it automatically):
app.MapPost("/api/query", async (QueryRequest request, RagService rag) => { ... });
```

- `AddScoped` = create one instance per HTTP request (most common)
- `AddSingleton` = one instance for the entire app lifetime
- `AddTransient` = new instance every time it's needed

### Async/Await
Works just like JavaScript. Every async method returns `Task<T>` (like `Promise<T>`).

```csharp
public async Task<string> GetDataAsync()    // C#
async function getData(): Promise<string>   // TypeScript
async def get_data() -> str:                # Python
```

### Strongly Typed Models
Instead of working with raw JSON objects, C# uses typed classes. The framework auto-serializes/deserializes JSON for you:
- Incoming JSON body → `QueryRequest` object (automatic)
- Return `QueryResponse` → JSON output (automatic)

No need for `req.body.question` (Express) or `request.get_json()["question"]` (Flask).

---

## Common Commands

| What | Command |
|------|---------|
| Run the server | `dotnet run` |
| Add a package | `dotnet add package PackageName` |
| Restore packages | `dotnet restore` |
| Build without running | `dotnet build` |
| Clean build files | `dotnet clean` |
| Watch mode (auto-restart) | `dotnet watch` |

`dotnet watch` is like `nodemon` — it restarts the server when you change code.

---

## API Endpoints

| Method | URL | Body | Description |
|--------|-----|------|-------------|
| GET | `/api/health` | none | Health check |
| POST | `/api/query` | `{"question": "...", "topK": 3}` | Ask the RAG pipeline |

---

## How It All Connects

```
User sends POST /api/query
        │
        ▼
   Program.cs (routes request)
        │
        ▼
   RagService.QueryAsync()
        │
        ├── Step 1: OllamaService.GetEmbeddingAsync()  →  Ollama /api/embed
        ├── Step 2: SearchSimilarAsync()                →  PostgreSQL + pgvector
        └── Step 3: OllamaService.GenerateAsync()       →  Ollama /api/generate
        │
        ▼
   Returns QueryResponse (JSON) with answer, sources, and stats
```

This is the exact same flow as `query_rag.py`, just structured as a web API instead of a CLI script.
