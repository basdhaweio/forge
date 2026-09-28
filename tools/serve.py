#!/usr/bin/env python
"""Local dev server for Forge: like `python -m http.server`, but with caching off so edits always load.

Usage: python tools/serve.py [port]      (default 8777) then open http://localhost:8777/
"""
import functools
import http.server
import os
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8777
    print(f"Forge on http://localhost:{port}/")
    http.server.ThreadingHTTPServer(("", port), functools.partial(NoCache, directory=ROOT)).serve_forever()
