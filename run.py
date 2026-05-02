#!/usr/bin/env python3

from __future__ import annotations

import contextlib
import http.server
import os
import socket
import socketserver
import sys
import threading
import webbrowser
from pathlib import Path


HOST = "127.0.0.1"
DEFAULT_PORT = 8000
MAX_PORT_TRIES = 25


class ReusableThreadingHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def find_open_port(host: str, start_port: int, attempts: int) -> int:
    for port in range(start_port, start_port + attempts):
        with contextlib.closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            if sock.connect_ex((host, port)) != 0:
                return port
    raise RuntimeError(f"No open port found in range {start_port}-{start_port + attempts - 1}")


def main() -> int:
    repo_root = Path(__file__).resolve().parent
    os.chdir(repo_root)

    port = find_open_port(HOST, DEFAULT_PORT, MAX_PORT_TRIES)
    handler = http.server.SimpleHTTPRequestHandler
    server = ReusableThreadingHTTPServer((HOST, port), handler)
    url = f"http://{HOST}:{port}"

    print(f"Serving ClothLab from {repo_root}")
    print(f"Open {url}")

    def open_browser() -> None:
      webbrowser.open(url)

    threading.Timer(0.4, open_browser).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down.")
    finally:
        server.server_close()

    return 0


if __name__ == "__main__":
    sys.exit(main())
