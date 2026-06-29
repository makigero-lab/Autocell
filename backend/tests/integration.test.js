/**
 * Testes de integração do backend (Autocell) — Jest + Supertest + MongoDB em memória.
 *
 * Cobertura:
 *   - Health check com BD ligada (GET /api/health)
 *   - Auth 401 em todas as rotas protegidas sem token
 *   - Auth login (sucesso, password errada, campos em falta, user inativo)
 *   - Auth /me com token
 *   - CRUD Propriedades (criar, listar, toggle estado, duplicado 409)
 *   - Webhook Smoobu (cria tarefa + atribui ao staff disponível)
 *   - Dashboard (GET /api/admin/dashboard)
 *   - Relatórios (GET /api/admin/relatorios/produtividade)
 *
 * Estratégia:
 *   - Usa mongodb-memory-server (BD efémera em memória, sem dependências externas).
 *   - beforeAll: arranca mongod + liga mongoose + semeia dados base.
 *   - afterAll: desliga mongoose + para mongod.
 *   - beforeEach: limpa as coleções de teste (mantém a empresa/admin).
 */

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');
const bcrypt = require('bcryptjs');

const app = require('../server');
const Empresa = require('../models/Empresa');
const Propriedade = require('../models/Propriedade');
const Utilizador = require('../models/Utilizador');
const Tarefa = require('../models/Tarefa');
const WebhookLog = require('../models/WebhookLog');

let mongod;
let empresaId;
let adminId;
let adminToken;
const PASSWORD = 'teste123';

/* ------------------------------------------------------------------ */
/* Setup / Teardown                                                    */
/* ------------------------------------------------------------------ */

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);

  // Semeia a empresa + admin base.
  const empresa = await Empresa.create({ nome: 'Empresa Teste', plano_ativo: true });
  empresaId = String(empresa._id);

  const hash = await bcrypt.hash(PASSWORD, 10);
  const admin = await Utilizador.create({
    nome: 'Admin Teste',
    email: 'admin@teste.pt',
    password_hash: hash,
    empresa_id: empresa._id,
    role: 'admin',
    ativo: true,
  });
  adminId = String(admin._id);

  // Login real para obter token (valida o fluxo de auth end-to-end).
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@teste.pt', password: PASSWORD });
  adminToken = res.body.token;
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

// Helper para fazer pedidos autenticados.
function authGet(path) {
  return request(app).get(path).set('Authorization', `Bearer ${adminToken}`);
}
function authPost(path, body) {
  return request(app).post(path).set('Authorization', `Bearer ${adminToken}`).send(body);
}
function authPatch(path, body) {
  return request(app).patch(path).set('Authorization', `Bearer ${adminToken}`).send(body || {});
}

// Espera que o processamento assíncrono do webhook (setImmediate) termine.
async function esperar(ms = 300) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ------------------------------------------------------------------ */
/* 1. Health check                                                     */
/* ------------------------------------------------------------------ */

describe('GET /api/health', () => {
  it('deve devolver 200 e mongodb connected quando a BD está ligada', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.mongodb).toBe('connected');
    expect(res.body).toHaveProperty('uptime');
    expect(res.body).toHaveProperty('timestamp');
  });
});

/* ------------------------------------------------------------------ */
/* 2. Auth — 401 em rotas protegidas sem token                         */
/* ------------------------------------------------------------------ */

describe('Auth — rotas protegidas sem token devolvem 401', () => {
  const rotasProtegidas = [
    '/api/admin/dashboard',
    '/api/admin/propriedades',
    '/api/admin/equipa',
    '/api/admin/tarefas',
    '/api/admin/relatorios/produtividade',
    '/api/auth/me',
  ];

  for (const rota of rotasProtegidas) {
    it(`GET ${rota} → 401 sem token`, async () => {
      const res = await request(app).get(rota);
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('erro');
    });
  }

  it('token inválido → 401', async () => {
    const res = await request(app)
      .get('/api/admin/dashboard')
      .set('Authorization', 'Bearer token-invalido');
    expect(res.status).toBe(401);
  });
});

/* ------------------------------------------------------------------ */
/* 3. Auth — login                                                     */
/* ------------------------------------------------------------------ */

describe('POST /api/auth/login', () => {
  it('credenciais válidas → 200 + token + utilizador', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@teste.pt', password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.utilizador.email).toBe('admin@teste.pt');
    expect(res.body.utilizador.role).toBe('admin');
    expect(res.body.utilizador.empresa_id).toBe(empresaId);
  });

  it('password errada → 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@teste.pt', password: 'errada' });
    expect(res.status).toBe(401);
  });

  it('email inexistente → 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ninguem@teste.pt', password: PASSWORD });
    expect(res.status).toBe(401);
  });

  it('campos em falta → 400', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'admin@teste.pt' });
    expect(res.status).toBe(400);
  });

  it('utilizador inativo → 401', async () => {
    const hash = await bcrypt.hash(PASSWORD, 10);
    await Utilizador.create({
      nome: 'Inativo',
      email: 'inativo@teste.pt',
      password_hash: hash,
      empresa_id: empresaId,
      role: 'staff',
      ativo: false,
    });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'inativo@teste.pt', password: PASSWORD });
    expect(res.status).toBe(401);
  });
});

/* ------------------------------------------------------------------ */
/* 4. Auth — /me                                                       */
/* ------------------------------------------------------------------ */

describe('GET /api/auth/me', () => {
  it('com token válido → 200 + dados do utilizador', async () => {
    const res = await authGet('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.utilizador.email).toBe('admin@teste.pt');
    expect(res.body.utilizador.role).toBe('admin');
  });
});

/* ------------------------------------------------------------------ */
/* 5. CRUD Propriedades                                                */
/* ------------------------------------------------------------------ */

describe('Propriedades (CRUD)', () => {
  let propId;

  it('POST /api/admin/propriedades → 201 (cria propriedade)', async () => {
    const res = await authPost('/api/admin/propriedades', {
      smoobu_id: 'prop-100',
      nome: 'Casa da Praia',
      morada: 'Rua do Mar 1, Lisboa',
      tempo_limpeza_minutos: 90,
    });
    expect(res.status).toBe(201);
    expect(res.body.propriedade).toHaveProperty('_id');
    expect(res.body.propriedade.smoobu_id).toBe('prop-100');
    expect(res.body.propriedade.tempo_limpeza_minutos).toBe(90);
    propId = res.body.propriedade._id;
  });

  it('POST sem campos obrigatórios → 400', async () => {
    const res = await authPost('/api/admin/propriedades', { smoobu_id: 'x' });
    expect(res.status).toBe(400);
  });

  it('POST com smoobu_id duplicado → 409', async () => {
    const res = await authPost('/api/admin/propriedades', {
      smoobu_id: 'prop-100',
      nome: 'Repetida',
      morada: 'Rua X',
    });
    expect(res.status).toBe(409);
  });

  it('GET /api/admin/propriedades → 200 + lista com a propriedade', async () => {
    const res = await authGet('/api/admin/propriedades');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.propriedades)).toBe(true);
    expect(res.body.propriedades.some((p) => p.smoobu_id === 'prop-100')).toBe(true);
  });

  it('PATCH /api/admin/propriedades/:id/estado → alterna ativo', async () => {
    const res = await authPatch(`/api/admin/propriedades/${propId}/estado`, { ativo: false });
    expect(res.status).toBe(200);
    expect(res.body.ativo).toBe(false);
  });

  it('PATCH com id inexistente → 404', async () => {
    const idInexistente = new mongoose.Types.ObjectId();
    const res = await authPatch(`/api/admin/propriedades/${idInexistente}/estado`, {});
    expect(res.status).toBe(404);
  });

  it('PUT /api/admin/propriedades/:id → 200 (atualiza nome e tempo)', async () => {
    // Cria uma propriedade para editar.
    const criada = await authPost('/api/admin/propriedades', {
      smoobu_id: 'prop-edit-1',
      nome: 'Nome Inicial',
      morada: 'Rua Inicial 1, Lisboa',
      tempo_limpeza_minutos: 60,
    });
    expect(criada.status).toBe(201);

    const res = await request(app)
      .put(`/api/admin/propriedades/${criada.body.propriedade._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ nome: 'Nome Editado', tempo_limpeza_minutos: 90 });
    expect(res.status).toBe(200);
    expect(res.body.propriedade.nome).toBe('Nome Editado');
    expect(res.body.propriedade.tempo_limpeza_minutos).toBe(90);
    // smoobu_id e morada não mudaram.
    expect(res.body.propriedade.smoobu_id).toBe('prop-edit-1');
  });

  it('PUT com smoobu_id duplicado (de outra propriedade) → 409', async () => {
    // Cria duas propriedades.
    await authPost('/api/admin/propriedades', {
      smoobu_id: 'prop-edit-2',
      nome: 'A',
      morada: 'Rua A',
    });
    const criadaB = await authPost('/api/admin/propriedades', {
      smoobu_id: 'prop-edit-3',
      nome: 'B',
      morada: 'Rua B',
    });

    // Tenta mudar B para o smoobu_id de A → 409.
    const res = await request(app)
      .put(`/api/admin/propriedades/${criadaB.body.propriedade._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ smoobu_id: 'prop-edit-2' });
    expect(res.status).toBe(409);
  });

  it('PUT com id inexistente → 404', async () => {
    const idInexistente = new mongoose.Types.ObjectId();
    const res = await request(app)
      .put(`/api/admin/propriedades/${idInexistente}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ nome: 'X' });
    expect(res.status).toBe(404);
  });

  it('PUT sem campos no body → 400', async () => {
    const criada = await authPost('/api/admin/propriedades', {
      smoobu_id: 'prop-edit-4',
      nome: 'C',
      morada: 'Rua C',
    });
    const res = await request(app)
      .put(`/api/admin/propriedades/${criada.body.propriedade._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(res.status).toBe(400);
  });
});

/* ------------------------------------------------------------------ */
/* 6. Webhook Smoobu                                                   */
/* ------------------------------------------------------------------ */

describe('POST /webhooks/smoobu (load balancer)', () => {
  let staffId;

  beforeEach(async () => {
    // Limpa tarefas/webhooks entre testes do webhook.
    await Tarefa.deleteMany({});
    await WebhookLog.deleteMany({});

    // Garante um staff ativo da empresa.
    const hash = await bcrypt.hash(PASSWORD, 10);
    const staff = await Utilizador.findOneAndUpdate(
      { email: 'staff.webhook@teste.pt' },
      {
        $set: {
          nome: 'Staff Webhook',
          email: 'staff.webhook@teste.pt',
          password_hash: hash,
          empresa_id: empresaId,
          role: 'staff',
          ativo: true,
          dias_folga: [],
        },
      },
      { upsert: true, new: true }
    );
    staffId = String(staff._id);

    // Garante a propriedade ativa com smoobu_id "200" (corresponde a apartment.id 200).
    await Propriedade.findOneAndUpdate(
      { smoobu_id: '200' },
      {
        $set: {
          smoobu_id: '200',
          nome: 'Apartamento Teste',
          morada: 'Av. Teste',
          empresa_id: empresaId,
          tempo_limpeza_minutos: 60,
          ativo: true,
        },
      },
      { upsert: true, new: true }
    );
  });

  it('devolve 200 imediato + cria tarefa atribuída ao staff', async () => {
    const amanha = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    const res = await request(app).post('/webhooks/smoobu').send({
      action: 'newReservation',
      data: {
        id: 777,
        arrival: amanha,
        apartment: { id: 200, name: 'Apartamento Teste' },
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('recebido');

    // Espera o processamento assíncrono (setImmediate).
    await esperar(400);

    // Verifica que a tarefa foi criada e atribuída.
    const tarefa = await Tarefa.findOne({ smoobu_reserva_id: '777' });
    expect(tarefa).not.toBeNull();
    expect(String(tarefa.utilizador_id)).toBe(staffId);
    expect(tarefa.empresa_id.toString()).toBe(empresaId);

    // Verifica que o WebhookLog ficou processado.
    const log = await WebhookLog.findOne({ 'payload.data.id': 777 });
    expect(log).not.toBeNull();
    expect(log.status).toBe('processado');
  });

  it('propriedade inativa → não cria tarefa', async () => {
    // Desativa a propriedade.
    await Propriedade.updateOne({ smoobu_id: '200' }, { $set: { ativo: false } });

    const amanha = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    await request(app).post('/webhooks/smoobu').send({
      action: 'newReservation',
      data: { id: 778, arrival: amanha, apartment: { id: 200, name: 'X' } },
    });
    await esperar(400);

    const tarefa = await Tarefa.findOne({ smoobu_reserva_id: '778' });
    expect(tarefa).toBeNull();

    // Restaura o estado ativo para testes seguintes.
    await Propriedade.updateOne({ smoobu_id: '200' }, { $set: { ativo: true } });
  });

  it('webhook duplicado (mesmo reservaId) → não cria tarefa duplicada (idempotência)', async () => {
    const amanha = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const payload = {
      action: 'newReservation',
      data: { id: 999, arrival: amanha, apartment: { id: 200, name: 'X' } },
    };

    // Primeiro envio → cria tarefa.
    await request(app).post('/webhooks/smoobu').send(payload);
    await esperar(400);
    const tarefas1 = await Tarefa.find({ smoobu_reserva_id: '999' });
    expect(tarefas1.length).toBe(1);

    // Segundo envio (retry do Smoobu) → NÃO cria duplicado.
    await request(app).post('/webhooks/smoobu').send(payload);
    await esperar(400);
    const tarefas2 = await Tarefa.find({ smoobu_reserva_id: '999' });
    expect(tarefas2.length).toBe(1);
  });

  it('action desconhecida → 200 mas não cria tarefa (log processado)', async () => {
    const amanha = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const res = await request(app).post('/webhooks/smoobu').send({
      action: 'pingTest',
      data: { id: 888, arrival: amanha, apartment: { id: 200, name: 'X' } },
    });
    expect(res.status).toBe(200);
    await esperar(400);

    // Não cria tarefa.
    const tarefa = await Tarefa.findOne({ smoobu_reserva_id: '888' });
    expect(tarefa).toBeNull();

    // O log fica 'processado' (não é erro — apenas não há nada a fazer).
    const log = await WebhookLog.findOne({ 'payload.data.id': 888 });
    expect(log).not.toBeNull();
    expect(log.status).toBe('processado');
  });

  it('cancellation → cancela a tarefa existente', async () => {
    // 1) Cria a tarefa com newReservation.
    const amanha = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    await request(app).post('/webhooks/smoobu').send({
      action: 'newReservation',
      data: { id: 1111, arrival: amanha, apartment: { id: 200, name: 'X' } },
    });
    await esperar(400);
    const tarefa = await Tarefa.findOne({ smoobu_reserva_id: '1111' });
    expect(tarefa).not.toBeNull();
    expect(tarefa.estado).not.toBe('cancelada');

    // 2) Envia cancellation → tarefa fica cancelada.
    await request(app).post('/webhooks/smoobu').send({
      action: 'cancellation',
      data: { id: 1111, arrival: amanha, apartment: { id: 200, name: 'X' } },
    });
    await esperar(400);
    const cancelada = await Tarefa.findOne({ smoobu_reserva_id: '1111' });
    expect(cancelada.estado).toBe('cancelada');
  });

  it('cancellation idempotente → cancelar 2x mantém cancelada', async () => {
    const amanha = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    // Cria primeiro (o beforeEach limpa as tarefas entre testes).
    await request(app).post('/webhooks/smoobu').send({
      action: 'newReservation',
      data: { id: 1111, arrival: amanha, apartment: { id: 200, name: 'X' } },
    });
    await esperar(400);
    // Cancela 2x.
    for (let i = 0; i < 2; i++) {
      await request(app).post('/webhooks/smoobu').send({
        action: 'cancellation',
        data: { id: 1111, arrival: amanha, apartment: { id: 200, name: 'X' } },
      });
      await esperar(300);
    }
    const tarefa = await Tarefa.findOne({ smoobu_reserva_id: '1111' });
    expect(tarefa.estado).toBe('cancelada');
  });

  it('cancellation de reserva sem tarefa → sem erro', async () => {
    const res = await request(app).post('/webhooks/smoobu').send({
      action: 'cancellation',
      data: { id: 999999, arrival: '2026-08-01', apartment: { id: 200, name: 'X' } },
    });
    expect(res.status).toBe(200);
    await esperar(300);
    // Nenhuma tarefa com este reservaId.
    const tarefa = await Tarefa.findOne({ smoobu_reserva_id: '999999' });
    expect(tarefa).toBeNull();
  });

  it('updateReservation → atualiza a data da tarefa existente', async () => {
    // 1) Cria tarefa com check-in amanhã.
    const amanha = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    await request(app).post('/webhooks/smoobu').send({
      action: 'newReservation',
      data: { id: 2222, arrival: amanha, apartment: { id: 200, name: 'X' } },
    });
    await esperar(400);
    const tarefa = await Tarefa.findOne({ smoobu_reserva_id: '2222' });
    const dataOriginal = new Date(tarefa.data).getTime();

    // 2) Envia update com check-in daqui a 5 dias.
    const daqui5dias = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
    await request(app).post('/webhooks/smoobu').send({
      action: 'updateReservation',
      data: { id: 2222, arrival: daqui5dias, apartment: { id: 200, name: 'X' } },
    });
    await esperar(400);

    const atualizada = await Tarefa.findOne({ smoobu_reserva_id: '2222' });
    // A data mudou.
    expect(new Date(atualizada.data).getTime()).not.toBe(dataOriginal);
    // Não criou duplicado.
    const count = await Tarefa.countDocuments({ smoobu_reserva_id: '2222' });
    expect(count).toBe(1);
  });

  it('updateReservation sem tarefa existente → cria a tarefa (fallback)', async () => {
    const amanha = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    await request(app).post('/webhooks/smoobu').send({
      action: 'updateReservation',
      data: { id: 3333, arrival: amanha, apartment: { id: 200, name: 'X' } },
    });
    await esperar(400);
    const tarefa = await Tarefa.findOne({ smoobu_reserva_id: '3333' });
    expect(tarefa).not.toBeNull(); // criou por fallback
  });

  it('newReservation de reserva anteriormente cancelada → re-activa', async () => {
    const amanha = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    // 1) Cria.
    await request(app).post('/webhooks/smoobu').send({
      action: 'newReservation',
      data: { id: 4444, arrival: amanha, apartment: { id: 200, name: 'X' } },
    });
    await esperar(400);
    // 2) Cancela.
    await request(app).post('/webhooks/smoobu').send({
      action: 'cancellation',
      data: { id: 4444, arrival: amanha, apartment: { id: 200, name: 'X' } },
    });
    await esperar(400);
    const cancelada = await Tarefa.findOne({ smoobu_reserva_id: '4444' });
    expect(cancelada.estado).toBe('cancelada');
    // 3) Re-cria (newReservation com mesmo ID) → re-activa.
    await request(app).post('/webhooks/smoobu').send({
      action: 'newReservation',
      data: { id: 4444, arrival: amanha, apartment: { id: 200, name: 'X' } },
    });
    await esperar(400);
    const reactivada = await Tarefa.findOne({ smoobu_reserva_id: '4444' });
    expect(reactivada.estado).not.toBe('cancelada');
    // Não criou duplicado.
    const count = await Tarefa.countDocuments({ smoobu_reserva_id: '4444' });
    expect(count).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/* 6b. Admin — Webhooks (logs)                                        */
/* ------------------------------------------------------------------ */

describe('GET /api/admin/webhooks', () => {
  it('sem token → 401', async () => {
    const res = await request(app).get('/api/admin/webhooks');
    expect(res.status).toBe(401);
  });

  it('com token → 200 + lista de logs + total', async () => {
    const res = await authGet('/api/admin/webhooks');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.webhooks)).toBe(true);
    expect(typeof res.body.total).toBe('number');
    // Os webhooks enviados nos testes anteriores devem aparecer.
    expect(res.body.total).toBeGreaterThan(0);
  });

  it('filtro por status=erro → só devolve logs com erro', async () => {
    // Força um webhook que vai falhar (propriedade inexistente).
    await request(app).post('/webhooks/smoobu').send({
      action: 'newReservation',
      data: { id: 4040, arrival: '2026-08-01', apartment: { id: 999999, name: 'X' } },
    });
    await esperar(400);

    const res = await authGet('/api/admin/webhooks?status=erro');
    expect(res.status).toBe(200);
    expect(res.body.webhooks.length).toBeGreaterThan(0);
    expect(res.body.webhooks.every((w) => w.status === 'erro')).toBe(true);
  });
});

describe('POST /api/admin/webhooks/:id/reprocessar', () => {
  it('webhook com erro (propriedade inexistente) → reprocessar mantém erro', async () => {
    // Cria um webhook que falhou (propriedade não existe).
    await request(app).post('/webhooks/smoobu').send({
      action: 'newReservation',
      data: { id: 5050, arrival: '2026-08-01', apartment: { id: 888888, name: 'X' } },
    });
    await esperar(400);

    const logErro = await WebhookLog.findOne({ 'payload.data.id': 5050 });
    expect(logErro).not.toBeNull();
    expect(logErro.status).toBe('erro');

    // Reproccessa → continua a falhar (propriedade ainda não existe).
    const res = await authPost(`/api/admin/webhooks/${logErro._id}/reprocessar`, {});
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('erro');
  });
});

/* ------------------------------------------------------------------ */
/* 7. Dashboard                                                        */
/* ------------------------------------------------------------------ */

describe('GET /api/admin/dashboard', () => {
  it('com token → 200 + shape esperado', async () => {
    const res = await authGet('/api/admin/dashboard');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('totalPropriedades');
    expect(res.body).toHaveProperty('propriedadesAtivas');
    expect(res.body).toHaveProperty('membrosEquipaAtivos');
    expect(res.body).toHaveProperty('tarefasHoje');
    expect(res.body).toHaveProperty('tarefasPorAtribuir');
    expect(res.body).toHaveProperty('tarefasConcluidasHoje');
    expect(Array.isArray(res.body.tarefasPorStaff)).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* 8. Relatórios                                                       */
/* ------------------------------------------------------------------ */

describe('GET /api/admin/relatorios/produtividade', () => {
  it('com token → 200 + shape completo', async () => {
    const res = await authGet('/api/admin/relatorios/produtividade');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('periodo');
    expect(res.body).toHaveProperty('resumo');
    expect(res.body.resumo).toHaveProperty('totalTarefas');
    expect(res.body.resumo).toHaveProperty('taxaConclusao');
    expect(res.body.resumo).toHaveProperty('emAtraso');
    expect(Array.isArray(res.body.porStaff)).toBe(true);
    expect(Array.isArray(res.body.porDia)).toBe(true);
    expect(Array.isArray(res.body.porEstado)).toBe(true);
    expect(Array.isArray(res.body.porPropriedade)).toBe(true);
  });

  it('com filtro de datas custom → 200', async () => {
    const inicio = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const fim = new Date().toISOString().slice(0, 10);
    const res = await authGet(`/api/admin/relatorios/produtividade?inicio=${inicio}&fim=${fim}`);
    expect(res.status).toBe(200);
    expect(res.body.periodo.inicio).toBeDefined();
    expect(res.body.periodo.fim).toBeDefined();
  });
});

/* ------------------------------------------------------------------ */
/* 9. Smoobu — sincronização em massa                                  */
/* ------------------------------------------------------------------ */

describe('POST /api/admin/smoobu/sincronizar', () => {
  let apiKeyOriginal;

  beforeEach(() => {
    apiKeyOriginal = process.env.SMOOBU_API_KEY;
    // Limpa tarefas entre testes.
    Tarefa.deleteMany({}).catch(() => {});
  });

  afterEach(() => {
    // Restaura a API key.
    if (apiKeyOriginal === undefined) {
      delete process.env.SMOOBU_API_KEY;
    } else {
      process.env.SMOOBU_API_KEY = apiKeyOriginal;
    }
    // Restaura o fetch global se foi mocked.
    if (global.fetch && global.fetch.__isMock) {
      global.fetch.mockRestore();
      delete global.fetch.__isMock;
    }
  });

  it('sem token → 401', async () => {
    const res = await request(app).post('/api/admin/smoobu/sincronizar');
    expect(res.status).toBe(401);
  });

  it('sem SMOOBU_API_KEY configurada → 400', async () => {
    delete process.env.SMOOBU_API_KEY;
    const res = await authPost('/api/admin/smoobu/sincronizar', {});
    expect(res.status).toBe(400);
    expect(res.body.erro).toMatch(/SMOOBU_API_KEY/);
  });

  it('com API key + fetch mockado → 200 + contadores', async () => {
    process.env.SMOOBU_API_KEY = 'test-key-123';

    const amanha = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    // Mocka o fetch global para devolver 2 reservas (uma nova, uma duplicada).
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        reservations: [
          {
            id: 2001,
            arrival: amanha,
            apartment: { id: 200, name: 'Apartamento Teste' },
          },
          {
            id: 2002,
            arrival: amanha,
            apartment: { id: 200, name: 'Apartamento Teste' },
          },
        ],
      }),
      text: async () => '',
    });
    mockFetch.__isMock = true;
    global.fetch = mockFetch;

    const res = await authPost('/api/admin/smoobu/sincronizar', {});
    expect(res.status).toBe(200);
    expect(res.body.totalRecebidas).toBe(2);
    expect(res.body.criadas).toBe(2);
    expect(res.body.existentes).toBe(0);
    expect(res.body.erros).toBe(0);
    expect(res.body.importadas).toBe(2);

    // Confirma que o fetch foi chamado com o URL e header corretos.
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toMatch(/login\.smoobu\.com\/api\/reservations\?from=/);
    expect(opts.headers['Api-Key']).toBe('test-key-123');
  });

  it('idempotente — sincronizar 2x não cria duplicados', async () => {
    process.env.SMOOBU_API_KEY = 'test-key-123';
    const amanha = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        reservations: [
          {
            id: 3001,
            arrival: amanha,
            apartment: { id: 200, name: 'X' },
          },
        ],
      }),
      text: async () => '',
    });
    mockFetch.__isMock = true;
    global.fetch = mockFetch;

    // 1ª sincronização → cria.
    const res1 = await authPost('/api/admin/smoobu/sincronizar', {});
    expect(res1.status).toBe(200);
    expect(res1.body.criadas).toBe(1);
    expect(res1.body.existentes).toBe(0);

    // 2ª sincronização → já existe.
    const res2 = await authPost('/api/admin/smoobu/sincronizar', {});
    expect(res2.status).toBe(200);
    expect(res2.body.criadas).toBe(0);
    expect(res2.body.existentes).toBe(1);

    // Confirma que só existe 1 tarefa.
    const count = await Tarefa.countDocuments({ smoobu_reserva_id: '3001' });
    expect(count).toBe(1);
  });

  it('fetch devolve erro 500 → 502', async () => {
    process.env.SMOOBU_API_KEY = 'test-key-123';
    const mockFetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => ({}),
      text: async () => 'Smoobu error',
    });
    mockFetch.__isMock = true;
    global.fetch = mockFetch;

    const res = await authPost('/api/admin/smoobu/sincronizar', {});
    expect(res.status).toBe(502);
    expect(res.body.erro).toMatch(/500/);
  });

  it('reserva com propriedade inexistente → conta como erro mas não falha o todo', async () => {
    process.env.SMOOBU_API_KEY = 'test-key-123';
    const amanha = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        reservations: [
          {
            id: 4001,
            arrival: amanha,
            apartment: { id: 999999, name: 'Inexistente' }, // prop não existe
          },
          {
            id: 4002,
            arrival: amanha,
            apartment: { id: 200, name: 'Existe' },
          },
        ],
      }),
      text: async () => '',
    });
    mockFetch.__isMock = true;
    global.fetch = mockFetch;

    const res = await authPost('/api/admin/smoobu/sincronizar', {});
    expect(res.status).toBe(200);
    expect(res.body.totalRecebidas).toBe(2);
    expect(res.body.criadas).toBe(1);
    expect(res.body.erros).toBe(1);
    expect(res.body.detalheErros.length).toBe(1);
    expect(String(res.body.detalheErros[0].reservaId)).toBe('4001');
  });
});
