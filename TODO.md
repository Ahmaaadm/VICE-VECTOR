# VICE-VECTOR — TODO / Improvements

---

## Pipeline (Python Scripts)

### High Priority

- [ ] **Upsert instead of re-insert in `setup_postgres.py`**
  Running the pipeline again after adding new sources currently inserts duplicate rows.
  Fix: use `INSERT ... ON CONFLICT (chunk_id) DO NOTHING` so re-runs are safe.

- [ ] **Incremental embedding generation**
  `generate_embeddings.py` re-processes all chunks every run.
  Fix: `WHERE embedding IS NULL` query already exists — make sure `setup_postgres.py` upsert preserves existing embeddings instead of wiping them.

- [ ] **Re-scrape existing articles on demand**
  There's no way to force-refresh a specific URL without deleting its hash from `saved_hashes.txt` manually.
  Add a `--force-url <url>` flag to `gta6_scraper.py`.

- [ ] **`sources_ultimate.txt` not used by default**
  The scraper defaults to `sources.txt`. Either merge the two files or add a CLI flag `--sources sources_ultimate.txt`.

### Medium Priority

- [ ] **Hybrid search (vector + full-text)**
  Right now retrieval is vector-only. PostgreSQL already has a GIN full-text index on the `text` column (created in `setup_postgres.py`). Combine both:
  `score = 0.7 * vector_similarity + 0.3 * bm25_score`
  This helps for exact-name queries like "Lucia Caminos" where keyword match beats semantic search.

- [ ] **Reranking after retrieval**
  Retrieve TOP_K=10 candidates, then rerank them with a cross-encoder model before sending the top 3 to the LLM.
  Ollama has `bge-reranker` available.

- [ ] **Chunk size tuning**
  Current: 500 words / 50 overlap. Try 300 words for more precise retrieval on short factual questions.
  Make `CHUNK_SIZE` and `CHUNK_OVERLAP` CLI arguments so you can experiment without editing code.

- [ ] **Store scrape date and detect stale articles**
  Articles scraped months ago may be outdated (e.g. release date changed).
  Add a `scraped_at` timestamp and a script to flag/re-scrape articles older than N days.

- [ ] **Add Reddit + Twitter support**
  Currently skipped with a warning. Use Reddit API (PRAW) and Twitter API v2 to pull community discussions.
  Reddit is especially valuable for GTA 6 leaks and community reactions.

- [ ] **YouTube transcript scraping**
  Rockstar trailers and gaming channels have auto-generated transcripts.
  Use `youtube-transcript-api` to pull transcripts and feed them into the pipeline.

### Low Priority

- [ ] **Deduplicate near-duplicate articles**
  MD5 hash catches exact duplicates. Near-duplicates (same article, slightly different intro) slip through.
  Fix: after embedding, cluster chunks with cosine similarity > 0.97 and keep only one.

- [ ] **Keyword extraction quality**
  Current keyword extraction just filters stopwords and counts frequency.
  Replace with TF-IDF or `keybert` for better, more meaningful keywords per chunk.

- [ ] **Add a `--dry-run` flag to the scraper**
  Shows which URLs would be scraped and which would be skipped (duplicate/irrelevant) without saving anything.

---

## Backend (.NET API)

### High Priority

- [ ] **Commit the backend to git**
  The entire `backend/` directory is untracked. Add it and push.

- [ ] **Add error handling to endpoints**
  `Program.cs` has no try/catch around `rag.QueryAsync()`. If Ollama is down or PostgreSQL is unreachable, the API crashes with a 500 and no message.
  Return a structured `{ "error": "..." }` response with appropriate HTTP status codes.

- [ ] **Add streaming response support**
  Ollama's `/api/generate` supports streaming. Right now the API waits for the full answer before responding (can be 30-120s on CPU).
  Implement SSE (Server-Sent Events) so the frontend can show tokens as they stream in.

### Medium Priority

- [ ] **Add `/api/sources` endpoint**
  Return the list of all scraped articles (title, URL, date, word count) so a frontend can display them.

- [ ] **Add `/api/stats` endpoint**
  Return DB stats: total chunks, total articles, embedding coverage (how many chunks have embeddings).

- [ ] **Configuration via environment variables**
  `appsettings.json` has the DB password hardcoded as `postgres`.
  Override with env vars in production: `ConnectionStrings__Postgres`, `Ollama__ChatModel`, etc.

- [ ] **Add request validation**
  `QueryRequest.Question` could be empty or 10,000 characters long. Add length validation (min 3, max 500 chars) and return 400 with a message.

- [ ] **Add response caching**
  Cache identical questions for a short TTL (e.g. 10 minutes) with `IMemoryCache`.
  Saves Ollama inference time for repeated questions.

### Low Priority

- [ ] **Add `/api/query` rate limiting**
  Prevent someone from hammering the endpoint and queuing 50 Ollama jobs.
  Use ASP.NET Core rate limiting middleware.

- [ ] **Structured logging**
  Replace default console logs with Serilog writing to a file, so you can debug production issues.

- [ ] **Health check includes dependency status**
  `/api/health` currently returns `{ status: "ok" }` unconditionally.
  Make it actually ping PostgreSQL and Ollama and return their status.

---

## Frontend (Not Started)

- [ ] **Build a minimal web UI**
  A simple chat interface: text box for questions, answer displayed with source cards below.
  Stack suggestion: plain HTML + Alpine.js (lightweight, no build step) or Next.js if you want something more substantial.

- [ ] **Source cards with links**
  Each source chunk returned by the API should render as a card: article title, publication date, similarity score, link to original URL.

- [ ] **Streaming answer display**
  Connect to the SSE endpoint (once built) and display tokens as they arrive — like ChatGPT's typing effect.

- [ ] **Search history**
  Store previous questions/answers in localStorage so the user can scroll back.

---

## DevOps / Infrastructure

- [ ] **Docker Compose setup**
  One `docker-compose.yml` that spins up PostgreSQL + pgvector, Ollama, and the .NET API together.
  Currently requires manual setup of all three separately.

- [ ] **`.env` file for secrets**
  DB password, Ollama URL, model names should all come from a `.env` not be hardcoded.
  Add `.env.example` and add `.env` to `.gitignore`.

- [ ] **Automate the full pipeline**
  A single `run_pipeline.sh` that runs all 5 Python stages in order with error checking between steps.

- [ ] **Schedule periodic re-scraping**
  Set up a cron job (or GitHub Action) to run the scraper weekly and add new articles automatically as GTA 6 news comes out.

---

## Data / Sources

- [ ] **Expand `sources_ultimate.txt`**
  Add more sources: Eurogamer, PCGamer, VGC, Kotaku, GTA Forums, GTA6.net.
  Aim for 150+ sources to get better RAG coverage.

- [ ] **Add official Rockstar sources**
  Rockstar Newswire posts are the most authoritative source. Add them directly.

- [ ] **Track which sources consistently fail**
  Log a failure rate per domain. If a source fails >80% of the time, remove or replace it.
