/**
 * Rotas de Relatórios / Analytics — Autocell
 *
 * Prefixo montado em server.js: /api/admin/relatorios
 *
 * Endpoints:
 *   GET /api/admin/relatorios/produtividade — métricas de produtividade
 *     Query: ?inicio=yyyy-mm-dd&fim=yyyy-mm-dd (default: últimos 30 dias)
 *
 * Autenticação: obrigatória (middleware `auth`).
 */
const express = require('express');
const router = express.Router();

const { auth } = require('../middleware/auth');
const { getRelatorioProdutividade } = require('../controllers/relatorioController');

router.get('/produtividade', auth, getRelatorioProdutividade);

module.exports = router;
