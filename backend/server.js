/**
 * Autocell - API de gestão para Alojamento Local
 * Ponto de entrada da aplicação backend (Express + MongoDB).
 */

require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const webhookRoutes = require('./routes/webhookRoutes');

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

/* ------------------------------------------------------------------ */
/* Ligação ao MongoDB e arranque do servidor                          */
/* ------------------------------------------------------------------ */
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
