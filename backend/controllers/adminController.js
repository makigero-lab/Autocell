/**
 * Admin Controller — Autocell
 *
 * Endpoints do Painel de Administração.
 *
 * NOTA: ainda NÃO há autenticação JWT. Enquanto o JWT não existir, o
 * `empresa_id` é extraído do header `x-empresa-id` do pedido. Esta é uma
 * solução temporária para conseguir testar a API; deve ser substituída por
 * um middleware de auth que faça parse do token e injete `req.empresaId`.
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Empresa = require('../models/Empresa');
const Propriedade = require('../models/Propriedade');
const Utilizador = require('../models/Utilizador');

/* ------------------------------------------------------------------ */
/* Helper — extrair empresa_id (JWT优先, fallback legacy x-empresa-id) */
/* ------------------------------------------------------------------ */

/**
 * Resolve o `empresa_id` do pedido.
 *
 * Prioridade:
 *   1. `req.user.empresa_id` — injetado pelo middleware `auth` a partir do JWT
 *      (modo principal, pós-login).
 *   2. Header `x-empresa-id` — modo legacy (transição), para o frontend que
 *      ainda não enviou JWT. Será removido quando o frontend estiver 100% com login.
 *
 * Devolve { ok, empresaId } — se `ok` for false, a resposta de erro já foi
 * enviada e o handler deve terminar imediatamente.
 */
function extrairEmpresaId(req, res) {
  // 1) JWT (prioritário)
  if (req.user && req.user.empresa_id) {
    const empresaId = req.user.empresa_id;
    if (!mongoose.isValidObjectId(empresaId)) {
      res.status(400).json({ erro: 'empresa_id do token inválido.' });
      return { ok: false };
    }
    return { ok: true, empresaId };
  }

  // 2) Fallback legacy: header x-empresa-id
  const raw = req.header('x-empresa-id');
  if (!raw) {
    res.status(400).json({
      erro: 'empresa_id em falta (envie JWT ou header x-empresa-id).',
    });
    return { ok: false };
  }
  if (!mongoose.isValidObjectId(raw)) {
    res.status(400).json({
      erro: 'x-empresa-id inválido (não é um ObjectId válido).',
    });
    return { ok: false };
  }
  return { ok: true, empresaId: raw };
}

/* ------------------------------------------------------------------ */
/* Propriedades                                                         */
/* ------------------------------------------------------------------ */

/**
 * GET /api/admin/propriedades
 * Devolve as propriedades dessa empresa.
 */
exports.getPropriedades = async (req, res) => {
  try {
    const { ok, empresaId } = extrairEmpresaId(req, res);
    if (!ok) return;

    const propriedades = await Propriedade.find({ empresa_id: empresaId }).sort(
      { nome: 1 }
    );

    return res.status(200).json({ propriedades });
  } catch (err) {
    console.error('❌ getPropriedades:', err.message);
    return res.status(500).json({ erro: 'Erro interno do servidor.' });
  }
};

/**
 * POST /api/admin/propriedades
 * Cria uma propriedade para essa empresa.
 * Valida: smoobu_id (obrigatório + único), nome (obrigatório),
 * tempo_limpeza_minutos (opcional, default 60).
 *
 * Body esperado:
 *   { smoobu_id, nome, tempo_limpeza_minutos? }
 */
exports.criarPropriedade = async (req, res) => {
  try {
    const { ok, empresaId } = extrairEmpresaId(req, res);
    if (!ok) return;

    const { smoobu_id, nome, tempo_limpeza_minutos } = req.body || {};

    // Validações de presença.
    if (!smoobu_id || !nome) {
      return res.status(400).json({
        erro: 'Campos obrigatórios em falta: smoobu_id e nome.',
      });
    }

    // Validação de unicidade do smoobu_id (global, não por empresa — é o ID
    // do apartment no Smoobu, pelo que não pode repetir-se entre empresas).
    const existente = await Propriedade.findOne({ smoobu_id: String(smoobu_id) });
    if (existente) {
      return res.status(409).json({
        erro: `Já existe uma propriedade com smoobu_id "${smoobu_id}".`,
      });
    }

    // Validação de tempo_limpeza_minutos (se vier, tem de ser número >= 0).
    let tempo = 60;
    if (tempo_limpeza_minutos !== undefined && tempo_limpeza_minutos !== null) {
      const n = Number(tempo_limpeza_minutos);
      if (Number.isNaN(n) || n < 0) {
        return res.status(400).json({
          erro: 'tempo_limpeza_minutos deve ser um número maior ou igual a 0.',
        });
      }
      tempo = n;
    }

    const nova = await Propriedade.create({
      smoobu_id: String(smoobu_id),
      nome: String(nome).trim(),
      empresa_id: empresaId,
      tempo_limpeza_minutos: tempo,
    });

    return res.status(201).json({ propriedade: nova });
  } catch (err) {
    console.error('❌ criarPropriedade:', err.message);

    // Erro de validação do Mongoose (campo obrigatório, etc.)
    if (err.name === 'ValidationError') {
      return res.status(400).json({ erro: err.message });
    }

    // Erro de chave duplicada (índice único)
    if (err.code === 11000) {
      return res.status(409).json({
        erro: 'Violação de unicidade.',
        detalhe: err.keyValue,
      });
    }

    return res.status(500).json({ erro: 'Erro interno do servidor.' });
  }
};

/* ------------------------------------------------------------------ */
/* Setup do "Cliente Zero" (bootstrap do ambiente de testes)          */
/* ------------------------------------------------------------------ */

/**
 * GET /api/admin/setup
 *
 * Cria o "Cliente Zero" — dados iniciais para testes:
 *   - 1 Empresa: "O Meu Alojamento Local"
 *   - 1 Utilizador Staff: "João Limpezas"
 *   - 1 Propriedade: "Casa Teste" (smoobu_id: "99999")
 *
 * Idempotente: antes de criar, verifica se a empresa já existe (por nome).
 * Se já existir, reutiliza-a e cria apenas o que faltar.
 *
 * Devolve o `empresa_id` gerado/reutilizado no JSON de resposta.
 */
exports.setupClienteZero = async (req, res) => {
  try {
    const NOME_EMPRESA = 'O Meu Alojamento Local';
    const NOME_PROPRIEDADE = 'Casa Teste';
    const SMOOBU_ID_TESTE = '99999';
    // Password comum de teste do Cliente Zero (em produção, cada utilizador
    // deve alterar a sua password após o primeiro login).
    const PASSWORD_TESTE = 'autocell123';

    // Utilizadores a garantir (admin + manager + staff).
    const UTILIZADORES_TESTE = [
      {
        nome: 'Gestor Autocell', // admin — para ti (dono da conta)
        email: 'admin@autocell.pt',
        role: 'admin',
      },
      {
        nome: 'Responsável Limpezas', // manager — gere a equipa de staff
        email: 'manager@autocell.pt',
        role: 'manager',
      },
      {
        nome: 'João Limpezas', // staff — executante de limpezas
        email: 'joao.limpezas@autocell.pt',
        role: 'staff',
      },
    ];

    // 1) Empresa — não duplicar (procura por nome).
    let empresa = await Empresa.findOne({ nome: NOME_EMPRESA });
    let empresaCriada = false;
    if (!empresa) {
      empresa = await Empresa.create({
        nome: NOME_EMPRESA,
        plano_ativo: true,
      });
      empresaCriada = true;
    }

    // 2) Utilizadores (admin + manager + staff) — não duplicar (email único).
    //    Para cada um: cria se não existir, ou define password se existir sem.
    const utilizadores = [];
    for (const u of UTILIZADORES_TESTE) {
      let user = await Utilizador.findOne({ email: u.email });
      let criado = false;
      let passwordDefinida = false;

      if (!user) {
        const password_hash = await bcrypt.hash(PASSWORD_TESTE, 10);
        user = await Utilizador.create({
          nome: u.nome,
          email: u.email,
          password_hash,
          empresa_id: empresa._id,
          role: u.role,
          ativo: true,
        });
        criado = true;
        passwordDefinida = true;
      } else if (!user.password_hash) {
        // Retrocompatibilidade: utilizador criado antes do auth, sem password.
        const password_hash = await bcrypt.hash(PASSWORD_TESTE, 10);
        user.empresa_id = user.empresa_id || empresa._id;
        user.password_hash = password_hash;
        // Garante que o role está correto (caso tenha sido criado com role antigo).
        user.role = u.role;
        await user.save();
        passwordDefinida = true;
      }

      utilizadores.push({
        id: user._id,
        nome: user.nome,
        email: user.email,
        role: user.role,
        criado,
        password_definida: passwordDefinida,
        credenciais_teste: {
          email: u.email,
          password: PASSWORD_TESTE,
        },
      });
    }

    // 3) Propriedade — não duplicar (procura por smoobu_id único).
    let propriedade = await Propriedade.findOne({ smoobu_id: SMOOBU_ID_TESTE });
    let propriedadeCriada = false;
    if (!propriedade) {
      propriedade = await Propriedade.create({
        smoobu_id: SMOOBU_ID_TESTE,
        nome: NOME_PROPRIEDADE,
        empresa_id: empresa._id,
        tempo_limpeza_minutos: 60,
      });
      propriedadeCriada = true;
    }

    const algoCriado =
      empresaCriada ||
      utilizadores.some((u) => u.criado) ||
      propriedadeCriada;

    return res.status(200).json({
      mensagem: algoCriado
        ? 'Cliente Zero criado com sucesso.'
        : 'Cliente Zero já existia (nada foi alterado).',
      empresa_id: empresa._id,
      empresa: {
        id: empresa._id,
        nome: empresa.nome,
        plano_ativo: empresa.plano_ativo,
        criada: empresaCriada,
      },
      // 3 utilizadores: admin (dono), manager (responsável limpezas), staff (executante).
      utilizadores,
      propriedade: {
        id: propriedade._id,
        nome: propriedade.nome,
        smoobu_id: propriedade.smoobu_id,
        criada: propriedadeCriada,
      },
    });
  } catch (err) {
    console.error('❌ setupClienteZero:', err.message);

    if (err.code === 11000) {
      return res.status(409).json({
        erro: 'Conflito de dados duplicados.',
        detalhe: err.keyValue,
      });
    }

    return res.status(500).json({ erro: 'Erro interno do servidor.' });
  }
};
