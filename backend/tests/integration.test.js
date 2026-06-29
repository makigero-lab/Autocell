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
