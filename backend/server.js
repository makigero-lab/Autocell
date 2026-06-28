/**
 * Autocell - API de gestão para Alojamento Local
 * Ponto de entrada da aplicação backend (Express + MongoDB).
 *
 * NOTA: a instância `app` é exportada (module.exports) para poder ser
 * usada nos testes com supertest SEM iniciar o servidor HTTP nem ligar
 * ao MongoDB. O `app.listen` e o `mongoose.connect` só correm quando
 * este ficheiro é executado diretamente (require.main === module).
 */

require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const webhookRoutes = require('./routes/webhookRoutes');
const adminRoutes = require('./routes/adminRoutes');
const authRoutes = require('./routes/authRoutes');
const ausenciaRoutes = require('./routes/ausenciaRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

/* ------------------------------------------------------------------ */
/* Middlewares                                                         */
/* ------------------------------------------------------------------ */
// CORS — TRANCADO: aceita apenas a origem do frontend definida em env.
// credentials: true para permitir cookies cross-origin (quando necessário).
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true,
  })
);

// Permite receber e enviar JSON no corpo dos pedidos.
app.use(express.json());

/* ------------------------------------------------------------------ */
/* Rotas                                                               */
/* ------------------------------------------------------------------ */
// Rota de teste para confirmar que a API está online.
app.get('/', (req, res) => {
  res.json({ status: 'API do Alojamento Local online e ligada à BD!' });
});

// Webhooks de integrações externas (Smoobu, etc.).
app.use('/webhooks', webhookRoutes);

// Autenticação (login público + /me protegido).
app.use('/api/auth', authRoutes);

// Painel de Administração.
// NOTA: a proteção por auth é aplicada dentro de adminRoutes.js, apenas às
// rotas que precisam (propriedades). O /setup fica PÚBLICO porque é o
// endpoint de bootstrap (cria o primeiro utilizador — ainda não há token).
app.use('/api/admin', adminRoutes);

// Gestão de Ausências (Folgas e Férias) — protegido por auth.
app.use('/api/admin/ausencias', ausenciaRoutes);

/* ------------------------------------------------------------------ */
/* Middleware global de tratamento de erros                            */
/* ------------------------------------------------------------------ */
// Captura exceções não tratadas (erros síncronos lançados após next(err)
// ou erros assíncronos não apanhados por try/catch). Devolve um JSON
// padrão sem vazar a stack trace para o cliente (segurança).
// Deve ser o ÚLTIMO middleware registado (depois de todas as rotas).
app.use((err, req, res, next) => {
  console.error('❌ Erro não tratado:', err.message);
  // Log completo no servidor (para debug), mas NÃO enviar ao cliente.
  if (process.env.NODE_ENV !== 'production') {
    console.error(err.stack);
  }
  return res.status(err.status || 500).json({
    erro: err.status ? err.message : 'Erro interno do servidor.',
  });
});

/* ------------------------------------------------------------------ */
/* Exporta a app para testes (supertest)                              */
/* ------------------------------------------------------------------ */
module.exports = app;

/* ------------------------------------------------------------------ */
/* Arranque do servidor (apenas em execução direta)                   */
/* ------------------------------------------------------------------ */
if (require.main === module) {
  mongoose
    .connect(process.env.MONGODB_URI)
    .then(() => {
      console.log('✅ Ligado ao MongoDB com sucesso.');
      app.listen(PORT, () => {
        console.log(`🚀 Servidor a correr na porta ${PORT}.`);
      });
    })
    .catch((err) => {
      console.error('❌ Erro ao ligar ao MongoDB:', err.message);
      process.exit(1);
    });
}
