#!/usr/bin/env python3
"""Inline the built app into one self-contained HTML fragment.

Used to hand the drill to a phone without a hosting step. The service worker
and manifest are stripped: they need a real origin and scope, so offline only
works from the deployed site, not from this single file.

Run after `npm run build`:  python3 scripts/build-singlefile.py <out.html>
"""
import base64
import pathlib
import re
import sys

DIST = pathlib.Path("dist")
out_path = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "dist/standalone.html")

html = (DIST / "index.html").read_text(encoding="utf-8")

js_name = re.search(r'src="[^"]*?(assets/[^"]+\.js)"', html).group(1)
css_name = re.search(r'href="[^"]*?(assets/[^"]+\.css)"', html).group(1)
js = (DIST / js_name).read_text(encoding="utf-8")
css = (DIST / css_name).read_text(encoding="utf-8")
icon = base64.b64encode((DIST / "favicon.ico").read_bytes()).decode()

# The publish step supplies <!doctype>, <html>, <head> and <body>, so emit the
# page content only.
fragment = f"""<title>Preflop Trainer</title>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="theme-color" content="#0b0f14" />
<link rel="icon" href="data:image/x-icon;base64,{icon}" sizes="32x32" />

<style>
{css}
</style>

<div id="root"></div>

<script type="module">
{js}
</script>
"""

out_path.parent.mkdir(parents=True, exist_ok=True)
out_path.write_text(fragment, encoding="utf-8")
kb = len(fragment.encode("utf-8")) / 1024
print(f"wrote {out_path} ({kb:.0f} KB)")
