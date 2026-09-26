const config = require('./config');
const { project, messages } = require('./constants');
const { sendJson } = require('./response');
const db = require('./db');
const logger = require('./logger');

const RESULTS = ['available', 'unavailable', 'no_answer'];
const MAX_BODY_BYTES = 64 * 1024;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const readJsonBody = (req) => new Promise((resolve, reject) => {
  let size = 0;
  const chunks = [];
  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      reject(new HttpError(413, '请求体过大'));
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });
  req.on('end', () => {
    if (chunks.length === 0) {
      resolve({});
      return;
    }
    try {
      resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    } catch {
      reject(new HttpError(400, '请求体不是合法的 JSON'));
    }
  });
  req.on('error', () => reject(new HttpError(400, '读取请求失败')));
});

// 备注只留一句话：去掉换行，限制长度。
const normalizeNote = (value) => {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw new HttpError(400, '备注格式不正确');
  const note = value.replace(/\s*\n+\s*/g, ' ').trim();
  if (note.length > 200) throw new HttpError(400, '备注太长了，一句话就好（200 字以内）');
  return note;
};

const normalizeCaller = (value) => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new HttpError(400, '请填写是谁打的电话');
  }
  const caller = value.trim();
  if (caller.length > 30) throw new HttpError(400, '称呼太长了（30 字以内）');
  return caller;
};

const normalizeResult = (value) => {
  if (!RESULTS.includes(value)) {
    throw new HttpError(400, '联系结果只能是：接通有床 / 接通没床 / 没人接');
  }
  return value;
};

const requireInstitution = async (id) => {
  const exists = await db.findInstitution(id);
  if (!exists) {
    throw new HttpError(404, '没有找到这家机构');
  }
};

const handleListInstitutions = async (req, res) => {
  const institutions = await db.listInstitutions();
  sendJson(res, 200, { institutions });
};

const handleListContacts = async (req, res, institutionId) => {
  await requireInstitution(institutionId);
  const contacts = await db.listContacts(institutionId);
  sendJson(res, 200, { contacts });
};

const handleCreateContact = async (req, res, institutionId) => {
  await requireInstitution(institutionId);
  const body = await readJsonBody(req);
  const contact = await db.addContact(institutionId, {
    caller: normalizeCaller(body.caller),
    result: normalizeResult(body.result),
    note: normalizeNote(body.note),
  });
  sendJson(res, 201, { contact });
};

const handleSetConfirmed = async (req, res, institutionId) => {
  await requireInstitution(institutionId);
  const body = await readJsonBody(req);
  if (typeof body.confirmed !== 'boolean') {
    throw new HttpError(400, 'confirmed 需要是 true 或 false');
  }
  await db.setConfirmed(institutionId, body.confirmed);
  sendJson(res, 200, { ok: true, confirmed: body.confirmed });
};

const routes = [
  {
    method: 'GET',
    pattern: /^\/api\/health$/,
    handler: async (req, res) => {
      sendJson(res, 200, {
        status: 'ok',
        service: project.id,
        message: messages.health,
        timestamp: new Date().toISOString(),
      });
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/info$/,
    handler: async (req, res) => {
      sendJson(res, 200, {
        ...project,
        database: { host: config.database.host, name: config.database.name },
      });
    },
  },
  { method: 'GET', pattern: /^\/api\/institutions$/, handler: handleListInstitutions },
  { method: 'GET', pattern: /^\/api\/institutions\/([^/]+)\/contacts$/, handler: handleListContacts },
  { method: 'POST', pattern: /^\/api\/institutions\/([^/]+)\/contacts$/, handler: handleCreateContact },
  { method: 'POST', pattern: /^\/api\/institutions\/([^/]+)\/confirmed$/, handler: handleSetConfirmed },
];

const handleRequest = async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const path = decodeURIComponent(url.pathname);

  for (const route of routes) {
    if (route.method !== req.method) continue;
    const match = route.pattern.exec(path);
    if (!match) continue;
    try {
      await route.handler(req, res, ...match.slice(1));
    } catch (err) {
      if (err instanceof HttpError) {
        sendJson(res, err.status, { error: err.message });
      } else {
        logger.error('请求处理失败', { path, error: err.message });
        sendJson(res, 500, { error: '服务器开小差了，请稍后再试' });
      }
    }
    return;
  }

  sendJson(res, 404, { error: messages.notFound, path });
};

module.exports = {
  handleRequest,
};
