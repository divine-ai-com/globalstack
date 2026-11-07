"""Own one bounded ClamAV engine per scanner process, on a private Unix socket."""

from pathlib import Path
import socket
import subprocess
import tempfile
import time


class ScanDaemon:
    def __init__(self, database):
        self.database = Path(database).resolve()
        self.directory = None
        self.process = None
        self.config = None
        self.socket = None

    def healthy(self):
        if self.process is None or self.process.poll() is not None:
            return False
        try:
            with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as client:
                client.settimeout(1)
                client.connect(str(self.socket))
                client.sendall(b"zPING\0")
                response = b""
                while len(response) < 32 and not response.endswith(b"\0"):
                    chunk = client.recv(32 - len(response))
                    if not chunk:
                        break
                    response += chunk
                return response == b"PONG\0"
        except OSError:
            return False

    def __enter__(self):
        if not self.database.is_dir() or any(character in str(self.database) for character in '\r\n"'):
            raise RuntimeError("Invalid frozen signature directory")
        self.directory = tempfile.TemporaryDirectory(prefix="scanner-engine-")
        self.socket = Path(self.directory.name) / "clamd.sock"
        self.config = Path(self.directory.name) / "clamd.conf"
        self.config.write_text(f'''Foreground yes
DatabaseDirectory "{self.database}"
LocalSocket {self.socket}
LocalSocketMode 600
FixStaleSocket yes
TemporaryDirectory {self.directory.name}
MaxThreads 2
MaxQueue 4
ReadTimeout 20
CommandReadTimeout 5
SendBufTimeout 2000
StreamMaxLength 10M
MaxFileSize 10M
MaxScanSize 50M
MaxFiles 512
MaxRecursion 8
MaxScanTime 15000
AlertExceedsMax yes
SelfCheck 0
ConcurrentDatabaseReload no
ExitOnOOM yes
LogClean no
LogVerbose no
''')
        self.config.chmod(0o600)
        try:
            self.process = subprocess.Popen(
                ["clamd", "--foreground", f"--config-file={self.config}"],
                stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                start_new_session=True,
            )
            deadline = time.monotonic() + 90
            while time.monotonic() < deadline:
                if self.healthy():
                    return self
                if self.process.poll() is not None:
                    raise RuntimeError("ClamAV engine failed to initialize")
                time.sleep(0.1)
            raise RuntimeError("ClamAV engine initialization timed out")
        except BaseException:
            self.close()
            raise

    def close(self):
        if self.process is not None and self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait(timeout=5)
        if self.directory is not None:
            self.directory.cleanup()

    def __exit__(self, *_args):
        self.close()
