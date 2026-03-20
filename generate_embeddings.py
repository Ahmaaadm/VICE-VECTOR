"""
Generate embeddings for GTA 6 RAG chunks using Ollama (nomic-embed-text).

Reads chunks from PostgreSQL, generates 768-dim embeddings via Ollama,
and updates each row's embedding column.

Requirements:
    - Ollama running locally: ollama serve
    - Model pulled: ollama pull nomic-embed-text
    - PostgreSQL with pgvector set up (run setup_postgres.py first)
    - pip install psycopg2-binary requests
"""

import requests
import psycopg2
import sys
import time

OLLAMA_URL = "http://localhost:11434/api/embed"
MODEL = "nomic-embed-text"

DB_CONFIG = {
    'host': 'localhost',
    'port': 5432,
    'database': 'gta6_rag',
    'user': 'postgres',
    'password': 'postgres'
}


def get_embedding(text):
    """Get embedding from Ollama for a single text."""
    response = requests.post(OLLAMA_URL, json={
        "model": MODEL,
        "input": text
    })
    response.raise_for_status()
    return response.json()["embeddings"][0]


def main():
    # Connect to DB
    conn = psycopg2.connect(**DB_CONFIG)
    cursor = conn.cursor()

    # Get chunks that don't have embeddings yet
    cursor.execute("""
        SELECT id, chunk_id, text
        FROM gta6_articles
        WHERE embedding IS NULL
        ORDER BY id
    """)
    chunks = cursor.fetchall()

    if not chunks:
        print("All chunks already have embeddings!")
        return

    print(f"Generating embeddings for {len(chunks)} chunks...\n")

    success = 0
    failed = 0
    start_time = time.time()

    for i, (row_id, chunk_id, text) in enumerate(chunks, 1):
        try:
            embedding = get_embedding(text)

            cursor.execute(
                "UPDATE gta6_articles SET embedding = %s WHERE id = %s",
                (str(embedding), row_id)
            )
            conn.commit()
            success += 1

            elapsed = time.time() - start_time
            rate = success / elapsed if elapsed > 0 else 0
            print(f"  [{i}/{len(chunks)}] {chunk_id[:60]}... ({rate:.1f} chunks/sec)")

        except Exception as e:
            failed += 1
            print(f"  [{i}/{len(chunks)}] FAILED: {chunk_id[:60]}... - {e}")

    elapsed = time.time() - start_time
    print(f"\nDone in {elapsed:.1f}s")
    print(f"  Success: {success}")
    print(f"  Failed:  {failed}")

    # Verify
    cursor.execute("SELECT COUNT(*) FROM gta6_articles WHERE embedding IS NOT NULL")
    total = cursor.fetchone()[0]
    print(f"  Total with embeddings: {total}")

    cursor.close()
    conn.close()


if __name__ == "__main__":
    main()
