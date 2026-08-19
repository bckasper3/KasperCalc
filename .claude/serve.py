import http.server
import os
import socketserver

port = int(os.environ.get("PORT", 3901))
handler = http.server.SimpleHTTPRequestHandler

class Server(socketserver.ThreadingTCPServer):
    daemon_threads = True
    allow_reuse_address = True


with Server(("", port), handler) as httpd:
    print(f"Serving on port {port}")
    httpd.serve_forever()
