# GTA 6 News Scraper
**Data Collection Pipeline for RAG + Ollama Project**

A robust web scraper designed to collect, clean, and organize GTA 6 news articles for use with Retrieval Augmented Generation (RAG) and Ollama.

## 🎯 What This Does

Follows this workflow:
```
URL list → Fetch page → Extract article → Clean text → Generate metadata → Save article
```

## ✨ Key Features

- ✅ **Multi-method extraction**: Uses `newspaper3k` + `BeautifulSoup` fallback
- ✅ **RSS feed support**: Auto-detects news site homepages and fetches articles from RSS feeds
- ✅ **Text cleaning**: Removes URLs, extra whitespace, special characters
- ✅ **Content filtering**: Only saves articles relevant to GTA 6
- ✅ **Duplicate detection**: MD5 hash-based deduplication
- ✅ **Rich metadata**: Saves title, authors, dates, word count, etc.
- ✅ **Comprehensive logging**: Tracks all operations
- ✅ **Error handling**: Gracefully handles failures

## 📦 Installation

```bash
# Install dependencies
pip install -r requirements.txt

# Download NLTK data (required by newspaper3k)
python -c "import nltk; nltk.download('punkt')"
```

## 🚀 Quick Start

1. **Add your sources** to `sources.txt`:
   ```
   # RSS feeds (will auto-extract articles)
   https://www.rockstargames.com/newswire.xml
   
   # Direct article URLs
   https://www.ign.com/articles/gta-6-everything-we-know
   ```

2. **Run the scraper**:
   ```bash
   python gta6_scraper.py
   ```

3. **Check the results**:
   ```
   data/
   ├── articles/          # Clean text files
   ├── metadata/          # JSON metadata
   ├── saved_hashes.txt   # Duplicate tracking
   └── scraper.log        # Execution log
   ```

## 📝 How to Add Sources

### ✅ What Works:

1. **RSS Feeds** (best option for news sites):
   ```
   https://www.rockstargames.com/newswire.xml
   https://www.pcgamer.com/rss/
   ```

2. **Direct Article URLs**:
   ```
   https://www.ign.com/articles/gta-6-trailer-breakdown
   https://www.gamespot.com/articles/gta-6-leak-analysis
   ```

3. **News Site Homepages** (will auto-detect RSS):
   ```
   https://www.ign.com
   https://www.gamespot.com
   ```

### ❌ What Doesn't Work (Yet):

- **Social media homepages**: `https://www.reddit.com/r/GTA6/`
- **Forum homepages**: `https://gtaforums.com`
- **Twitter/X**: Requires API access

**Solution**: Add direct links to specific posts:
```
https://www.reddit.com/r/GTA6/comments/abc123/leak_discussion/
https://gtaforums.com/topic/12345-gta-6-analysis/
```

## 🔧 Configuration

Edit the script to customize:

```python
# Filter keywords (line 43)
GTA6_KEYWORDS = ["gta 6", "gta vi", "rockstar", "vice city"]

# RSS feed mappings (line 35)
RSS_FEEDS = {
    "ign.com": "https://www.ign.com/articles?tags=gta-6",
    # Add more...
}

# Articles per RSS feed (line 232)
article_urls = get_articles_from_rss(feed_url, limit=10)
```

## 📊 Output Format

### Article Text File (`.txt`):
```
TITLE: GTA 6 Trailer Breakdown
URL: https://example.com/article
DATE: 2024-12-01
EXTRACTED: 2024-12-05T10:30:00
WORD COUNT: 1250

================================================================================

[Clean article text here...]
```

### Metadata JSON (`.json`):
```json
{
  "title": "GTA 6 Trailer Breakdown",
  "text": "Article content...",
  "authors": ["John Smith"],
  "publish_date": "2024-12-01",
  "url": "https://example.com/article",
  "extraction_date": "2024-12-05T10:30:00",
  "word_count": 1250,
  "char_count": 7800,
  "top_image": "https://example.com/image.jpg"
}
```

## 🧹 Text Cleaning

The scraper automatically:
- Removes excessive whitespace
- Strips URLs and email addresses
- Normalizes quotes and punctuation
- Filters out scripts, navigation, footers
- Validates minimum content length

## 🔍 Content Filtering

Only saves articles containing GTA 6-related keywords:
- "gta 6" / "gta vi"
- "grand theft auto 6"
- "rockstar"
- "vice city"
- etc.

## 🚨 Troubleshooting

**"No articles extracted"**
- Check if URL is an actual article, not a homepage
- Try adding the RSS feed instead
- Verify the site isn't blocking scrapers

**"Content not relevant to GTA 6"**
- Article doesn't mention GTA 6 keywords
- Add more keywords in `GTA6_KEYWORDS`

**"Skipping social media/forum"**
- Add direct post URLs instead of homepages
- Consider using official APIs for Reddit/Twitter

**Import errors**
```bash
pip install --upgrade -r requirements.txt
python -c "import nltk; nltk.download('punkt')"
```

## 📈 Next Steps for RAG Pipeline

After collecting articles:

1. **Chunk the text** (500-1000 tokens per chunk)
2. **Generate embeddings** using Ollama
3. **Store in vector database** (ChromaDB, FAISS, etc.)
4. **Build RAG system** to query the knowledge base

## 🔮 Future Enhancements

- [ ] Reddit API integration
- [ ] Twitter/X API integration
- [ ] Forum-specific scrapers
- [ ] Automatic scheduling (cron job)
- [ ] Database storage (SQLite/PostgreSQL)
- [ ] Image/video downloading
- [ ] Sentiment analysis tagging

## ⚠️ Legal & Ethical Considerations

- Respect `robots.txt`
- Don't overload servers (add delays if scraping many URLs)
- Only use data for personal/research purposes
- Check each site's Terms of Service

## 📄 License

Use responsibly for educational/research purposes.
