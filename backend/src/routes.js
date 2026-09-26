const config = require('./config');
const { project, messages } = require('./constants');
const { sendJson } = require('./response');
const logger = require('./logger');
const ledger = require('./ledger');

const handleRequest = async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  try {
    if (url.pathname === '/api/health') {
      sendJson(res, 200, {
        status: 'ok',
        service: project.id,
        message: messages.health,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (url.pathname === '/api/info') {
      sendJson(res, 200, {
        ...project,
        database: config.database,
      });
      return;
    }

    if (url.pathname === '/api/ledger' && req.method === 'GET') {
      await ledger.listLedger(req, res);
      return;
    }

    if (url.pathname === '/api/ledger/contacts' && req.method === 'GET') {
      await ledger.listContacts(req, res, url);
      return;
    }

    if (url.pathname === '/api/ledger/contacts' && req.method === 'POST') {
      await ledger.createContact(req, res);
      return;
    }

    const agreedMatch = url.pathname.match(/^\/api\/ledger\/institutions\/(\d+)\/agreed$/);
    if (agreedMatch && req.method === 'PUT') {
      await ledger.setAgreed(req, res, Number(agreedMatch[1]));
      return;
    }

    sendJson(res, 404, { error: messages.notFound, path: url.pathname });
  } catch (err) {
    logger.error('request failed', err.message);
    if (!res.headersSent) {
      sendJson(res, 500, { error: '服务器开小差了，请稍后再试' });
    }
  }
};

module.exports = {
  handleRequest,
};
