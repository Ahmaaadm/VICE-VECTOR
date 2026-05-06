# VICE-VECTOR

**A grounded GTA 6 knowledge assistant — full RAG stack, end to end.**

VICE-VECTOR scrapes news articles about Grand Theft Auto VI, embeds them as vectors, and answers user questions using only those sources. It refuses to hallucinate, prefers the most recent article when sources disagree, and stays politely on-topic — anything outside GTA 6 gets a short refusal.

```
┌──────────┐   ┌─────────────┐   ┌──────────────┐   ┌─────────────┐   ┌──────────┐
│  scraper │ → │  chunker /  │ → │ pgvector DB  │ ← │   .NET API  │ ← │  React   │
│  (py)    │   │  embedder   │   │  (Postgres)  │   │   :5035     │   │  :5173   │
└──────────┘   └─────────────┘   └──────────────┘   └─────────────┘   └──────────┘
                                                          │
                                                          ▼
                                                    ┌─────────────┐
                                                    │   Gemini    │
                                                    │ (rewrite +  │
                                                    │   answer)   │
                                                    └─────────────┘
```

---

## What it does well

- **Recency-aware retrieval.** The vector search oversamples then reranks by `similarity + recency_boost` (180-day half-life). When the corpus contains a 2024 "release Fall 2025" article and a 2026 "delayed to November 19, 2026" article, the newer one wins.
- **Multi-turn conversation.** Each session has a chat history; follow-ups like *"so?"* are rewritten into standalone questions before retrieval, so the vector search actually finds relevant chunks instead of garbage.
- **Scope guard in the prompt.** Out-of-scope questions get an exact one-sentence refusal — no inventing facts, no apologies, no leaking the source list.
- **Real /health.** The endpoint actually pings Postgres, Ollama, and Gemini; the UI shows a green/red dot per dependency.
- **No GPU required.** Embeddings run locally on CPU via Ollama (free, fast for short queries). Generation goes to Gemini (free tier, ~50 tok/s, ~3s end-to-end).

---

## Stack

| Layer | Tech |
|---|---|
| **Frontend** | React 19 + TypeScript + Vite + Tailwind v4 (dev: `:5173`) |
| **Backend** | ASP.NET Core (.NET 10) minimal APIs (dev: `:5035`) |
| **Vector DB** | PostgreSQL 16 + pgvector |
| **Embeddings** | Ollama + `nomic-embed-text` (768-dim, runs on CPU) |
| **LLM** | Google Gemini (`gemini-flash-latest`) via REST |
| **Scraper / chunker** | Python 3.10+ (`newspaper3k`, `BeautifulSoup`, `feedparser`) |

---

## Quick start (local, ~5 minutes)

### 0. Prerequisites

- Postgres 16+ with pgvector extension
- Ollama installed (`curl -fsSL https://ollama.com/install.sh | sh`)
- .NET 10 SDK
- Node 20+
- Python 3.10+ (only if you want to re-run the scraper / embedder)

### 1. Clone and install

```bash
git clone <repo>
cd VICE-VECTOR

# Backend deps come down automatically on first build
# Frontend deps:
cd frontend && npm install && cd ..

# Python deps (only if running the scraper):
pip install -r requirements.txt
```

### 2. Configure secrets

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Edit `backend/.env` and set:

```env
GEMINI_API_KEY=...   # https://aistudio.google.com/api-keys
ConnectionStrings__Postgres=Host=localhost;Port=5432;Database=gta6_rag;Username=postgres;Password=postgres
```

`frontend/.env` can be left blank for local dev — the Vite proxy handles it.

### 3. Build the corpus (only if the DB is empty)

```bash
ollama serve &                       # in its own terminal
ollama pull nomic-embed-text

python gta6_scraper.py                # scrape ~70 URLs → data/articles/
python prepare_for_rag.py             # chunk articles → data/rag_chunks.jsonl
python setup_postgres.py              # create gta6_rag DB + insert chunks
python generate_embeddings.py         # fill the vector column (~60s on CPU)
```

See [PIPELINE.md](PIPELINE.md) for a deep dive into every stage.

### 4. Run

```bash
# Terminal 1 — backend (auto-loads backend/.env)
cd backend && dotnet run

# Terminal 2 — frontend
cd frontend && npm run dev
```

Open **http://localhost:5173**. Type "when does GTA 6 release?" and you'll get a confident "November 19, 2026" answer with three source cards underneath, each scored by similarity + recency.

---

## API

The .NET backend serves these on `:5035`. The React app uses the same shape via the Vite proxy.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | Postgres / Ollama / Gemini liveness |
| `GET` | `/api/stats` | DB counts, oldest/newest article date, model names |
| `GET` | `/api/sources?limit=200` | All scraped articles, newest first |
| `POST` | `/api/query` | RAG query — body: `{ question, sessionId?, topK? }` |
| `POST` | `/api/session/reset` | Clear a session's chat history |

Example:

```bash
curl -s http://localhost:5035/api/query \
  -H 'Content-Type: application/json' \
  -d '{"question": "when does gta 6 release?", "sessionId": "demo"}' | jq
```

Response includes the answer, source chunks (with `similarity`, `recencyBoost`, `finalScore`, `publishDate`), pipeline timing breakdown, and the rewritten standalone query if the rewriter fired.

---

## How retrieval works

```python
# Pseudocode for what RagService.SearchSimilarAsync does
candidates = SELECT * FROM gta6_articles
             ORDER BY embedding <=> ?
             LIMIT topK * 4              # oversample

for c in candidates:
    age_days = (today - c.publish_date).days  # null → 0.05 neutral nudge
    c.recency_boost = 0.25 * 0.5 ** (age_days / 180)
    c.final = c.similarity + c.recency_boost

return sorted(candidates, key=final_score, reverse=True)[:topK]
```

Tunable in `backend/appsettings.json` under `Retrieval`:

```json
"Retrieval": {
  "DefaultTopK": 3,
  "Oversample": 4,
  "RecencyWeight": 0.25,
  "RecencyHalfLifeDays": 180,
  "NullDateBoost": 0.05
}
```

---

## How conversation memory works

Sessions are kept in-process via `IMemoryCache` keyed by `sessionId`, with a sliding 60-minute TTL. The frontend generates a session id once and stores it in `localStorage`, so refreshing the page keeps the conversation.

For follow-ups, the backend asks Gemini to rewrite the user's terse message (`"so?"`, `"more details?"`) into a standalone question that the vector search can actually use. Without this step, retrieval scores collapse from ~0.86 to ~0.51 and you get unrelated chunks.

For multi-instance deploys: swap `IMemoryCache` for `IDistributedCache` (Redis) — same interface, no other code changes.

---

## Project layout

```
VICE-VECTOR/
├── README.md                     ← you are here
├── PIPELINE.md                   ← deep dive on the scraper → embed → query flow
├── SCRAPER.md                    ← scraper-specific reference
├── TODO.md                       ← tracked improvements
├── .env (git-ignored)            ← (none at repo root yet)
│
├── backend/                      ← .NET 10 minimal API
│   ├── .env                      ← git-ignored secrets
│   ├── .env.example              ← committed template
│   ├── Program.cs                ← entrypoint, DI, routes
│   ├── appsettings.json          ← non-secret defaults
│   ├── Models/                   ← request / response DTOs
│   ├── Services/
│   │   ├── RagService.cs         ← rewrite + retrieve + rerank + generate
│   │   ├── GeminiService.cs      ← REST client for Gemini
│   │   ├── OllamaService.cs      ← embedding only (local CPU)
│   │   └── SessionService.cs     ← per-session chat history
│   └── wwwroot/index.html        ← legacy single-file UI (still works)
│
├── frontend/                     ← Vite + React + TS
│   ├── .env.example
│   ├── vite.config.ts            ← /api proxy → :5035
│   ├── src/
│   │   ├── App.tsx
│   │   ├── api.ts                ← typed fetch wrappers
│   │   ├── types.ts
│   │   ├── useRag.ts             ← single state hook
│   │   └── components/
│   │       ├── Header.tsx
│   │       ├── ChatTurn.tsx
│   │       ├── SourceCard.tsx
│   │       ├── Composer.tsx
│   │       ├── EmptyState.tsx
│   │       └── AllSourcesPanel.tsx
│   └── package.json
│
├── gta6_scraper.py               ← stage 1: scrape sources.txt
├── prepare_for_rag.py            ← stage 2: chunk → rag_chunks.jsonl
├── setup_postgres.py             ← stage 3: build DB + insert chunks
├── generate_embeddings.py        ← stage 4: fill embedding column
└── query_rag.py                  ← stage 5: CLI version of the RAG loop
```

---

## What's deliberately not yet here (see [TODO.md](TODO.md))

- Streaming answers (SSE) — currently the API waits for Gemini's full response (~3s)
- Hybrid search (vector + BM25 full-text)
- Cross-encoder rerank with `bge-reranker`
- Docker Compose for the whole stack
- Auth / rate limiting per-IP
- Re-scrape stale articles automatically (cron / GitHub Action)
