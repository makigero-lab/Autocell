/**
 * Modelo: Propriedade
 * Representa um alojamento (apartment) sincronizado com o Smoobu.
 * Cada propriedade pertence a uma empresa.
 */
const mongoose = require('mongoose');

const propriedadeSchema = new mongoose.Schema(
  {
    // ID da propriedade no Smoobu ( usado para cruzar com o webhook )
    smoobu_id: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    nome: {
      type: String,
      required: true,
      trim: true,
    },
    empresa_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Empresa',
      required: true,
      index: true,
    },
    // Tempo de limpeza por defeito (minutos) — usado quando o payload
    // do Smoobu não traz esta informação.
    tempo_limpeza_minutos: {
      type: Number,
      default: 60,
      min: 0,
    },
    ativo: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Propriedade', propriedadeSchema);
