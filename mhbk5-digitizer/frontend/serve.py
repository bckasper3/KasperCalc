"""Static file server for frontend/, same as `python -m http.server` but
sends Cache-Control: no-store on every response.

Plain http.server sends no cache headers at all, so browsers fall back to
heuristic caching and can keep serving an old copy of a .js/.css file for a
long time after it's changed on disk - confusing during active development
(edits don't show up even after a hard reload). Run this instead:
    python serve.py [port]
"""
import functools
import sys
from pathlib import Path
from http.server import HTTPServer, SimpleHTTPRequestHandler

# Serve this script's own directory (frontend/), regardless of the caller's
# current working directory - so `python serve.py` works the same whether
# it's run from frontend/ itself or from the project root via start.bat.
FRONTEND_DIR = Path(__file__).resolve().parent


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    handler = functools.partial(NoCacheHandler, directory=str(FRONTEND_DIR))
    HTTPServer(("", port), handler).serve_forever()
