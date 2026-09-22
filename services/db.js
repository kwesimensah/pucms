/**
 * Lightweight JSON-file data layer.
 * Mimics a simple relational-style store (collections + ids) so it can be
 * swapped for PostgreSQL/Mongo later without rewriting service logic —
 * every service only calls db.find/insert/update/remove, never touches files.
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

function filePath(collection) {
  return path.join(DATA_DIR, `${collection}.json`);
}

function ensureFile(collection) {
  const fp = filePath(collection);
  if (!fs.existsSync(fp)) fs.writeFileSync(fp, '[]', 'utf8');
}

function readAll(collection) {
  ensureFile(collection);
  const raw = fs.readFileSync(filePath(collection), 'utf8');
  try {
    return JSON.parse(raw || '[]');
  } catch (e) {
    return [];
  }
}

function writeAll(collection, records) {
  ensureFile(collection);
  fs.writeFileSync(filePath(collection), JSON.stringify(records, null, 2), 'utf8');
}

function find(collection, predicate = () => true) {
  return readAll(collection).filter(predicate);
}

function findOne(collection, predicate) {
  return readAll(collection).find(predicate) || null;
}

function findById(collection, id) {
  return findOne(collection, (r) => r.id === id);
}

function insert(collection, record) {
  const records = readAll(collection);
  records.push(record);
  writeAll(collection, records);
  return record;
}

function updateById(collection, id, patch) {
  const records = readAll(collection);
  const idx = records.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  records[idx] = { ...records[idx], ...patch };
  writeAll(collection, records);
  return records[idx];
}

function removeById(collection, id) {
  const records = readAll(collection);
  const next = records.filter((r) => r.id !== id);
  writeAll(collection, next);
  return next.length !== records.length;
}

module.exports = {
  readAll, writeAll, find, findOne, findById, insert, updateById, removeById
};
