#!/usr/bin/env python3
"""Small dev server for geebr.world.

Serves the static project files. The browser downloads WebLLM model files
directly from HuggingFace and caches them in IndexedDB (no server proxy needed).

Run:
    cd /files/geebr.world
    python3 geebr_server.py 8000
"""

from __future__ import annotations

import http.server
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent


class GeebrHandler(http.server.SimpleHTTPRequestHandler):
    server_version = "geebr.world-dev/0.3"
    protocol_version = "HTTP/1.1"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get("PORT", "8000"))
    os.chdir(ROOT)
    print(f"Serving geebr.world on http://localhost:{port}")
    http.server.ThreadingHTTPServer(("", port), GeebrHandler).serve_forever()
