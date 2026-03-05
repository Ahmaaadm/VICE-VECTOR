#!/bin/bash
# Setup script for GTA 6 News Scraper

echo "🚀 Setting up GTA 6 News Scraper..."
echo ""

# Create virtual environment
echo "📦 Creating virtual environment..."
python3 -m venv venv
source venv/bin/activate

# Install dependencies
echo "📥 Installing dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

# Download NLTK data
echo "📚 Downloading NLTK data..."
python -c "import nltk; nltk.download('punkt', quiet=True)"

# Create directory structure
echo "📁 Creating directory structure..."
mkdir -p data/articles data/metadata
touch data/saved_hashes.txt

echo ""
echo "✅ Setup complete!"
echo ""
echo "To run the scraper:"
echo "  1. Activate the virtual environment: source venv/bin/activate"
echo "  2. Edit sources.txt with your URLs"
echo "  3. Run: python gta6_scraper.py"
echo ""
echo "Happy scraping! 🎮"
