const { Pool } = require('pg');
const config = require('./config');
const logger = require('./logger');

const pool = new Pool({
  host: config.database.host,
  port: config.database.port,
  database: config.database.name,
  user: config.database.user,
  password: config.database.password,
  max: 5,
});

let ready = false;

// 台账表结构：联系记录逐条留存，谈好标记单独一张表。
// 服务重启后数据仍在 PostgreSQL 数据卷里，这里只负责确保表存在。
const SCHEMA = `
CREATE TABLE IF NOT EXISTS contact_logs (
  id SERIAL PRIMARY KEY,
  institution_id INTEGER NOT NULL,
  caller TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  result TEXT NOT NULL CHECK (result IN ('available', 'unavailable', 'no_answer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contact_logs_institution
  ON contact_logs (institution_id, created_at DESC);
CREATE TABLE IF NOT EXISTS institution_marks (
  institution_id INTEGER PRIMARY KEY,
  agreed BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

const initSchema = async (attempts = 20) => {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await pool.query(SCHEMA);
      ready = true;
      logger.info('ledger schema ready');
      return;
    } catch (err) {
      logger.error(`schema init failed (attempt ${attempt}/${attempts})`, err.message);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
  logger.error('schema init gave up; ledger API will stay unavailable');
};

const isReady = () => ready;

module.exports = {
  pool,
  initSchema,
  isReady,
};
