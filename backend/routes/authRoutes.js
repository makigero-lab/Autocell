/**
 * Rotas de Autenticação.
 *
 * Prefixo montado em server.js: /api/auth
 *
 * Endpoints:
 *   POST /api/auth/login  — login (público)
 *   GET  /api/auth/me     — dados do utilizador autenticado (requer JWT)
 */
const express = require('express');
const router = express.Router();

const { auth } = require('../middleware/auth');
const { login, me } = require('../controllers/authController');

// Login — público.
router.post('/login', login);

// Dados do utilizador autenticado — requer JWT.
router.get('/me', auth, me);

module.exports = router;
