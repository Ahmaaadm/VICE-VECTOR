"""
GTA 6 RAG Query Interface

Ask questions about GTA 6 and get answers grounded in scraped articles.

Requirements:
    - Ollama running: ollama serve
    - Models: nomic-embed-text, tinyllama
    - PostgreSQL with embedded chunks (run generate_embeddings.py first)
"""

import requests
import psycopg2
import time

OLLAMA_EMBED_URL = "http://localhost:11434/api/embed"
OLLAMA_CHAT_URL = "http://localhost:11434/api/generate"
EMBED_MODEL = "nomic-embed-text"
CHAT_MODEL = "mistral"
TOP_K = 3

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


def search_similar(embedding, top_k=TOP_K):
    """Find the most similar chunks using pgvector cosine similarity."""
    conn = psycopg2.connect(**DB_CONFIG)
    cursor = conn.cursor()

    cursor.execute("""
        SELECT title, source_url, text, chunk_index,
               1 - (embedding <=> %s::vector) AS similarity
        FROM gta6_articles
        WHERE embedding IS NOT NULL
        ORDER BY embedding <=> %s::vector
        LIMIT %s
    """, (str(embedding), str(embedding), top_k))

    results = cursor.fetchall()
    cursor.close()
    conn.close()
    return results


def generate_answer(question, chunks):
    """Send question + context to LLM and get an answer."""
    context = ""
    for i, (title, url, text, chunk_idx, score) in enumerate(chunks, 1):
        context += f"\n[Source {i}] {title}\n{text}\n"

    prompt = f"""You are a GTA 6 knowledge assistant. Answer the user's question based ONLY on the provided sources. If the sources don't contain enough information, say so. Always mention which sources you used.

Sources:
{context}

Question: {question}

Answer:"""

    prompt_len = len(prompt.split())
    print(f"  [LOG] Prompt length: {prompt_len} words")
    print(f"  [LOG] Sending to {CHAT_MODEL}...")
    print(f"  [LOG] Waiting for response (timeout: 300s)...")

    response = requests.post(OLLAMA_CHAT_URL, json={
        "model": CHAT_MODEL,
        "prompt": prompt,
        "stream": False
    }, timeout=None)
    response.raise_for_status()

    data = response.json()
    answer = data["response"]
    # Ollama returns timing info
    total_duration = data.get("total_duration", 0) / 1e9  # nanoseconds to seconds
    eval_count = data.get("eval_count", 0)
    eval_duration = data.get("eval_duration", 0) / 1e9

    print(f"  [LOG] Response received!")
    print(f"  [LOG] Tokens generated: {eval_count}")
    print(f"  [LOG] Generation time: {eval_duration:.1f}s")
    if eval_duration > 0:
        print(f"  [LOG] Speed: {eval_count / eval_duration:.1f} tokens/sec")
    print(f"  [LOG] Total time: {total_duration:.1f}s")

    return answer


def query(question):
    """Full RAG pipeline: embed → search → generate."""
    print(f"\n{'='*70}")
    print(f"Question: {question}")
    print(f"{'='*70}\n")

    total_start = time.time()

    # Step 1: Embed the question
    step_start = time.time()
    print("[Step 1/3] Embedding question...")
    embedding = get_embedding(question)
    elapsed = time.time() - step_start
    print(f"  [LOG] Embedding done in {elapsed:.2f}s")
    print(f"  [LOG] Vector dimensions: {len(embedding)}\n")

    # Step 2: Find similar chunks
    step_start = time.time()
    print(f"[Step 2/3] Searching top {TOP_K} relevant chunks...")
    chunks = search_similar(embedding)
    elapsed = time.time() - step_start
    print(f"  [LOG] DB search done in {elapsed:.4f}s")
    print(f"  [LOG] Results found: {len(chunks)}\n")

    print("  Sources:")
    for i, (title, url, text, chunk_idx, score) in enumerate(chunks, 1):
        print(f"    {i}. [{score:.2f}] {title[:60]}")
        print(f"       {url}")
        print(f"       chunk #{chunk_idx}, {len(text.split())} words")

    # Step 3: Generate answer
    step_start = time.time()
    print(f"\n[Step 3/3] Generating answer...")
    answer = generate_answer(question, chunks)
    elapsed = time.time() - step_start

    total_elapsed = time.time() - total_start

    print(f"\n{'='*70}")
    print(f"\n{answer}\n")
    print(f"{'='*70}")
    print(f"  [LOG] Total pipeline time: {total_elapsed:.1f}s")
    print()


def main():
    print("GTA 6 RAG Query System")
    print(f"  Model: {CHAT_MODEL}")
    print(f"  Embeddings: {EMBED_MODEL}")
    print(f"  Top-K: {TOP_K}")

    # Check Ollama connection
    try:
        r = requests.get("http://localhost:11434/api/tags", timeout=5)
        models = [m["name"] for m in r.json().get("models", [])]
        print(f"  Ollama models: {', '.join(models)}")
    except Exception:
        print("  WARNING: Cannot connect to Ollama! Run: ollama serve")
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

    print("\nType your question and press Enter. Type 'quit' to exit.\n")

    while True:
        try:
            question = input(">> ").strip()
            if not question:
                continue
            if question.lower() in ('quit', 'exit', 'q'):
                print("Bye!")
                break
            query(question)
        except KeyboardInterrupt:
            print("\nBye!")
            break
        except Exception as e:
            print(f"\n  [ERROR] {type(e).__name__}: {e}\n")


if __name__ == "__main__":
    main()
