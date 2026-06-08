import http from 'http';
import { parse } from 'url';
import next from 'next';
import { WebSocketServer } from 'ws';
import { handleNewConnection } from './lib/wsServer';

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = http.createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const { pathname } = parse(req.url!);
    if (pathname === '/ws') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
        handleNewConnection(ws);
      });
    } else {
      socket.destroy();
    }
  });

  const port = parseInt(process.env.PORT ?? '3000', 10);
  server.listen(port, '0.0.0.0', () => {
    console.log(`[server] listening on port ${port}`);
  });
});
