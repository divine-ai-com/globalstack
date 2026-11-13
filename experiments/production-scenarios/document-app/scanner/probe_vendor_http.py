"""Record actual HTTP scans with frozen vendor signatures inside a bounded container."""

import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import http.client
import json
import os
from pathlib import Path
import signal
import subprocess
import time
from uuid import uuid4

from test_worker import text_pdf


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    parser.add_argument("--image-id", required=True)
    parser.add_argument("--revision", required=True)
    options = parser.parse_args()
    output = Path(options.output)
    output.mkdir(parents=True, exist_ok=True)
    port = 18082
    report = {"scope": "Local HTTP scanner with official frozen ClamAV databases. No Azure or complete pipeline result.",
              "startedAt": datetime.now(timezone.utc).isoformat(), "imageId": options.image_id,
              "sourceRevision": options.revision, "requests": [], "cleanup": False}
    started = time.monotonic()
    process = None
    engine_pid = None

    def request(name, content=None, kind="text/plain", path="/scan"):
        correlation = str(uuid4())
        connection = http.client.HTTPConnection("127.0.0.1", port, timeout=30)
        before = time.monotonic()
        try:
            connection.request("POST" if content is not None else "GET", path, body=content,
                               headers={"Content-Type": kind, "X-Correlation-Id": correlation})
            response = connection.getresponse()
            return {"case": name, "correlationId": correlation, "httpStatus": response.status,
                    "body": json.loads(response.read()), "durationMs": round((time.monotonic() - before) * 1000)}
        finally:
            connection.close()

    try:
        with (output / "server.log").open("w") as log:
            process = subprocess.Popen(["python", "/app/server.py"], stdout=log, stderr=log,
                                       env={**os.environ, "PORT": str(port)})
            deadline = time.monotonic() + 100
            while time.monotonic() < deadline:
                try:
                    if request("startup-health", path="/health")["httpStatus"] == 200:
                        break
                except (OSError, http.client.HTTPException):
                    pass
                if process.poll() is not None:
                    raise RuntimeError("HTTP scanner exited during startup")
                time.sleep(0.2)
            healthy = request("ready", path="/health")
            report["requests"].append(healthy)
            if healthy["httpStatus"] != 200:
                raise RuntimeError("Scanner readiness deadline exceeded")
            report["startupMs"] = round((time.monotonic() - started) * 1000)
            engine_pid = int(Path(f"/proc/{process.pid}/task/{process.pid}/children").read_text().strip())
            cases = [
                ("clean-txt", b"Pilot vendor-signature check: revenue 123.45 USD.", "text/plain", "clean"),
                ("clean-pdf", text_pdf(), "application/pdf", "clean"),
                ("clamav-harmless-detection", b"X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*", "text/plain", "detected"),
                ("yara-harmless-detection", b"PILOT_DOCUMENT_DETECTION_73261", "text/plain", "detected"),
            ]
            for name, content, kind, expected in cases:
                result = request(name, content, kind)
                result["expected"] = expected
                report["requests"].append(result)
            with ThreadPoolExecutor(max_workers=2) as executor:
                concurrent = list(executor.map(lambda n: request(f"concurrent-{n}", f"Concurrent document {n}: revenue 123.45 USD".encode()), range(2)))
            for result in concurrent:
                result["expected"] = "clean"
                report["requests"].append(result)
            os.kill(engine_pid, signal.SIGTERM)
            deadline = time.monotonic() + 5
            while time.monotonic() < deadline and request("poll-after-loss", path="/health")["httpStatus"] != 503:
                time.sleep(0.1)
            report["requests"].append(request("engine-loss-health", path="/health"))
            lost = request("engine-loss-scan", b"Must not be treated as clean after engine failure")
            lost["expected"] = "unresolved"
            report["requests"].append(lost)
    except Exception as error:
        report["error"] = type(error).__name__ + ": " + str(error)
    finally:
        if process is not None:
            process.terminate()
            try:
                process.wait(timeout=8)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=3)
            report["cleanup"] = engine_pid is not None and not Path(f"/proc/{engine_pid}").exists()
        report["completedAt"] = datetime.now(timezone.utc).isoformat()
        report["decisionsMatched"] = all(item["httpStatus"] == 200 and item["body"].get("status") == item["expected"]
                                         for item in report["requests"] if "expected" in item)
        lines = (output / "server.log").read_text().splitlines()
        logs = []
        for line in lines:
            try:
                logs.append(json.loads(line))
            except json.JSONDecodeError:
                continue
        report["correlatedScans"] = all(sum(log.get("correlationId") == item["correlationId"]
                                              and log.get("contentHash") == item["body"].get("sha256")
                                              and log.get("status") == item["expected"]
                                              for log in logs) == 1
                                        for item in report["requests"] if "expected" in item)
        report["readinessFailedClosed"] = any(item["case"] == "engine-loss-health" and item["httpStatus"] == 503
                                              and item["body"] == {"ready": False} for item in report["requests"])
        report["complete"] = (not report.get("error") and len(report["requests"]) == 9 and report["decisionsMatched"]
                              and report["cleanup"] and report["correlatedScans"] and report["readinessFailedClosed"])
        (output / "result.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"complete": report["complete"], "startupMs": report.get("startupMs"),
                      "requests": [{"case": r["case"], "httpStatus": r["httpStatus"], "status": r["body"].get("status"), "durationMs": r["durationMs"]} for r in report["requests"]]}))
    return 0 if report["complete"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
