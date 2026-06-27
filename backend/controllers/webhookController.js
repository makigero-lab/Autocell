/**
 * Webhook Controller — Autocell
 *
 * Recebe os webhooks do Smoobu (nova reserva) e aplica a lógica central de
 * atribuição de tarefas de limpeza.
 *
 * Fluxo da função (ESTRITAMENTE este):
 *   1. Receber o payload do Smoobu (propriedade + data_check_in).
 *   2. Encontrar a que empresa_id pertence a propriedade no MongoDB.
 *   3. Procurar todos os Staff dessa empresa.
 *   4. Filtro de Ausências: excluir Staff com registo de Ausência na data_check_in.
 *   5. Cálculo de Carga (Load Balancing): somar tempo_limpeza_minutos das tarefas
 *      já atribuídas a cada Staff para esse dia.
 *   6. Atribuir a nova Tarefa ao Staff com menor tempo acumulado.
 *   7. Se não houver ninguém disponível, criar a Tarefa com utilizador_id: null.
 *
 * Regra de resposta: devolver 200 OK IMEDIATO ao Smoobu e processar as regras
 * de forma assíncrona (o Smoobu cancela pedidos demorados → timeout).
 */

const mongoose = require('mongoose');
const Propriedade = require('../models/Propriedade');
const Utilizador = require('../models/Utilizador');
const Ausencia = require('../models/Ausencia');
const Tarefa = require('../models/Tarefa');

/* ------------------------------------------------------------------ */
/* Utilitários                                                         */
/* ------------------------------------------------------------------ */

/**
 * Converte uma data (string "YYYY-MM-DD" ou Date) no intervalo
 * [início do dia, início do dia seguinte] em UTC.
 * Usado para comparar "dias inteiros" na BD de forma determinística.
 *
 * @param {string|Date} dateInput
 * @returns {{start: Date, end: Date}|null}
 */
function getDayRange(dateInput) {
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return null;
  const start = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  );
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

/**
 * Extrai o ID da propriedade e a data de check-in do payload do Smoobu.
 *
 * Estrutura OFICIAL do webhook "newReservation" do Smoobu (documentada):
 *   {
 *     "action": "newReservation",
 *     "data": {
 *       "id": 292,
 *       "arrival": "YYYY-MM-DD",
 *       "apartment": { "id": 38, "name": "Apartment 1" }
 *     }
 *   }
 *
 * Mapeamento primário (respeita o objeto `data` e o sub-objeto `apartment`):
 *   - smoobuPropId  ← payload.data.apartment.id
 *   - dataCheckInRaw ← payload.data.arrival
 *   - reservaId     ← payload.data.id
 *
 * Fallbacks (com ??) mantidos para precaver outras estruturas/variantes
 * (ex.: payloads com `content` em vez de `data`, ou campos "achatados").
 *
 * @param {object} payload
 * @returns {{smoobuPropId: string, dataCheckInRaw: string, reservaId: string|null, content: object}}
 */
function extrairDadosReserva(payload) {
  // Objeto principal: o Smoobu usa `data`; alguns webhooks antigos usavam `content`.
  const data = (payload && payload.data) || null;
  const content = (payload && payload.content) || payload || {};

  // Sub-objeto apartment (estrutura oficial do Smoobu).
  const apartment = (data && data.apartment) || content.apartment || null;

  // 1) smoobuPropId — primário: data.apartment.id
  const smoobuPropId =
    (apartment && apartment.id) ??
    data?.apartmentId ??
    data?.apartment_id ??
    data?.propertyId ??
    data?.property_id ??
    content.apartmentId ??
    content.apartment_id ??
    content.propertyId ??
    content.property_id ??
    content.propriedade_id;

  // 2) dataCheckInRaw — primário: data.arrival
  const dataCheckInRaw =
    data?.arrival ??
    data?.check_in ??
    data?.checkIn ??
    data?.data_check_in ??
    data?.startDate ??
    content.arrival ??
    content.check_in ??
    content.checkIn ??
    content.data_check_in ??
    content.startDate;

  // 3) reservaId — primário: data.id
  const reservaId =
    data?.id ??
    data?.reservationId ??
    data?.reservation_id ??
    content.id ??
    content.reservationId ??
    content.reservation_id ??
    null;

  return {
    smoobuPropId: smoobuPropId != null ? String(smoobuPropId) : null,
    dataCheckInRaw: dataCheckInRaw != null ? String(dataCheckInRaw) : null,
    reservaId: reservaId != null ? String(reservaId) : null,
    // Mantém-se `content` para retrocompatibilidade com quem consome esta função.
    content,
  };
}

/* ------------------------------------------------------------------ */
/* Lógica de atribuição (passos 3 a 6)                                */
/* ------------------------------------------------------------------ */

/**
 * Determina o utilizador (Staff) a quem atribuir a tarefa, aplicando:
 *   - filtro de ausências (passo 4)
 *   - cálculo de carga / load balancing (passo 5)
 *   - escolha do utilizador com menor carga (passo 6)
 *
 * Devolve null se não houver ninguém disponível.
 *
 * @param {import('mongoose').Types.ObjectId} empresaId
 * @param {{start: Date, end: Date}} range
 * @returns {Promise<mongoose.Types.ObjectId|null>}
 */
async function determinarUtilizadorAtribuido(empresaId, range) {
  // Passo 3 — Procurar todos os Staff e Managers ativos da empresa.
  // (O manager — responsável de limpezas — também pode executar limpezas,
  //  pelo que entra no load balancing como qualquer staff.)
  const staff = await Utilizador.find({
    empresa_id: empresaId,
    role: { $in: ['staff', 'manager'] },
    ativo: true,
  }).lean();

  if (staff.length === 0) return null;

  // Passo 4 — Filtro de Ausências: excluir quem tem ausência neste dia.
  const ausentes = await Ausencia.find({
    utilizador_id: { $in: staff.map((s) => s._id) },
    data: { $gte: range.start, $lt: range.end },
  }).distinct('utilizador_id');

  const setAusentes = new Set(ausentes.map(String));
  const disponiveis = staff.filter((s) => !setAusentes.has(String(s._id)));

  if (disponiveis.length === 0) return null;

  // Passo 5 — Cálculo de Carga: soma de tempo_limpeza_minutos das tarefas
  // já atribuídas a cada utilizador disponível para esse dia.
  const disponiveisIds = disponiveis.map((s) => s._id);

  const cargas = await Tarefa.aggregate([
    {
      $match: {
        empresa_id: empresaId,
        utilizador_id: { $in: disponiveisIds },
        data: { $gte: range.start, $lt: range.end },
        // Não contar tarefas canceladas nem concluídas na carga atual.
        estado: { $nin: ['cancelada', 'concluida'] },
      },
    },
    {
      $group: {
        _id: '$utilizador_id',
        total: { $sum: '$tempo_limpeza_minutos' },
      },
    },
  ]);

  const cargaMap = new Map();
  for (const c of cargas) {
    cargaMap.set(String(c._id), c.total);
  }

  // Passo 6 — Escolher o utilizador com menor carga acumulada
  // (empate → primeiro encontrado; quem não tem tarefas conta como 0).
  let melhorUtilizador = null;
  let menorCarga = Infinity;

  for (const u of disponiveis) {
    const carga = cargaMap.get(String(u._id)) ?? 0;
    if (carga < menorCarga) {
      menorCarga = carga;
      melhorUtilizador = u;
    }
  }

  return melhorUtilizador ? melhorUtilizador._id : null;
}

/* ------------------------------------------------------------------ */
/* Processamento principal (passos 1, 2, 7)                           */
/* ------------------------------------------------------------------ */

/**
 * Processa o payload do Smoobu e cria a Tarefa correspondente.
 *
 * @param {object} payload
 * @returns {Promise<object>} a tarefa criada
 */
async function processarReservaSmoobu(payload) {
  // Passo 1 — Receber o payload (identificar propriedade + data_check_in).
  const { smoobuPropId, dataCheckInRaw, reservaId, content } =
    extrairDadosReserva(payload);

  if (!smoobuPropId || !dataCheckInRaw) {
    throw new Error(
      'Payload do Smoobu inválido: propriedade ou data_check_in em falta.'
    );
  }

  const range = getDayRange(dataCheckInRaw);
  if (!range) {
    throw new Error(`data_check_in inválida: ${dataCheckInRaw}`);
  }

  // Passo 2 — Encontrar a empresa à qual a propriedade pertence.
  const propriedade = await Propriedade.findOne({ smoobu_id: smoobuPropId });
  if (!propriedade) {
    throw new Error(`Propriedade Smoobu ${smoobuPropId} não encontrada na BD.`);
  }

  const empresaId = propriedade.empresa_id;

  // Passos 3 a 6 — Determinar o utilizador (best-effort).
  // Se a lógica de atribuição falhar por qualquer motivo, criamos a tarefa
  // mesmo assim, com utilizador_id: null, para o Admin atribuir manualmente.
  let utilizadorAtribuido = null;
  try {
    utilizadorAtribuido = await determinarUtilizadorAtribuido(empresaId, range);
  } catch (err) {
    // Não interrompemos: a tarefa tem de ser criada (passo 7).
    console.error(
      '⚠️  Erro ao determinar utilizador (tarefa será criada sem atribuição):',
      err.message
    );
    utilizadorAtribuido = null;
  }

  // Tempo de limpeza: payload.data > content (legacy) > propriedade > default (60).
  // O Smoobu não envia este campo oficialmente, mas alguns clientes adicionam-no.
  const tempoLimpeza =
    content.tempo_limpeza_minutos ??
    content.cleaning_minutes ??
    propriedade.tempo_limpeza_minutos ??
    60;

  // Passo 7 — Criar a Tarefa (mesmo sem utilizador → null).
  const novaTarefa = await Tarefa.create({
    empresa_id: empresaId,
    propriedade_id: propriedade._id,
    smoobu_reserva_id: reservaId || undefined,
    utilizador_id: utilizadorAtribuido,
    data: range.start,
    tempo_limpeza_minutos: Number(tempoLimpeza) || 60,
    tipo: 'limpeza',
    estado: utilizadorAtribuido ? 'atribuida' : 'por_atribuir',
  });

  if (utilizadorAtribuido) {
    console.log(
      `✅ Tarefa ${novaTarefa._id} atribuída ao utilizador ${utilizadorAtribuido} ` +
        `(carga do dia calculada).`
    );
  } else {
    console.log(
      `✅ Tarefa ${novaTarefa._id} criada SEM atribuição (sem Staff disponível ou erro).`
    );
  }

  return novaTarefa;
}

/* ------------------------------------------------------------------ */
/* Handler do endpoint                                                */
/* ------------------------------------------------------------------ */

/**
 * POST /webhooks/smoobu
 *
 * Responde 200 OK IMEDIATAMENTE ao Smoobu e processa a lógica de forma
 * assíncrona (fire-and-forget) para evitar timeouts no Smoobu.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
exports.webhookSmoobu = (req, res) => {
  // Resposta imediata — NÃO esperamos pelo processamento.
  res.status(200).json({ status: 'recebido' });

  // Processamento assíncrono com tratamento de erros robusto.
  setImmediate(async () => {
    try {
      await processarReservaSmoobu(req.body);
    } catch (err) {
      console.error('❌ Erro no processamento do webhook Smoobu:', err.message);
      // TODO (futuro): persistir o payload bruto numa coleção de WebhookLog
      // e/ou integrar com sistema de retentas (ex.: fila BullMQ) para reprocessar.
    }
  });
};
