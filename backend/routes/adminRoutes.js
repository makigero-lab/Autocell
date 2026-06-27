/**
 * Rotas do Painel de Administração.
 *
 * Prefixo montado em server.js: /api/admin
 *
 * Endpoints:
 *   GET  /api/admin/propriedades   — lista propriedades da empresa (PROTEGIDO)
 *   POST /api/admin/propriedades   — cria propriedade para a empresa (PROTEGIDO)
 *   GET  /api/admin/equipa         — lista utilizadores da empresa (PROTEGIDO)
 *   POST /api/admin/equipa         — cria utilizador (membro de equipa) (PROTEGIDO)
 *   GET  /api/admin/setup          — bootstrap do "Cliente Zero" (PÚBLICO)
 *
 * Autenticação:
 *   - As rotas de propriedades e equipa são protegidas pelo middleware `auth`
 *     (JWT, com fallback legacy x-empresa-id durante a transição).
 *   - A rota /setup é PÚBLICA de propósito: é o endpoint de bootstrap que
 *     cria o primeiro utilizador (ainda não há token para a chamar). Em
 *     produção, deve ser desativada ou protegida por outro mecanismo após
 *     o setup inicial.
 */
const express = require('express');
const router = express.Router();

const { auth } = require('../middleware/auth');
const {
  getPropriedades,
  criarPropriedade,
  getEquipa,
  criarMembroEquipa,
  setupClienteZero,
} = require('../controllers/adminController');

// Bootstrap do ambiente de testes — Cliente Zero. PÚBLICO (sem auth).
router.get('/setup', setupClienteZero);

// Gestão de propriedades da empresa. PROTEGIDO por JWT (com fallback legacy).
router.get('/propriedades', auth, getPropriedades);
router.post('/propriedades', auth, criarPropriedade);

// Gestão de equipa (utilizadores) da empresa. PROTEGIDO por JWT (com fallback legacy).
router.get('/equipa', auth, getEquipa);
router.post('/equipa', auth, criarMembroEquipa);

module.exports = router;
