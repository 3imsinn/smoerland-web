import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve('dist');
const port = Number(process.env.PORT || 8080);
const types = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml; charset=utf-8']
]);

const server = http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const relativePath = pathname.endsWith('/') ? `${pathname}index.html` : pathname;
    const filePath = path.resolve(root, `.${relativePath}`);
    if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
      response.writeHead(400).end('Bad request');
      return;
    }
    const body = await fs.readFile(filePath);
    response.writeHead(200, { 'Content-Type': types.get(path.extname(filePath)) || 'application/octet-stream' });
    response.end(body);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
});

server.listen(port, () => console.log(`Serving dist at http://localhost:${port}`));
