/**
 * Modelo: Utilizador
 * Representa um utilizador do sistema dentro de uma empresa.
 *
 * Roles (hierarquia):
 *   - admin   → dono da conta (gestão total: empresas, planos, utilizadores).
 *   - manager → responsável de limpezas (gere a equipa de staff, vê dashboard
 *               alargado, pode também executar limpezas).
 *   - staff   → executante de limpezas (vê apenas as suas tarefas no mobile).
 *
 * Autenticação (v1.3.0):
 *   - `email` é único (índice único) — serve de credencial de login.
 *   - `password_hash` guarda a hash bcrypt da password (nunca a password em claro).
 *
 * O webhook considera utilizadores com role "staff" OU "manager" e ativos=true
 * para atribuição de tarefas (o manager também pode executar limpezas).
 */
const mongoose = require('mongoose');

const utilizadorSchema = new mongoose.Schema(
  {
    nome: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      unique: true,
      index: true,
    },
    // Hash bcrypt da password. Nunca armazenar a password em claro.
    password_hash: {
      type: String,
      // Não é `required` para permitir migrar utilizadores existentes sem
      // password (que terão de a definir depois). O login recusa se vazio.
    },
    empresa_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Empresa',
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ['admin', 'manager', 'staff'],
      default: 'staff',
      required: true,
    },
    // Superior hierárquico (responsável) do utilizador.
    // Referência a outro Utilizador (normalmente role 'admin' ou 'manager').
    // O admin não tem responsavel_id (topo da hierarquia).
    responsavel_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Utilizador',
      default: null,
      index: true,
    },
    ativo: {
      type: Boolean,
      default: true,
    },
    // Soft delete: em vez de remover o utilizador da BD (o que deixaria
    // Tarefas antigas com utilizador_id órfão), marca-se a data de eliminação.
    // Utilizadores com eliminado_em !== null são excluídos das queries normais.
    eliminado_em: {
      type: Date,
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Utilizador', utilizadorSchema);
