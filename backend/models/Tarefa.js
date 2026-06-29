/**
 * Modelo: Tarefa
 * Representa uma tarefa de limpeza/trabalho gerada a partir de uma reserva.
 *
 * - utilizador_id pode ser null (tarefa por atribuir — o Admin atribui manualmente).
 * - tempo_limpeza_minutos é a unidade usada no cálculo de carga (load balancing).
 * - data é normalizada para meia-noite UTC (dia do check-in).
 */
const mongoose = require('mongoose');

const tarefaSchema = new mongoose.Schema(
  {
    empresa_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Empresa',
      required: true,
      index: true,
    },
    propriedade_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Propriedade',
      required: true,
      index: true,
    },
    // ID da reserva no Smoobu (para auditoria / idempotência futura)
    smoobu_reserva_id: {
      type: String,
      index: true,
    },
    utilizador_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Utilizador',
      default: null,
      index: true,
    },
    data: {
      type: Date,
      required: true,
      index: true,
    },
    tempo_limpeza_minutos: {
      type: Number,
      required: true,
      default: 60,
      min: 0,
    },
    tipo: {
      type: String,
      enum: ['limpeza', 'check_in', 'check_out', 'manutencao', 'outro'],
      default: 'limpeza',
    },
    estado: {
      type: String,
      enum: ['por_atribuir', 'atribuida', 'em_curso', 'concluida', 'cancelada'],
      default: 'por_atribuir',
    },
    // Observações preenchidas pelo staff ao concluir a tarefa.
    observacoes: {
      type: String,
      default: '',
    },
    // Data em que a tarefa foi concluída (para relatórios).
    concluida_em: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Tarefa', tarefaSchema);
