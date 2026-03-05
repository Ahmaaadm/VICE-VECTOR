@echo off
REM Setup script for GTA 6 News Scraper (Windows)

echo 🚀 Setting up GTA 6 News Scraper...
echo.

REM Create virtual environment
echo 📦 Creating virtual environment...
python -m venv venv
call venv\Scripts\activate.bat

REM Install dependencies
echo 📥 Installing dependencies...
python -m pip install --upgrade pip
pip install -r requirements.txt

REM Download NLTK data
echo 📚 Downloading NLTK data...
python -c "import nltk; nltk.download('punkt', quiet=True)"

REM Create directory structure
echo 📁 Creating directory structure...
if not exist "data\articles" mkdir data\articles
if not exist "data\metadata" mkdir data\metadata
if not exist "data\saved_hashes.txt" type nul > data\saved_hashes.txt

echo.
echo ✅ Setup complete!
echo.
echo To run the scraper:
echo   1. Activate the virtual environment: venv\Scripts\activate.bat
echo   2. Edit sources.txt with your URLs
echo   3. Run: python gta6_scraper.py
echo.
echo Happy scraping! 🎮
pause
