"""Dev server: run the editor in a normal browser (no pywebview).

    python tools/devserver.py  ->  http://127.0.0.1:8765
File dialogs aren't available here; everything else talks to the real Api.
"""
import json
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from bgremover.studio import Api, web_dir  # noqa: E402

api = Api()


class H(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=str(web_dir()), **k)

    def log_message(self, *a):
        pass

    def do_POST(self):
        if not self.path.startswith("/api/"):
            self.send_error(404)
            return
        name = self.path[5:]
        n = int(self.headers.get("Content-Length") or 0)
        args = json.loads(self.rfile.read(n) or b"[]")
        try:
            res = getattr(api, name)(*args)
        except Exception as e:  # noqa: BLE001
            res = {"ok": False, "error": repr(e)}
        body = json.dumps(res).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    print(f"http://127.0.0.1:{port}")
    ThreadingHTTPServer(("127.0.0.1", port), H).serve_forever()
