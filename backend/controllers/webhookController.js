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
const WebhookLog = require('../models/WebhookLog');

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

// Capacidade máxima diária por utilizador (7 horas = 420 minutos).
// Inclui tempo de limpeza + tempo de viagem. Se um utilizador exceder
// este limite ao receber a nova tarefa, é excluído da atribuição.
// Justificação: as limpezas devem terminar antes do check-in (ex: 16h00),
// pelo que 7h de trabalho produtivo é um SLA razoável.
const CAPACIDADE_MAXIMA_MINUTOS = 420;

/**
 * Calcula o tempo de viagem entre duas coordenadas usando a Fórmula de
 * Haversine (distância em linha reta) e uma velocidade média urbana de
 * 30 km/h.
 *
 * TODO (futuro): substituir por Google Maps Distance Matrix API para ter
 * em conta o trânsito real e a rota rodoviária.
 *
 * @param {{ lat: number, lng: number } | null} coordA
 * @param {{ lat: number, lng: number } | null} coordB
 * @returns {number} tempo de viagem em minutos (0 se coordenadas inválidas)
 */
function calcularTempoViagem(coordA, coordB) {
  if (!coordA || !coordB || coordA.lat == null || coordA.lng == null ||
      coordB.lat == null || coordB.lng == null) {
    return 0;
  }

  const R = 6371; // raio da Terra em km
  const dLat = ((coordB.lat - coordA.lat) * Math.PI) / 180;
  const dLng = ((coordB.lng - coordA.lng) * Math.PI) / 180;
  const lat1 = (coordA.lat * Math.PI) / 180;
  const lat2 = (coordB.lat * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distanciaKm = R * c;

  // Velocidade média urbana: 30 km/h → tempo em minutos.
  const velocidadeKmh = 30;
  const tempoHoras = distanciaKm / velocidadeKmh;
  const tempoMinutos = Math.round(tempoHoras * 60);

  return tempoMinutos;
}

/**
 * Determina o utilizador (Staff) a quem atribuir a tarefa, aplicando:
 *   - filtro de ausências (passo 4)
 *   - filtro de folgas fixas semanais (v1.13.0)
 *   - cálculo de carga + tempo de viagem (passo 5, v1.14.0)
 *   - escolha do utilizador com menor carga_total (passo 6)
 *
 * v1.14.0 — Carga total = tempo_limpeza acumulado + tempo_viagem
 *   O tempo_viagem é calculado entre a última tarefa do dia do utilizador
 *   e a nova propriedade (Haversine). Se o utilizador não tiver tarefas
 *   nesse dia, tempo_viagem = 0.
 *
 * v1.15.0 — SLA de Capacidade Máxima:
 *   Após calcular a carga_total (limpeza + viagem + nova tarefa), se
 *   carga_total > CAPACIDADE_MAXIMA_MINUTOS (420 min = 7h), o utilizador
 *   é excluído. Se TODOS excederem, devolve null (tarefa por_atribuir).
 *
 * Devolve null se não houver ninguém disponível.
 *
 * @param {import('mongoose').Types.ObjectId} empresaId
 * @param {{start: Date, end: Date}} range
 * @param {{ lat: number, lng: number } | null} coordenadasNovaPropriedade
 * @param {number} tempoNovaTarefa - tempo_limpeza_minutos da nova tarefa
 * @returns {Promise<mongoose.Types.ObjectId|null>}
 */
async function determinarUtilizadorAtribuido(empresaId, range, coordenadasNovaPropriedade, tempoNovaTarefa) {
  // Passo 3 — Procurar todos os Staff e Managers ativos da empresa.
  // (O manager — responsável de limpezas — também pode executar limpezas,
  //  pelo que entra no load balancing como qualquer staff.)
  const staff = await Utilizador.find({
    empresa_id: empresaId,
    role: { $in: ['staff', 'manager'] },
    ativo: true,
  }).lean();

  if (staff.length === 0) return null;

  // Passo 4 — Filtro de Ausências: excluir quem tem ausência que cobre este dia.
  // v1.16.0: o campo legacy `data` foi removido. Query agora usa apenas
  // data_inicio/data_fim (sobreposição de intervalos).
  // Condição: ausencia.data_inicio <= dia AND ausencia.data_fim >= dia.
  const ausentes = await Ausencia.find({
    utilizador_id: { $in: staff.map((s) => s._id) },
    data_inicio: { $lte: range.start },
    data_fim: { $gte: range.start },
  }).distinct('utilizador_id');

  const setAusentes = new Set(ausentes.map(String));

  // v1.13.0 — Filtro de Folgas Fixas Semanais:
  // Um utilizador também é excluído se o dia da semana do check-in
  // estiver no seu array dias_folga (0=Dom, 6=Sáb, padrão Date.getDay()).
  const diaSemana = range.start.getDay();

  const disponiveis = staff.filter((s) => {
    // Filtro de ausências (já calculado acima).
    if (setAusentes.has(String(s._id))) return false;
    // Filtro de folgas fixas semanais.
    if (s.dias_folga && Array.isArray(s.dias_folga) && s.dias_folga.includes(diaSemana)) {
      return false;
    }
    return true;
  });

  if (disponiveis.length === 0) return null;

  // Passo 5 — Cálculo de Carga + Tempo de Viagem (v1.14.0):
  // carga_total = tempo_limpeza acumulado + tempo_viagem
  //
  // Para cada utilizador disponível:
  //   1. Soma o tempo_limpeza_minutos das tarefas já atribuídas no dia.
  //   2. Encontra a ÚLTIMA tarefa do dia (com populate de propriedade_id
  //      para obter coordenadas).
  //   3. Calcula tempo_viagem entre a última casa e a nova casa (Haversine).
  //   4. carga_total = soma_limpeza + tempo_viagem.
  const disponiveisIds = disponiveis.map((s) => s._id);

  // Soma de tempo de limpeza por utilizador (aggregate).
  const cargasLimpeza = await Tarefa.aggregate([
    {
      $match: {
        empresa_id: empresaId,
        utilizador_id: { $in: disponiveisIds },
        data: { $gte: range.start, $lt: range.end },
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

  const cargaLimpezaMap = new Map();
  for (const c of cargasLimpeza) {
    cargaLimpezaMap.set(String(c._id), c.total);
  }

  // Para cada utilizador, encontra a última tarefa do dia (com coordenadas).
  // Fazemos um find por utilizador em vez de um aggregate complexo, porque
  // precisamos de populate('propriedade_id', 'coordenadas').
  let melhorUtilizador = null;
  let menorCargaTotal = Infinity;

  for (const u of disponiveis) {
    // Tempo de limpeza acumulado.
    const cargaLimpeza = cargaLimpezaMap.get(String(u._id)) ?? 0;

    // Encontra a última tarefa do dia deste utilizador (com coordenadas).
    const ultimaTarefa = await Tarefa.findOne({
      utilizador_id: u._id,
      data: { $gte: range.start, $lt: range.end },
      estado: { $nin: ['cancelada', 'concluida'] },
    })
      .populate({ path: 'propriedade_id', select: 'coordenadas' })
      .sort({ createdAt: -1 }) // mais recente primeiro
      .lean();

    // Calcula tempo de viagem.
    let tempoViagem = 0;
    if (ultimaTarefa && ultimaTarefa.propriedade_id) {
      const coordAnterior = ultimaTarefa.propriedade_id.coordenadas;
      tempoViagem = calcularTempoViagem(coordAnterior, coordenadasNovaPropriedade);
    }

    // Carga total = limpeza acumulada + viagem + tempo da nova tarefa.
    // v1.15.0: inclui o tempo_limpeza_minutos da NOVA tarefa que está a
    // ser atribuída (recebido como parâmetro adicional).
    const cargaTotal = cargaLimpeza + tempoViagem + tempoNovaTarefa;

    // SLA: se a carga total exceder a capacidade máxima, ignora este utilizador.
    if (cargaTotal > CAPACIDADE_MAXIMA_MINUTOS) {
      continue;
    }

    if (cargaTotal < menorCargaTotal) {
      menorCargaTotal = cargaTotal;
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
 * @returns {Promise<object|null>} a tarefa criada (ou a existente, se duplicado),
 *   ou null se a action não for newReservation.
 */
async function processarReservaSmoobu(payload) {
  // Passo 1 — Receber o payload (identificar propriedade + data_check_in).
  const { smoobuPropId, dataCheckInRaw, reservaId, content } =
    extrairDadosReserva(payload);

  // v1.18.0 — Ação do webhook: o Smoobu envia webhooks para várias ações
  // (newReservation, updateReservation, cancellation, etc.). Só criamos
  // tarefa para 'newReservation' (e variantes). Outras ações são ignoradas
  // graciosamente (não é erro — apenas não há nada a fazer).
  const action =
    (payload && payload.action) ||
    (payload && payload.type) ||
    (content && content.action) ||
    'newReservation'; // fallback: se não vier action, assume newReservation

  const ACOES_CRIAR_TAREFA = [
    'newReservation',
    'new_reservation',
    'reservation_created',
    'created',
  ];
  if (!ACOES_CRIAR_TAREFA.includes(action)) {
    console.log(
      `ℹ️  Webhook com action "${action}" — não cria tarefa (apenas newReservation é processado).`
    );
    return null; // não é erro → o WebhookLog fica 'processado'
  }

  if (!smoobuPropId || !dataCheckInRaw) {
    throw new Error(
      'Payload do Smoobu inválido: propriedade ou data_check_in em falta.'
    );
  }

  const range = getDayRange(dataCheckInRaw);
  if (!range) {
    throw new Error(`data_check_in inválida: ${dataCheckInRaw}`);
  }

  // v1.18.0 — Idempotência: o Smoobu pode reenviar o mesmo webhook (retries
  // em caso de timeout/network glitch). Se já existir uma tarefa com o
  // mesmo smoobu_reserva_id, NÃO criamos duplicado — apenas devolvemos a
  // existente. Isto evita tarefas órfãs/duplicadas que poluiriam o calendário.
  if (reservaId) {
    const existente = await Tarefa.findOne({ smoobu_reserva_id: reservaId });
    if (existente) {
      console.log(
        `♻️  Webhook duplicado (reserva ${reservaId}) — tarefa ${existente._id} já existe. Sem ação.`
      );
      return existente;
    }
  }

  // Passo 2 — Encontrar a empresa à qual a propriedade pertence.
  const propriedade = await Propriedade.findOne({ smoobu_id: smoobuPropId });
  if (!propriedade) {
    throw new Error(`Propriedade Smoobu ${smoobuPropId} não encontrada na BD.`);
  }

  // Validação: se a propriedade estiver suspensa (ativo: false), aborta.
  if (!propriedade.ativo) {
    console.warn(
      `⚠️  Propriedade "${propriedade.nome}" (smoobu_id: ${smoobuPropId}) está suspensa — tarefa não criada.`
    );
    throw new Error(
      `Propriedade "${propriedade.nome}" está suspensa (ativo: false). Tarefa não criada.`
    );
  }

  const empresaId = propriedade.empresa_id;

  // Tempo de limpeza: payload.data > content (legacy) > propriedade > default (60).
  // O Smoobu não envia este campo oficialmente, mas alguns clientes adicionam-no.
  // NOTA: tem de ser calculado ANTES de determinar o utilizador atribuído,
  // pois o load balancer usa-o no cálculo da carga total (SLA de 420 min).
  const tempoLimpeza =
    content.tempo_limpeza_minutos ??
    content.cleaning_minutes ??
    propriedade.tempo_limpeza_minutos ??
    60;

  // Passos 3 a 6 — Determinar o utilizador (best-effort).
  // Se a lógica de atribuição falhar por qualquer motivo, criamos a tarefa
  // mesmo assim, com utilizador_id: null, para o Admin atribuir manualmente.
  let utilizadorAtribuido = null;
  try {
    utilizadorAtribuido = await determinarUtilizadorAtribuido(empresaId, range, propriedade.coordenadas, tempoLimpeza);
  } catch (err) {
    // Não interrompemos: a tarefa tem de ser criada (passo 7).
    console.error(
      '⚠️  Erro ao determinar utilizador (tarefa será criada sem atribuição):',
      err.message
    );
    utilizadorAtribuido = null;
  }

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
 * v1.12.0 — WebhookLog (idempotência + auditoria):
 *   Antes de devolver o 200, guarda o payload bruto num WebhookLog com
 *   status 'recebido'. No bloco assíncrono (setImmediate), atualiza o log
 *   para 'processado' se tudo correr bem, ou 'erro' com a mensagem se falhar.
 *   Isto permite saber quantos webhooks foram recebidos vs processados vs
 *   com erro, e reproccessar manualmente os que falharam.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
exports.webhookSmoobu = async (req, res) => {
  // 1) Guarda o payload bruto no WebhookLog com status 'recebido'.
  //    Fazemos isto ANTES de devolver o 200 para garantir que o payload
  //    nunca se perde, mesmo que o processamento assíncrono falhe.
  let webhookLog = null;
  try {
    webhookLog = await WebhookLog.create({
      payload: req.body,
      status: 'recebido',
    });
  } catch (err) {
    console.error('⚠️  Erro ao guardar WebhookLog (payload será perdido):', err.message);
    // Não interrompemos o fluxo — o Smoobu precisa do 200.
  }

  // 2) Resposta imediata — NÃO esperamos pelo processamento.
  res.status(200).json({ status: 'recebido' });

  // 3) Processamento assíncrono com tratamento de erros robusto.
  //    Atualiza o WebhookLog conforme o resultado.
  setImmediate(async () => {
    try {
      const resultado = await processarReservaSmoobu(req.body);

      // Sucesso → atualiza log para 'processado'.
      // (inclui o caso de webhook duplicado ou action ignorada — não é erro)
      if (webhookLog) {
        await WebhookLog.findByIdAndUpdate(webhookLog._id, {
          status: 'processado',
          erro_msg: null,
        });
      }
      // resultado pode ser null (action ignorada) ou a tarefa (criada/existente)
      return resultado;
    } catch (err) {
      console.error('❌ Erro no processamento do webhook Smoobu:', err.message);

      // Erro → atualiza log para 'erro' com a mensagem.
      if (webhookLog) {
        await WebhookLog.findByIdAndUpdate(webhookLog._id, {
          status: 'erro',
          erro_msg: err.message,
        });
      }
    }
  });
};

// Exporta a função de processamento para permitir reproccessamento manual
// a partir do painel de admin (POST /api/admin/webhooks/:id/reprocessar).
exports._processarReservaSmoobu = processarReservaSmoobu;
