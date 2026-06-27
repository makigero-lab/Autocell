/**
 * Middleware de Autenticação (JWT) — Autocell
 *
 * Lê o token do header `Authorization: Bearer <token>`, verifica-o e injeta
 * o payload em `req.user` ({ id, role, empresa_id }).
 *
 * Comportamento:
 *   - Se o token for válido → `req.user` fica preenchido e o pedido continua.
 *   - Se faltar o header / token malformado / token inválido ou expirado →
 *     responde 401 e o pedido pára.
 *
 * Fallback temporário (transição para JWT):
 *   Se NÃO houver token mas houver o header `x-empresa-id`, o middleware
 *   permite o acesso (modo legacy) com `req.user = { empresa_id }`. Isto
 *   evita partir o fluxo enquanto o frontend migra para o login. Remover
 *   assim que o frontend estiver 100% com JWT.
 */

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'autocell-dev-secret-change-me';

function extrairToken(req) {
  const header = req.header('authorization') || req.header('Authorization');
  if (!header) return null;
  // Formato esperado: "Bearer <token>"
  const partes = header.split(' ');
  if (partes.length === 2 && /^bearer$/i.test(partes[0])) {
    return partes[1];
  }
  return null;
}

function auth(req, res, next) {
  const token = extrairToken(req);

  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      req.user = {
        id: payload.id,
        role: payload.role,
        empresa_id: payload.empresa_id,
      };
      return next();
    } catch (err) {
      return res.status(401).json({
        erro: 'Token inválido ou expirado.',
        detalhe: err.message,
      });
    }
  }

  // Fallback legacy: sem token, mas com x-empresa-id → modo transição.
  const empresaIdLegacy = req.header('x-empresa-id');
  if (empresaIdLegacy) {
    req.user = { empresa_id: empresaIdLegacy, legacy: true };
    return next();
  }

  return res.status(401).json({
    erro: 'Autenticação obrigatória. Envie Authorization: Bearer <token>.',
  });
}

module.exports = { auth, JWT_SECRET };
