import re
from pathlib import Path

def build_standalone():
    dist_dir = Path("frontend/dist")
    index_html = (dist_dir / "index.html").read_text(encoding="utf-8")

    # Inline CSS
    css_match = re.search(r'<link rel="stylesheet"[^>]*href="[^"]*/(assets/[^"]+\.css)"[^>]*>', index_html)
    if css_match:
        css_file = dist_dir / css_match.group(1)
        css_content = css_file.read_text(encoding="utf-8")
        index_html = index_html.replace(css_match.group(0), f"<style>\n{css_content}\n</style>")
        print(f"Inlined CSS from {css_file}")

    # Inline JS
    js_match = re.search(r'<script type="module"[^>]*src="[^"]*/(assets/[^"]+\.js)"[^>]*></script>', index_html)
    if js_match:
        js_file = dist_dir / js_match.group(1)
        js_content = js_file.read_text(encoding="utf-8")
        index_html = index_html.replace(js_match.group(0), f'<script type="module">\n{js_content}\n</script>')
        print(f"Inlined JS from {js_file}")

    static_dir = Path("static")
    static_dir.mkdir(exist_ok=True)
    standalone_file = static_dir / "standalone.html"
    standalone_file.write_text(index_html, encoding="utf-8")
    print(f"Generated static/standalone.html: {standalone_file.stat().st_size} bytes")

if __name__ == "__main__":
    build_standalone()
