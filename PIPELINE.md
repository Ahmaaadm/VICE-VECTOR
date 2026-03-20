# VICE-VECTOR: GTA 6 RAG Pipeline

A complete Retrieval Augmented Generation system that scrapes GTA 6 news articles, stores them as vector embeddings, and answers questions using a local LLM.

## Table of Contents

- [What is RAG?](#what-is-rag)
- [Architecture Overview](#architecture-overview)
- [The Pipeline (5 Stages)](#the-pipeline-5-stages)
  - [Stage 1: Scraping Articles](#stage-1-scraping-articles)
  - [Stage 2: Chunking Text](#stage-2-chunking-text)
  - [Stage 3: Storing in PostgreSQL](#stage-3-storing-in-postgresql)
  - [Stage 4: Generating Embeddings](#stage-4-generating-embeddings)
  - [Stage 5: Query Interface (RAG)](#stage-5-query-interface-rag)
- [Tech Stack](#tech-stack)
- [Data Flow](#data-flow)
- [Database Schema](#database-schema)
- [Models Used](#models-used)
- [Key Concepts Explained](#key-concepts-explained)
- [File Reference](#file-reference)
- [Setup & Run](#setup--run)
- [Configuration](#configuration)
- [Performance Notes](#performance-notes)

---

## What is RAG?

RAG (Retrieval Augmented Generation) solves a fundamental problem with LLMs: they only know what they were trained on, and they can hallucinate facts.

**Without RAG:**
```
User: "When is GTA 6 coming out?"
LLM:  "I think 2025..." (might be wrong, outdated, or made up)
```

**With RAG:**
```
User: "When is GTA 6 coming out?"
System: 1. Search our article database for relevant info
        2. Find: "Rockstar has delayed GTA 6 to May 26, 2026" (from GameSpot)
        3. Feed this context to the LLM
LLM:  "According to GameSpot, GTA 6 has been delayed to May 26, 2026."
        (grounded in real data, with a source)
```

RAG = **Retrieve** relevant documents, then **Generate** an answer using them as context.

---

## Architecture Overview

```
                         VICE-VECTOR PIPELINE

  ┌─────────────────────────────────────────────────────────────────┐
  │                                                                 │
  │   STAGE 1          STAGE 2          STAGE 3         STAGE 4     │
  │                                                                 │
  │   70+ URLs  ──>  55 Articles  ──>  119 Chunks  ──>  119 Chunks │
  │   (sources.txt)  (data/)         (rag_chunks.jsonl)  + Vectors  │
  │                                                      (pgvector) │
  │   gta6_scraper   prepare_for     setup_postgres    generate_    │
  │   .py            _rag.py         .py               embeddings.py│
  │                                                                 │
  └─────────────────────────────────────────────────────────────────┘
                                                           │
                                                           ▼
                                                    ┌─────────────┐
                                                    │   STAGE 5   │
                                                    │             │
                                   User Question ──>│ query_rag.py│
                                                    │             │
                                        Answer  <───│  Embed      │
                                     + Sources      │  Search     │
                                                    │  Generate   │
                                                    └─────────────┘
```

---

## The Pipeline (5 Stages)

### Stage 1: Scraping Articles

**Script:** `gta6_scraper.py`
**Input:** `sources.txt` or `sources_ultimate.txt` (list of URLs)
**Output:** `data/articles/*.txt` + `data/metadata/*.json`

#### What it does

Takes a list of 70+ URLs pointing to GTA 6 news articles and extracts the clean text content from each one.

#### How it works, step by step

```
For each URL in sources.txt:
│
├── 1. CHECK URL TYPE
│   ├── Is it an RSS feed URL? → Parse feed, extract article URLs
│   ├── Is it a news site homepage? → Auto-detect RSS feed, extract articles
│   └── Is it a direct article URL? → Process directly
│
├── 2. FETCH PAGE
│   └── HTTP GET request with browser-like headers
│
├── 3. EXTRACT ARTICLE (dual-method)
│   ├── Try newspaper3k first (ML-based article extraction)
│   │   └── Extracts: title, text, authors, date, images
│   ├── If that fails, fall back to BeautifulSoup
│   │   └── Parses HTML, finds <article> or <p> tags, strips junk
│   └── If both fail → skip this URL
│
├── 4. CLEAN TEXT
│   ├── Remove URLs and email addresses (regex)
│   ├── Remove excessive whitespace
│   ├── Normalize quotes and punctuation
│   └── Strip navigation, footers, ads
│
├── 5. VALIDATE
│   ├── Is it long enough? (minimum word count)
│   ├── Is it about GTA 6? (keyword check against GTA6_KEYWORDS)
│   └── Is it a duplicate? (MD5 hash check against saved_hashes.txt)
│
└── 6. SAVE
    ├── data/articles/article_title.txt    (clean text with header)
    └── data/metadata/article_title.json   (structured metadata)
```

#### Key implementation details

- **Dual extraction:** `newspaper3k` uses machine learning to identify article content vs. boilerplate. If it fails (some sites block it), `BeautifulSoup` does raw HTML parsing as a fallback.
- **RSS auto-detection:** If you give it `https://www.ign.com`, it checks a mapping of known RSS feeds for that domain and fetches articles from the feed instead.
- **Duplicate detection:** Every article's text is hashed with MD5. Hashes are stored in `saved_hashes.txt`. If the same content appears from a different URL, it's skipped.
- **GTA 6 filtering:** Articles must contain at least one keyword from `GTA6_KEYWORDS` (e.g., "gta 6", "rockstar", "vice city"). This prevents saving unrelated articles from RSS feeds.

#### Output format

**Text file** (`data/articles/gta_6_trailer_breakdown.txt`):
```
TITLE: GTA 6 Trailer Breakdown
URL: https://example.com/article
DATE: 2024-12-01
EXTRACTED: 2024-12-05T10:30:00
WORD COUNT: 1250

================================================================================

The first trailer for Grand Theft Auto VI was released...
```

**Metadata JSON** (`data/metadata/gta_6_trailer_breakdown.json`):
```json
{
  "title": "GTA 6 Trailer Breakdown",
  "text": "The first trailer for Grand Theft Auto VI was released...",
  "authors": ["John Smith"],
  "publish_date": "2024-12-01",
  "url": "https://example.com/article",
  "extraction_date": "2024-12-05T10:30:00",
  "word_count": 1250,
  "char_count": 7800,
  "top_image": "https://example.com/image.jpg"
}
```

---

### Stage 2: Chunking Text

**Script:** `prepare_for_rag.py`
**Input:** `data/metadata/*.json`
**Output:** `data/rag_chunks.jsonl`

#### What it does

Splits 55 articles into 119 smaller chunks of ~500 words each. This is necessary because:

1. **LLMs have limited context windows** — you can't feed 55 full articles into a prompt
2. **Smaller chunks = more precise search** — if an article is 2000 words but only 1 paragraph answers your question, a 500-word chunk containing that paragraph will rank higher than the full article
3. **Embedding quality degrades with length** — embedding models produce better representations for shorter, focused text

#### How chunking works

```
Original article (1500 words):
┌──────────────────────────────────────────────────────────────────┐
│ word1 word2 word3 ... word500 word501 ... word1000 ... word1500 │
└──────────────────────────────────────────────────────────────────┘

After chunking (CHUNK_SIZE=500, CHUNK_OVERLAP=50):

Chunk 0: [word1 ─────────────────── word500]
Chunk 1:                    [word451 ─────────────────── word950]
Chunk 2:                                         [word901 ───── word1500]
                             ▲
                             │
                     50-word overlap ensures no
                     sentence is cut in half and
                     context is preserved between chunks
```

#### Parameters

| Parameter | Value | Purpose |
|-----------|-------|---------|
| `CHUNK_SIZE` | 500 words | Size of each chunk |
| `CHUNK_OVERLAP` | 50 words | Overlap between consecutive chunks to preserve context |

#### Additional processing

- **Keyword extraction:** For each chunk, the script extracts the most frequent meaningful words (filtering out stopwords). These keywords are stored alongside the chunk for potential keyword-based search.

#### Output format

`data/rag_chunks.jsonl` — one JSON object per line:
```json
{
  "chunk_id": "https://example.com/article#chunk_0",
  "text": "The first trailer for Grand Theft Auto VI...",
  "metadata": {
    "source_url": "https://example.com/article",
    "title": "GTA 6 Trailer Breakdown",
    "authors": ["John Smith"],
    "publish_date": "2024-12-01",
    "chunk_index": 0,
    "total_chunks": 3,
    "word_count": 498
  },
  "keywords": ["gta", "trailer", "rockstar", "release", "vice"]
}
```

**Why JSONL?** One JSON object per line makes it easy to stream/process large files line by line without loading everything into memory.

---

### Stage 3: Storing in PostgreSQL

**Script:** `setup_postgres.py`
**Input:** `data/rag_chunks.jsonl`
**Output:** `gta6_rag` database with `gta6_articles` table

#### What it does

1. Creates a PostgreSQL database (`gta6_rag`)
2. Enables the `pgvector` extension (adds vector data type and similarity search)
3. Creates the `gta6_articles` table
4. Inserts all 119 chunks (without embeddings — those come in Stage 4)
5. Creates indexes for fast search

#### Why PostgreSQL + pgvector?

We need a database that can:
- Store text chunks with metadata (any SQL database can do this)
- Store 768-dimensional vectors (pgvector adds this to PostgreSQL)
- Find the most similar vectors quickly (pgvector provides similarity operators and indexes)

pgvector turns PostgreSQL into a vector database without needing a separate system like Pinecone or Weaviate.

#### What the table looks like after this stage

| id | chunk_id | title | text | embedding | keywords |
|----|----------|-------|------|-----------|----------|
| 1 | url#chunk_0 | "GTA 6 Trailer..." | "The first trailer..." | `NULL` | {gta, trailer} |
| 2 | url#chunk_1 | "GTA 6 Trailer..." | "Rockstar confirmed..." | `NULL` | {rockstar, release} |

The `embedding` column is NULL — it gets filled in Stage 4.

#### Indexes created

1. **IVFFlat index on embedding column** — speeds up vector similarity search from O(n) to approximately O(sqrt(n)). Uses cosine distance (`vector_cosine_ops`).
2. **GIN index on text column** — enables PostgreSQL full-text search as a fallback/complement to vector search.

---

### Stage 4: Generating Embeddings

**Script:** `generate_embeddings.py`
**Input:** Chunks in PostgreSQL (embedding = NULL)
**Output:** Updates each row with a 768-dimensional embedding vector

#### What it does

For each of the 119 chunks in the database:
1. Sends the chunk text to Ollama's `nomic-embed-text` model
2. Gets back a vector of 768 floating-point numbers
3. Updates the row in PostgreSQL with this vector

#### What is an embedding?

An embedding converts text into a fixed-size list of numbers that captures its **meaning**. Texts with similar meanings end up with similar numbers.

```
"GTA 6 release delayed to 2026"     → [0.12, -0.34, 0.87, 0.03, ... 768 numbers]
"Rockstar postpones GTA VI launch"  → [0.11, -0.33, 0.85, 0.04, ... 768 numbers]  ← CLOSE!
"Best pizza recipes for beginners"  → [-0.92, 0.45, -0.11, 0.78, ... 768 numbers] ← FAR!
```

The distance between vectors tells you how semantically similar two texts are. This is more powerful than keyword matching:
- Keyword search: "When is GTA 6 releasing?" won't match "Rockstar postpones launch" (different words)
- Vector search: These two WILL match because they mean the same thing

#### How nomic-embed-text works (simplified)

1. Tokenize the text into subword tokens
2. Pass tokens through a transformer neural network (137M parameters)
3. The network outputs a 768-dimensional vector
4. This vector is a compressed representation of the text's meaning

#### The database after this stage

| id | text | embedding |
|----|------|-----------|
| 1 | "The first trailer..." | `[0.12, -0.34, 0.87, ... 768 floats]` |
| 2 | "Rockstar confirmed..." | `[-0.05, 0.22, 0.91, ... 768 floats]` |

Now pgvector can compute distances between any two rows' embeddings and find the most similar ones.

---

### Stage 5: Query Interface (RAG)

**Script:** `query_rag.py`
**Input:** User's question (typed interactively)
**Output:** Answer grounded in scraped articles, with sources

#### What it does

This is where everything comes together. When you ask a question, three things happen:

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  STEP 1: EMBED THE QUESTION                                        │
│  ─────────────────────────                                          │
│  "Who is Lucia?" ──> Ollama (nomic-embed-text) ──> [0.15, -0.30,..]│
│                                                                     │
│  Same model that embedded the chunks. This ensures the question     │
│  and the chunks live in the same vector space.                      │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  STEP 2: SIMILARITY SEARCH (pgvector)                               │
│  ────────────────────────────────────                               │
│  SELECT text, 1 - (embedding <=> question_vector) AS similarity     │
│  FROM gta6_articles                                                 │
│  ORDER BY embedding <=> question_vector                             │
│  LIMIT 3;                                                           │
│                                                                     │
│  <=> is pgvector's cosine distance operator.                        │
│  This finds the 3 chunks whose meaning is closest to the question.  │
│                                                                     │
│  Results:                                                           │
│    1. [0.56] "Lucia Caminos" (gta.fandom.com)                      │
│    2. [0.51] "Story, Background..." (wikigta6.com)                  │
│    3. [0.48] "Who Is Lucia..." (beebom.com)                         │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  STEP 3: GENERATE ANSWER (LLM)                                     │
│  ──────────────────────────────                                     │
│  Build a prompt:                                                    │
│  ┌─────────────────────────────────────────────────────────┐        │
│  │ System: You are a GTA 6 knowledge assistant. Answer     │        │
│  │ based ONLY on the provided sources.                     │        │
│  │                                                         │        │
│  │ Sources:                                                │        │
│  │ [Source 1] Lucia Caminos                                │        │
│  │ Lucia Caminos is a lead playable character...           │        │
│  │                                                         │        │
│  │ [Source 2] Story, Background...                         │        │
│  │ Lucia is the first female protagonist in...             │        │
│  │                                                         │        │
│  │ Question: Who is Lucia?                                 │        │
│  └─────────────────────────────────────────────────────────┘        │
│                        │                                            │
│                        ▼                                            │
│               Ollama (mistral 7B)                                   │
│                        │                                            │
│                        ▼                                            │
│  "Lucia Caminos is the lead playable character in GTA 6 and        │
│   the first female protagonist in the series. According to          │
│   Source 1, she is from Leonida and her story begins with..."       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

#### Why "based ONLY on the provided sources"?

This instruction in the prompt prevents the LLM from hallucinating. Without it, the model might mix its training knowledge (which could be wrong or outdated) with the article data. By constraining it to the sources, every claim in the answer is traceable to a real article.

#### TOP_K parameter

`TOP_K` controls how many chunks are sent to the LLM as context:

| TOP_K | Pros | Cons |
|-------|------|------|
| 1 | Fastest, least tokens | Might miss relevant info |
| 3 | Good balance | Moderate speed |
| 5 | Best coverage | Slowest, more tokens for LLM to process |

---

## Tech Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Scraping | newspaper3k + BeautifulSoup | Extract articles from web pages |
| RSS parsing | feedparser | Parse RSS/Atom feeds |
| Database | PostgreSQL + pgvector | Store chunks and vectors, similarity search |
| Embeddings | Ollama + nomic-embed-text | Convert text to 768-dim vectors locally |
| LLM | Ollama + mistral (7B) | Generate answers from context |
| Language | Python 3.14 | Everything |

---

## Data Flow

```
sources.txt (70+ URLs)
       │
       ▼
gta6_scraper.py
       │
       ├──> data/articles/*.txt      (55 clean text files)
       ├──> data/metadata/*.json     (55 metadata files)
       └──> data/saved_hashes.txt    (61 MD5 hashes)
              │
              ▼
    prepare_for_rag.py
              │
              └──> data/rag_chunks.jsonl  (119 chunks)
                          │
                          ▼
                setup_postgres.py
                          │
                          └──> PostgreSQL: gta6_articles table (119 rows, embedding=NULL)
                                       │
                                       ▼
                            generate_embeddings.py
                                       │
                                       └──> PostgreSQL: gta6_articles (119 rows, embedding=filled)
                                                    │
                                                    ▼
                                              query_rag.py
                                                    │
                                                    └──> User asks question → gets answer + sources
```

---

## Database Schema

```sql
CREATE TABLE gta6_articles (
    id           SERIAL PRIMARY KEY,
    chunk_id     VARCHAR(500) UNIQUE NOT NULL,  -- "url#chunk_N"
    title        VARCHAR(1000),                 -- article title
    source_url   TEXT,                          -- original article URL
    publish_date VARCHAR(100),                  -- when article was published
    chunk_index  INTEGER,                       -- 0, 1, 2... within the article
    total_chunks INTEGER,                       -- how many chunks this article produced
    word_count   INTEGER,                       -- words in this chunk
    text         TEXT NOT NULL,                 -- the actual chunk text
    keywords     TEXT[],                        -- extracted keywords array
    embedding    vector(768),                   -- nomic-embed-text output (768 floats)
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Fast vector similarity search (cosine distance)
CREATE INDEX gta6_articles_embedding_idx
ON gta6_articles USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Full-text search fallback
CREATE INDEX gta6_articles_text_idx
ON gta6_articles USING gin(to_tsvector('english', text));
```

---

## Models Used

### nomic-embed-text (Embedding Model)
- **Size:** 274 MB
- **Output:** 768-dimensional vector
- **Parameters:** 137M
- **Purpose:** Converts text to vectors. Used for both chunks (Stage 4) and queries (Stage 5).
- **Speed:** Fast (~0.5s per text on CPU)

### mistral (Chat Model)
- **Size:** 4.1 GB
- **Parameters:** 7B
- **Purpose:** Generates natural language answers from context + question
- **Speed:** ~20 tokens/sec on CPU (slow), ~200+ tokens/sec on GPU

Both models run **locally** via Ollama. No data leaves your machine.

---

## Key Concepts Explained

### Cosine Similarity
Measures the angle between two vectors. Ranges from -1 (opposite) to 1 (identical).
```
similarity = 1 - cosine_distance

0.9+ = Very similar meaning
0.7-0.9 = Related topic
0.5-0.7 = Loosely related
<0.5 = Different topics
```

### IVFFlat Index
Instead of comparing your query against all 119 vectors (brute force), IVFFlat clusters vectors into 100 lists. At query time, it only searches the nearest clusters. This is approximate but much faster for large datasets.

### JSONL Format
JSON Lines — one JSON object per line. Unlike a JSON array, you can process it line by line without loading the entire file into memory:
```
{"chunk_id": "url#0", "text": "...", "metadata": {...}}
{"chunk_id": "url#1", "text": "...", "metadata": {...}}
```

### Transformer Model
The neural network architecture behind both the embedding model and the chat model. It processes text by attending to relationships between all words simultaneously (self-attention), which is why it understands meaning rather than just matching keywords.

---

## File Reference

| File | Stage | Purpose |
|------|-------|---------|
| `sources.txt` | 1 | URL list (basic) |
| `sources_ultimate.txt` | 1 | URL list (curated, categorized) |
| `gta6_scraper.py` | 1 | Scrapes articles from URLs |
| `prepare_for_rag.py` | 2 | Chunks articles for RAG |
| `setup_postgres.py` | 3 | Creates DB, inserts chunks |
| `generate_embeddings.py` | 4 | Generates vector embeddings via Ollama |
| `query_rag.py` | 5 | Interactive RAG query interface |
| `test_scraper.py` | - | Test suite for the scraper |
| `setup.sh` / `setup.bat` | - | Environment setup scripts |
| `requirements.txt` | - | Python dependencies |
| `data/articles/` | 1 | Scraped article text files |
| `data/metadata/` | 1 | Article metadata (JSON) |
| `data/rag_chunks.jsonl` | 2 | Chunked text ready for embedding |
| `data/saved_hashes.txt` | 1 | MD5 hashes for dedup |
| `data/scraper.log` | 1 | Scraper execution log |

---

## Setup & Run

### Prerequisites
- Python 3.10+
- PostgreSQL 12+ with pgvector extension
- Ollama

### Step-by-step

```bash
# 1. Install Python dependencies
pip install -r requirements.txt
pip install psycopg2-binary requests

# 2. Install Ollama (https://ollama.ai) then pull models
ollama pull nomic-embed-text
ollama pull mistral

# 3. Start Ollama server (keep running in background)
ollama serve

# 4. Run the full pipeline
python gta6_scraper.py          # Stage 1: Scrape articles
python prepare_for_rag.py       # Stage 2: Chunk text
python setup_postgres.py        # Stage 3: Create DB + insert chunks
python generate_embeddings.py   # Stage 4: Generate embeddings
python query_rag.py             # Stage 5: Ask questions!
```

---

## Configuration

### Scraper (`gta6_scraper.py`)
```python
GTA6_KEYWORDS = ["gta 6", "gta vi", "rockstar", "vice city", ...]  # line 48
RSS_FEEDS = {"ign.com": "https://...", ...}                          # line 38
```

### Chunking (`prepare_for_rag.py`)
```python
CHUNK_SIZE = 500     # words per chunk (line 25)
CHUNK_OVERLAP = 50   # overlap between chunks (line 26)
```

### Database (`setup_postgres.py`)
```python
DB_CONFIG = {
    'host': 'localhost', 'port': 5432,
    'database': 'gta6_rag', 'user': 'postgres', 'password': 'postgres'
}
```

### Query (`query_rag.py`)
```python
CHAT_MODEL = "mistral"       # LLM for answer generation (line 19)
EMBED_MODEL = "nomic-embed-text"  # embedding model (line 18)
TOP_K = 3                    # number of chunks to retrieve (line 20)
```

---

## Performance Notes

| Step | Time | Bottleneck |
|------|------|-----------|
| Embedding a question | ~0.5s | Fast, small model |
| pgvector similarity search | ~0.01s | Instant |
| LLM answer generation (CPU) | 30-120s | Slow — CPU processes 7B params word by word |
| LLM answer generation (GPU) | 2-5s | Fast — thousands of parallel cores |

### To improve speed:
1. **Use a GPU** (NVIDIA with CUDA, AMD with ROCm, or Apple Silicon)
2. **Use a smaller chat model** (`tinyllama`, `phi3`)
3. **Reduce TOP_K** (fewer chunks = shorter prompt = faster generation)
4. **Use a cloud API** (Groq, OpenAI) instead of local Ollama for the chat model
