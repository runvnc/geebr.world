#!/usr/bin/env python3
"""Dev server for the MiniCPM5-1B browser demo.

Sends Cross-Origin-Opener-Policy / Cross-Origin-Embedder-Policy headers so the
page becomes crossOriginIsolated, which is required for multi-threaded WASM
(SharedArrayBuffer). Without these headers wllama falls back to single-thread.

Usage:  python3 serve.py [port]     (default port 8177)
"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        self.send_header("Cross-Origin-Resource-Policy", "cross-origin")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write("[serve] " + (fmt % args) + "\n")


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8177
    srv = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print(f"MiniCPM5 demo -> http://localhost:{port}/")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
