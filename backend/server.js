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
// Permite pedidos cross-origin (ex.: frontend na Vercel a falar com a
// API alojada no Render).
app.use(cors());

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
/* Exporta a app para testes (supertest)                              */
/* ------------------------------------------------------------------ */
// Permite que os testes importem a app SEM iniciar o servidor HTTP nem
// ligar ao MongoDB (evita conflitos de portas e dependência de BD).
module.exports = app;

/* ------------------------------------------------------------------ */
/* Arranque do servidor (apenas em execução direta)                   */
/* ------------------------------------------------------------------ */
// Só liga ao MongoDB e abre a porta HTTP quando o ficheiro é executado
// diretamente (node server.js / npm start). Nos testes (require('./server')),
// este bloco NÃO corre — a app é importada apenas para supertest.
if (require.main === module) {
  mongoose
    .connect(process.env.MONGODB_URI)
    .then(() => {
      console.log('✅ Ligado ao MongoDB com sucesso.');

      // Só iniciamos o servidor HTTP depois de garantir a ligação à BD.
      app.listen(PORT, () => {
        console.log(`🚀 Servidor a correr na porta ${PORT}.`);
      });
    })
    .catch((err) => {
      console.error('❌ Erro ao ligar ao MongoDB:', err.message);
      process.exit(1);
    });
}
