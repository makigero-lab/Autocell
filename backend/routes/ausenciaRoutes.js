/**
 * Rotas de Gestão de Ausências (Folgas e Férias).
 *
 * Prefixo montado em server.js: /api/admin/ausencias
 *
 * Endpoints:
 *   GET    /            — lista ausências da empresa (populate utilizador)
 *   POST   /            — regista nova ausência (folga/férias)
 *   DELETE /:id         — elimina ausência
 *
 * Autenticação: middleware `auth` (JWT, com fallback legacy x-empresa-id).
 */
const express = require('express');
const router = express.Router();

const { auth } = require('../middleware/auth');
const {
  listarAusencias,
  registarAusencia,
  eliminarAusencia,
} = require('../controllers/ausenciaController');

router.get('/', auth, listarAusencias);
router.post('/', auth, registarAusencia);
router.delete('/:id', auth, eliminarAusencia);

module.exports = router;
