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
const Empresa = require('../models/Empresa');
const Propriedade = require('../models/Propriedade');
const Utilizador = require('../models/Utilizador');

/* ------------------------------------------------------------------ */
/* Helper — extrair empresa_id do header x-empresa-id                  */
/* ------------------------------------------------------------------ */

/**
 * Lê e valida o `empresa_id` do header `x-empresa-id`.
 * Devolve { ok, empresaId, res } — se `ok` for false, `res` já tem a
 * resposta de erro enviada e o handler deve terminar imediatamente.
 */
function extrairEmpresaId(req, res) {
  const raw = req.header('x-empresa-id');
  if (!raw) {
    res.status(400).json({
      erro: 'Header x-empresa-id em falta.',
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
    const NOME_STAFF = 'João Limpezas';
    const NOME_PROPRIEDADE = 'Casa Teste';
    const SMOOBU_ID_TESTE = '99999';

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

    // 2) Utilizador Staff — não duplicar (procura por nome + empresa).
    let staff = await Utilizador.findOne({
      empresa_id: empresa._id,
      nome: NOME_STAFF,
    });
    let staffCriado = false;
    if (!staff) {
      staff = await Utilizador.create({
        nome: NOME_STAFF,
        // Email derivado do nome para satisfazer o `required` do modelo,
        // já que ainda não há gestão de utilizadores reais.
        email: `joao.limpezas@${empresa._id}.local`,
        empresa_id: empresa._id,
        role: 'staff',
        ativo: true,
      });
      staffCriado = true;
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

    return res.status(200).json({
      mensagem: empresaCriada || staffCriado || propriedadeCriada
        ? 'Cliente Zero criado com sucesso.'
        : 'Cliente Zero já existia (nada foi alterado).',
      empresa_id: empresa._id,
      empresa: {
        id: empresa._id,
        nome: empresa.nome,
        plano_ativo: empresa.plano_ativo,
        criada: empresaCriada,
      },
      staff: {
        id: staff._id,
        nome: staff.nome,
        role: staff.role,
        criado: staffCriado,
      },
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
