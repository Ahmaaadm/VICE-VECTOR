"""
Prepare scraped articles for RAG (Retrieval Augmented Generation)

This script processes the scraped articles and prepares them for use with Ollama + RAG:
1. Loads all articles
2. Chunks text into optimal sizes
3. Generates metadata for each chunk
4. Exports in format ready for vector database

Usage:
    python prepare_for_rag.py
"""

import json
from pathlib import Path
from typing import List, Dict
import re

# Configuration
BASE_DIR = Path("data")
META_DIR = BASE_DIR / "metadata"
OUTPUT_FILE = BASE_DIR / "rag_chunks.jsonl"

# RAG parameters
CHUNK_SIZE = 500  # words per chunk
CHUNK_OVERLAP = 50  # words overlap between chunks

def load_all_articles() -> List[Dict]:
    """Load all article metadata."""
    articles = []
    
    if not META_DIR.exists():
        print(f"❌ Metadata directory not found: {META_DIR}")
        return articles
    
    for meta_file in META_DIR.glob("*.json"):
        try:
            with open(meta_file, 'r', encoding='utf-8') as f:
                articles.append(json.load(f))
        except Exception as e:
            print(f"⚠️  Error loading {meta_file.name}: {e}")
    
    return articles

def chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> List[str]:
    """Split text into overlapping chunks."""
    words = text.split()
    chunks = []
    
    if len(words) <= chunk_size:
        return [text]
    
    start = 0
    while start < len(words):
        end = start + chunk_size
        chunk_words = words[start:end]
        chunks.append(' '.join(chunk_words))
        
        if end >= len(words):
            break
            
        start += (chunk_size - overlap)
    
    return chunks

def create_rag_chunks(articles: List[Dict]) -> List[Dict]:
    """Convert articles into RAG-ready chunks."""
    rag_chunks = []
    
    for article in articles:
        text = article.get('text', '')
        if not text:
            continue
        
        # Split into chunks
        chunks = chunk_text(text)
        
        # Create metadata for each chunk
        for idx, chunk in enumerate(chunks):
            rag_chunk = {
                'chunk_id': f"{article.get('url', 'unknown')}#chunk_{idx}",
                'text': chunk,
                'metadata': {
                    'source_url': article.get('url', ''),
                    'title': article.get('title', ''),
                    'authors': article.get('authors', []),
                    'publish_date': article.get('publish_date', ''),
                    'extraction_date': article.get('extraction_date', ''),
                    'chunk_index': idx,
                    'total_chunks': len(chunks),
                    'word_count': len(chunk.split()),
                },
                'keywords': extract_keywords(chunk),
            }
            rag_chunks.append(rag_chunk)
    
    return rag_chunks

def extract_keywords(text: str, top_n: int = 10) -> List[str]:
    """Extract basic keywords from text (simple frequency-based)."""
    # Convert to lowercase and split
    words = re.findall(r'\b[a-z]{4,}\b', text.lower())
    
    # Common stopwords to exclude
    stopwords = {'that', 'this', 'with', 'from', 'have', 'been', 'were', 
                 'will', 'would', 'could', 'should', 'there', 'their', 'what',
                 'when', 'where', 'which', 'while', 'about', 'after', 'also'}
    
    # Count word frequencies
    word_freq = {}
    for word in words:
        if word not in stopwords:
            word_freq[word] = word_freq.get(word, 0) + 1
    
    # Get top N keywords
    sorted_words = sorted(word_freq.items(), key=lambda x: x[1], reverse=True)
    return [word for word, _ in sorted_words[:top_n]]

def save_chunks(chunks: List[Dict], output_file: Path):
    """Save chunks in JSONL format (one JSON object per line)."""
    with open(output_file, 'w', encoding='utf-8') as f:
        for chunk in chunks:
            f.write(json.dumps(chunk, ensure_ascii=False) + '\n')

def print_statistics(articles: List[Dict], chunks: List[Dict]):
    """Print processing statistics."""
    total_words = sum(article.get('word_count', 0) for article in articles)
    avg_words = total_words / len(articles) if articles else 0
    
    print("\n" + "="*60)
    print("Processing Statistics")
    print("="*60)
    print(f"Articles processed: {len(articles)}")
    print(f"Total chunks created: {len(chunks)}")
    print(f"Total words: {total_words:,}")
    print(f"Average words per article: {avg_words:.0f}")
    print(f"Average chunks per article: {len(chunks)/len(articles):.1f}")
    print("="*60 + "\n")

def main():
    """Main processing function."""
    print("="*60)
    print("RAG Data Preparation")
    print("="*60 + "\n")
    
    # Load articles
    print("📂 Loading articles...")
    articles = load_all_articles()
    
    if not articles:
        print("❌ No articles found. Run gta6_scraper.py first!")
        return
    
    print(f"✓ Loaded {len(articles)} articles\n")
    
    # Create chunks
    print("✂️  Chunking articles...")
    chunks = create_rag_chunks(articles)
    print(f"✓ Created {len(chunks)} chunks\n")
    
    # Save chunks
    print(f"💾 Saving to {OUTPUT_FILE}...")
    save_chunks(chunks, OUTPUT_FILE)
    print(f"✓ Saved!\n")
    
    # Show statistics
    print_statistics(articles, chunks)
    
    # Show example chunk
    if chunks:
        print("Example chunk:")
        print("-" * 60)
        example = chunks[0]
        print(f"Title: {example['metadata']['title']}")
        print(f"Chunk: {example['chunk_id']}")
        print(f"Text preview: {example['text'][:200]}...")
        print(f"Keywords: {', '.join(example['keywords'][:5])}")
        print("-" * 60 + "\n")
    
    print("✅ Ready for RAG pipeline!")
    print("\nNext steps:")
    print("  1. Use Ollama to generate embeddings for each chunk")
    print("  2. Store embeddings in vector database (ChromaDB, FAISS, etc.)")
    print("  3. Build query interface for RAG retrieval")
    print("\nExample with ChromaDB:")
    print("  pip install chromadb")
    print("  # Then use chunks from rag_chunks.jsonl\n")

if __name__ == "__main__":
    main()
