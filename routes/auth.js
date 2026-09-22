const express = require('express');
const authService = require('../services/authService');
const router = express.Router();

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '');
}

router.post('/register', (req, res) => {
  const { fullName, email, password, phone } = req.body || {};
  if (!fullName || !email || !password || !phone) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Full name, email, password, and phone number are all required.' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Please enter a valid email address.' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Password must be at least 6 characters.' });
  }
  try {
    const user = authService.registerCitizen({ fullName, email, password, phone });
    const { token } = authService.loginCitizen(email, password);
    return res.status(201).json({ user, token });
  } catch (e) {
    if (e.code === 'DUPLICATE_EMAIL') {
      return res.status(409).json({ error: e.code, message: e.message });
    }
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Registration failed. Please try again.' });
  }
});

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Email and password are required.' });
  }
  try {
    const result = authService.loginCitizen(email, password);
    return res.json(result);
  } catch (e) {
    return res.status(401).json({ error: e.code || 'SERVER_ERROR', message: e.message });
  }
});

router.post('/admin/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Email and password are required.' });
  }
  try {
    const result = authService.loginAdmin(email, password);
    return res.json(result);
  } catch (e) {
    return res.status(401).json({ error: e.code || 'SERVER_ERROR', message: e.message });
  }
});

module.exports = router;
