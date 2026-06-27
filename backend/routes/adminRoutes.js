/**
 * Rotas do Painel de Administração.
 *
 * Prefixo montado em server.js: /api/admin
 *
 * Endpoints:
 *   GET  /api/admin/propriedades   — lista propriedades da empresa
 *   POST /api/admin/propriedades   — cria propriedade para a empresa
 *   GET  /api/admin/setup          — bootstrap do "Cliente Zero"
 *
 * NOTA: empresa_id vem do header `x-empresa-id` (ainda sem JWT).
 */
const express = require('express');
const router = express.Router();

const {
  getPropriedades,
  criarPropriedade,
  setupClienteZero,
} = require('../controllers/adminController');

// Bootstrap do ambiente de testes — Cliente Zero.
router.get('/setup', setupClienteZero);

// Gestão de propriedades da empresa.
router.get('/propriedades', getPropriedades);
router.post('/propriedades', criarPropriedade);

module.exports = router;
