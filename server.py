import functools
import os
import re
import socket
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))


class RangeHandler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".mp3": "audio/mpeg",
        ".js": "text/javascript",
        ".css": "text/css",
    }

    def handle(self):
        try:
            super().handle()
        except (BrokenPipeError, ConnectionResetError):
            pass  # браузер сам обрывает запросы к медиафайлам при перемотке

    def end_headers(self):
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def send_head(self):
        self._range_left = None
        header = self.headers.get("Range")
        path = self.translate_path(self.path)
        if not header or not os.path.isfile(path):
            return super().send_head()

        m = re.match(r"bytes=(\d*)-(\d*)$", header.strip())
        if not m or (m.group(1) == "" and m.group(2) == ""):
            return super().send_head()

        size = os.path.getsize(path)
        first, last = m.groups()
        if first == "":                      # bytes=-N: последние N байт
            start = max(size - int(last), 0)
            end = size - 1
        else:
            start = int(first)
            end = int(last) if last else size - 1
        end = min(end, size - 1)
        if start > end or start >= size:
            self.send_response(416)
            self.send_header("Content-Range", f"bytes */{size}")
            self.end_headers()
            return None

        f = open(path, "rb")
        f.seek(start)
        self._range_left = end - start + 1
        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(self._range_left))
        self.end_headers()
        return f

    def copyfile(self, source, outputfile):
        left = getattr(self, "_range_left", None)
        if left is None:
            return super().copyfile(source, outputfile)
        while left > 0:
            chunk = source.read(min(64 * 1024, left))
            if not chunk:
                break
            outputfile.write(chunk)
            left -= len(chunk)


def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))  # пакеты не отправляются, нужен только выбор интерфейса
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    handler = functools.partial(RangeHandler, directory=ROOT)
    with ThreadingHTTPServer(("0.0.0.0", port), handler) as httpd:
        print("Сервер запущен. Остановить: Ctrl+C\n")
        print(f"  На этом компьютере:  http://localhost:{port}")
        print(f"  С телефона:  http://{lan_ip()}:{port}\n")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nОстановлено.")


if __name__ == "__main__":
    main()
