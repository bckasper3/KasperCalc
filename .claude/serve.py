import http.server
import os
import socketserver

port = int(os.environ.get("PORT", 3901))
handler = http.server.SimpleHTTPRequestHandler

with socketserver.TCPServer(("", port), handler) as httpd:
    print(f"Serving on port {port}")
    httpd.serve_forever()
