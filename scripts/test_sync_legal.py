"""Exercise legal conversion without app or third-party dependencies."""

from html.parser import HTMLParser
import importlib.util
from pathlib import Path
import re
import sys
import unittest

sys.dont_write_bytecode = True

spec = importlib.util.spec_from_file_location('sync_legal', Path(__file__).with_name('sync-legal.py'))
sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)


class ArticleText(HTMLParser):
    def __init__(self):
        super().__init__()
        self.active = False
        self.parts = []

    def handle_starttag(self, tag, attrs):
        if tag == 'article':
            self.active = True

    def handle_endtag(self, tag):
        if tag == 'article':
            self.active = False

    def handle_data(self, text):
        if self.active:
            self.parts.append(text)


class LegalConversionTest(unittest.TestCase):
    def test_structure_and_inline_markup(self):
        parser = sync.LegalMarkdown()
        parser.feed('''<nav>Ignore</nav><article><h1>Policy</h1>
        <p>A <strong>bold &amp; <em>italic</em></strong> paragraph with
        <a href="https://expo.dev/privacy">Expo</a> and <code>code</code>.</p>
        <ol><li>One</li><li>Two</li></ol><ul><li>Bullet</li></ul><hr />
        </article><footer>Ignore</footer>''')
        self.assertEqual(parser.markdown(), '''# Policy

A **bold & *italic*** paragraph with [Expo](https://expo.dev/privacy) and `code`.

1. One
2. Two

- Bullet

---
''')

    def test_unsupported_markup_fails_instead_of_losing_content(self):
        for html in ('<table>', '<a href="relative.html">'):
            with self.subTest(html=html), self.assertRaises(ValueError):
                sync.LegalMarkdown().feed('<article>' + html)

    def test_every_word_in_published_articles_survives_conversion(self):
        for path in (sync.ROOT / 'landing/legal').glob('*.html'):
            with self.subTest(path=path):
                source = path.read_text()
                plain = ArticleText()
                plain.feed(source)
                parser = sync.LegalMarkdown()
                parser.feed(source)
                markdown = parser.markdown()
                markdown = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', markdown)
                markdown = re.sub(r'(?m)^(?:#{1,3} |\d+\. |[-] |---$)', '', markdown)
                markdown = re.sub(r'[*`]', '', markdown)
                normalize = lambda text: ' '.join(text.split())
                self.assertEqual(normalize(markdown), normalize(''.join(plain.parts)))


if __name__ == '__main__':
    unittest.main()
