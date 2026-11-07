"""Bounded file scanning and extraction, shared by both deployment targets."""

import hashlib
import os
from functools import lru_cache
from pathlib import Path
import re
import subprocess
import tempfile
import time
import zipfile
from xml.etree import ElementTree


MAX_BYTES = 10 * 1024 * 1024
MAX_EXPANDED_BYTES = 50 * 1024 * 1024
MAX_TEXT_BYTES = 2 * 1024 * 1024
MAX_PAGES = 20


class ProcessingError(Exception):
    """A bounded failure safe to expose without subprocess output or paths."""


def digest_file(path):
    value = hashlib.sha256()
    with open(path, "rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            value.update(chunk)
    return value.hexdigest()


def command(args, directory, timeout=20):
    # prlimit applies in the child without preexec_fn in the threaded HTTP host.
    # Container limits independently bound total memory, PIDs and temporary data.
    with tempfile.TemporaryFile(dir=directory) as output:
        try:
            result = subprocess.run(
                ["prlimit", "--fsize=8388608", "--cpu=45", "--"] + args,
                stdin=subprocess.DEVNULL,
                stdout=output,
                stderr=subprocess.STDOUT,
                timeout=timeout,
                check=False,
                env={"PATH": "/usr/local/bin:/usr/bin:/bin", "LANG": "C.UTF-8", "HOME": str(directory)},
            )
        except (OSError, subprocess.TimeoutExpired) as error:
            raise ProcessingError("engine_unavailable_or_timed_out") from error
        output.seek(0)
        text = output.read(1024 * 1024).decode("utf-8", errors="replace")
        return result.returncode, text


def engine_result(engine, source, directory, database, rules):
    started = time.monotonic()
    try:
        if engine == "clamav":
            daemon_config = os.environ.get("CLAMD_CONFIG")
            if daemon_config:
                # A missing or failed daemon is an error, never a fallback that
                # silently reloads a different signature set for this request.
                args = ["clamdscan", "--no-summary", "--stream", f"--config-file={daemon_config}", str(source)]
            else:
                args = ["clamscan", "--no-summary", f"--database={database}",
                        "--max-filesize=10M", "--max-scansize=50M", "--max-files=512",
                        "--max-recursion=8", "--alert-exceeds-max=yes", str(source)]
            code, output = command(args, directory)
            if code not in (0, 1):
                raise ProcessingError("scan_failed")
            findings = re.findall(r": ([^\r\n]+) FOUND", output)
            if code == 1 and not findings:
                raise ProcessingError("invalid_engine_result")
            status = "detected" if code == 1 else "clean"
        else:
            code, output = command(["yara", "--timeout=15", str(rules), str(source)], directory)
            if code != 0:
                raise ProcessingError("scan_failed")
            findings = [line.split()[0] for line in output.splitlines() if line.strip()]
            status = "detected" if findings else "clean"
        return {"engine": engine, "status": status, "findings": findings, "durationMs": round((time.monotonic() - started) * 1000)}
    except ProcessingError as error:
        return {"engine": engine, "status": "error", "reason": str(error), "durationMs": round((time.monotonic() - started) * 1000)}


@lru_cache(maxsize=4)
def provenance(database, rules):
    # The deployment mounts frozen rules and databases read-only. Hash once per
    # artifact set rather than re-read a large database for every document.
    databases = sorted(path for path in database.iterdir() if path.suffix in {".cvd", ".cld", ".ndb", ".hdb", ".ldb"})
    if not databases or not rules.is_file():
        raise ProcessingError("signature_artifacts_missing")
    versions = {}
    with tempfile.TemporaryDirectory(prefix="engine-info-") as directory:
        for name, binary in (("clamav", "clamscan"), ("yara", "yara")):
            code, value = command([binary, "--version"], directory)
            if code != 0:
                raise ProcessingError("engine_version_unavailable")
            versions[name] = value.strip()
    return {"versions": versions, "clamavDatabases": [{"file": path.name, "sha256": digest_file(path)} for path in databases],
            "yaraRulesSha256": digest_file(rules)}


def text_file(path):
    if path.stat().st_size > MAX_TEXT_BYTES:
        raise ProcessingError("extracted_text_too_large")
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeError as error:
        raise ProcessingError("invalid_text_encoding") from error


def extract(source, media_type, directory):
    if media_type == "text/plain":
        text = text_file(source)
        if "\x00" in text:
            raise ProcessingError("binary_content_in_text")
        return [{"page": 1, "method": "utf8", "text": text}]
    if media_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        try:
            with zipfile.ZipFile(source) as archive:
                entries = archive.infolist()
                if len(entries) > 512 or sum(item.file_size for item in entries) > MAX_EXPANDED_BYTES:
                    raise ProcessingError("archive_limits_exceeded")
                if any(item.flag_bits & 1 for item in entries):
                    raise ProcessingError("encrypted_document")
                item = archive.getinfo("word/document.xml")
                if item.file_size > MAX_TEXT_BYTES:
                    raise ProcessingError("document_xml_too_large")
                xml = archive.read(item)
                if b"<!DOCTYPE" in xml or b"<!ENTITY" in xml:
                    raise ProcessingError("xml_entities_not_allowed")
                root = ElementTree.fromstring(xml)
                namespace = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
                paragraphs = ["".join(text.text or "" for text in node.iter(namespace + "t")) for node in root.iter(namespace + "p")]
                # DOCX has no reliable physical page boundaries without layout.
                return [{"page": None, "section": 1, "method": "docx_xml", "text": "\n".join(paragraphs)}]
        except (zipfile.BadZipFile, KeyError, ElementTree.ParseError) as error:
            raise ProcessingError("malformed_docx") from error
    if media_type != "application/pdf":
        raise ProcessingError("unsupported_media_type")
    code, info = command(["pdfinfo", str(source)], directory)
    if code != 0:
        raise ProcessingError("invalid_or_encrypted_pdf")
    count = re.search(r"^Pages:\s+(\d+)", info, re.MULTILINE)
    if not count or not 1 <= int(count[1]) <= MAX_PAGES:
        raise ProcessingError("pdf_page_limit")
    if re.search(r"^Encrypted:\s+yes", info, re.MULTILINE):
        raise ProcessingError("encrypted_document")
    pages, total = [], 0
    deadline = time.monotonic() + 45
    for page in range(1, int(count[1]) + 1):
        if time.monotonic() >= deadline:
            raise ProcessingError("extraction_deadline")
        output = directory / "page.txt"
        code, _ = command(["pdftotext", "-f", str(page), "-l", str(page), "-enc", "UTF-8", str(source), str(output)], directory)
        if code != 0:
            raise ProcessingError("pdf_extraction_failed")
        text, method = text_file(output).strip(), "pdf_text"
        if not text:
            image = directory / "page"
            code, _ = command(["pdftoppm", "-f", str(page), "-l", str(page), "-singlefile", "-scale-to", "2400", "-png", str(source), str(image)], directory)
            if code != 0:
                raise ProcessingError("pdf_rasterization_failed")
            code, _ = command(["tesseract", str(image) + ".png", str(directory / "page"), "-l", "eng"], directory)
            if code != 0:
                raise ProcessingError("ocr_failed")
            text, method = text_file(output).strip(), "tesseract_eng"
            Path(str(image) + ".png").unlink(missing_ok=True)
        total += len(text.encode("utf-8"))
        if total > MAX_TEXT_BYTES:
            raise ProcessingError("extracted_text_too_large")
        pages.append({"page": page, "method": method, "text": text})
    return pages


def process_document(content, media_type, database, rules):
    if not 0 < len(content) <= MAX_BYTES:
        raise ProcessingError("file_size_out_of_range")
    supported = {"text/plain", "application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"}
    if media_type not in supported:
        raise ProcessingError("unsupported_media_type")
    result = {"sha256": hashlib.sha256(content).hexdigest(), "bytes": len(content), "mediaType": media_type}
    with tempfile.TemporaryDirectory(prefix="document-") as temp:
        directory = Path(temp)
        source = directory / "input"
        source.write_bytes(content)
        result["engines"] = [engine_result(name, source, directory, database, rules) for name in ("clamav", "yara")]
        statuses = [item["status"] for item in result["engines"]]
        result["status"] = "detected" if "detected" in statuses else "unresolved" if "error" in statuses else "clean"
        if result["status"] == "clean":
            try:
                result["pages"] = extract(source, media_type, directory)
                if not any(page["text"].strip() for page in result["pages"]):
                    raise ProcessingError("empty_extraction")
                result["extractionStatus"] = "completed"
            except ProcessingError as error:
                result["status"] = "unresolved"
                result["extractionStatus"] = "failed"
                result["reason"] = str(error)
                result.pop("pages", None)
        else:
            result["extractionStatus"] = "not_run"
        try:
            result["provenance"] = provenance(database, rules)
        except (ProcessingError, OSError):
            # A result without identifiable scanning artifacts cannot be called
            # clean, even if both subprocesses returned a successful status.
            if result["status"] == "clean":
                result["status"] = "unresolved"
                result["reason"] = "signature_provenance_unavailable"
                result.pop("pages", None)
    return result
