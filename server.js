const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const root = __dirname;

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function requestHandler(req, res) {
  // CORS & Security headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Service-Worker-Allowed', '/');

  // Strict anti-caching headers so client updates are 100% instantaneous
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const urlPath = req.url.split('?')[0];
  let filePath = path.join(root, urlPath === '/' ? 'index.html' : urlPath);

  // Normalize path security
  if (!filePath.startsWith(root)) {
    filePath = path.join(root, 'index.html');
  }

  // Fallback for SPA routing if file does not exist
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(root, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || 'text/html; charset=utf-8';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      // Fallback to index.html if read failed
      const indexPath = path.join(root, 'index.html');
      fs.readFile(indexPath, (err2, indexContent) => {
        if (err2) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Server Error: ' + err2.message);
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(indexContent);
      });
      return;
    }

    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  });
}

// Universal export: supports both Vercel serverless function and standalone node server
const server = http.createServer(requestHandler);

if (require.main === module || !process.env.VERCEL) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Trade Diary running at: http://localhost:${PORT}`);
  });
}

module.exports = requestHandler;
