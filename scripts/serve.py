from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler


def main() -> None:
    address = ("127.0.0.1", 8000)
    server = ThreadingHTTPServer(address, SimpleHTTPRequestHandler)
    print("Serving ClothLab at http://127.0.0.1:8000")
    server.serve_forever()


if __name__ == "__main__":
    main()
