/**
 * Rotas de Gestão de Ausências (Folgas e Férias).
 *
 * Prefixo montado em server.js: /api/admin/ausencias
 *
 * Endpoints:
 *   GET    /                  — lista ausências da empresa (populate utilizador)
 *   POST   /                  — regista nova ausência (folga/férias) — admin, estado 'aprovada'
 *   DELETE /:id               — elimina ausência
 *   PATCH  /:id/estado        — aprovar/rejeitar pedido do staff (v1.24.0)
 *
 * Autenticação: middleware `auth` (JWT).
 */
const express = require('express');
const router = express.Router();

const { auth } = require('../middleware/auth');
const {
  listarAusencias,
  registarAusencia,
  eliminarAusencia,
  aprovarRejeitarAusencia,
} = require('../controllers/ausenciaController');

router.get('/', auth, listarAusencias);
router.post('/', auth, registarAusencia);
router.delete('/:id', auth, eliminarAusencia);
router.patch('/:id/estado', auth, aprovarRejeitarAusencia);

module.exports = router;
