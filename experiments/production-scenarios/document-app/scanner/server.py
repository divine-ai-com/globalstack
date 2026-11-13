"""Container-internal HTTP entrypoint; ingress identity is configured by IaC."""

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import signal
import threading
from uuid import UUID

from daemon import ScanDaemon
from worker import MAX_BYTES, ProcessingError, process_document


slots = threading.BoundedSemaphore(2)
log_lock = threading.Lock()
database = Path(os.environ.get("CLAMAV_DATABASE", "/var/lib/clamav"))
rules = Path(os.environ.get("YARA_RULES", "/app/rules.yar"))
ready = False
engine = None


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def setup(self):
        super().setup()
        self.connection.settimeout(15)

    def log_message(self, _format, *_args):
        # Payloads, filenames and authorization headers are never logged here.
        pass

    def respond(self, status, value):
        body = json.dumps(value).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Connection", "close")
        self.end_headers()
        self.wfile.write(body)
        self.close_connection = True

    def do_GET(self):
        if self.path != "/health":
            return self.respond(404, {"error": "route_not_found"})
        healthy = ready and engine is not None and engine.healthy()
        self.respond(200 if healthy else 503, {"ready": healthy})

    def do_POST(self):
        if self.path != "/scan":
            return self.respond(404, {"error": "route_not_found"})
        if self.headers.get("Transfer-Encoding"):
            return self.respond(400, {"error": "content_length_required"})
        lengths = self.headers.get_all("Content-Length", [])
        if len(lengths) != 1 or len(lengths[0]) > 8 or not lengths[0].isdigit():
            return self.respond(400, {"error": "invalid_content_length"})
        length = int(lengths[0])
        if not 0 < length <= MAX_BYTES:
            return self.respond(413, {"error": "file_size_out_of_range"})
        if not slots.acquire(blocking=False):
            return self.respond(503, {"error": "worker_busy"})
        try:
            content = self.rfile.read(length)
            if len(content) != length:
                return self.respond(400, {"error": "incomplete_request"})
            result = process_document(content, self.headers.get("Content-Type", "").split(";")[0], database, rules)
            try:
                correlation = str(UUID(self.headers.get("X-Correlation-Id", "")))
            except ValueError:
                correlation = None
            with log_lock:
                print(json.dumps({"stage": "scanner_completed", "correlationId": correlation,
                                  "contentHash": result["sha256"], "status": result["status"],
                                  "engines": [{"engine": item["engine"], "status": item["status"]}
                                              for item in result["engines"]]}), flush=True)
            self.respond(200, result)
        except ProcessingError as error:
            self.respond(422, {"error": str(error)})
        except (OSError, ValueError):
            self.respond(503, {"error": "worker_failed"})
        finally:
            slots.release()


class BoundedServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, *args):
        self.connections = threading.BoundedSemaphore(16)
        super().__init__(*args)

    def process_request(self, request, address):
        if not self.connections.acquire(blocking=False):
            self.shutdown_request(request)
            return
        try:
            super().process_request(request, address)
        except Exception:
            self.connections.release()
            raise

    def process_request_thread(self, request, address):
        try:
            super().process_request_thread(request, address)
        finally:
            self.connections.release()


if __name__ == "__main__":
    with ScanDaemon(database) as engine:
        os.environ["CLAMD_CONFIG"] = str(engine.config)
        try:
            ready = process_document(b"Document worker readiness probe", "text/plain", database, rules)["status"] == "clean"
        except (ProcessingError, OSError):
            ready = False
        with BoundedServer(("0.0.0.0", int(os.environ.get("PORT", "8080"))), Handler) as server:
            def stop(_signum, _frame):
                threading.Thread(target=server.shutdown, daemon=True).start()

            signal.signal(signal.SIGTERM, stop)
            signal.signal(signal.SIGINT, stop)
            server.serve_forever()
