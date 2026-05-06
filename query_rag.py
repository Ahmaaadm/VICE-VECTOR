"""
GTA 6 RAG Query Interface

Ask questions about GTA 6 and get answers grounded in scraped articles.

Requirements:
    - Ollama running (for embeddings only): ollama serve
    - Model: nomic-embed-text
    - PostgreSQL with embedded chunks (run generate_embeddings.py first)
    - GEMINI_API_KEY env var (for answer generation via Google Gemini)
"""

import os
import requests
import psycopg2
import time
from datetime import datetime, timezone
from google import genai

OLLAMA_EMBED_URL = "http://localhost:11434/api/embed"
EMBED_MODEL = "nomic-embed-text"
CHAT_MODEL = "gemini-flash-latest"
TOP_K = 3
OVERSAMPLE = 4              # fetch TOP_K * OVERSAMPLE candidates, then rerank by recency
RECENCY_WEIGHT = 0.25       # max boost added to a similarity score (0..1)
RECENCY_HALF_LIFE_DAYS = 180  # ~6 months: an article this old gets half the max boost
NULL_DATE_BOOST = 0.05      # neutral nudge for chunks with unknown date
MAX_HISTORY_PAIRS = 3       # last N user+assistant turns kept for context

history = []  # list of dicts: {"role": "user"|"assistant", "content": str}

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise SystemExit("GEMINI_API_KEY env var is not set. Run: set -Ux GEMINI_API_KEY <AIzaSyCqqfL2SycMDtP6UNoz5LFjGxyRlEVo5z8>")
gemini_client = genai.Client(api_key=GEMINI_API_KEY)

DB_CONFIG = {
    'host': 'localhost',
    'port': 5432,
    'database': 'gta6_rag',
    'user': 'postgres',
    'password': 'postgres'
}


def get_embedding(text):
    """Get embedding for a query."""
    response = requests.post(OLLAMA_EMBED_URL, json={
        "model": EMBED_MODEL,
        "input": text
    }, timeout=60)
    response.raise_for_status()
    return response.json()["embeddings"][0]


def _parse_publish_date(raw):
    """Parse the messy publish_date string column into a UTC datetime, or None."""
    if not raw:
        return None
    s = str(raw).strip()
    # Try ISO 8601 directly (handles "+00:00", microseconds, dates only).
    try:
        dt = datetime.fromisoformat(s)
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except ValueError:
        pass
    # Fall back to a few common shapes.
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%Y/%m/%d"):
        try:
            return datetime.strptime(s[:len(fmt) + 5], fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def _recency_boost(publish_dt):
    """Map a publish datetime to an additive score in [0, RECENCY_WEIGHT].
    Half-life decay: today = full boost, +RECENCY_HALF_LIFE_DAYS = half boost, etc.
    Unknown date returns NULL_DATE_BOOST so missing-date rows aren't crushed."""
    if publish_dt is None:
        return NULL_DATE_BOOST
    age_days = max(0.0, (datetime.now(timezone.utc) - publish_dt).total_seconds() / 86400)
    return RECENCY_WEIGHT * (0.5 ** (age_days / RECENCY_HALF_LIFE_DAYS))


def search_similar(embedding, top_k=TOP_K):
    """Vector search with recency-aware rerank.

    Pulls top_k * OVERSAMPLE candidates by pure similarity, then reranks them by
    (similarity + recency_boost) so newer articles surface for time-sensitive
    questions like 'when does GTA 6 release?' even if older articles have been
    repeated more often in the corpus.
    """
    conn = psycopg2.connect(**DB_CONFIG)
    cursor = conn.cursor()

    cursor.execute("""
        SELECT title, source_url, text, chunk_index, publish_date,
               1 - (embedding <=> %s::vector) AS similarity
        FROM gta6_articles
        WHERE embedding IS NOT NULL
        ORDER BY embedding <=> %s::vector
        LIMIT %s
    """, (str(embedding), str(embedding), top_k * OVERSAMPLE))

    raw = cursor.fetchall()
    cursor.close()
    conn.close()

    reranked = []
    for title, url, text, chunk_idx, publish_date, similarity in raw:
        pub_dt = _parse_publish_date(publish_date)
        boost = _recency_boost(pub_dt)
        final = float(similarity) + boost
        reranked.append((title, url, text, chunk_idx, publish_date, float(similarity), boost, final))

    reranked.sort(key=lambda r: r[7], reverse=True)
    return reranked[:top_k]


def format_history_for_prompt(history):
    if not history:
        return ""
    lines = []
    for turn in history:
        speaker = "User" if turn["role"] == "user" else "Assistant"
        lines.append(f"{speaker}: {turn['content']}")
    return "\n".join(lines)


def rewrite_query(question, history):
    """Rewrite a follow-up question into a standalone form using history.
    Returns the rewritten question, or the original if no history exists."""
    if not history:
        return question

    history_text = format_history_for_prompt(history)
    prompt = f"""Rewrite the user's latest message as a standalone question that can be understood without the prior conversation. Preserve the user's intent. If the latest message is already self-contained, return it unchanged. Output ONLY the rewritten question, nothing else.

Conversation so far:
{history_text}

Latest message: {question}

Standalone question:"""

    t0 = time.time()
    response = gemini_client.models.generate_content(
        model=CHAT_MODEL,
        contents=prompt,
    )
    elapsed = time.time() - t0
    rewritten = response.text.strip().strip('"').strip("'")
    if rewritten != question:
        print(f"  [LOG] Rewrote query in {elapsed:.2f}s: \"{rewritten}\"")
    return rewritten


def generate_answer(question, chunks, history):
    """Send question + context + prior turns to Gemini and get an answer."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    context = ""
    for i, row in enumerate(chunks, 1):
        title, text, publish_date = row[0], row[2], row[4]
        date_label = publish_date if publish_date else "unknown date"
        context += f"\n[Source {i}] {title}  (published: {date_label})\n{text}\n"

    history_block = format_history_for_prompt(history)
    history_section = f"\nPrior conversation:\n{history_block}\n" if history_block else ""

    prompt = f"""You are a GTA 6 knowledge assistant. Today is {today}. Your scope is strictly Grand Theft Auto VI: its release, story, characters, gameplay, map, trailers, leaks, development, marketing, Rockstar / Take-Two business news directly tied to GTA 6, and similar GTA-franchise context that helps interpret a GTA 6 question.

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
{history_section}
Sources:
{context}

Question: {question}

Answer:"""

    prompt_len = len(prompt.split())
    print(f"  [LOG] Prompt length: {prompt_len} words")
    print(f"  [LOG] Sending to {CHAT_MODEL}...")

    t0 = time.time()
    response = gemini_client.models.generate_content(
        model=CHAT_MODEL,
        contents=prompt,
    )
    elapsed = time.time() - t0

    answer = response.text
    usage = getattr(response, "usage_metadata", None)
    out_tokens = getattr(usage, "candidates_token_count", None) if usage else None

    print(f"  [LOG] Response received!")
    if out_tokens:
        print(f"  [LOG] Tokens generated: {out_tokens}")
        if elapsed > 0:
            print(f"  [LOG] Speed: {out_tokens / elapsed:.1f} tokens/sec")
    print(f"  [LOG] Generation time: {elapsed:.2f}s")

    return answer


def query(question):
    """Full RAG pipeline: rewrite → embed → search → generate (history-aware)."""
    print(f"\n{'='*70}")
    print(f"Question: {question}")
    print(f"{'='*70}\n")

    total_start = time.time()

    # Step 0: Rewrite into a standalone question (only if history exists)
    if history:
        print("[Step 0/4] Rewriting follow-up into standalone query...")
        search_question = rewrite_query(question, history)
    else:
        search_question = question

    # Step 1: Embed the rewritten question
    step_start = time.time()
    print("[Step 1/4] Embedding question...")
    embedding = get_embedding(search_question)
    elapsed = time.time() - step_start
    print(f"  [LOG] Embedding done in {elapsed:.2f}s")
    print(f"  [LOG] Vector dimensions: {len(embedding)}\n")

    # Step 2: Find similar chunks
    step_start = time.time()
    print(f"[Step 2/4] Searching top {TOP_K} relevant chunks...")
    chunks = search_similar(embedding)
    elapsed = time.time() - step_start
    print(f"  [LOG] DB search done in {elapsed:.4f}s")
    print(f"  [LOG] Results found: {len(chunks)}\n")

    print("  Sources (sorted by similarity + recency boost):")
    for i, row in enumerate(chunks, 1):
        title, url, text, chunk_idx, publish_date = row[0], row[1], row[2], row[3], row[4]
        sim, boost, final = row[5], row[6], row[7]
        date_label = (publish_date[:10] if publish_date else "unknown")
        print(f"    {i}. [final={final:.2f} = sim {sim:.2f} + recency {boost:+.2f}]  {title[:55]}")
        print(f"       published: {date_label}   chunk #{chunk_idx}, {len(text.split())} words")
        print(f"       {url}")

    # Step 3: Generate answer (history is passed for coherence; sources are the truth)
    step_start = time.time()
    print(f"\n[Step 3/4] Generating answer...")
    answer = generate_answer(question, chunks, history)
    elapsed = time.time() - step_start

    # Step 4: Update history (capped to last MAX_HISTORY_PAIRS pairs)
    history.append({"role": "user", "content": question})
    history.append({"role": "assistant", "content": answer})
    excess = len(history) - MAX_HISTORY_PAIRS * 2
    if excess > 0:
        del history[:excess]

    total_elapsed = time.time() - total_start

    print(f"\n{'='*70}")
    print(f"\n{answer}\n")
    print(f"{'='*70}")
    print(f"  [LOG] Total pipeline time: {total_elapsed:.1f}s")
    print(f"  [LOG] History: {len(history)//2} turn(s) kept (cap {MAX_HISTORY_PAIRS})")
    print()


def main():
    print("GTA 6 RAG Query System")
    print(f"  Chat model:  {CHAT_MODEL} (Google Gemini API)")
    print(f"  Embeddings:  {EMBED_MODEL} (local Ollama)")
    print(f"  Top-K:       {TOP_K}")

    # Check Ollama connection (only needed for embeddings)
    try:
        r = requests.get("http://localhost:11434/api/tags", timeout=5)
        models = [m["name"] for m in r.json().get("models", [])]
        if EMBED_MODEL not in " ".join(models):
            print(f"  WARNING: '{EMBED_MODEL}' not found in Ollama. Run: ollama pull {EMBED_MODEL}")
        else:
            print(f"  Ollama OK")
    except Exception:
        print("  WARNING: Cannot connect to Ollama! Run: ollama serve  (needed for embeddings)")
        return

    # Check DB connection
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM gta6_articles WHERE embedding IS NOT NULL")
        count = cursor.fetchone()[0]
        print(f"  DB chunks with embeddings: {count}")
        cursor.close()
        conn.close()
    except Exception as e:
        print(f"  WARNING: Cannot connect to DB! {e}")
        return

    print("\nType your question and press Enter.")
    print("Commands: 'quit' to exit, '/reset' or '/clear' to forget conversation history.\n")

    while True:
        try:
            question = input(">> ").strip()
            if not question:
                continue
            if question.lower() in ('quit', 'exit', 'q'):
                print("Bye!")
                break
            if question.lower() in ('/reset', '/clear'):
                history.clear()
                print("  [LOG] Conversation history cleared.\n")
                continue
            query(question)
        except KeyboardInterrupt:
            print("\nBye!")
            break
        except Exception as e:
            print(f"\n  [ERROR] {type(e).__name__}: {e}\n")


if __name__ == "__main__":
    main()
