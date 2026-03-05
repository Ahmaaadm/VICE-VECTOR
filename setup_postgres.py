"""
PostgreSQL + pgvector Setup for GTA 6 RAG System

Requirements:
    pip install psycopg2-binary pgvector
    
PostgreSQL with pgvector extension must be installed:
    - PostgreSQL 12+
    - pgvector extension

Installation:
    Ubuntu/Debian: 
        sudo apt install postgresql postgresql-contrib
        sudo apt install postgresql-15-pgvector
    
    Mac (Homebrew):
        brew install postgresql@15
        brew install pgvector
    
    Docker:
        docker run -d --name postgres-pgvector \
          -e POSTGRES_PASSWORD=postgres \
          -p 5432:5432 \
          ankane/pgvector
"""

import json
import psycopg2
from psycopg2.extras import execute_values
from pathlib import Path
import numpy as np

# Configuration
CHUNKS_FILE = Path("data/rag_chunks.jsonl")
DB_CONFIG = {
    'host': 'localhost',
    'port': 5432,
    'database': 'gta6_rag',
    'user': 'postgres',
    'password': 'postgres'  # Change this!
}

def create_database():
    """Create database if it doesn't exist."""
    print("🗄️  Creating database...\n")
    
    # Connect to default postgres database
    conn = psycopg2.connect(
        host=DB_CONFIG['host'],
        port=DB_CONFIG['port'],
        database='postgres',
        user=DB_CONFIG['user'],
        password=DB_CONFIG['password']
    )
    conn.autocommit = True
    cursor = conn.cursor()
    
    # Check if database exists
    cursor.execute(
        "SELECT 1 FROM pg_database WHERE datname = %s",
        (DB_CONFIG['database'],)
    )
    exists = cursor.fetchone()
    
    if not exists:
        cursor.execute(f"CREATE DATABASE {DB_CONFIG['database']}")
        print(f"✓ Created database: {DB_CONFIG['database']}\n")
    else:
        print(f"✓ Database exists: {DB_CONFIG['database']}\n")
    
    cursor.close()
    conn.close()

def setup_pgvector():
    """Set up pgvector extension and create tables."""
    print("🔧 Setting up pgvector...\n")
    
    conn = psycopg2.connect(**DB_CONFIG)
    cursor = conn.cursor()
    
    # Enable pgvector extension
    cursor.execute("CREATE EXTENSION IF NOT EXISTS vector")
    print("✓ pgvector extension enabled\n")
    
    # Create articles table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS gta6_articles (
            id SERIAL PRIMARY KEY,
            chunk_id VARCHAR(500) UNIQUE NOT NULL,
            title VARCHAR(1000),
            source_url TEXT,
            publish_date VARCHAR(100),
            chunk_index INTEGER,
            total_chunks INTEGER,
            word_count INTEGER,
            text TEXT NOT NULL,
            keywords TEXT[],
            embedding vector(768),  -- nomic-embed-text produces 768-dim vectors
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    print("✓ Created table: gta6_articles\n")
    
    # Create index for vector similarity search
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS gta6_articles_embedding_idx 
        ON gta6_articles 
        USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 100)
    """)
    print("✓ Created vector index for fast similarity search\n")
    
    # Create text search index
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS gta6_articles_text_idx 
        ON gta6_articles 
        USING gin(to_tsvector('english', text))
    """)
    print("✓ Created full-text search index\n")
    
    conn.commit()
    cursor.close()
    conn.close()

def load_chunks():
    """Load chunks from JSONL file."""
    print("📂 Loading chunks...\n")
    chunks = []
    
    with open(CHUNKS_FILE, 'r', encoding='utf-8') as f:
        for line in f:
            chunks.append(json.loads(line))
    
    print(f"✓ Loaded {len(chunks)} chunks\n")
    return chunks

def insert_chunks(chunks):
    """Insert chunks into PostgreSQL (without embeddings for now)."""
    print("📥 Inserting chunks into database...\n")
    
    conn = psycopg2.connect(**DB_CONFIG)
    cursor = conn.cursor()
    
    # Prepare data for insertion
    data = []
    for chunk in chunks:
        data.append((
            chunk['chunk_id'],
            chunk['metadata']['title'],
            chunk['metadata']['source_url'],
            chunk['metadata'].get('publish_date', 'Unknown'),
            chunk['metadata']['chunk_index'],
            chunk['metadata']['total_chunks'],
            chunk['metadata']['word_count'],
            chunk['text'],
            chunk.get('keywords', [])
        ))
    
    # Insert in batches
    insert_query = """
        INSERT INTO gta6_articles 
        (chunk_id, title, source_url, publish_date, chunk_index, 
         total_chunks, word_count, text, keywords)
        VALUES %s
        ON CONFLICT (chunk_id) DO NOTHING
    """
    
    execute_values(cursor, insert_query, data)
    conn.commit()
    
    # Get count
    cursor.execute("SELECT COUNT(*) FROM gta6_articles")
    count = cursor.fetchone()[0]
    
    print(f"✓ Inserted {len(data)} chunks")
    print(f"✓ Total in database: {count}\n")
    
    cursor.close()
    conn.close()

def get_stats():
    """Get database statistics."""
    print("📊 Database Statistics\n")
    print("="*80 + "\n")
    
    conn = psycopg2.connect(**DB_CONFIG)
    cursor = conn.cursor()
    
    # Total chunks
    cursor.execute("SELECT COUNT(*) FROM gta6_articles")
    total = cursor.fetchone()[0]
    print(f"Total chunks: {total}")
    
    # Total words
    cursor.execute("SELECT SUM(word_count) FROM gta6_articles")
    words = cursor.fetchone()[0]
    print(f"Total words: {words:,}")
    
    # Unique articles
    cursor.execute("SELECT COUNT(DISTINCT title) FROM gta6_articles")
    unique = cursor.fetchone()[0]
    print(f"Unique articles: {unique}")
    
    # Chunks with embeddings
    cursor.execute("SELECT COUNT(*) FROM gta6_articles WHERE embedding IS NOT NULL")
    embedded = cursor.fetchone()[0]
    print(f"Chunks with embeddings: {embedded}")
    
    # Sample articles
    cursor.execute("""
        SELECT title, COUNT(*) as chunks
        FROM gta6_articles
        GROUP BY title
        ORDER BY chunks DESC
        LIMIT 5
    """)
    
    print("\nTop 5 articles by chunk count:")
    for title, count in cursor.fetchall():
        print(f"  • {title[:60]}... ({count} chunks)")
    
    print("\n" + "="*80 + "\n")
    
    cursor.close()
    conn.close()

def test_text_search():
    """Test full-text search without embeddings."""
    print("🔍 Testing text search...\n")
    
    conn = psycopg2.connect(**DB_CONFIG)
    cursor = conn.cursor()
    
    query = "GTA 6 release date"
    
    cursor.execute("""
        SELECT title, source_url, 
               ts_rank(to_tsvector('english', text), query) as rank,
               LEFT(text, 200) as preview
        FROM gta6_articles, 
             plainto_tsquery('english', %s) query
        WHERE to_tsvector('english', text) @@ query
        ORDER BY rank DESC
        LIMIT 3
    """, (query,))
    
    print(f"Query: '{query}'\n")
    print("Top 3 results (text search):")
    print("="*80 + "\n")
    
    for i, (title, url, rank, preview) in enumerate(cursor.fetchall(), 1):
        print(f"{i}. {title}")
        print(f"   URL: {url}")
        print(f"   Relevance: {rank:.4f}")
        print(f"   Preview: {preview}...")
        print()
    
    print("="*80 + "\n")
    
    cursor.close()
    conn.close()

def main():
    """Main setup function."""
    print("="*80)
    print("GTA 6 RAG System - PostgreSQL + pgvector Setup")
    print("="*80 + "\n")
    
    # Check if chunks file exists
    if not CHUNKS_FILE.exists():
        print("❌ Chunks file not found!")
        print("   Run: python prepare_for_rag.py first\n")
        return
    
    try:
        # Step 1: Create database
        create_database()
        
        # Step 2: Set up pgvector
        setup_pgvector()
        
        # Step 3: Load chunks
        chunks = load_chunks()
        
        # Step 4: Insert chunks
        insert_chunks(chunks)
        
        # Step 5: Show statistics
        get_stats()
        
        # Step 6: Test search
        test_text_search()
        
        print("="*80)
        print("✅ PostgreSQL + pgvector setup complete!")
        print("="*80)
        print("\nNext steps:")
        print("1. Install Ollama: https://ollama.ai")
        print("2. Pull embedding model: ollama pull nomic-embed-text")
        print("3. Generate embeddings: python generate_embeddings.py")
        print("4. Query system: python query_postgres_rag.py\n")
        
    except psycopg2.OperationalError as e:
        print(f"❌ Database connection error: {e}")
        print("\nTroubleshooting:")
        print("1. Is PostgreSQL running?")
        print("   - Linux: sudo systemctl start postgresql")
        print("   - Mac: brew services start postgresql@15")
        print("   - Docker: docker start postgres-pgvector")
        print("\n2. Check credentials in DB_CONFIG")
        print("3. Install pgvector extension\n")
    except Exception as e:
        print(f"❌ Error: {e}\n")

if __name__ == "__main__":
    main()
