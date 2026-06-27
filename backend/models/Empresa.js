/**
 * Modelo: Empresa
 * Representa a entidade principal do SaaS (multi-tenant).
 * Cada empresa agrupa Propriedades e Utilizadores (Admin/Staff).
 */
const mongoose = require('mongoose');

const empresaSchema = new mongoose.Schema(
  {
    nome: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    nif: {
      type: String,
      trim: true,
    },
    plano_ativo: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Empresa', empresaSchema);
