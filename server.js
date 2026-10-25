const http = require('http');
const fs = require('fs');
const path = require('path');

// Security: serve only files within this project directory and prevent path traversal
function resolvePath(reqUrl, root) {
  let url = reqUrl.split('?')[0];
  if (url === '/' || url === '') url = '/index.html';
  // Build, then resolve and verify it's within root
  const filePath = path.resolve(path.join(root, url));
  if (!filePath.startsWith(root)) {
    return null; // path traversal attempt
  }
  return filePath;
}

function mimeType(ext) {
  switch (ext) {
    case '.html': return 'text/html; charset=utf-8';
    case '.css': return 'text/css; charset=utf-8';
    case '.js': return 'application/javascript; charset=utf-8';
    case '.mjs': return 'application/javascript; charset=utf-8';
    case '.json': return 'application/json';
    case '.woff2': return 'font/woff2';
    case '.woff': return 'font/woff';
    case '.png': return 'image/png';
    case '.jpg': case '.jpeg': return 'image/jpeg';
    case '.svg': return 'image/svg+xml';
    default: return 'text/plain';
  }
}

function serve(req, res) {
  // Only allow GET/HEAD for safety
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405; res.setHeader('Content-Type', 'text/plain'); res.end('Method Not Allowed');
    return;
  }

  const root = __dirname;
  const filePath = resolvePath(req.url, root);
  if (!filePath) {
    res.statusCode = 404; res.setHeader('Content-Type', 'text/plain'); res.end('Not Found');
    return;
  }

  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      res.statusCode = 404; res.setHeader('Content-Type', 'text/plain'); res.end('Not Found');
      return;
    }
    fs.readFile(filePath, (e, data) => {
      if (e) {
        res.statusCode = 500; res.setHeader('Content-Type', 'text/plain'); res.end('Server Error');
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      res.setHeader('Content-Type', mimeType(ext));
      res.end(data);
    });
  });
}

// Start server with fallback port if 8732 is in use
const DEFAULT_PORT = 8732;
let port = DEFAULT_PORT;
const server = http.createServer(serve);
function tryListen(p) {
  return new Promise(resolve => {
    server.listen(p, () => {
      console.log(`CHRONOS static server listening on http://localhost:${p}`);
      resolve(p);
    }).on('error', err => {
      if (err.code === 'EADDRINUSE' && p === DEFAULT_PORT) {
        const alt = DEFAULT_PORT + 1;
        console.log(`Port ${p} in use, trying ${alt}`);
        tryListen(alt).then(resolve);
      } else {
        console.error('Server failed to start', err);
        resolve(null);
      }
    });
  });
}

tryListen(port);
