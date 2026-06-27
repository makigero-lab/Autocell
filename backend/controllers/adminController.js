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
/* Equipa (Utilizadores)                                               */
/* ------------------------------------------------------------------ */

/**
 * GET /api/admin/equipa
 * Lista todos os utilizadores da empresa (qualquer role).
 * O `empresa_id` vem do JWT (via extrairEmpresaId).
 *
 * Resposta 200: { utilizadores: [...] } (sem password_hash).
 */
exports.getEquipa = async (req, res) => {
  try {
    const { ok, empresaId } = extrairEmpresaId(req, res);
    if (!ok) return;

    const utilizadores = await Utilizador.find({ empresa_id: empresaId })
      .select('-password_hash') // nunca expor a hash
      .populate({ path: 'responsavel_id', select: 'nome email role' })
      .sort({ nome: 1 })
      .lean();

    // Transforma responsavel_id (objeto populated) num campo `responsavel` limpo
    // e mantém responsavel_id como string (ou null) para o frontend.
    const transformados = utilizadores.map((u) => {
      const resp = u.responsavel_id;
      return {
        ...u,
        responsavel_id: resp ? String(resp._id) : null,
        responsavel: resp
          ? { _id: String(resp._id), nome: resp.nome, email: resp.email, role: resp.role }
          : null,
      };
    });

    return res.status(200).json({ utilizadores: transformados });
  } catch (err) {
    console.error('❌ getEquipa:', err.message);
    return res.status(500).json({ erro: 'Erro interno do servidor.' });
  }
};

/**
 * POST /api/admin/equipa
 * Cria um novo membro de equipa (Utilizador) para a empresa.
 *
 * Body: { nome, email, password, role }
 *   - nome      (obrigatório)
 *   - email     (obrigatório, único global)
 *   - password  (obrigatória, em claro — é guardada como hash bcrypt)
 *   - role      (opcional, default 'staff'; enum ['admin','manager','staff'])
 *
 * Resposta 201: { utilizador: { ... } } (sem password_hash).
 * Erros: 400 campos em falta / role inválido; 409 email duplicado; 500 erro.
 */
exports.criarMembroEquipa = async (req, res) => {
  try {
    const { ok, empresaId } = extrairEmpresaId(req, res);
    if (!ok) return;

    const { nome, email, password, role, responsavel_id } = req.body || {};

    // Validações de presença.
    if (!nome || !email || !password) {
      return res.status(400).json({
        erro: 'Campos obrigatórios em falta: nome, email e password.',
      });
    }

    // Validação da password (mínimo 6 caracteres).
    if (String(password).length < 6) {
      return res.status(400).json({
        erro: 'A password deve ter pelo menos 6 caracteres.',
      });
    }

    // Validação do role (se vier, tem de ser um dos permitidos).
    const roleFinal = role || 'staff';
    if (!['admin', 'manager', 'staff'].includes(roleFinal)) {
      return res.status(400).json({
        erro: 'Role inválido. Valores permitidos: admin, manager, staff.',
      });
    }

    // SEGURANÇA: Não é possível criar utilizadores com role 'admin'.
    // O admin é criado apenas via /api/admin/setup (bootstrap) ou processo separado.
    if (roleFinal === 'admin') {
      return res.status(403).json({
        erro: 'Não é possível criar utilizadores com role "admin".',
      });
    }

    // Validação de unicidade do email (único global).
    const emailNormalizado = String(email).toLowerCase().trim();
    const existente = await Utilizador.findOne({ email: emailNormalizado });
    if (existente) {
      return res.status(409).json({
        erro: `Já existe um utilizador com o email "${emailNormalizado}".`,
      });
    }

    // SEGURANÇA: Valida responsavel_id se vier — tem de ser admin/manager
    // da mesma empresa.
    let responsavelValidado = null;
    if (responsavel_id) {
      if (!mongoose.isValidObjectId(responsavel_id)) {
        return res.status(400).json({ erro: 'responsavel_id inválido.' });
      }
      const resp = await Utilizador.findOne({
        _id: responsavel_id,
        empresa_id: empresaId,
        role: { $in: ['admin', 'manager'] },
      });
      if (!resp) {
        return res.status(400).json({
          erro: 'Responsável não encontrado (ou não é admin/manager da empresa).',
        });
      }
      responsavelValidado = resp._id;
    }

    // Hash da password com bcrypt.
    const password_hash = await bcrypt.hash(String(password), 10);

    const novo = await Utilizador.create({
      nome: String(nome).trim(),
      email: emailNormalizado,
      password_hash,
      empresa_id: empresaId,
      role: roleFinal,
      responsavel_id: responsavelValidado,
      ativo: true,
    });

    // Resposta sem password_hash.
    const utilizador = novo.toObject();
    delete utilizador.password_hash;

    return res.status(201).json({ utilizador });
  } catch (err) {
    console.error('❌ criarMembroEquipa:', err.message);

    if (err.name === 'ValidationError') {
      return res.status(400).json({ erro: err.message });
    }
    if (err.code === 11000) {
      return res.status(409).json({
        erro: 'Violação de unicidade.',
        detalhe: err.keyValue,
      });
    }
    return res.status(500).json({ erro: 'Erro interno do servidor.' });
  }
};

/**
 * PUT /api/admin/equipa/:id
 * Atualiza Nome, Email e/ou Role de um utilizador, e opcionalmente a password.
 *
 * Body (todos opcionais, mas pelo menos um deve vir):
 *   { nome?, email?, role?, password? }
 *   - password: se vier, é guardada como NOVA hash bcrypt (mín. 6 chars).
 *               Se não vier, a password atual é mantida.
 *
 * Regras de segurança:
 *   - O utilizador tem de pertencer à mesma empresa do JWT.
 *   - Não é possível desativar via este endpoint (usar PATCH /:id/estado).
 *   - Se o email mudar, tem de continuar único.
 *
 * Resposta 200: { utilizador: { ... } } (sem password_hash).
 */
exports.atualizarMembroEquipa = async (req, res) => {
  try {
    const { ok, empresaId } = extrairEmpresaId(req, res);
    if (!ok) return;

    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ erro: 'ID de utilizador inválido.' });
    }

    const { nome, email, role, password, responsavel_id } = req.body || {};
    if (
      nome === undefined &&
      email === undefined &&
      role === undefined &&
      password === undefined &&
      responsavel_id === undefined
    ) {
      return res.status(400).json({
        erro: 'Nada para atualizar. Envie nome, email, role, password e/ou responsavel_id.',
      });
    }

    // SEGURANÇA: Não é possível definir role 'admin' via edição.
    if (role !== undefined && role === 'admin') {
      return res.status(403).json({
        erro: 'Não é possível atribuir o role "admin" via edição.',
      });
    }

    // Procura o utilizador e garante que pertence à empresa do JWT.
    const utilizador = await Utilizador.findOne({ _id: id, empresa_id: empresaId });
    if (!utilizador) {
      return res.status(404).json({
        erro: 'Utilizador não encontrado (ou não pertence a esta empresa).',
      });
    }

    // SEGURANÇA: Não é possível modificar um administrador.
    if (utilizador.role === 'admin') {
      return res.status(403).json({
        erro: 'Não é possível modificar um administrador.',
      });
    }

    // --- Nome ---
    if (nome !== undefined) {
      const n = String(nome).trim();
      if (!n) {
        return res.status(400).json({ erro: 'nome não pode ser vazio.' });
      }
      utilizador.nome = n;
    }

    // --- Email (com verificação de unicidade se mudou) ---
    if (email !== undefined) {
      const emailNormalizado = String(email).toLowerCase().trim();
      if (!emailNormalizado) {
        return res.status(400).json({ erro: 'email não pode ser vazio.' });
      }
      if (emailNormalizado !== utilizador.email) {
        const existente = await Utilizador.findOne({ email: emailNormalizado });
        if (existente) {
          return res.status(409).json({
            erro: `Já existe um utilizador com o email "${emailNormalizado}".`,
          });
        }
        utilizador.email = emailNormalizado;
      }
    }

    // --- Role ---
    if (role !== undefined) {
      if (!['manager', 'staff'].includes(role)) {
        return res.status(400).json({
          erro: 'Role inválido. Valores permitidos via edição: manager, staff.',
        });
      }
      utilizador.role = role;
    }

    // --- Responsável (opcional: null = sem responsável) ---
    if (responsavel_id !== undefined) {
      if (responsavel_id === null || responsavel_id === '') {
        utilizador.responsavel_id = null;
      } else {
        if (!mongoose.isValidObjectId(responsavel_id)) {
          return res.status(400).json({ erro: 'responsavel_id inválido.' });
        }
        const resp = await Utilizador.findOne({
          _id: responsavel_id,
          empresa_id: empresaId,
          role: { $in: ['admin', 'manager'] },
        });
        if (!resp) {
          return res.status(400).json({
            erro: 'Responsável não encontrado (ou não é admin/manager da empresa).',
          });
        }
        // Não permitir atribuir o utilizador como responsável de si próprio.
        if (String(resp._id) === String(utilizador._id)) {
          return res.status(400).json({
            erro: 'Um utilizador não pode ser responsável de si próprio.',
          });
        }
        utilizador.responsavel_id = resp._id;
      }
    }

    // --- Password (opcional: só se vier, faz hash nova) ---
    if (password !== undefined && password !== null && String(password) !== '') {
      if (String(password).length < 6) {
        return res.status(400).json({
          erro: 'A password deve ter pelo menos 6 caracteres.',
        });
      }
      utilizador.password_hash = await bcrypt.hash(String(password), 10);
    }

    await utilizador.save();

    // Resposta sem password_hash.
    const resp = utilizador.toObject();
    delete resp.password_hash;
    return res.status(200).json({ utilizador: resp });
  } catch (err) {
    console.error('❌ atualizarMembroEquipa:', err.message);
    if (err.name === 'ValidationError') {
      return res.status(400).json({ erro: err.message });
    }
    if (err.code === 11000) {
      return res.status(409).json({
        erro: 'Violação de unicidade.',
        detalhe: err.keyValue,
      });
    }
    return res.status(500).json({ erro: 'Erro interno do servidor.' });
  }
};

/**
 * PATCH /api/admin/equipa/:id/estado
 * Alterna o estado `ativo` do utilizador (ativa ↔ desativa).
 *
 * Um utilizador desativado NÃO consegue fazer login (ver authController.login).
 *
 * Body (opcional): { ativo: boolean } — se não vier, alterna o estado atual.
 *
 * Resposta 200: { utilizador: { ... }, ativo: boolean } (sem password_hash).
 */
exports.alternarEstadoMembro = async (req, res) => {
  try {
    const { ok, empresaId } = extrairEmpresaId(req, res);
    if (!ok) return;

    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ erro: 'ID de utilizador inválido.' });
    }

    const utilizador = await Utilizador.findOne({ _id: id, empresa_id: empresaId });
    if (!utilizador) {
      return res.status(404).json({
        erro: 'Utilizador não encontrado (ou não pertence a esta empresa).',
      });
    }

    // SEGURANÇA: Não é possível desativar/ativar um administrador.
    if (utilizador.role === 'admin') {
      return res.status(403).json({
        erro: 'Não é possível modificar o estado de um administrador.',
      });
    }

    // Se vier `ativo` no body, usa-o; senão alterna.
    const novoEstado =
      typeof req.body?.ativo === 'boolean' ? req.body.ativo : !utilizador.ativo;

    utilizador.ativo = novoEstado;
    await utilizador.save();

    const resp = utilizador.toObject();
    delete resp.password_hash;
    return res.status(200).json({ utilizador: resp, ativo: novoEstado });
  } catch (err) {
    console.error('❌ alternarEstadoMembro:', err.message);
    return res.status(500).json({ erro: 'Erro interno do servidor.' });
  }
};

/**
 * DELETE /api/admin/equipa/:id
 * Remove permanentemente o utilizador da base de dados.
 *
 * Regras de segurança:
 *   - O utilizador tem de pertencer à mesma empresa do JWT.
 *   - Não é possível eliminar-se a si próprio (req.user.id) — evita
 *     o admin ficar sem acesso à conta.
 *
 * Resposta 200: { mensagem, utilizador_id }.
 */
exports.eliminarMembroEquipa = async (req, res) => {
  try {
    const { ok, empresaId } = extrairEmpresaId(req, res);
    if (!ok) return;

    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ erro: 'ID de utilizador inválido.' });
    }

    // Proteção: não permitir eliminar-se a si próprio.
    if (req.user && req.user.id && String(req.user.id) === String(id)) {
      return res.status(400).json({
        erro: 'Não podes eliminar a tua própria conta.',
      });
    }

    const utilizador = await Utilizador.findOne({ _id: id, empresa_id: empresaId });
    if (!utilizador) {
      return res.status(404).json({
        erro: 'Utilizador não encontrado (ou não pertence a esta empresa).',
      });
    }

    // SEGURANÇA: Não é possível eliminar um administrador.
    if (utilizador.role === 'admin') {
      return res.status(403).json({
        erro: 'Não é possível eliminar um administrador.',
      });
    }

    const nomeEliminado = utilizador.nome;
    await Utilizador.deleteOne({ _id: id });

    return res.status(200).json({
      mensagem: `Utilizador "${nomeEliminado}" eliminado com sucesso.`,
      utilizador_id: id,
    });
  } catch (err) {
    console.error('❌ eliminarMembroEquipa:', err.message);
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
