# Documentação Técnica — Backend (Autocell)

API REST do SaaS de gestão para Alojamento Local, construída com **Node.js**, **Express** e **MongoDB** (via **Mongoose**).

---

## 1. Stack tecnológica

| Camada            | Tecnologia      | Função                                                         |
|-------------------|-----------------|----------------------------------------------------------------|
| Runtime           | Node.js ≥ 18    | Execução do servidor JavaScript                                |
| Framework Web     | Express 4       | Definição de rotas e middlewares HTTP                          |
| ODM de Base Dados | Mongoose 8      | Modelação e ligação ao MongoDB                                 |
| Variáveis de env. | dotenv          | Carregamento de configuração a partir de `.env`                |
| CORS              | cors            | Permissão de pedidos cross-origin (Vercel → Render)            |
| Dev tooling       | nodemon         | Reinício automático do servidor durante o desenvolvimento      |

---

## 2. Estrutura de ficheiros

```
backend/
├── package.json              # Dependências e scripts (npm start → node server.js)
├── server.js                 # Ponto de entrada: middlewares, rotas, ligação à BD
├── .env.example              # Modelo das variáveis de ambiente (a copiar para .env)
├── .gitignore                # Ignora node_modules, .env, logs, etc.
├── controllers/
│   ├── webhookController.js  # Webhook do Smoobu: atribuição de tarefas (lógica central)
│   └── adminController.js    # Painel de Administração + setup Cliente Zero
├── models/                   # Modelos Mongoose (ODM do MongoDB)
│   ├── Empresa.js            #   Entidade principal (multi-tenant)
│   ├── Propriedade.js        #   Alojamento sincronizado com o Smoobu
│   ├── Utilizador.js         #   Admin / Staff de uma empresa
│   ├── Ausencia.js           #   Indisponibilidade de Staff num dia
│   └── Tarefa.js             #   Tarefa de limpeza gerada por reserva
└── routes/
    ├── webhookRoutes.js      # POST /webhooks/smoobu
    └── adminRoutes.js        # GET/POST /api/admin/propriedades, GET /api/admin/setup
```

---

## 3. Arquitetura e lógica de arranque (`server.js`)

O fluxo de arranque segue uma sequência segura:

1. **Carregamento de configuração** — `require('dotenv').config()` lê o `.env` e expõe as variáveis em `process.env`.
2. **Instanciação da app Express** — cria a aplicação e define a porta (`process.env.PORT || 5000`).
3. **Middlewares:**
   - `cors()` — habilita respostas a pedidos vindos de outras origens (essencial para o frontend na Vercel comunicar com a API no Render).
   - `express.json()` — faz parse do corpo dos pedidos em JSON, disponibilizando-os em `req.body`.
4. **Rotas** — `GET /` (healthcheck), montagem de `/webhooks` e `/api/admin` (ver secção 6).
5. **Ligação ao MongoDB** — `mongoose.connect(process.env.MONGODB_URI)`.
   - Em **caso de sucesso**: regista mensagem e **só depois** arranca o servidor HTTP com `app.listen(PORT)`. Isto garante que a API só recebe tráfego quando a base de dados está acessível.
   - Em **caso de erro**: regista o erro e termina o processo (`process.exit(1)`), evitando arrancar um servidor sem acesso à BD.

### Regra de processo importante
> O servidor HTTP **só arranca depois de a ligação ao MongoDB ser estabelecida**. Se a BD estiver indisponível, a aplicação termina imediatamente em vez de arrancar num estado inconsistente.

---

## 3.1. Modelos de dados (Mongoose)

O sistema gira em torno de 5 coleções. Todas usam `timestamps: true` (createdAt/updatedAt).

### `Empresa`
Entidade principal do SaaS (multi-tenant). Cada empresa agrupa Propriedades e Utilizadores.

| Campo         | Tipo    | Notas                                              |
|---------------|---------|----------------------------------------------------|
| `nome`        | String  | Obrigatório, trim, indexado.                       |
| `nif`         | String  | Opcional, trim.                                    |
| `plano_ativo` | Boolean | Default `true`.                                    |

### `Propriedade`
Representa um alojamento sincronizado com o Smoobu.

| Campo                   | Tipo     | Notas                                                        |
|-------------------------|----------|--------------------------------------------------------------|
| `smoobu_id`             | String   | Único, indexado. ID do apartment no Smoobu (cruzamento webhook). |
| `nome`                  | String   | Obrigatório.                                                 |
| `empresa_id`            | ObjectId | `ref: 'Empresa'`. Obrigatório, indexado.                     |
| `tempo_limpeza_minutos` | Number   | Default `60`. Usado se o payload do Smoobu não trouxer valor. |
| `ativo`                 | Boolean  | Default `true`.                                              |

### `Utilizador`
Admin ou Staff de uma empresa.

| Campo        | Tipo     | Notas                                                              |
|--------------|----------|--------------------------------------------------------------------|
| `nome`       | String   | Obrigatório.                                                       |
| `email`      | String   | Obrigatório, lowercase, indexado.                                  |
| `empresa_id` | ObjectId | `ref: 'Empresa'`. Obrigatório, indexado.                           |
| `role`       | String   | `enum: ['admin','staff']`, default `'staff'`.                      |
| `ativo`      | Boolean  | Default `true`. Staff inativo é ignorado pelo webhook.             |

### `Ausencia`
Indisponibilidade de um Staff num dia. O campo `data` é **normalizado para meia-noite UTC**.

| Campo           | Tipo     | Notas                                                              |
|-----------------|----------|--------------------------------------------------------------------|
| `utilizador_id` | ObjectId | `ref: 'Utilizador'`. Obrigatório, indexado.                        |
| `empresa_id`    | ObjectId | `ref: 'Empresa'`. Obrigatório, indexado.                           |
| `data`          | Date     | Obrigatório, indexado. Meia-noite UTC do dia da ausência.          |
| `motivo`        | String   | Opcional.                                                          |

Índice único composto `{ utilizador_id, data }` → um Staff só tem uma ausência por dia.

### `Tarefa`
Tarefa de limpeza gerada a partir de uma reserva do Smoobu.

| Campo                   | Tipo     | Notas                                                              |
|-------------------------|----------|--------------------------------------------------------------------|
| `empresa_id`            | ObjectId | Obrigatório, indexado.                                             |
| `propriedade_id`        | ObjectId | `ref: 'Propriedade'`. Obrigatório, indexado.                       |
| `smoobu_reserva_id`     | String   | ID da reserva no Smoobu (auditoria / idempotência). Indexado.      |
| `utilizador_id`         | ObjectId | `ref: 'Utilizador'`, **default `null`** → tarefa por atribuir.     |
| `data`                  | Date     | Dia do check-in (meia-noite UTC). Obrigatório, indexado.           |
| `tempo_limpeza_minutos` | Number   | Obrigatório, default `60`, `min: 0`. Unidade de carga.             |
| `tipo`                  | String   | `enum: ['limpeza','check_in','check_out','manutencao','outro']`.   |
| `estado`                | String   | `enum: ['por_atribuir','atribuida','em_curso','concluida','cancelada']`. |

> Nota: `empresa_id` é uma referência a `Empresa` (modelo criado na v1.2.0).

---

## 3.2. Lógica central — Atribuição de tarefas (Webhook Smoobu)

Quando o Smoobu notifica uma **nova reserva** (`POST /webhooks/smoobu`), a API executa o seguinte fluxo **estrito**:

1. **Receber o payload** — extrai o ID da propriedade (`apartmentId` / `propertyId` / …) e a `data_check_in` (`arrival` / `check_in` / …). Suporta várias nomenclaturas para tolerância a variações do Smoobu.
2. **Encontrar a empresa** — procura a `Propriedade` por `smoobu_id` e obtém o respetivo `empresa_id`. Se não existir → erro (a tarefa não pode ser criada sem saber a empresa).
3. **Procurar Staff** — lista todos os `Utilizador` com `role: 'staff'`, `ativo: true` dessa empresa.
4. **Filtro de Ausências** — exclui os Staff que tenham um registo em `Ausencia` para o dia do check-in (comparação por dia inteiro em UTC).
5. **Cálculo de Carga (Load Balancing)** — para cada Staff disponível, soma `tempo_limpeza_minutos` de todas as `Tarefa` já atribuídas a esse Staff para o mesmo dia (excluindo `cancelada`/`concluida`). Staff sem tarefas conta como carga `0`.
6. **Atribuição** — a nova Tarefa é atribuída ao Staff com **menor carga acumulada** (empate → primeiro encontrado).
7. **Sem disponíveis** — se não houver Staff disponível (ou a lógica de atribuição falhar), a Tarefa é **mesmo assim criada** com `utilizador_id: null` e `estado: 'por_atribuir'`, para o Admin atribuir manualmente.

### Regra de resposta (anti-timeout)
> O handler devolve **`200 OK` imediato** (`{ status: 'recebido' }`) **antes** de qualquer acesso à BD. O processamento das regras decorre de forma **assíncrona** (`setImmediate`), porque o Smoobu cancela pedidos demorados. Erros do processamento assíncrono são capturados em `try/catch` e registados (não propagam para o cliente).

### Regra de robustez
> A criação da Tarefa (passo 7) **nunca** é impedida por falhas na lógica de atribuição (passos 3–6): se algo falhar ao determinar o utilizador, a tarefa é criada com `utilizador_id: null` e o erro é registado. Apenas a falha nos passos 1–2 (payload inválido / propriedade inexistente) impede a criação, por serem pré-requisitos.

---

## 4. Scripts disponíveis

| Script       | Comando            | Descrição                                          |
|--------------|--------------------|----------------------------------------------------|
| `npm start`  | `node server.js`   | Arranca a API em modo produção                     |
| `npm run dev`| `nodemon server.js`| Arranca em modo desenvolvimento (auto-restart)     |

---

## 5. Variáveis de ambiente

Definidas no ficheiro `.env` (a criar a partir de `.env.example`). **Nunca** fazer commit do `.env`.

| Variável      | Obrigatória | Descrição                                                        |
|---------------|-------------|------------------------------------------------------------------|
| `MONGODB_URI` | ✅ Sim       | URI de ligação ao MongoDB (local, Atlas ou add-on do Render)     |
| `PORT`        | ❌ Não        | Porta de escuta. Por defeito `5000`. No Render é injetada.       |

---

## 6. API — Endpoints

### `GET /`
Rota de verificação de estado (healthcheck).

**Resposta (200 OK):**
```json
{
  "status": "API do Alojamento Local online e ligada à BD!"
}
```

### `POST /webhooks/smoobu`
Recebe o webhook do Smoobu (nova reserva) e cria a respetiva Tarefa de limpeza, aplicando a lógica de atribuição descrita na secção 3.2.

- **Resposta imediata (200 OK):** `{ "status": "recebido" }` — o processamento decorre em segundo plano.
- **Payload esperado (campos lidos):**

  | Campo lido (qualquer destes) | Uso                                   |
  |-------------------------------|---------------------------------------|
  | `content.apartmentId` / `apartment_id` / `propertyId` / `propriedade_id` | Identifica a propriedade no Smoobu |
  | `content.arrival` / `check_in` / `checkIn` / `data_check_in` / `startDate` | Data de check-in (dia da tarefa) |
  | `content.id` / `reservationId` / `reservation_id` | ID da reserva (auditoria) |
  | `content.tempo_limpeza_minutos` / `cleaning_minutes` | (Opcional) sobrepõe-se ao default da propriedade |

- **Exemplo de payload Smoobu (formato canónico):**
```json
{
  "type": "newReservation",
  "content": {
    "id": 102345,
    "apartmentId": 67890,
    "arrival": "2024-07-15",
    "departure": "2024-07-20"
  }
}
```
- **Resultado (assíncrono):** é criado um documento `Tarefa` com `utilizador_id` preenchido (Staff com menor carga) ou `null` (sem disponíveis / erro). O resultado é registado nos logs do servidor.

### 6.1. Painel de Administração (`/api/admin`)

> ⚠️ **Autenticação temporária:** enquanto não há JWT, o `empresa_id` é lido do **header `x-empresa-id`** em todos os endpoints abaixo. Esta solução será substituída por um middleware de auth que faça parse do token e injete `req.empresaId`.

#### `GET /api/admin/propriedades`
Devolve as propriedades da empresa (ordenadas por `nome`).

- **Header obrigatório:** `x-empresa-id: <ObjectId>`
- **Resposta (200 OK):**
```json
{
  "propriedades": [
    { "_id": "...", "smoobu_id": "99999", "nome": "Casa Teste", "empresa_id": "...", "tempo_limpeza_minutos": 60, "ativo": true, "createdAt": "...", "updatedAt": "..." }
  ]
}
```
- **Erros:** `400` se faltar o header / for ObjectId inválido; `500` erro interno.

#### `POST /api/admin/propriedades`
Cria uma propriedade para a empresa.

- **Header obrigatório:** `x-empresa-id: <ObjectId>`
- **Body:**
```json
{
  "smoobu_id": "99999",
  "nome": "Casa Teste",
  "tempo_limpeza_minutos": 60
}
```
  - `smoobu_id` (obrigatório, único global) — ID do apartment no Smoobu.
  - `nome` (obrigatório).
  - `tempo_limpeza_minutos` (opcional, default `60`, tem de ser `>= 0`).
- **Resposta (201 Created):** `{ "propriedade": { ... } }`
- **Erros:** `400` campos em falta / `tempo_limpeza_minutos` inválido; `409` se `smoobu_id` já existir; `500` erro interno.

#### `GET /api/admin/setup`
**Bootstrap do “Cliente Zero”** — cria dados iniciais para testes (idempotente):

- 1 **Empresa** «O Meu Alojamento Local» (procura por `nome` para não duplicar).
- 1 **Utilizador Staff** «João Limpezas» (procura por `nome` + `empresa_id`).
- 1 **Propriedade** «Casa Teste» (`smoobu_id: '99999'`) (procura por `smoobu_id`).

- **Resposta (200 OK):**
```json
{
  "mensagem": "Cliente Zero criado com sucesso.",
  "empresa_id": "<ObjectId>",
  "empresa":  { "id": "...", "nome": "O Meu Alojamento Local", "plano_ativo": true, "criada": true },
  "staff":    { "id": "...", "nome": "João Limpezas", "role": "staff", "criado": true },
  "propriedade": { "id": "...", "nome": "Casa Teste", "smoobu_id": "99999", "criada": true }
}
```
- Se já existir tudo, devolve `mensagem: "Cliente Zero já existia (nada foi alterado)."` com `criada/criado: false`.
- **Uso típico:** chamar uma vez após o primeiro deploy para obter o `empresa_id`, que depois se usa no header `x-empresa-id` dos outros endpoints.

---

## 7. Deploy no Render

| Definição        | Valor                        |
|------------------|------------------------------|
| Root Directory   | `backend`                    |
| Build Command    | `npm install`                |
| Start Command    | `npm start`                  |
| Environment Vars | `MONGODB_URI` (e `PORT` opcional) |

> O Render injeta automaticamente a variável `PORT`. A aplicação lê essa variável, pelo que não é necessário defini-la manualmente.

---

## 8. Regras e convenções do projeto

- **Branch de desenvolvimento:** `dev` (todos os commits de funcionalidades vão para aqui).
- **Documentação:** sempre que o código do backend é alterado, este ficheiro (`docs/BACKEND.md`) e o `README.md` da raiz devem ser atualizados.
- **Segredos:** nenhum segredo (URIs com credenciais, tokens, etc.) deve ser commitado. Usar sempre `.env` localmente e as variáveis de ambiente do Render em produção.
- **Linguagem:** os comentários de código e a documentação são redigidos em **pt-pt**.

---

## 9. Histórico de alterações (backend)

| Data       | Versão | Alteração                                                            |
|------------|--------|---------------------------------------------------------------------|
| Inicial    | 1.0.0  | Criação da estrutura base: `package.json`, `server.js`, `.env.example`, `.gitignore`. Ligação ao MongoDB e rota de teste `GET /`. |
| v1.1.0     | 1.1.0  | Lógica central: modelos `Propriedade`, `Utilizador`, `Ausencia`, `Tarefa`; `controllers/webhookController.js` (fluxo estrito de atribuição com filtro de ausências + load balancing); `routes/webhookRoutes.js` (`POST /webhooks/smoobu`); resposta 200 imediata + processamento assíncrono; tratamento de erros robusto. |
| v1.2.0     | 1.2.0  | Painel de Administração: modelo `Empresa` (nome, nif, plano_ativo); `controllers/adminController.js` (`getPropriedades`, `criarPropriedade`, `setupClienteZero`); `routes/adminRoutes.js` (`GET/POST /api/admin/propriedades`, `GET /api/admin/setup`); montagem em `server.js`. `empresa_id` via header `x-empresa-id` (sem JWT ainda). |
