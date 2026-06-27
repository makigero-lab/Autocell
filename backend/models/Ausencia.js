/**
 * Modelo: Ausencia
 * Regista que um utilizador (Staff) está indisponível num determinado dia.
 * Usado pelo webhook para excluir staff indisponível na data de check-in.
 *
 * Nota: o campo "data" é normalizado para meia-noite UTC, de forma a que a
 * comparação por dia seja determinística.
 */
const mongoose = require('mongoose');

const ausenciaSchema = new mongoose.Schema(
  {
    utilizador_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Utilizador',
      required: true,
      index: true,
    },
    empresa_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Empresa',
      required: true,
      index: true,
    },
    data: {
      type: Date,
      required: true,
      index: true,
    },
    motivo: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

// Um utilizador só pode ter um registo de ausência por dia.
ausenciaSchema.index({ utilizador_id: 1, data: 1 }, { unique: true });

module.exports = mongoose.model('Ausencia', ausenciaSchema);
