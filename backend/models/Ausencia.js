/**
 * Modelo: Ausencia
 * Regista férias ou folgas de um utilizador (Staff/Manager) num intervalo de datas.
 *
 * v1.16.0 — Limpeza de retrocompatibilidade:
 *   O campo legacy `data` (v1.1.0, dia único) foi REMOVIDO. O modelo
 *   passa a usar exclusivamente `data_inicio` / `data_fim` (intervalos).
 *   O pre('save') que preenchia `data` foi também removido.
 *
 * v1.8.0 — Sistema de Folgas e Férias:
 *   - `data_inicio` / `data_fim` definem o intervalo (inclusive).
 *   - `tipo`: 'ferias' | 'folga'.
 *   - `notas`: observações livres.
 *
 * O webhook consulta Ausencia para excluir staff indisponível no dia da limpeza.
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
    // Intervalo de datas (inclusive). Ambas obrigatórias.
    data_inicio: {
      type: Date,
      required: true,
      index: true,
    },
    data_fim: {
      type: Date,
      required: true,
      index: true,
    },
    tipo: {
      type: String,
      enum: ['ferias', 'folga'],
      default: 'folga',
      required: true,
    },
    notas: {
      type: String,
      trim: true,
      default: '',
    },
  },
  { timestamps: true }
);

// Antes de guardar: normaliza data_inicio/data_fim para meia-noite UTC.
ausenciaSchema.pre('save', function preSave(next) {
  if (this.data_inicio) {
    const d = new Date(this.data_inicio);
    this.data_inicio = new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
    );
  }
  if (this.data_fim) {
    const d = new Date(this.data_fim);
    this.data_fim = new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
    );
  }
  next();
});

// Índice único composto { utilizador_id, data_inicio } — evita duplicar o
// MESMO início de ausência para o mesmo utilizador (mas permite intervalos
// sobrepostos de tipos diferentes se necessário; a validação de sobreposição
// real é feita no controller para dar mensagem clara).
ausenciaSchema.index({ utilizador_id: 1, data_inicio: 1 }, { unique: true });

module.exports = mongoose.model('Ausencia', ausenciaSchema);
