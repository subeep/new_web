"""Local dev server: serves this folder with caching disabled so edits always show up."""
import http.server, sys

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8420
http.server.ThreadingHTTPServer(("0.0.0.0", port), NoCache).serve_forever()
