const http = require('node:http');
const config = require('./config');
const { messages } = require('./constants');
const { handleRequest } = require('./routes');
const db = require('./db');
const logger = require('./logger');

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch((err) => {
    logger.error('未捕获的请求异常', { error: err.message });
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    }
    res.end(JSON.stringify({ error: '服务器开小差了，请稍后再试' }));
  });
});

const shutdown = async () => {
  logger.info('正在关闭服务…');
  server.close();
  try {
    await db.close();
  } finally {
    process.exit(0);
  }
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

const start = async () => {
  await db.init();
  server.listen(config.port, config.host, () => {
    logger.info(`${messages.serverStarted} on ${config.port}`);
  });
};

start().catch((err) => {
  logger.error('服务启动失败', { error: err.message });
  process.exit(1);
});
