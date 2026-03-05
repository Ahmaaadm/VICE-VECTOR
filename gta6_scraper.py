import hashlib
import json
import re
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict, List
import logging

import requests
from bs4 import BeautifulSoup
import feedparser
from newspaper import Article

# ---------- CONFIGURATION ----------
BASE_DIR = Path("data")
ARTICLES_DIR = BASE_DIR / "articles"
META_DIR = BASE_DIR / "metadata"
HASH_FILE = BASE_DIR / "saved_hashes.txt"
LOG_FILE = BASE_DIR / "scraper.log"

# Create directories
for directory in [BASE_DIR, ARTICLES_DIR, META_DIR]:
    directory.mkdir(parents=True, exist_ok=True)
HASH_FILE.touch(exist_ok=True)

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(LOG_FILE),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# RSS Feed mappings for news sites
RSS_FEEDS = {
    "ign.com": "https://www.ign.com/articles?tags=gta-6",
    "gamespot.com": "https://www.gamespot.com/feeds/news/",
    "eurogamer.net": "https://www.eurogamer.net/?format=rss",
    "kotaku.com": "https://kotaku.com/rss",
    "pcgamer.com": "https://www.pcgamer.com/rss/",
    "rockstargames.com": "https://www.rockstargames.com/newswire.xml"
}

# Keywords for filtering GTA 6 content
GTA6_KEYWORDS = ["gta 6", "gta vi", "grand theft auto 6", "grand theft auto vi", 
                 "rockstar", "gta6", "gtavi", "vice city"]

# ---------- UTILITIES ----------
def hash_text(text: str) -> str:
    """Generate MD5 hash of text."""
    return hashlib.md5(text.encode("utf-8")).hexdigest()

def is_duplicate(text: str) -> bool:
    """Check if content already exists."""
    h = hash_text(text)
    with open(HASH_FILE, "r") as f:
        if h in f.read():
            return True
    with open(HASH_FILE, "a") as f:
        f.write(h + "\n")
    return False

def clean_text(text: str) -> str:
    """Clean and normalize text content."""
    if not text:
        return ""
    
    # Remove excessive whitespace
    text = re.sub(r'\s+', ' ', text)
    
    # Remove special characters but keep punctuation
    text = re.sub(r'[^\w\s\.\,\!\?\-\:\;\'\"]', '', text)
    
    # Remove URLs
    text = re.sub(r'http[s]?://(?:[a-zA-Z]|[0-9]|[$-_@.&+]|[!*\\(\\),]|(?:%[0-9a-fA-F][0-9a-fA-F]))+', '', text)
    
    # Remove email addresses
    text = re.sub(r'\S+@\S+', '', text)
    
    # Normalize quotes
    text = text.replace('"', '"').replace('"', '"').replace(''', "'").replace(''', "'")
    
    # Remove extra spaces again
    text = ' '.join(text.split())
    
    return text.strip()

def is_relevant_content(text: str, title: str = "") -> bool:
    """Check if content is relevant to GTA 6."""
    combined = (text + " " + title).lower()
    return any(keyword in combined for keyword in GTA6_KEYWORDS)

def generate_safe_filename(url: str) -> str:
    """Generate safe filename from URL."""
    safe_name = re.sub(r'https?://', '', url)
    safe_name = re.sub(r'[^\w\-\.]', '_', safe_name)
    safe_name = safe_name[:200]  # Limit length
    return safe_name

# ---------- EXTRACTORS ----------
class ArticleExtractor:
    """Base class for article extraction."""
    
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
    
    def extract_with_newspaper(self, url: str) -> Optional[Dict]:
        """Extract article using newspaper3k."""
        try:
            article = Article(url)
            article.download()
            article.parse()
            
            if not article.text.strip():
                return None
            
            return {
                "title": article.title or "Untitled",
                "text": article.text,
                "authors": article.authors,
                "publish_date": str(article.publish_date) if article.publish_date else None,
                "url": url,
                "top_image": article.top_image
            }
        except Exception as e:
            logger.debug(f"Newspaper extraction failed for {url}: {e}")
            return None
    
    def extract_with_beautifulsoup(self, url: str) -> Optional[Dict]:
        """Fallback extraction using BeautifulSoup."""
        try:
            response = self.session.get(url, timeout=10)
            response.raise_for_status()
            soup = BeautifulSoup(response.content, 'html.parser')
            
            # Remove script and style elements
            for element in soup(['script', 'style', 'nav', 'footer', 'header', 'aside']):
                element.decompose()
            
            # Try to find title
            title = None
            if soup.find('h1'):
                title = soup.find('h1').get_text().strip()
            elif soup.find('title'):
                title = soup.find('title').get_text().strip()
            
            # Try to find main content
            content = ""
            
            # Look for common article containers
            article_selectors = ['article', '.article-content', '.post-content', 
                               '.entry-content', 'main', '.content']
            
            for selector in article_selectors:
                container = soup.select_one(selector)
                if container:
                    paragraphs = container.find_all('p')
                    content = '\n\n'.join([p.get_text().strip() for p in paragraphs if p.get_text().strip()])
                    if len(content) > 200:  # Minimum content length
                        break
            
            if not content:
                # Fallback: get all paragraphs
                paragraphs = soup.find_all('p')
                content = '\n\n'.join([p.get_text().strip() for p in paragraphs if p.get_text().strip()])
            
            if len(content) < 100:  # Too short, probably not an article
                return None
            
            return {
                "title": title or "Untitled",
                "text": content,
                "authors": [],
                "publish_date": None,
                "url": url,
                "top_image": None
            }
            
        except Exception as e:
            logger.debug(f"BeautifulSoup extraction failed for {url}: {e}")
            return None
    
    def extract(self, url: str) -> Optional[Dict]:
        """Extract article with multiple methods."""
        logger.info(f"Extracting: {url}")
        
        # Try newspaper3k first
        data = self.extract_with_newspaper(url)
        
        # Fallback to BeautifulSoup
        if not data:
            data = self.extract_with_beautifulsoup(url)
        
        if not data:
            logger.warning(f"Failed to extract: {url}")
            return None
        
        # Clean the text
        data['text'] = clean_text(data['text'])
        data['title'] = clean_text(data['title'])
        
        # Check if content is relevant
        if not is_relevant_content(data['text'], data['title']):
            logger.info(f"Content not relevant to GTA 6: {url}")
            return None
        
        # Add metadata
        data['extraction_date'] = datetime.now().isoformat()
        data['word_count'] = len(data['text'].split())
        data['char_count'] = len(data['text'])
        
        return data

# ---------- RSS HANDLER ----------
def get_articles_from_rss(feed_url: str, limit: int = 10) -> List[str]:
    """Extract article URLs from RSS feed."""
    try:
        logger.info(f"Fetching RSS feed: {feed_url}")
        feed = feedparser.parse(feed_url)
        
        urls = []
        for entry in feed.entries[:limit]:
            if hasattr(entry, 'link'):
                urls.append(entry.link)
        
        logger.info(f"Found {len(urls)} articles in RSS feed")
        return urls
    except Exception as e:
        logger.error(f"RSS feed error: {e}")
        return []

# ---------- SAVE FUNCTIONS ----------
def save_article(data: Dict) -> None:
    """Save article and metadata to disk."""
    safe_name = generate_safe_filename(data['url'])
    
    # Save article text
    article_path = ARTICLES_DIR / f"{safe_name}.txt"
    with open(article_path, "w", encoding="utf-8") as f:
        f.write(f"TITLE: {data['title']}\n")
        f.write(f"URL: {data['url']}\n")
        f.write(f"DATE: {data.get('publish_date', 'Unknown')}\n")
        f.write(f"EXTRACTED: {data['extraction_date']}\n")
        f.write(f"WORD COUNT: {data['word_count']}\n")
        f.write("\n" + "="*80 + "\n\n")
        f.write(data['text'])
    
    # Save metadata JSON
    meta_path = META_DIR / f"{safe_name}.json"
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    
    logger.info(f"✓ Saved: {data['title'][:50]}... ({data['word_count']} words)")

# ---------- MAIN PROCESS ----------
def load_sources(file: str = "sources_ultimate.txt") -> List[str]:
    """Load URLs from sources file."""
    try:
        with open(file, "r") as f:
            return [line.strip() for line in f if line.strip() and not line.startswith('#')]
    except FileNotFoundError:
        logger.error(f"Sources file not found: {file}")
        return []

def process_url(url: str, extractor: ArticleExtractor) -> None:
    """Process a single URL."""
    try:
        # Parse the URL
        from urllib.parse import urlparse
        parsed = urlparse(url)
        domain = parsed.netloc
        path = parsed.path.strip('/')
        
        # Check if this is actually a homepage (no path or very short path)
        is_homepage = not path or path in ['', 'news', 'articles', 'games']
        
        # Only use RSS feed if it's ACTUALLY a homepage, not an article URL
        if is_homepage and any(news_site in domain for news_site in RSS_FEEDS.keys()):
            logger.info(f"Detected news site homepage: {domain}")
            
            # Find matching RSS feed
            feed_url = None
            for site, rss in RSS_FEEDS.items():
                if site in domain:
                    feed_url = rss
                    break
            
            if feed_url:
                article_urls = get_articles_from_rss(feed_url, limit=10)
                for article_url in article_urls:
                    process_article(article_url, extractor)
            return
        
        # Otherwise, treat as direct article URL
        process_article(url, extractor)
        
    except Exception as e:
        logger.error(f"Error processing URL {url}: {e}")

def process_article(url: str, extractor: ArticleExtractor) -> None:
    """Extract and save a single article."""
    data = extractor.extract(url)
    
    if not data:
        return
    
    if is_duplicate(data['text']):
        logger.info(f"⊗ Duplicate skipped: {url}")
        return
    
    save_article(data)

def main():
    """Main scraper function."""
    logger.info("="*80)
    logger.info("GTA 6 News Scraper Started")
    logger.info("="*80)
    
    urls = load_sources()
    
    if not urls:
        logger.error("No URLs found in sources.txt")
        return
    
    extractor = ArticleExtractor()
    
    total = len(urls)
    for idx, url in enumerate(urls, 1):
        logger.info(f"\n[{idx}/{total}] Processing: {url}")
        
        # Skip social media for now (need special handling)
        if any(domain in url for domain in ['reddit.com', 'x.com', 'twitter.com', 'gtaforums.com']):
            logger.warning(f"⚠ Skipping social media/forum (needs API): {url}")
            logger.info("   → Add specific article URLs instead of homepages")
            continue
        
        process_url(url, extractor)
    
    logger.info("\n" + "="*80)
    logger.info("Scraping completed!")
    logger.info("="*80)

if __name__ == "__main__":
    main()