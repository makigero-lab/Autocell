/**
 * Rotas do Painel de Administração.
 *
 * Prefixo montado em server.js: /api/admin
 *
 * Endpoints:
 *   GET    /api/admin/propriedades      — lista propriedades da empresa (PROTEGIDO)
 *   POST   /api/admin/propriedades      — cria propriedade para a empresa (PROTEGIDO)
 *   GET    /api/admin/equipa            — lista utilizadores da empresa (PROTEGIDO)
 *   POST   /api/admin/equipa            — cria utilizador (membro de equipa) (PROTEGIDO)
 *   PUT    /api/admin/equipa/:id        — atualiza utilizador (nome/email/role/password) (PROTEGIDO)
 *   PATCH  /api/admin/equipa/:id/estado — alterna ativo/desativo (PROTEGIDO)
 *   DELETE /api/admin/equipa/:id        — elimina utilizador (PROTEGIDO)
 *   GET    /api/admin/setup             — bootstrap do "Cliente Zero" (PÚBLICO)
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
  getDashboard,
  getPropriedades,
  criarPropriedade,
  atualizarPropriedade,
  alternarEstadoPropriedade,
  getTarefas,
  getEquipa,
  criarMembroEquipa,
  atualizarMembroEquipa,
  alternarEstadoMembro,
  eliminarMembroEquipa,
  reportarFaltaSubita,
  registarBaixaProlongada,
  exportarTarefasCSV,
  getAuditoria,
  getWebhooks,
  reprocessarWebhook,
  setupClienteZero,
} = require('../controllers/adminController');
const { reportarAtrasoTarefa, criarTarefa, atribuirTarefa, atualizarEstadoTarefa } = require('../controllers/tarefaController');
const { sincronizarReservas, getPropriedadesSmoobu } = require('../controllers/smoobuController');

// Bootstrap do ambiente de testes — Cliente Zero. PÚBLICO (sem auth).
router.get('/setup', setupClienteZero);

// Dashboard com dados reais.
router.get('/dashboard', auth, getDashboard);

// Gestão de propriedades da empresa. PROTEGIDO por JWT.
router.get('/propriedades', auth, getPropriedades);
router.post('/propriedades', auth, criarPropriedade);
router.put('/propriedades/:id', auth, atualizarPropriedade);
router.patch('/propriedades/:id/estado', auth, alternarEstadoPropriedade);

// Calendário Geral de Operações — lista tarefas com filtro de datas.
router.get('/tarefas', auth, getTarefas);

// Exportação CSV de tarefas.
router.get('/tarefas/export', auth, exportarTarefasCSV);

// Reportar atraso numa tarefa.
router.post('/tarefas/:id/atraso', auth, reportarAtrasoTarefa);

// Gestão manual de tarefas.
router.post('/tarefas', auth, criarTarefa);
router.patch('/tarefas/:id/atribuir', auth, atribuirTarefa);
router.patch('/tarefas/:id/estado', auth, atualizarEstadoTarefa);

// Gestão de equipa (utilizadores) da empresa. PROTEGIDO por JWT.
router.get('/equipa', auth, getEquipa);
router.post('/equipa', auth, criarMembroEquipa);
router.put('/equipa/:id', auth, atualizarMembroEquipa);
router.patch('/equipa/:id/estado', auth, alternarEstadoMembro);
router.delete('/equipa/:id', auth, eliminarMembroEquipa);

// Falta súbita — reatribuição de emergência.
router.post('/equipa/:id/falta-subita', auth, reportarFaltaSubita);

// Baixa prolongada / férias — redistribuição de tarefas futuras.
router.post('/equipa/:id/baixa', auth, registarBaixaProlongada);

// Auditoria.
router.get('/auditoria', auth, getAuditoria);

// Webhooks — logs do Smoobu (lista + reproccessamento manual).
router.get('/webhooks', auth, getWebhooks);
router.post('/webhooks/:id/reprocessar', auth, reprocessarWebhook);

// Smoobu — sincronização em massa de reservas (REST API pull).
router.post('/smoobu/sincronizar', auth, sincronizarReservas);

// Smoobu — listar propriedades (apartamentos) para mapeamento no fluxo de criação.
router.get('/smoobu/propriedades', auth, getPropriedadesSmoobu);

module.exports = router;
