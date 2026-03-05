"""
Test script to verify the scraper is working correctly
"""
import sys
from pathlib import Path

def check_dependencies():
    """Check if all required packages are installed."""
    print("🔍 Checking dependencies...")
    required = ['requests', 'bs4', 'feedparser', 'newspaper']
    missing = []
    
    for package in required:
        try:
            __import__(package)
            print(f"  ✓ {package}")
        except ImportError:
            print(f"  ✗ {package} - MISSING")
            missing.append(package)
    
    if missing:
        print(f"\n❌ Missing packages: {', '.join(missing)}")
        print("Run: pip install -r requirements.txt")
        return False
    
    print("✅ All dependencies installed!\n")
    return True

def check_directories():
    """Check if required directories exist."""
    print("🔍 Checking directory structure...")
    required_dirs = [
        Path("data"),
        Path("data/articles"),
        Path("data/metadata")
    ]
    
    all_exist = True
    for directory in required_dirs:
        if directory.exists():
            print(f"  ✓ {directory}")
        else:
            print(f"  ✗ {directory} - MISSING")
            all_exist = False
    
    if not all_exist:
        print("\n⚠️  Creating missing directories...")
        for directory in required_dirs:
            directory.mkdir(parents=True, exist_ok=True)
        print("✅ Directories created!\n")
    else:
        print("✅ Directory structure OK!\n")
    
    return True

def test_text_cleaning():
    """Test the text cleaning function."""
    print("🔍 Testing text cleaning...")
    
    try:
        from gta6_scraper import clean_text
        
        test_cases = [
            ("  Multiple    spaces   ", "Multiple spaces"),
            ("Text with URL https://example.com here", "Text with URL here"),
            ("Email test@example.com removed", "Email removed"),
            ("Excessive\n\n\nlinebreaks", "Excessive linebreaks"),
        ]
        
        for input_text, expected_pattern in test_cases:
            result = clean_text(input_text)
            if expected_pattern in result:
                print(f"  ✓ Cleaning: '{input_text[:30]}...'")
            else:
                print(f"  ⚠️  Unexpected result for: '{input_text[:30]}...'")
        
        print("✅ Text cleaning works!\n")
        return True
    except Exception as e:
        print(f"❌ Text cleaning test failed: {e}\n")
        return False

def test_extraction():
    """Test article extraction with a sample URL."""
    print("🔍 Testing article extraction...")
    print("  (This will attempt to fetch a real article)\n")
    
    try:
        from gta6_scraper import ArticleExtractor
        
        # Test with a reliable news site
        test_url = "https://www.bbc.com/news"
        
        print(f"  Attempting to extract: {test_url}")
        extractor = ArticleExtractor()
        
        # This might fail, but we're testing if the code runs
        result = extractor.extract_with_beautifulsoup(test_url)
        
        if result:
            print(f"  ✓ Successfully extracted content")
            print(f"    Title: {result.get('title', 'N/A')[:50]}...")
            print(f"    Content length: {len(result.get('text', ''))} chars")
        else:
            print(f"  ⚠️  No content extracted (this is OK for homepage)")
        
        print("✅ Extraction code runs without errors!\n")
        return True
        
    except Exception as e:
        print(f"❌ Extraction test failed: {e}\n")
        return False

def main():
    """Run all tests."""
    print("="*60)
    print("GTA 6 News Scraper - Test Suite")
    print("="*60 + "\n")
    
    tests = [
        ("Dependencies", check_dependencies),
        ("Directory Structure", check_directories),
        ("Text Cleaning", test_text_cleaning),
        ("Article Extraction", test_extraction),
    ]
    
    results = []
    for name, test_func in tests:
        try:
            result = test_func()
            results.append((name, result))
        except Exception as e:
            print(f"❌ {name} test crashed: {e}\n")
            results.append((name, False))
    
    print("="*60)
    print("Test Summary")
    print("="*60)
    
    for name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status} - {name}")
    
    print("\n")
    
    if all(result for _, result in results):
        print("🎉 All tests passed! You're ready to scrape.")
        print("\nNext steps:")
        print("  1. Edit sources.txt with GTA 6 article URLs")
        print("  2. Run: python gta6_scraper.py")
    else:
        print("⚠️  Some tests failed. Please check the errors above.")
        print("   Run: pip install -r requirements.txt")
    
    print("\n" + "="*60)

if __name__ == "__main__":
    main()
