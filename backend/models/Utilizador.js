/**
 * Modelo: Utilizador
 * Representa um utilizador do sistema (Admin ou Staff) dentro de uma empresa.
 *
 * Autenticação (v1.3.0):
 *   - `email` é único (índice único) — serve de credencial de login.
 *   - `password_hash` guarda a hash bcrypt da password (nunca a password em claro).
 *
 * O webhook considera apenas utilizadores com role "staff" e ativos=true.
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
      enum: ['admin', 'staff'],
      default: 'staff',
      required: true,
    },
    ativo: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Utilizador', utilizadorSchema);
