"""Run inside the scanner image. Tests invoke installed binaries, not mocks."""

import hashlib
import io
from concurrent.futures import ThreadPoolExecutor
import http.client
import json
import os
from pathlib import Path
import signal
import subprocess
import tempfile
import time
import unittest
from unittest.mock import patch
import zipfile
import zlib

from worker import ProcessingError, command, process_document
from daemon import ScanDaemon


def pdf(objects):
    result, offsets = bytearray(b"%PDF-1.4\n"), [0]
    for number, value in enumerate(objects, 1):
        offsets.append(len(result))
        result.extend(f"{number} 0 obj\n".encode() + value + b"\nendobj\n")
    xref = len(result)
    result.extend(f"xref\n0 {len(offsets)}\n0000000000 65535 f \n".encode())
    for offset in offsets[1:]:
        result.extend(f"{offset:010d} 00000 n \n".encode())
    result.extend(f"trailer\n<< /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode())
    return bytes(result)


def pdf_stream(data, properties=b""):
    return b"<< /Length " + str(len(data)).encode() + b" " + properties + b" >>\nstream\n" + data + b"\nendstream"


def text_pdf():
    return pdf([
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        pdf_stream(b"BT /F1 24 Tf 50 700 Td (Revenue 123.45 USD) Tj ET"),
    ])


class WorkerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.database = Path(cls.temp.name) / "database"
        cls.database.mkdir()
        cls.clam_marker = b"PILOT_CLAMAV_DETECTION_57241"
        (cls.database / "pilot.ndb").write_text("Pilot.Document.Marker:0:*:" + cls.clam_marker.hex() + "\n")
        cls.rules = Path("/app/rules.yar")

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def scan(self, content, media_type="text/plain", database=None, rules=None):
        return process_document(content, media_type, database or self.database, rules or self.rules)

    def test_clean_text_executes_both_engines(self):
        content = b"Financial report: revenue was 123.45 USD."
        result = self.scan(content)
        self.assertEqual(result["status"], "clean", result)
        self.assertEqual([item["status"] for item in result["engines"]], ["clean", "clean"])
        self.assertEqual(result["sha256"], hashlib.sha256(content).hexdigest())
        self.assertEqual(result["pages"][0]["text"], content.decode())
        self.assertIn("ClamAV", result["provenance"]["versions"]["clamav"])
        self.assertEqual(result["provenance"]["clamavDatabases"][0]["sha256"], hashlib.sha256((self.database / "pilot.ndb").read_bytes()).hexdigest())

    def test_persistent_engine_scans_concurrently_and_fails_closed_after_loss(self):
        with ScanDaemon(self.database) as engine:
            self.assertTrue(engine.healthy())
            self.assertEqual(engine.socket.stat().st_mode & 0o777, 0o600)
            with patch.dict(os.environ, {"CLAMD_CONFIG": str(engine.config)}):
                with ThreadPoolExecutor(max_workers=2) as executor:
                    results = list(executor.map(self.scan, [b"Concurrent clean report", self.clam_marker]))
                self.assertEqual([item["status"] for item in results], ["clean", "detected"], results)
                self.assertNotIn("pages", results[1])
                engine.close()
                self.assertFalse(engine.healthy())
                failed = self.scan(b"A report cannot pass without its engine")
                self.assertEqual(failed["status"], "unresolved", failed)
                self.assertEqual(failed["engines"][0]["status"], "error")
                self.assertNotIn("pages", failed)

    def test_http_health_tracks_engine_loss_and_shutdown_reaps_worker(self):
        # The test runs in its own network-isolated container, not on a host port.
        port = 18081
        environment = {**os.environ, "CLAMAV_DATABASE": str(self.database), "PORT": str(port)}
        process = subprocess.Popen(["python", "/app/server.py"], env=environment,
                                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        engine_pid = None

        def request(method, path, content=None):
            connection = http.client.HTTPConnection("127.0.0.1", port, timeout=3)
            try:
                connection.request(method, path, body=content, headers={"Content-Type": "text/plain"})
                response = connection.getresponse()
                return response.status, json.loads(response.read())
            finally:
                connection.close()

        try:
            deadline = time.monotonic() + 15
            while time.monotonic() < deadline:
                try:
                    if request("GET", "/health") == (200, {"ready": True}):
                        break
                except (OSError, http.client.HTTPException):
                    pass
                self.assertIsNone(process.poll(), "HTTP worker exited during startup")
                time.sleep(0.1)
            self.assertEqual(request("GET", "/health"), (200, {"ready": True}))
            status, result = request("POST", "/scan", b"HTTP scanner lifecycle report")
            self.assertEqual(status, 200)
            self.assertEqual(result["status"], "clean", result)
            children = Path(f"/proc/{process.pid}/task/{process.pid}/children").read_text().split()
            self.assertEqual(len(children), 1)
            engine_pid = int(children[0])
            os.kill(engine_pid, signal.SIGTERM)
            deadline = time.monotonic() + 5
            while time.monotonic() < deadline and request("GET", "/health")[0] != 503:
                time.sleep(0.1)
            self.assertEqual(request("GET", "/health"), (503, {"ready": False}))
            status, result = request("POST", "/scan", b"Must remain excluded after engine loss")
            self.assertEqual(status, 200)
            self.assertEqual(result["status"], "unresolved", result)
            self.assertNotIn("pages", result)
        finally:
            process.terminate()
            try:
                process.wait(timeout=8)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=3)
            if engine_pid and Path(f"/proc/{engine_pid}").exists():
                os.kill(engine_pid, signal.SIGKILL)
                self.fail("Scanner shutdown did not reap its engine")

    def test_independent_detections_never_reach_extraction(self):
        for content, expected in [(self.clam_marker, ["detected", "clean"]),
                                  (b"PILOT_DOCUMENT_DETECTION_73261", ["clean", "detected"]),
                                  (self.clam_marker + b" PILOT_DOCUMENT_DETECTION_73261", ["detected", "detected"])]:
            with self.subTest(expected=expected):
                result = self.scan(content)
                self.assertEqual(result["status"], "detected", result)
                self.assertEqual([item["status"] for item in result["engines"]], expected)
                self.assertEqual(result["extractionStatus"], "not_run")
                self.assertNotIn("pages", result)

    def test_missing_signature_database_or_rules_fail_closed(self):
        missing = Path(self.temp.name) / "missing"
        for options in ({"database": missing}, {"rules": missing}):
            result = self.scan(b"Financial report", **options)
            self.assertEqual(result["status"], "unresolved", result)
            self.assertTrue(any(item["status"] == "error" for item in result["engines"]))
            self.assertNotIn("pages", result)

    def test_docx_reads_text_without_inventing_physical_pages(self):
        stream = io.BytesIO()
        with zipfile.ZipFile(stream, "w") as archive:
            archive.writestr("word/document.xml", '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Quarterly revenue 123.45</w:t></w:r></w:p></w:body></w:document>')
        result = self.scan(stream.getvalue(), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
        self.assertEqual(result["status"], "clean", result)
        self.assertEqual(result["pages"][0]["text"], "Quarterly revenue 123.45")
        self.assertIsNone(result["pages"][0]["page"])

    def test_parser_errors_and_empty_content_are_not_clean(self):
        for content, media_type in [(b"not a PDF", "application/pdf"), (b"binary\x00payload", "text/plain"), (b"  ", "text/plain")]:
            result = self.scan(content, media_type)
            self.assertEqual(result["status"], "unresolved", result)
            self.assertEqual(result["extractionStatus"], "failed")
            self.assertNotIn("pages", result)
        with self.assertRaises(ProcessingError):
            self.scan(b"")
        with self.assertRaises(ProcessingError):
            self.scan(b"unknown", "application/octet-stream")

    def test_pdf_text_keeps_page_provenance(self):
        result = self.scan(text_pdf(), "application/pdf")
        self.assertEqual(result["status"], "clean", result)
        self.assertEqual(result["pages"][0]["page"], 1)
        self.assertEqual(result["pages"][0]["method"], "pdf_text")
        self.assertIn("Revenue 123.45 USD", result["pages"][0]["text"])

    def test_image_only_pdf_executes_ocr(self):
        directory = Path(self.temp.name)
        source, image = directory / "source.pdf", directory / "raster"
        source.write_bytes(text_pdf())
        code, _ = command(["pdftoppm", "-singlefile", "-scale-to", "1600", str(source), str(image)], directory)
        self.assertEqual(code, 0)
        with open(str(image) + ".ppm", "rb") as stream:
            self.assertEqual(stream.readline().strip(), b"P6")
            width, height = map(int, stream.readline().split())
            self.assertEqual(stream.readline().strip(), b"255")
            pixels = stream.read()
        self.assertEqual(len(pixels), width * height * 3)
        content = pdf([
            b"<< /Type /Catalog /Pages 2 0 R >>",
            b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >>",
            pdf_stream(zlib.compress(pixels), f"/Type /XObject /Subtype /Image /Width {width} /Height {height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode".encode()),
            pdf_stream(b"q 612 0 0 792 0 0 cm /Im1 Do Q"),
        ])
        result = self.scan(content, "application/pdf")
        self.assertEqual(result["status"], "clean", result)
        self.assertEqual(result["pages"][0]["method"], "tesseract_eng")
        self.assertIn("123.45", result["pages"][0]["text"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
