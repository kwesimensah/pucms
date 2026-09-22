const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const config = require('../config');

function hashPassword(plain) {
  return bcrypt.hashSync(plain, config.BCRYPT_ROUNDS);
}

function verifyPassword(plain, hash) {
  return bcrypt.compareSync(plain, hash);
}

function generateToken(payload) {
  return jwt.sign(payload, config.JWT_SECRET, { expiresIn: config.JWT_EXPIRES_IN });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, config.JWT_SECRET);
  } catch (e) {
    return null;
  }
}

function registerCitizen({ fullName, email, password, phone }) {
  const existing = db.findOne('users', (u) => u.email.toLowerCase() === email.toLowerCase());
  if (existing) {
    const err = new Error('An account with this email already exists.');
    err.code = 'DUPLICATE_EMAIL';
    throw err;
  }
  const user = {
    id: uuidv4(),
    role: 'citizen',
    fullName,
    email: email.toLowerCase(),
    phone,
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString()
  };
  db.insert('users', user);
  return sanitizeUser(user);
}

function loginCitizen(email, password) {
  const user = db.findOne('users', (u) => u.email.toLowerCase() === (email || '').toLowerCase());
  if (!user || !verifyPassword(password, user.passwordHash)) {
    const err = new Error('Invalid email or password.');
    err.code = 'INVALID_CREDENTIALS';
    throw err;
  }
  const token = generateToken({ id: user.id, role: 'citizen', email: user.email });
  return { token, user: sanitizeUser(user) };
}

function loginAdmin(email, password) {
  const admin = db.findOne('administrators', (a) => a.email.toLowerCase() === (email || '').toLowerCase());
  if (!admin || !verifyPassword(password, admin.passwordHash)) {
    const err = new Error('Invalid administrator credentials.');
    err.code = 'INVALID_CREDENTIALS';
    throw err;
  }
  const token = generateToken({ id: admin.id, role: 'admin', email: admin.email });
  return { token, admin: sanitizeUser(admin) };
}

function sanitizeUser(user) {
  const { passwordHash, ...rest } = user;
  return rest;
}

module.exports = {
  hashPassword, verifyPassword, generateToken, verifyToken,
  registerCitizen, loginCitizen, loginAdmin, sanitizeUser
};
