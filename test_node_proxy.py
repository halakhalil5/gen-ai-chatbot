import urllib.request
import json
import uuid

boundary = uuid.uuid4().hex
body = b"--" + boundary.encode() + b"\r\n"
body += b'Content-Disposition: form-data; name="documents"; filename="sample.txt"\r\n'
body += b"Content-Type: text/plain\r\n\r\n"
body += b"hello world\r\n"
body += b"--" + boundary.encode() + b"--\r\n"

req = urllib.request.Request(
    'http://127.0.0.1:3000/api/upload-documents',
    data=body,
    headers={'Content-Type': 'multipart/form-data; boundary=' + boundary}
)
try:
    response = urllib.request.urlopen(req)
    print("SUCCESS:", response.read().decode())
except Exception as e:
    print("ERROR:", str(e))
