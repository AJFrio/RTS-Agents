/**
 * Simple dev server for Tauri development
 * Serves the dist folder on http://localhost:3000
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PORT = 3000;
const DIST_DIR = path.resolve(__dirname, '..', 'dist');

// Build first, then start server
console.log('Building dist folder...');
try {
  execSync('npm run build:dist', { 
    stdio: 'inherit',
    cwd: path.resolve(__dirname, '..')
  });
  console.log('Build complete!');
} catch (error) {
  console.error('Build failed:', error.message);
  process.exit(1);
}

// MIME types
const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
};

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

function serveFile(filePath, res) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const mimeType = getMimeType(filePath);
    res.writeHead(200, { 'Content-Type': mimeType });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  // Handle CORS for development
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  let urlPath = req.url || '/';
  
  // Remove query string
  urlPath = urlPath.split('?')[0];
  
  // Default to index.html
  if (urlPath === '/') {
    urlPath = '/index.html';
  }

  const filePath = path.join(DIST_DIR, urlPath);

  // Security: ensure file is within dist directory
  const resolvedPath = path.resolve(filePath);
  if (!resolvedPath.startsWith(DIST_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // If file doesn't exist, try index.html (for SPA routing)
      if (urlPath !== '/index.html') {
        const indexPath = path.join(DIST_DIR, 'index.html');
        fs.stat(indexPath, (err2) => {
          if (!err2) {
            serveFile(indexPath, res);
          } else {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
          }
        });
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
      }
      return;
    }

    serveFile(filePath, res);
  });
});

server.listen(PORT, 'localhost', () => {
  console.log(`Dev server running at http://localhost:${PORT}`);
  console.log(`Serving files from: ${DIST_DIR}`);
});

// Handle errors
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Please stop the other process or change the port.`);
  } else {
    console.error('Server error:', err);
  }
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down dev server...');
  server.close(() => {
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\nShutting down dev server...');
  server.close(() => {
    process.exit(0);
  });
});
