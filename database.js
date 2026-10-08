const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'coven-house.db');
const db = new sqlite3.Database(dbPath);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function withTransaction(fn) {
  await run('BEGIN TRANSACTION');
  try {
    const result = await fn();
    await run('COMMIT');
    return result;
  } catch (error) {
    await run('ROLLBACK');
    throw error;
  }
}

async function initDatabase() {
  await run('PRAGMA foreign_keys = ON');

  await run(`
    CREATE TABLE IF NOT EXISTS produtos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      preco_custo REAL NOT NULL,
      custo_embalagem REAL NOT NULL,
      preco_venda REAL NOT NULL,
      lucro_liquido REAL NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS variacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      produto_id INTEGER NOT NULL,
      tamanho TEXT,
      cor TEXT,
      quantidade_estoque INTEGER NOT NULL,
      FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS vendas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      produto_id INTEGER NOT NULL,
      variacao_id INTEGER NOT NULL,
      cliente TEXT,
      quantidade INTEGER NOT NULL,
      tipo_frete TEXT NOT NULL,
      valor_frete REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL,
      data TEXT NOT NULL,
      FOREIGN KEY (produto_id) REFERENCES produtos(id),
      FOREIGN KEY (variacao_id) REFERENCES variacoes(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS gastos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      descricao TEXT NOT NULL,
      categoria TEXT NOT NULL,
      valor REAL NOT NULL,
      data TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS agenda (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente TEXT NOT NULL,
      tipo TEXT NOT NULL,
      data TEXT NOT NULL,
      hora TEXT NOT NULL,
      status TEXT NOT NULL
    )
  `);
}

module.exports = {
  db,
  initDatabase,
  run,
  get,
  all,
  withTransaction
};
