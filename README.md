# Autocell

**SaaS de gestão para Alojamento Local.**

O Autocell é uma aplicação dividida em duas partes:

- **`backend/`** — API REST construída em **Node.js + Express**, com base de dados **MongoDB** (via Mongoose). A API está desenhada para ser alojada no [Render](https://render.com).
- **`frontend/`** — Interface de utilizador em **Next.js 14 + TypeScript + Tailwind CSS + shadcn/ui**, com duas áreas: Painel de Administração (`/admin`) e Área do Staff (`/staff`). Desenhada para a [Vercel](https://vercel.com), comunica com a API via CORS. *(Fase atual: dados fictícios/mock.)*

> 📌 Repositório: https://github.com/makigero-lab/Autocell
> 🌿 Branch de desenvolvimento ativa: **`dev`**

---

## Estrutura do repositório

```
Autocell/
├── backend/        # API REST (Node.js + Express + MongoDB)
│   ├── package.json
│   ├── server.js
│   ├── controllers/webhookController.js
│   ├── models/ (Propriedade, Utilizador, Ausencia, Tarefa)
│   ├── routes/webhookRoutes.js
│   ├── .env.example
│   └── .gitignore
├── frontend/       # Interface (Next.js 14 + TS + Tailwind + shadcn/ui)
│   ├── package.json
│   ├── src/app/        # Rotas: /, /admin/*, /staff
│   ├── src/components/ # ui (shadcn) + admin + staff
│   └── src/lib/        # utils + mock-data
├── docs/           # Documentação técnica do projeto
│   ├── BACKEND.md
│   └── FRONTEND.md
└── README.md
```

---

## Backend

### Pré-requisitos
- Node.js **18 ou superior**
- Uma instância do **MongoDB** (local, MongoDB Atlas ou um add-on do Render)

### Instalação e execução local

```bash
cd backend
npm install
cp .env.example .env      # preenche MONGODB_URI e PORT no .env
npm run dev               # desenvolvimento (com reinício automático)
# ou
npm start                 # produção
```

A API arranca na porta definida em `PORT` (por defeito **5000**).

### Variáveis de ambiente

| Variável      | Descrição                                      | Exemplo                                   |
|---------------|------------------------------------------------|-------------------------------------------|
| `MONGODB_URI` | URI de ligação ao MongoDB                       | `mongodb://localhost:27017/autocell`      |
| `PORT`        | Porta onde a API escuta (no Render é injetada) | `5000`                                    |

### Endpoints disponíveis

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET`  | `/`  | Healthcheck. Devolve `{ "status": "API do Alojamento Local online e ligada à BD!" }` |
| `POST` | `/webhooks/smoobu` | Webhook do Smoobu (nova reserva). Cria a Tarefa de limpeza aplicando filtro de ausências + load balancing. Responde `200` imediato e processa de forma assíncrona. |

> Detalhes completos da lógica de atribuição (regras de negócio) em [`docs/BACKEND.md`](docs/BACKEND.md#32-lógica-central--atribuição-de-tarefas-webhook-smoobu).

### Deploy no Render
1. Cria um novo serviço **Web Service** apontando para a pasta `backend/`.
2. **Build Command:** `npm install`
3. **Start Command:** `npm start` (executa `node server.js`)
4. Adiciona as variáveis de ambiente `MONGODB_URI` (e opcionalmente `PORT`).
5. O Render injeta automaticamente a variável `PORT`; a aplicação respeita esse valor.

---

## Frontend

### Pré-requisitos
- Node.js **18 ou superior**

### Instalação e execução local

```bash
cd frontend
npm install
npm run dev          # http://localhost:3000
```

Abrir http://localhost:3000 → landing page com links para `/admin` e `/staff`.

### Rotas

| Rota | Área | Descrição |
|------|------|-----------|
| `/` | — | Landing page (escolha Admin / Staff) |
| `/admin` | Admin (desktop-first) | Dashboard com sidebar (Dashboard, Propriedades, Equipa, Calendário de Folgas) |
| `/admin/propriedades` | Admin | Placeholder (Propriedades) |
| `/admin/equipa` | Admin | Placeholder (Equipa) |
| `/admin/calendario` | Admin | Placeholder (Calendário de Folgas) |
| `/staff` | Staff (mobile-first) | Cabeçalho "Bem-vindo, [Nome]" + lista de cartões de tarefas de limpeza do dia |

> Nesta fase, o frontend usa **dados fictícios (mock data)** — sem ligação à API.

### Variáveis de ambiente

| Variável | Descrição | Exemplo |
|-----------|-----------|---------|
| `NEXT_PUBLIC_API_URL` | URL base da API backend (Render). Usada na fase de integração. | `https://autocell-backend.onrender.com` |

### Deploy na Vercel
1. Importa o repositório e define **Root Directory** = `frontend`.
2. Framework Preset: **Next.js** (detetado automaticamente).
3. Adiciona a variável de ambiente `NEXT_PUBLIC_API_URL`.

---

## Documentação

- [📚 Documentação técnica do Backend](docs/BACKEND.md)
- [🎨 Documentação técnica do Frontend](docs/FRONTEND.md)

---

## Notas de desenvolvimento
- Todo o desenvolvimento decorre na branch **`dev`**.
- Sempre que o código é alterado, a documentação (este `README.md` e a pasta `docs/`) é atualizada em conformidade.
- Histórico de evolução técnica disponível no worklog interno do projeto.
