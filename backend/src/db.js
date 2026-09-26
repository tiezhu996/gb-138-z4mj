const { Pool } = require('pg');
const config = require('./config');
const logger = require('./logger');
const seedData = require('./data/institutions');

const pool = new Pool({
  host: config.database.host,
  port: config.database.port,
  database: config.database.name,
  user: config.database.user,
  password: config.database.password,
  max: 5,
});

pool.on('error', (err) => {
  logger.error('数据库连接池出现空闲连接错误', { error: err.message });
});

// 与 database/init.sql 保持一致；后端启动时兜底建表，
// 这样旧的 db_data 数据卷（init.sql 只在首次初始化时执行）也能升级。
const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS institutions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    region TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    services JSONB NOT NULL DEFAULT '[]'::jsonb,
    description TEXT NOT NULL DEFAULT '',
    confirmed BOOLEAN NOT NULL DEFAULT FALSE,
    confirmed_at TIMESTAMPTZ,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS contact_logs (
    id BIGSERIAL PRIMARY KEY,
    institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    caller TEXT NOT NULL,
    result TEXT NOT NULL CHECK (result IN ('available', 'unavailable', 'no_answer')),
    note TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_contact_logs_institution_time
    ON contact_logs (institution_id, created_at DESC, id DESC)`,
];

const ensureSchema = async () => {
  for (const statement of SCHEMA_STATEMENTS) {
    await pool.query(statement);
  }
};

const seedInstitutions = async () => {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM institutions');
  if (rows[0].count > 0) {
    return;
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const [index, inst] of seedData.entries()) {
      await client.query(
        `INSERT INTO institutions
          (id, name, region, type, address, phone, services, description, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)`,
        [
          inst.id,
          inst.name,
          inst.region,
          inst.type,
          inst.address,
          inst.phone,
          JSON.stringify(inst.services),
          inst.description,
          index + 1,
        ],
      );
    }
    await client.query('COMMIT');
    logger.info(`已写入 ${seedData.length} 家机构的基础名单`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// 容器编排里数据库健康检查后仍可能有短暂不可达，做有限次重试。
const init = async (attempts = 30) => {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await ensureSchema();
      await seedInstitutions();
      logger.info('数据库就绪');
      return;
    } catch (err) {
      logger.error(`数据库初始化失败（第 ${attempt}/${attempts} 次）`, { error: err.message });
      if (attempt === attempts) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
};

const toContact = (row) => ({
  id: row.id,
  caller: row.caller,
  result: row.result,
  note: row.note,
  createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
});

const toInstitution = (row) => ({
  id: row.id,
  name: row.name,
  region: row.region,
  type: row.type,
  address: row.address,
  phone: row.phone,
  services: row.services,
  description: row.description,
  confirmed: row.confirmed,
  confirmedAt: row.confirmed_at instanceof Date ? row.confirmed_at.toISOString() : row.confirmed_at,
  contactCount: row.contact_count,
  lastContact: row.last_id === null
    ? null
    : toContact({
      id: row.last_id,
      caller: row.last_caller,
      result: row.last_result,
      note: row.last_note,
      created_at: row.last_at,
    }),
});

// 台账排序：已谈妥 > 接通有床 > 没人接/未联系 > 接通没床（沉底）。
// 同组内最近一次联系越新越靠前，从未联系的保持名单原顺序。
const RESULT_GROUP = { available: 1, no_answer: 2, unavailable: 3 };

const groupOf = (inst) => {
  if (inst.confirmed) return 0;
  if (!inst.lastContact) return 2;
  return RESULT_GROUP[inst.lastContact.result] ?? 2;
};

const timeDescNullsLast = (a, b) => {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return new Date(b).getTime() - new Date(a).getTime();
};

const compareInstitutions = (a, b) => {
  const groupDiff = groupOf(a) - groupOf(b);
  if (groupDiff !== 0) return groupDiff;
  if (a.confirmed && b.confirmed) {
    return timeDescNullsLast(a.confirmedAt, b.confirmedAt) || a.sortOrder - b.sortOrder;
  }
  const aTime = a.lastContact ? a.lastContact.createdAt : null;
  const bTime = b.lastContact ? b.lastContact.createdAt : null;
  return timeDescNullsLast(aTime, bTime) || a.sortOrder - b.sortOrder;
};

const listInstitutions = async () => {
  const { rows } = await pool.query(`
    SELECT
      i.id, i.name, i.region, i.type, i.address, i.phone, i.services, i.description,
      i.confirmed, i.confirmed_at, i.sort_order,
      l.id AS last_id, l.caller AS last_caller, l.result AS last_result,
      l.note AS last_note, l.created_at AS last_at,
      (SELECT COUNT(*)::int FROM contact_logs c WHERE c.institution_id = i.id) AS contact_count
    FROM institutions i
    LEFT JOIN LATERAL (
      SELECT id, caller, result, note, created_at
      FROM contact_logs c
      WHERE c.institution_id = i.id
      ORDER BY c.created_at DESC, c.id DESC
      LIMIT 1
    ) l ON TRUE
  `);
  return rows
    .map((row) => ({ ...toInstitution(row), sortOrder: row.sort_order }))
    .sort(compareInstitutions)
    .map(({ sortOrder, ...inst }) => inst);
};

const findInstitution = async (id) => {
  const { rows } = await pool.query('SELECT id FROM institutions WHERE id = $1', [id]);
  return rows.length > 0;
};

const listContacts = async (institutionId) => {
  const { rows } = await pool.query(
    `SELECT id, caller, result, note, created_at
     FROM contact_logs
     WHERE institution_id = $1
     ORDER BY created_at DESC, id DESC`,
    [institutionId],
  );
  return rows.map(toContact);
};

const addContact = async (institutionId, { caller, result, note }) => {
  const { rows } = await pool.query(
    `INSERT INTO contact_logs (institution_id, caller, result, note)
     VALUES ($1, $2, $3, $4)
     RETURNING id, caller, result, note, created_at`,
    [institutionId, caller, result, note],
  );
  return toContact(rows[0]);
};

const setConfirmed = async (institutionId, confirmed) => {
  await pool.query(
    `UPDATE institutions
     SET confirmed = $2, confirmed_at = CASE WHEN $2 THEN now() ELSE NULL END
     WHERE id = $1`,
    [institutionId, confirmed],
  );
};

const close = async () => {
  await pool.end();
};

module.exports = {
  init,
  listInstitutions,
  findInstitution,
  listContacts,
  addContact,
  setConfirmed,
  close,
};
