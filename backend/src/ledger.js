const { pool, isReady } = require('./db');
const { sendJson } = require('./response');

const VALID_RESULTS = new Set(['available', 'unavailable', 'no_answer']);

const readBody = (req) => new Promise((resolve, reject) => {
  let data = '';
  req.on('data', (chunk) => {
    data += chunk;
    if (data.length > 100 * 1024) {
      reject(new Error('request body too large'));
      req.destroy();
    }
  });
  req.on('end', () => {
    if (!data) {
      resolve({});
      return;
    }
    try {
      resolve(JSON.parse(data));
    } catch {
      reject(new Error('invalid JSON body'));
    }
  });
  req.on('error', reject);
});

const notReady = (res) => sendJson(res, 503, { error: '台账数据库尚未就绪，请稍候再试' });

// 台账总览：每家机构的谈好标记、联系次数和最近一次联系
const listLedger = async (req, res) => {
  if (!isReady()) {
    notReady(res);
    return;
  }
  const [marks, latest, counts] = await Promise.all([
    pool.query('SELECT institution_id, agreed FROM institution_marks'),
    pool.query(`
      SELECT DISTINCT ON (institution_id)
        institution_id, result, caller, note, created_at
      FROM contact_logs
      ORDER BY institution_id, created_at DESC, id DESC
    `),
    pool.query('SELECT institution_id, COUNT(*)::int AS count FROM contact_logs GROUP BY institution_id'),
  ]);

  const entries = {};
  marks.rows.forEach((row) => {
    entries[row.institution_id] = { institutionId: row.institution_id, agreed: row.agreed };
  });
  counts.rows.forEach((row) => {
    entries[row.institution_id] = entries[row.institution_id] || { institutionId: row.institution_id, agreed: false };
    entries[row.institution_id].contactCount = row.count;
  });
  latest.rows.forEach((row) => {
    const entry = entries[row.institution_id] || { institutionId: row.institution_id, agreed: false };
    entry.lastContact = {
      result: row.result,
      caller: row.caller,
      note: row.note,
      at: row.created_at,
    };
    entries[row.institution_id] = entry;
  });

  sendJson(res, 200, { entries: Object.values(entries) });
};

// 某家机构的全部联系记录，新的在前
const listContacts = async (req, res, url) => {
  if (!isReady()) {
    notReady(res);
    return;
  }
  const institutionId = Number(url.searchParams.get('institutionId'));
  if (!Number.isInteger(institutionId)) {
    sendJson(res, 400, { error: '缺少有效的 institutionId' });
    return;
  }
  const { rows } = await pool.query(
    `SELECT id, institution_id, caller, note, result, created_at
     FROM contact_logs
     WHERE institution_id = $1
     ORDER BY created_at DESC, id DESC`,
    [institutionId],
  );
  sendJson(res, 200, {
    contacts: rows.map((row) => ({
      id: row.id,
      institutionId: row.institution_id,
      caller: row.caller,
      note: row.note,
      result: row.result,
      at: row.created_at,
    })),
  });
};

// 登记一次联系：打电话的人 + 一句备注 + 结果
const createContact = async (req, res) => {
  if (!isReady()) {
    notReady(res);
    return;
  }
  const body = await readBody(req);
  const institutionId = Number(body.institutionId);
  const caller = typeof body.caller === 'string' ? body.caller.trim() : '';
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  const { result } = body;

  if (!Number.isInteger(institutionId)) {
    sendJson(res, 400, { error: '缺少有效的 institutionId' });
    return;
  }
  if (!caller) {
    sendJson(res, 400, { error: '请填写打电话的人' });
    return;
  }
  if (!VALID_RESULTS.has(result)) {
    sendJson(res, 400, { error: '结果必须是 available / unavailable / no_answer 之一' });
    return;
  }

  const { rows } = await pool.query(
    `INSERT INTO contact_logs (institution_id, caller, note, result)
     VALUES ($1, $2, $3, $4)
     RETURNING id, institution_id, caller, note, result, created_at`,
    [institutionId, caller, note, result],
  );
  const row = rows[0];
  sendJson(res, 201, {
    contact: {
      id: row.id,
      institutionId: row.institution_id,
      caller: row.caller,
      note: row.note,
      result: row.result,
      at: row.created_at,
    },
  });
};

// 标记/取消「已谈好」
const setAgreed = async (req, res, institutionId) => {
  if (!isReady()) {
    notReady(res);
    return;
  }
  const body = await readBody(req);
  const agreed = Boolean(body.agreed);
  await pool.query(
    `INSERT INTO institution_marks (institution_id, agreed, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (institution_id)
     DO UPDATE SET agreed = EXCLUDED.agreed, updated_at = now()`,
    [institutionId, agreed],
  );
  sendJson(res, 200, { institutionId, agreed });
};

module.exports = {
  listLedger,
  listContacts,
  createContact,
  setAgreed,
};
