"""
gunsview service — HTTP API to send views to guns.lol profiles.
Listens on http://127.0.0.1:8192 (or PORT env var).

POST /view
  Body (JSON): {"username": "test", "worker_id": 0}
  Response:    {"ok": true, "username": "test"}
               {"ok": false, "error": "..."} on failure

GET /health
  Response: {"status": "ok", "workers": N, "active": N, "queued": N}
"""
import os
import json
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from socketserver import ThreadingMixIn
from typing import Optional

from gunsview import send_view


PORT = int(os.environ.get("GUNSVIEW_PORT", 8192))
MAX_WORKERS = int(os.environ.get("GUNSVIEW_WORKERS", 2))

_worker_sem = threading.Semaphore(MAX_WORKERS)
_active_count = 0
_queued_count = 0
_count_lock = threading.Lock()


class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print(f"[gunsview] {self.address_string()} - {fmt % args}")

    def send_json(self, code: int, data: dict):
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path != "/view":
            self.send_json(404, {"error": "use POST /view"})
            return

        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length)

        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            self.send_json(400, {"error": "invalid JSON"})
            return

        username = payload.get("username", "").strip()
        timeout = int(payload.get("timeout", 90))
        worker_id = int(payload.get("worker_id", 0))
        proxy = payload.get("proxy")  # e.g. "socks5://1.2.3.4:1080" or "http://1.2.3.4:8080"

        if not username:
            self.send_json(400, {"error": "username is required"})
            return

        global _active_count, _queued_count

        with _count_lock:
            _queued_count += 1
        print(f"[gunsview] queued — username={username!r} worker={worker_id} "
              f"(active={_active_count}/{MAX_WORKERS} queued={_queued_count})")

        _worker_sem.acquire()

        with _count_lock:
            _queued_count -= 1
            _active_count += 1

        t0 = time.time()
        try:
            print(f"[gunsview] sending view to {username} (worker={worker_id} proxy={proxy or 'direct'})")
            result = send_view(username, timeout=timeout, worker_id=worker_id, proxy=proxy)
            elapsed = round(time.time() - t0, 2)
            print(f"[gunsview] done in {elapsed}s — ok={result.get('ok')}")
            self.send_json(200, result)
        except Exception as exc:
            elapsed = round(time.time() - t0, 2)
            print(f"[gunsview] error after {elapsed}s: {exc}")
            self.send_json(500, {"ok": False, "error": str(exc), "username": username})
        finally:
            with _count_lock:
                _active_count -= 1
            _worker_sem.release()

    def do_GET(self):
        if self.path == "/health":
            with _count_lock:
                self.send_json(200, {
                    "status": "ok",
                    "workers": MAX_WORKERS,
                    "active": _active_count,
                    "queued": _queued_count,
                })
        else:
            self.send_json(404, {"error": "use POST /view"})


if __name__ == "__main__":
    server = ThreadedHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"[gunsview] service running on http://127.0.0.1:{PORT}")
    print(f"[gunsview] worker pool: {MAX_WORKERS} concurrent browser instances")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[gunsview] shutting down")
        server.server_close()
