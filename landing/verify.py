"""Check the static site's links and assets before publishing to a repository subpath."""

from hashlib import sha256
from html.parser import HTMLParser
from pathlib import Path
import re
import sys
from urllib.parse import unquote, urlsplit


class Page(HTMLParser):
    def __init__(self, path):
        super().__init__()
        self.path = path
        self.ids = set()
        self.links = []
        self.feed(path.read_text())

    def handle_starttag(self, tag, attributes):
        attributes = dict(attributes)
        if "id" in attributes:
            value = attributes["id"]
            if value in self.ids:
                raise ValueError(f"{self.path}: duplicate id {value}")
            self.ids.add(value)
        for key in ("href", "src", "poster"):
            if key in attributes:
                self.links.append(attributes[key])


def verify(root):
    pages = {path: Page(path) for path in root.rglob("*.html")}
    for required in ("index.html", "legal/privacy-policy.html", "legal/terms-and-conditions.html"):
        if root / required not in pages:
            raise ValueError(f"Missing required page: {required}")

    version = sha256((root / "styles.css").read_bytes()).hexdigest()[:12]
    stylesheet = f"styles.css?v={version}"
    if stylesheet not in pages[root / "index.html"].links:
        raise ValueError(
            f'index.html: update the stylesheet link to href="{stylesheet}" '
            "so returning visitors load the current CSS"
        )

    def local_target(path, link):
        url = urlsplit(link)
        if url.scheme or url.netloc:
            return None
        if url.path.startswith("/"):
            raise ValueError(f"{path}: {link} breaks repository-subpath hosting")
        target = (path.parent / unquote(url.path)).resolve() if url.path else path
        if not target.is_relative_to(root) or not target.is_file():
            raise ValueError(f"{path}: missing or out-of-site target {link}")
        return target

    for path, page in pages.items():
        for link in page.links:
            target = local_target(path, link)
            fragment = unquote(urlsplit(link).fragment)
            if target in pages and fragment and fragment not in pages[target].ids:
                raise ValueError(f"{path}: missing fragment {link}")

    for path in root.rglob("*.css"):
        for link in re.findall(r"url\(\s*['\"]?([^'\")\s]+)['\"]?\s*\)", path.read_text()):
            local_target(path, link)
    print(f"PASS: {len(pages)} pages; local links, fragments, images, fonts, and video resolve.")


if __name__ == "__main__":
    verify(Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path(__file__).resolve().parent)
