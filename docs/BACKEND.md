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
│   ├── adminController.js    # Painel de Administração + setup Cliente Zero
│   └── authController.js     # Autenticação: login (JWT) + /me
├── middleware/
│   └── auth.js               # Verifica JWT (strito), injeta req.user — sem fallback legacy
├── models/                   # Modelos Mongoose (ODM do MongoDB)
│   ├── Empresa.js            #   Entidade principal (multi-tenant)
│   ├── Propriedade.js        #   Alojamento sincronizado com o Smoobu
│   ├── Utilizador.js         #   Admin / Staff de uma empresa (email + password_hash)
│   ├── Ausencia.js           #   Indisponibilidade de Staff num dia
│   └── Tarefa.js             #   Tarefa de limpeza gerada por reserva
└── routes/
    ├── webhookRoutes.js      # POST /webhooks/smoobu
    ├── adminRoutes.js        # GET/POST /api/admin/propriedades, GET /api/admin/setup
    └── authRoutes.js         # POST /api/auth/login, GET /api/auth/me
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
Admin, Manager ou Staff de uma empresa. Credenciais de login (email + password_hash).

**Roles (hierarquia):**
- `admin` — dono da conta (gestão total: empresas, planos, utilizadores).
- `manager` — responsável de limpezas (gere equipa de staff, vê dashboard alargado, pode executar limpezas).
- `staff` — executante de limpezas (vê apenas as suas tarefas no mobile).

| Campo            | Tipo     | Notas                                                              |
|------------------|----------|--------------------------------------------------------------------|
| `nome`           | String   | Obrigatório.                                                       |
| `email`          | String   | Obrigatório, lowercase, trim, **único** (indexado). Credencial de login. |
| `password_hash`  | String   | Hash bcrypt da password (nunca a password em claro). Opcional (utilizador migrado sem password → login recusa). |
| `empresa_id`     | ObjectId | `ref: 'Empresa'`. Obrigatório, indexado.                           |
| `role`           | String   | `enum: ['admin','manager','staff']`, default `'staff'`.           |
| `responsavel_id` | ObjectId | `ref: 'Utilizador'`, default `null`. Superior hierárquico (admin/manager). O admin não tem responsavel_id (topo da hierarquia). Indexado. |
| `ativo`          | Boolean  | Default `true`. Utilizador inativo é ignorado pelo webhook e pelo login. |

> **Regras de segurança (v1.7.0):** não é possível criar/editar utilizadores com role `admin` via `/api/admin/equipa` (403). Não é possível editar/eliminar/desativar utilizadores que já sejam `admin` (403 "Não é possível modificar um administrador"). O `responsavel_id` tem de ser um admin/manager da mesma empresa (validado no backend).

### `Ausencia`
Indisponibilidade (férias/folga) de um Staff num intervalo de datas. Todas as datas são **normalizadas para meia-noite UTC**.

| Campo           | Tipo     | Notas                                                              |
|-----------------|----------|--------------------------------------------------------------------|
| `utilizador_id` | ObjectId | `ref: 'Utilizador'`. Obrigatório, indexado.                        |
| `empresa_id`    | ObjectId | `ref: 'Empresa'`. Obrigatório, indexado.                           |
| `data_inicio`   | Date     | Obrigatório, indexado. Início do intervalo (inclusive, meia-noite UTC). |
| `data_fim`      | Date     | Obrigatório, indexado. Fim do intervalo (inclusive, meia-noite UTC). |
| `tipo`          | String   | `enum: ['ferias','folga']`, default `'folga'`. Obrigatório.        |
| `notas`         | String   | Opcional. Observações livres.                                      |
| `data`          | Date     | **Retrocompatibilidade** (v1.1.0). Preenchido automaticamente com `data_inicio` no `pre('save')`. Usado pelo webhook legacy. |
| `motivo`        | String   | **Legacy** (v1.1.0). Mantido para não partir registos antigos.    |

Índice único composto `{ utilizador_id, data_inicio }` → evita duplicar o mesmo início para o mesmo utilizador. A validação de **sobreposição de intervalos** é feita no controller (mensagem clara de 409).

> **v1.8.0:** o modelo passou de dia único (`data`) para intervalos (`data_inicio`/`data_fim`) com `tipo` e `notas`. O webhook foi atualizado para verificar sobreposição de intervalos (mantém a query `data` legacy para retrocompatibilidade).

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

1. **Receber o payload** — extrai o ID da propriedade, a data de check-in e o ID da reserva do payload do Smoobu. **Mapeamento primário (estrutura oficial):** `payload.data.apartment.id`, `payload.data.arrival`, `payload.data.id`. Fallbacks com `??` para variantes (`content.*`, campos achatados).
2. **Encontrar a empresa** — procura a `Propriedade` por `smoobu_id` e obtém o respetivo `empresa_id`. Se não existir → erro (a tarefa não pode ser criada sem saber a empresa).
3. **Procurar Staff/Managers** — lista todos os `Utilizador` com `role: { $in: ['staff','manager'] }`, `ativo: true` dessa empresa. (O manager também pode executar limpezas, pelo que entra no load balancing.)
4. **Filtro de Ausências** — exclui os Staff que tenham uma `Ausencia` que cubra o dia do check-in. **v1.8.0:** verifica sobreposição de intervalos (`data_inicio <= dia AND data_fim >= dia`), mantendo também a query `data` legacy para retrocompatibilidade. Férias/folgas registadas via `/api/admin/ausencias` excluem automaticamente o staff da atribuição nesse período.
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
| `npm test`   | `jest`             | Corre os testes unitários/integração (Jest + Supertest) |

### Testes (v1.9.0)

Os testes usam **Jest** + **Supertest** e estão em `backend/tests/`.

- `tests/server.test.js` — testa o healthcheck `GET /` (status 200, mensagem, Content-Type) e rota inexistente (404).
- A instância `app` é exportada por `server.js` (`module.exports = app`) e o `app.listen` + `mongoose.connect` estão isolados dentro de `if (require.main === module)`. Isto permite que os testes importem a app **sem** iniciar o servidor HTTP nem ligar ao MongoDB (sem conflitos de portas nem dependência de BD).
- Configuração do Jest no `package.json` (`jest.testEnvironment: node`, `testMatch: **/tests/**/*.test.js`).
- Para correr: `cd backend && npm test`.

### Integração Contínua (CI) — GitHub Actions

O workflow `.github/workflows/ci.yml` corre em todos os `push` e `pull_request` nas branches `main` e `dev`, com 2 jobs paralelos em `ubuntu-latest` + Node.js 18:

1. **Frontend** — `npm ci` → `npm run lint` → `npx tsc --noEmit` → `npm run build` (na diretoria `frontend/`).
2. **Backend** — `npm ci` → `npm test` (na diretoria `backend/`).

---

## 5. Variáveis de ambiente

Definidas no ficheiro `.env` (a criar a partir de `.env.example`). **Nunca** fazer commit do `.env`.

| Variável        | Obrigatória | Descrição                                                        |
|-----------------|-------------|------------------------------------------------------------------|
| `MONGODB_URI`   | ✅ Sim       | URI de ligação ao MongoDB (local, Atlas ou add-on do Render)     |
| `PORT`          | ❌ Não        | Porta de escuta. Por defeito `5000`. No Render é injetada.       |
| `JWT_SECRET`    | ✅ Sim (prod)| Segredo para assinar/verificar JWT. Em dev tem fallback. **Gerar valor aleatório longo em produção.** |
| `JWT_EXPIRACAO` | ❌ Não        | Tempo de expiração do JWT (formato jsonwebtoken: `7d`, `12h`). Default `7d`. |

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
- **Payload esperado (estrutura OFICIAL do Smoobu — `data` + sub-objeto `apartment`):**

  | Campo lido (prioritário) | Fallbacks | Uso |
  |---|---|---|
  | `payload.data.apartment.id` | `data.apartmentId` / `data.apartment_id` / `data.propertyId` / `data.property_id` / `content.apartmentId` / `content.property_id` / `content.propriedade_id` | Identifica a propriedade no Smoobu |
  | `payload.data.arrival` | `data.check_in` / `data.checkIn` / `data.data_check_in` / `data.startDate` / `content.arrival` / `content.startDate` | Data de check-in (dia da tarefa) |
  | `payload.data.id` | `data.reservationId` / `data.reservation_id` / `content.id` / `content.reservation_id` | ID da reserva (auditoria) |
  | — | `content.tempo_limpeza_minutos` / `content.cleaning_minutes` | (Opcional) sobrepõe-se ao default da propriedade |

- **Exemplo de payload Smoobu (estrutura oficial documentada):**
```json
{
  "action": "newReservation",
  "data": {
    "id": 292,
    "arrival": "2024-07-15",
    "apartment": {
      "id": 38,
      "name": "Apartment 1"
    }
  }
}
```
- **Resultado (assíncrono):** é criado um documento `Tarefa` com `utilizador_id` preenchido (Staff com menor carga) ou `null` (sem disponíveis / erro). O resultado é registado nos logs do servidor.

### 6.1. Painel de Administração (`/api/admin`)

> **Autenticação (v1.10.0 — ESTRITA):** o middleware `auth` é aplicado **dentro de `adminRoutes.js`** apenas às rotas que precisam de proteção (`/propriedades`, `/equipa`). A rota `/setup` é **PÚBLICA** de propósito (bootstrap).
> - O middleware valida o JWT do header `Authorization: Bearer <token>` e injeta `req.user = { id, role, empresa_id }`. O `empresa_id` é lido do token.
> - **Sem token (ou token inválido/expirado) → `401`** (strito, sem fallback).
> - v1.10.0: o fallback legacy `x-empresa-id` foi **REMOVIDO**. O frontend está 100% com JWT, pelo que qualquer pedido sem token válido é recusado.

#### `GET /api/admin/propriedades`
Devolve as propriedades da empresa (ordenadas por `nome`).

- **Auth:** JWT (strito, sem fallback legacy). **Protegido.**
- **Resposta (200 OK):**
```json
{
  "propriedades": [
    { "_id": "...", "smoobu_id": "99999", "nome": "Casa Teste", "empresa_id": "...", "tempo_limpeza_minutos": 60, "ativo": true, "createdAt": "...", "updatedAt": "..." }
  ]
}
```
- **Erros:** `400` empresa_id em falta/inválido; `401` não autenticado; `500` erro interno.

#### `POST /api/admin/propriedades`
Cria uma propriedade para a empresa.

- **Auth:** JWT (strito, sem fallback legacy).
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
- **Erros:** `400` campos em falta / `tempo_limpeza_minutos` inválido; `401` não autenticado; `409` se `smoobu_id` já existir; `500` erro interno.

#### `GET /api/admin/equipa`
Lista todos os utilizadores da empresa (qualquer role), ordenados por `nome`.

- **Auth:** JWT (strito, sem fallback legacy). **Protegido.**
- **Resposta (200 OK):**
```json
{
  "utilizadores": [
    { "_id": "...", "nome": "João Limpezas", "email": "joao.limpezas@autocell.pt", "empresa_id": "...", "role": "staff", "ativo": true, "createdAt": "...", "updatedAt": "..." }
  ]
}
```
- **Nota:** a `password_hash` **nunca** é devolvida (`.select('-password_hash')`).
- **Erros:** `400` empresa_id em falta/inválido; `401` não autenticado; `500` erro interno.

#### `POST /api/admin/equipa`
Cria um novo membro de equipa (Utilizador) para a empresa.

- **Auth:** JWT (strito, sem fallback legacy). **Protegido.**
- **Body:**
```json
{
  "nome": "Maria Ferreira",
  "email": "maria.ferreira@autocell.pt",
  "password": "segredo123",
  "role": "staff"
}
```
  - `nome` (obrigatório).
  - `email` (obrigatório, único global, normalizado para lowercase).
  - `password` (obrigatória, mín. 6 caracteres — guardada como hash bcrypt, nunca em claro).
  - `role` (opcional, default `'staff'`; enum `['admin','manager','staff']`).
- **Resposta (201 Created):** `{ "utilizador": { ... } }` (sem `password_hash`).
- **Erros:** `400` campos em falta / password < 6 / role inválido; `401` não autenticado; `409` email duplicado; `500` erro interno.

#### `PUT /api/admin/equipa/:id`
Atualiza Nome, Email e/ou Role de um utilizador, e opcionalmente a password.

- **Auth:** JWT (strito, sem fallback legacy). **Protegido.**
- **Body (todos opcionais, mas pelo menos um):**
```json
{ "nome": "Maria Ferreira", "email": "maria@x.pt", "role": "manager", "password": "novapass123" }
```
  - `password`: se vier, é guardada como **nova hash bcrypt** (mín. 6 chars). Se não vier, a atual é mantida.
- **Regras de segurança:**
  - O utilizador tem de pertencer à mesma empresa do JWT (`findOne({ _id, empresa_id })`).
  - Se o email mudar, verifica unicidade global.
  - Não desativa via este endpoint (usar `PATCH /:id/estado`).
- **Resposta (200 OK):** `{ "utilizador": { ... } }` (sem `password_hash`).
- **Erros:** `400` ID inválido / nada para atualizar / password < 6 / role inválido; `401` não autenticado; `404` não encontrado / não pertence à empresa; `409` email duplicado; `500` erro.

#### `PATCH /api/admin/equipa/:id/estado`
Alterna o estado `ativo` do utilizador (ativa ↔ desativa).

- **Auth:** JWT (strito, sem fallback legacy). **Protegido.**
- **Body (opcional):** `{ "ativo": true }` — se não vier, alterna o estado atual.
- **Resposta (200 OK):** `{ "utilizador": { ... }, "ativo": boolean }`.
- **Comportamento:** um utilizador desativado **não consegue fazer login** (ver `authController.login` → 401 "Utilizador inativo").
- **Erros:** `400` ID inválido; `401` não autenticado; `404` não encontrado; `500` erro.

#### `DELETE /api/admin/equipa/:id`
Remove permanentemente o utilizador da base de dados.

- **Auth:** JWT (strito, sem fallback legacy). **Protegido.**
- **Regras de segurança:**
  - O utilizador tem de pertencer à mesma empresa do JWT.
  - **Não é possível eliminar-se a si próprio** (`req.user.id === id` → 400) — evita o admin ficar sem acesso.
- **Resposta (200 OK):** `{ "mensagem": "Utilizador \"X\" eliminado com sucesso.", "utilizador_id": "..." }`.
- **Erros:** `400` ID inválido / tentativa de auto-eliminação; `401` não autenticado; `404` não encontrado; `500` erro.

#### `GET /api/admin/setup`  *(PÚBLICO — sem auth)*
**Bootstrap do “Cliente Zero”** — cria dados iniciais para testes (idempotente):

- 1 **Empresa** «O Meu Alojamento Local» (procura por `nome`).
- 3 **Utilizadores** (procura por `email` único), cada um com `password_hash` bcrypt:
  - `admin@autocell.pt` (admin — dono da conta)
  - `manager@autocell.pt` (manager — responsável de limpezas)
  - `joao.limpezas@autocell.pt` (staff — executante de limpezas)
- 1 **Propriedade** «Casa Teste» (`smoobu_id: '99999'`).

- **Resposta (200 OK):**
```json
{
  "mensagem": "Cliente Zero criado com sucesso.",
  "empresa_id": "<ObjectId>",
  "empresa":  { "id": "...", "nome": "O Meu Alojamento Local", "plano_ativo": true, "criada": true },
  "utilizadores": [
    { "id": "...", "nome": "Gestor Autocell", "email": "admin@autocell.pt", "role": "admin", "criado": true, "password_definida": true, "credenciais_teste": { "email": "admin@autocell.pt", "password": "autocell123" } },
    { "id": "...", "nome": "Responsável Limpezas", "email": "manager@autocell.pt", "role": "manager", "criado": true, "password_definida": true, "credenciais_teste": { "email": "manager@autocell.pt", "password": "autocell123" } },
    { "id": "...", "nome": "João Limpezas", "email": "joao.limpezas@autocell.pt", "role": "staff", "criado": true, "password_definida": true, "credenciais_teste": { "email": "joao.limpezas@autocell.pt", "password": "autocell123" } }
  ],
  "propriedade": { "id": "...", "nome": "Casa Teste", "smoobu_id": "99999", "criada": true }
}
```
- Se já existir tudo, devolve `mensagem: "Cliente Zero já existia (nada foi alterado)."` com `criada/criado: false`.
- **Retrocompatibilidade:** se um utilizador já existir sem `password_hash` (criado antes do auth), o setup define-lhe a password e garante o role correto.
- **Credenciais de teste (3 contas):** `admin@autocell.pt`, `manager@autocell.pt`, `joao.limpezas@autocell.pt` — todas com password `autocell123` (remover em produção).

### 6.2. Autenticação (`/api/auth`)

#### `POST /api/auth/login` (público)
Login com email + password. Valida a hash bcrypt e devolve um JWT.

- **Body:**
```json
{ "email": "joao.limpezas@autocell.pt", "password": "autocell123" }
```
- **Resposta (200 OK):**
```json
{
  "token": "<jwt>",
  "utilizador": {
    "id": "...",
    "nome": "João Limpezas",
    "email": "joao.limpezas@autocell.pt",
    "role": "staff",
    "empresa_id": "..."
  }
}
```
- **JWT payload:** `{ id, role, empresa_id }` assinado com `JWT_SECRET`, expira em `JWT_EXPIRACAO` (default `7d`).
- **Erros:** `400` email/password em falta; `401` credenciais inválidas / utilizador inativo / sem password definida; `500` erro interno.

#### `GET /api/auth/me` (requer JWT)
Devolve os dados do utilizador autenticado (a partir do token).

- **Header:** `Authorization: Bearer <token>`
- **Resposta (200 OK):** `{ "utilizador": { id, nome, email, role, empresa_id } }`
- **Erros:** `401` não autenticado / token inválido; `404` utilizador não encontrado; `500` erro interno.

### 6.3. Ausências — Folgas e Férias (`/api/admin/ausencias`)

> **Auth:** JWT (strito, sem fallback legacy). Todas as rotas **protegidas** por `auth`.

#### `GET /api/admin/ausencias`
Lista as ausências da empresa, com o utilizador populado.

- **Query param opcional:** `?futuras=true` — só ausências com `data_fim >= hoje` (úteis para o calendário).
- **Resposta (200 OK):**
```json
{
  "ausencias": [
    {
      "_id": "...",
      "utilizador_id": "...",
      "utilizador": { "_id": "...", "nome": "João Limpezas", "email": "...", "role": "staff" },
      "empresa_id": "...",
      "data_inicio": "2024-07-15T00:00:00.000Z",
      "data_fim": "2024-07-20T00:00:00.000Z",
      "tipo": "ferias",
      "notas": "férias pagas"
    }
  ]
}
```

#### `POST /api/admin/ausencias`
Regista uma nova ausência (folga ou férias).

- **Body:**
```json
{
  "utilizador_id": "...",
  "data_inicio": "2024-07-15",
  "data_fim": "2024-07-20",
  "tipo": "ferias",
  "notas": "férias pagas"
}
```
  - `utilizador_id` (obrigatório) — tem de ser staff/manager da empresa (não admin).
  - `data_inicio` / `data_fim` (obrigatórias) — `data_fim >= data_inicio`.
  - `tipo` (opcional, default `'folga'`) — `enum: ['ferias','folga']`.
  - `notas` (opcional).
- **Validações:**
  - Utilizador existe e pertence à empresa com role staff/manager.
  - **Sem sobreposição** com outra ausência do mesmo utilizador (409 se houver).
- **Resposta (201 Created):** `{ "ausencia": { ... } }` (com utilizador populado).
- **Erros:** `400` campos em falta / datas inválidas / utilizador não encontrado; `409` sobreposição; `500` erro.

#### `DELETE /api/admin/ausencias/:id`
Elimina uma ausência.

- **Regras:** a ausência tem de pertencer à empresa do JWT.
- **Resposta (200 OK):** `{ "mensagem": "Ausência eliminada com sucesso.", "ausencia_id": "..." }`.
- **Erros:** `400` ID inválido; `404` não encontrada; `500` erro.

> **Integração com o webhook:** as ausências registadas aqui são consultadas automaticamente pelo `webhookController` (passo 4 do fluxo de atribuição) para excluir staff indisponível da atribuição automática de tarefas.

---

## 7. Deploy no Render

| Definição        | Valor                        |
|------------------|------------------------------|
| Root Directory   | `backend`                    |
| Build Command    | `npm install`                |
| Start Command    | `npm start`                  |
| Environment Vars | `MONGODB_URI`, `JWT_SECRET`, `JWT_EXPIRACAO` (e `PORT` opcional) |

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
| v1.3.0     | 1.3.0  | **Autenticação JWT:** dependências `jsonwebtoken` + `bcryptjs`; modelo `Utilizador` com `email` único + `password_hash`; `middleware/auth.js` (verifica JWT, injeta `req.user`, fallback legacy `x-empresa-id`); `controllers/authController.js` (`login` com bcrypt + JWT, `/me`); `routes/authRoutes.js` (`POST /api/auth/login`, `GET /api/auth/me`); `/api/admin` protegido por `auth` com `empresa_id` do token; `setupClienteZero` cria Staff com `password_hash` (`joao.limpezas@autocell.pt` / `autocell123`); `.env.example` com `JWT_SECRET` + `JWT_EXPIRACAO`. |
| v1.3.1     | 1.3.1  | **Fix bootstrap:** o `auth` deixou de ser aplicado a todo `/api/admin` e passou a ser aplicado apenas às rotas `/propriedades` (dentro de `adminRoutes.js`). A rota `/api/admin/setup` voltou a ser **PÚBLICA** (era o endpoint de bootstrap que criava o primeiro utilizador — não podia exigir token). Corrige o erro `401 Autenticação obrigatória` ao chamar `/setup`. |
| v1.4.0     | 1.4.0  | **Novo role `manager`:** modelo `Utilizador` enum `['admin','manager','staff']`; `webhookController` inclui managers na atribuição de tarefas (load balancing); `setupClienteZero` cria 3 utilizadores (admin `admin@autocell.pt` + manager `manager@autocell.pt` + staff `joao.limpezas@autocell.pt`, todos com password `autocell123`). |
| v1.4.1     | 1.4.1  | **Payload Smoobu oficial:** `extrairDadosReserva` atualizada para a estrutura documentada (`{ action, data: { id, arrival, apartment: { id, name } } }`). Mapeamento primário: `payload.data.apartment.id`, `payload.data.arrival`, `payload.data.id`. Fallbacks `??` mantidos para variantes (`content.*`, campos achatados). |
| v1.5.0     | 1.5.0  | **Gestão de Equipa:** `adminController` com `getEquipa` (lista utilizadores, `.select('-password_hash')`) e `criarMembroEquipa` (valida nome/email/password/role, hash bcrypt, email único); `adminRoutes` com `GET/POST /api/admin/equipa` (protegidos por `auth`). |
| v1.6.0     | 1.6.0  | **CRUD completo de Utilizadores:** `adminController` com `atualizarMembroEquipa` (PUT — nome/email/role/password opcional com nova hash bcrypt), `alternarEstadoMembro` (PATCH — ativa/desativa, inativos não fazem login), `eliminarMembroEquipa` (DELETE — não permite auto-eliminação); `adminRoutes` com `PUT/PATCH/DELETE /api/admin/equipa/:id` (protegidos por `auth`). Validação de pertença à empresa em todas as operações. |
| v1.7.0     | 1.7.0  | **Segurança hierárquica + `responsavel_id`:** modelo `Utilizador` com campo `responsavel_id` (ObjectId ref Utilizador, superior hierárquico); `getEquipa` faz `populate('responsavel_id')` e devolve campo `responsavel` preenchido; regras 403 em criar/editar (bloqueia role `admin`), editar/eliminar/desativar (bloqueia se alvo é `admin`); `responsavel_id` validado (admin/manager da mesma empresa, não pode ser si próprio). |
| v1.8.0     | 1.8.0  | **Sistema de Folgas e Férias:** modelo `Ausencia` expandido para intervalos (`data_inicio`/`data_fim`/`tipo`/`notas`, com `data` retrocompatível via `pre('save')`); `controllers/ausenciaController.js` (`listarAusencias` com `?futuras=true` + populate, `registarAusencia` com validação de sobreposição, `eliminarAusencia`); `routes/ausenciaRoutes.js` (`GET/POST/DELETE /api/admin/ausencias`); `webhookController` atualizado para excluir staff com ausência no intervalo (sobreposição `data_inicio <= dia AND data_fim >= dia` + query `data` legacy). |
| v1.9.0     | 1.9.0  | **Testes + CI:** dependências dev `jest` + `supertest`; script `npm test`; `tests/server.test.js` (healthcheck GET / → 200 + mensagem, rota inexistente → 404); `server.js` refactorizado para exportar `app` (`module.exports = app`) e isolar `app.listen` + `mongoose.connect` em `if (require.main === module)` (permite testes sem BD/porta); workflow GitHub Actions `.github/workflows/ci.yml` (2 jobs paralelos: frontend lint+tsc+build, backend test). |
| v1.10.0    | 1.10.0 | **Remoção do fallback legacy `x-empresa-id`:** `middleware/auth.js` agora é **ESTRITO** — só aceita JWT válido, sem token → 401 (sem fallback). `adminController` + `ausenciaController`: helper `extrairEmpresaId` (com fallback) substituído por `obterEmpresaId` (lê apenas `req.user.empresa_id` do JWT). Frontend `lib/api.ts`: removido `EMPRESA_ID` e fallback `x-empresa-id` do `adminHeaders` — se não houver token, não envia header (backend devolve 401). Proteção de rotas (middleware.ts + RouteGuard) já garante que só utilizadores autenticados chegam às páginas privadas. |
