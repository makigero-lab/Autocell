# Documentação Técnica — Frontend (Autocell)

Interface web do SaaS de gestão para Alojamento Local, construída com **Next.js 14 (App Router)**, **TypeScript**, **Tailwind CSS** e componentes **shadcn/ui** (estilo *New York*).

> Nesta fase, o frontend usa **dados fictícios (mock data)** — sem ligação à API. O objetivo é validar design, layout e comportamento responsivo.

---

## 1. Stack tecnológica

| Camada          | Tecnologia        | Função                                                         |
|-----------------|-------------------|----------------------------------------------------------------|
| Framework       | Next.js 14.2.x    | App Router, SSR/SSG, rotas por ficheiro                        |
| Linguagem       | TypeScript 5      | Tipagem estática                                               |
| Estilos         | Tailwind CSS 3.4  | Utilitários CSS + design tokens via CSS variables             |
| Componentes UI  | shadcn/ui         | Componentes base (Button, Card, Badge, Avatar, Separator)     |
| Ícones          | lucide-react      | Conjunto de ícones SVG                                         |
| Utilitários     | clsx, tailwind-merge, class-variance-authority | Combinação de classes + variantes |

> **Nota sobre dependências:** os componentes shadcn foram criados **sem Radix UI** (exceto onde estritamente necessário), de forma a manter o número de dependências mínimo. O `Button` usa `asChild={false}` nativo.

---

## 2. Estrutura de ficheiros

```
frontend/
├── package.json              # Dependências e scripts
├── next.config.mjs           # Configuração do Next.js
├── tsconfig.json             # Configuração TypeScript (paths @/*)
├── tailwind.config.ts        # Tema Tailwind + cores shadcn
├── postcss.config.mjs        # PostCSS (Tailwind + Autoprefixer)
├── components.json           # Configuração shadcn/ui (estilo new-york)
├── .env.example              # Modelo de variáveis de ambiente
├── .gitignore
└── src/
    ├── middleware.ts          # Proteção de rotas (Edge): /admin/** e /staff/** exigem token; / e /login redirecionam autenticados
    ├── app/
    │   ├── globals.css       # Variáveis CSS do tema premium (azul marinho) — light/dark
    │   ├── layout.tsx        # Layout root (fonte Inter, lang pt-PT)
    │   ├── page.tsx          # Landing page premium (1 botão 'Entrar na Plataforma' → /login)
    │   ├── login/
    │   │   └── page.tsx      # Ecrã de Login (POST /api/auth/login, redirect por role / ?from=)
    │   ├── admin/
    │   │   ├── layout.tsx    # Layout admin + RouteGuard (role admin)
    │   │   ├── page.tsx      # Dashboard (estatísticas, tarefas, equipa)
    │   │   ├── propriedades/page.tsx   # Consome API real (GET/POST)
    │   │   ├── equipa/page.tsx         # Placeholder
    │   │   └── calendario/page.tsx     # Placeholder
    │   ├── manager/
    │   │   ├── layout.tsx    # Layout manager + RouteGuard (role manager)
    │   │   ├── page.tsx      # Dashboard do responsável (tarefas + equipa)
    │   │   ├── tarefas/page.tsx        # Placeholder
    │   │   └── equipa/page.tsx          # Placeholder
    │   └── staff/
    │       ├── layout.tsx    # Layout staff + RouteGuard (role staff)
    │       ├── page.tsx      # Área do Staff (mobile-first)
    │       └── tarefas/[id]/page.tsx  # Detalhe da Tarefa (checklist + concluir)
    ├── components/
    │   ├── ui/               # shadcn: button, card, badge, avatar, separator, checkbox, textarea, input
    │   ├── admin/
    │   │   ├── admin-sidebar.tsx    # Sidebar responsiva (desktop fixa / mobile overlay)
    │   │   └── placeholder-page.tsx # Componente de página "Em breve"
    │   ├── auth/
    │   │   └── route-guard.tsx      # Camada client-side de proteção (valida token + role)
    │   ├── manager/
    │   │   └── manager-sidebar.tsx  # Sidebar do responsável de limpezas
    │   └── staff/
    │       ├── task-card.tsx             # Cartão de tarefa (link para detalhe)
    │       └── detalhe-tarefa-client.tsx # Ecrã de detalhe (estado interativo)
    └── lib/
        ├── utils.ts          # cn() — clsx + tailwind-merge
        ├── api.ts             # Helpers de fetch (adminGet/adminPost) com Authorization Bearer
        ├── auth.ts            # Gestão do token JWT em **cookie** (middleware lê) + ler user do payload
        └── mock-data.ts      # Dados fictícios (ainda usados em /staff e dashboard)
```

---

## 3. Sistema de rotas

A aplicação tem **três áreas privadas** (cada uma com layout próprio), uma página de login e uma landing page pública — todas com proteção de rotas (ver secção 12):

| Rota            | Descrição                                          | Abordagem         |
|-----------------|----------------------------------------------------|-------------------|
| `/`             | Landing premium — 1 botão 'Entrar na Plataforma' → `/login` | — |
| `/login`        | **Login** (POST /api/auth/login; redirect por role / `?from=`) | Centrado, premium |
| `/admin`        | Painel de Administração (Dashboard) — **protegido** (role admin) | Desktop-first |
| `/admin/propriedades` | **Consome API real** (GET/POST propriedades) | Desktop-first |
| `/admin/equipa`       | Placeholder (Equipa)                         | Desktop-first |
| `/admin/calendario`   | Placeholder (Calendário de Folgas)           | Desktop-first |
| `/manager`      | Painel do Responsável de Limpezas — **protegido** (role manager) | Desktop-first |
| `/manager/tarefas`    | Placeholder (Tarefas)                        | Desktop-first |
| `/manager/equipa`     | Placeholder (Equipa)                         | Desktop-first |
| `/staff`        | Área do Staff — tarefas de limpeza do dia — **protegida** (role staff) | Mobile-first |
| `/staff/tarefas/[id]` | Detalhe da Tarefa (checklist + concluir)      | Mobile-first |

### 3.1 Área Admin (`/admin`)

- **Barra lateral** (`admin-sidebar.tsx`) com 4 itens: **Dashboard**, **Propriedades**, **Equipa**, **Calendário de Folgas**.
  - Desktop (`lg+`): sidebar fixa à esquerda, sempre visível.
  - Mobile: colapsada; abre como **overlay** ao tocar no botão de menu (hambúrguer).
  - Item ativo destacado com cor primária (emerald).
- **Dashboard** (`/admin`): cartões de estatística (Propriedades, Staff ativo, Tarefas hoje, Por atribuir), lista de tarefas do dia e estado da equipa com carga de trabalho.
- **Propriedades** (`/admin/propriedades`): **ecrã real que consome a API** (ver secção 6).
- Secções **Equipa** e **Calendário de Folgas**: páginas placeholder ("Em breve") — apenas layout visual.

### 3.2 Área Staff (`/staff`)

- **Mobile-first**: container com largura máxima `max-w-md` centrado.
- **Cabeçalho fixo** com:
  - Avatar (iniciais do nome)
  - Mensagem "Bem-vindo, [Nome]"
  - Data de hoje (formato pt-PT) e resumo (nº de tarefas + tempo total)
- **Lista de cartões** (`task-card.tsx`), cada um representando uma **Tarefa de Limpeza do dia** com:
  - Nome da propriedade
  - Tipo (ícone + label: Limpeza / Check-in / Check-out / Manutenção)
  - **Hora limite**
  - **Estimativa de tempo** (minutos → formato `XhYY`)
  - Endereço (opcional)
  - Estado (Atribuída / Por atribuir) com badge colorido
  - Botão "Iniciar tarefa" → abre o **Detalhe da Tarefa** (`/staff/tarefas/[id]`). Em tarefas "Por atribuir" o botão fica desativado.
- **Rodapé** fixo com identidade "Autocell · Área do Staff".

### 3.3 Ecrã de Detalhe da Tarefa (`/staff/tarefas/[id]`)

Ecrã mobile-first apresentado quando o Staff clica num cartão de tarefa atribuída.

- **Cabeçalho fixo** com:
  - Link "Voltar" para `/staff`
  - Ícone do tipo de tarefa + **nome da propriedade no topo** + label do tipo
  - Metadados rápidos: hora limite, estimativa e endereço
- **Checklist interativa** (gerada a partir de um array `string[]`):
  - Cada item tem uma **checkbox** controlada por React State (`itensMarcados[]`).
  - Badge com contador `{concluídos}/{total}` e barra de progresso visual.
  - Itens marcados ficam riscados e com fundo esverdeado.
- **Campo de texto (textarea)** opcional "Observações ou Problemas" com contador de caracteres (máx. 500).
- **Botão grande "Concluir Tarefa"** fixo no fundo do ecrã.

#### Regra de Negócio Visual (implementada com React State)
> O botão **"Concluir Tarefa" está `disabled`** até que **todas as checkboxes** da checklist estejam marcadas (`todasMarcadas = itensConcluidos === total && total > 0`).
>
> Enquanto não estão todas marcadas, o botão mostra o progresso `Concluir Tarefa (X/Y)` e uma legenda explicativa por baixo. Quando todas estão marcadas, o botão fica ativo (cor primária + ícone de confirmação) e, ao clicar, mostra "Tarefa concluída!" e volta para a lista de tarefas.

#### Arquitetura
- `app/staff/tarefas/[id]/page.tsx` — **Server Component**: valida o `id` contra o mock data (`getTarefaPorId`), resolve a checklist (a da tarefa ou a por defeito) e passa ao Client Component. Se o id não existir → `notFound()`.
- `components/staff/detalhe-tarefa-client.tsx` — **Client Component** (`"use client"`): gere o estado (`itensMarcados`, `observacoes`, `concluida`) e aplica a regra de negócio visual.

---

## 4. Tema visual

### Rebranding Premium (v1.3.0)
Inspirado em sites corporativos de Property Management de alto nível (ex.: all2gether). Estética sóbria, "sharp", luxuosa.

- **Cor primária:** Azul Marinho Premium (`hsl(222 47% 11%)` ≈ Tailwind `blue-950`) — sóbrio, forte, profissional. (Anterior: emerald-600 — abandonado.)
- **Fundos:**
  - Light: branco neve (`#fff`) para fundos principais; `zinc-50` (`hsl(240 5% 96%)`) para secções secundárias (muted/secondary/accent).
  - Dark: `blue-950` como fundo; `primary` ajustado para `blue-500` (mais visível).
- **Border-radius global:** `0.3rem` (reduzido de `0.5rem`) — visual mais sério e "sharp" em botões e cartões.
- **Borders/sombras:** muito discretos (hairline). `Card` usa `border-border/60` + `shadow-sm`; `Button` default usa `shadow-sm` com `hover:shadow-md` (elevação subtil no hover).
- **Estilo shadcn:** *New York*, base color *zinc*, com CSS variables (suporte light/dark).
- **Tipografia:** Inter (via `next/font/google`); pesos `font-light` (corpo) e `font-semibold` (títulos) para hierarquia premium.
- **Landing page (`/`):** fundo limpo (sem gradiente), padrão de pontos subtil em radial-gradient, marca minimalista, cartões com `hover:-translate-y-0.5` (elevação) e ícones que mudam de cor no hover.
- **Responsividade:** mobile-first em toda a aplicação; breakpoints Tailwind (`sm`, `lg`, `xl`).
- **Acessibilidade:** alvos táteis ≥ 44px, `aria-label` nos botões de menu, semântica HTML (`header`, `main`, `footer`, `nav`).

---

## 5. Dados fictícios (Mock Data)

Definidos em `src/lib/mock-data.ts`. A estrutura **espelha os modelos do backend** para facilitar a integração futura:

| Tipo TS              | Modelo backend correspondente     |
|----------------------|-----------------------------------|
| `PropriedadeMock`    | `backend/models/Propriedade.js`   |
| `MembroEquipaMock`   | `backend/models/Utilizador.js`    |
| `TarefaMock`         | `backend/models/Tarefa.js`        |

Inclui: `staffAtual` (utilizador staff simulado), `tarefasHoje` (4 tarefas, cada uma com `checklist: string[]`), `equipa` (4 membros), `propriedades` (4 alojamentos), `resumoDashboard` (estatísticas agregadas), `checklistPorDefeito` (fallback) e o helper `getTarefaPorId(id)` (usado no ecrã de detalhe).

> Quando a ligação à API for ativada, basta substituir as importações de `mock-data.ts` por chamadas `fetch` aos endpoints do backend (mesmos campos).

---

## 6. Variáveis de ambiente

Definidas em `.env.example` (copiar para `.env.local`). Nesta fase (mock) não são obrigatórias.

| Variável             | Descrição                                              |
|----------------------|--------------------------------------------------------|
| `NEXT_PUBLIC_API_URL`| URL base da API backend (Render). Usada na fase de integração. |

---

## 7. Scripts disponíveis

| Script         | Comando        | Descrição                                  |
|----------------|----------------|--------------------------------------------|
| `npm run dev`  | `next dev`     | Servidor de desenvolvimento (porta 3000)   |
| `npm run build`| `next build`   | Build de produção                          |
| `npm start`    | `next start`   | Servidor de produção                       |
| `npm run lint` | `next lint`    | ESLint                                     |

---

## 8. Instalação e execução local

```bash
cd frontend
npm install
npm run dev          # http://localhost:3000
```

Abrir http://localhost:3000 → landing page com links para `/admin` e `/staff`.

---

## 9. Deploy na Vercel

### ⚠️ Definições obrigatórias no Vercel

Para evitar o erro `No Output Directory named "public" found`, é **obrigatório** configurar:

| Definição (Project Settings) | Valor                          | Notas                                                            |
|------------------------------|--------------------------------|------------------------------------------------------------------|
| **Root Directory**           | `frontend`                     | O `package.json` do Next.js está em `frontend/`, não na raiz do repo. |
| **Framework Preset**         | **Next.js**                    | Se não for detetado automaticamente, selecionar manualmente.     |
| Build Command                | `next build` *(auto)*          | Deixar o auto quando Framework = Next.js.                        |
| Output Directory             | `.next` *(auto)*               | **Não** definir como `public` — `public` é só para assets estáticos. |
| Install Command              | `npm install` *(auto)*         |                                                                  |
| Environment Variables        | `NEXT_PUBLIC_API_URL`          | URL do backend no Render (ex.: `https://autocell-backend.onrender.com`). |

> **Causa do erro `public`:** quando o Vercel não reconhece o projeto como Next.js, assume o preset "Other" (site estático) e procura a pasta `public/` como output. A correção é garantir que o **Framework Preset = Next.js** e que o **Root Directory = `frontend`**.

### `frontend/vercel.json` (rede de segurança)

Para garantir que o Vercel trata o projeto como Next.js — mesmo que a auto-deteção falhe —, o repositório inclui `frontend/vercel.json`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs"
}
```

Isto força o framework para `nextjs`, pelo que o output directory passa a `.next` e o build command a `next build` automaticamente. **Este ficheiro só é lido se o Root Directory estiver definido como `frontend`.**

### Passos para (re)configurar um projeto já criado no Vercel
1. Vercel → Project → **Settings** → **General**.
2. **Root Directory** → `frontend` → Save.
3. **Settings → Build & Development Settings** → confirmar que o **Framework Preset = Next.js** (se estiver "Other", o build falha com o erro `public`). Se necessário, override e selecionar Next.js.
4. **Settings → Environment Variables** → adicionar `NEXT_PUBLIC_API_URL`.
5. **Deployments** → Redeploy.

---

## 10. Regras e convenções

- **Branch de desenvolvimento:** `dev`.
- **Documentação:** sempre que o frontend é alterado, este ficheiro e o `README.md` são atualizados.
- **Linguagem:** interface e comentários em **pt-pt**.
- **Integração com a API:** `/admin/propriedades` consome a API real com **JWT** (v1.3.0); `/login` faz autenticação; as restantes secções (`/staff`, dashboard) ainda usam `mock-data.ts`.

---

## 11. Autenticação e Integração com a API backend

### `src/lib/auth.ts` — Gestão do token JWT
- `guardarToken(token)` / `lerToken()` / `removerToken()` — token guardado em `localStorage` (chave `autocell_token`).
- `lerUtilizadorDoToken()` — descodifica o payload JWT (base64url) **sem verificar assinatura** (isso é responsabilidade do backend); devolve `{ id, role, empresa_id }` ou `null` se inválido/expirado.
- `estaAutenticado()` — true se houver token válido.
- `rotaPorRole(role)` — devolve `/admin` para admin, `/staff` para staff (usado no redirect pós-login).

### `src/lib/api.ts` — Helpers de fetch
- `API_URL` — lê `process.env.NEXT_PUBLIC_API_URL`.
- `adminHeaders()` — inclui `Authorization: Bearer <token>` **se houver token** no localStorage; senão, envia o header legacy `x-empresa-id` (fallback de transição).
- `adminGet(path)` / `adminPost(path, body)` — wrappers de `fetch` com tratamento de erros. Em `401`, removem o token (força novo login).
- `LoginResponse` — tipo da resposta de `POST /api/auth/login`.

### `/login` (Client Component)
Ecrã minimalista premium centrado:
- Formulário com **Email** + **Password** + botão **Entrar** (design premium: azul marinho, padrão de pontos de fundo, marca "A").
- Ao submeter: `POST /api/auth/login` (sem auth header — endpoint público).
- Em caso de sucesso: `guardarToken(token)` + `router.push(rotaPorRole(role))` → **admin → `/admin`**, **staff → `/staff`**.
- Estados: loading (spinner), erro (cartão vermelho com a mensagem do backend).

### `/admin/propriedades` (Client Component)
Primeiro ecrã a consumir a API real (mock-data abandonado nesta secção):

- `useEffect` chama `adminGet('/api/admin/propriedades')` ao montar.
- Apresenta as propriedades numa **tabela HTML** (Tailwind) com colunas **Nome**, **Smoobu ID**, **Tempo de Limpeza**, **Estado**.
- Estados visuais: loading (spinner), erro (cartão vermelho com “Tentar novamente”), vazio (call-to-action).
- Botão **“Nova Propriedade”** no topo → abre formulário **inline** (Card) com campos **Nome**, **Smoobu ID**, **Tempo de Limpeza**.
- Ao submeter: `adminPost('/api/admin/propriedades', { ... })`, limpa o formulário e volta a chamar `carregar()` para atualizar a tabela automaticamente.
- Validações no cliente: Nome e Smoobu ID obrigatórios; Tempo de Limpeza numérico `>= 0`.

---

## 12. Proteção de Rotas (v1.5.0)

A proteção de rotas usa **duas camadas complementares**:

### 12.1 `src/middleware.ts` (camada servidor / Edge)
Executado antes de renderizar qualquer página. Lê o cookie `autocell_token` (definido por `lib/auth.ts` após login):

- **Rotas privadas** (`/admin/*`, `/manager/*`, `/staff/*`):
  - Sem token (ou token inválido/expirado) → redireciona para `/login?from=<rota>` (preserva a rota pretendida).
  - Token válido mas role errado (ex.: staff tenta aceder a `/admin`) → redireciona para o painel do role.
  - Token válido + role certo → deixa passar.
- **Rotas públicas para autenticados** (`/`, `/login`):
  - Com token válido → redireciona para o painel do role (`/admin`, `/manager` ou `/staff`).
  - Sem token → deixa passar (mostra landing/login).
- `matcher`: `/`, `/login`, `/admin/:path*`, `/manager/:path*`, `/staff/:path*` (ignora `_next`, `api`, estáticos).
- **Não verifica a assinatura** do JWT (seria arriscado no Edge); valida apenas formato + `exp`. A verificação real é feita pelo backend em cada pedido à API.

### 12.2 `components/auth/route-guard.tsx` (camada client-side)
Client Component aplicado nos layouts de `/admin`, `/manager` e `/staff` (envolve o conteúdo). Segunda camada de defesa:

- Re-valida o token no client (`lerUtilizadorDoToken` — descodifica e verifica `exp`).
- Confirma que o `role` do utilizador corresponde ao role da área.
- Mostra um **spinner** enquanto valida (evita flash de conteúdo protegido).
- Se falhar → `router.replace('/login')`.

### 12.3 `lib/auth.ts` — token em cookie (necessário para middleware)
O token passou a ser guardado num **cookie** (`autocell_token`, SameSite=Lax, 7 dias) em vez de localStorage, porque o `middleware.ts` (Edge) só consegue ler cookies, não localStorage. Mantém-se localStorage como backup. Funções: `guardarToken`, `lerToken`, `removerToken`, `lerUtilizadorDoToken`, `estaAutenticado`, `rotaPorRole`.

### 12.4 Fluxo de redirecionamento pós-login
- Login com sucesso → `guardarToken(token)` (define cookie) → redirect para `?from=` (se vier de rota protegida) ou `rotaPorRole(role)`.
- `rotaPorRole`: admin → `/admin`, manager → `/manager`, staff → `/staff`.
- Se um utilizador autenticado aceder a `/login` ou `/` → middleware redireciona para o painel.

### 12.5 Área `/manager` (Responsável de Limpezas) — v1.6.0
Nova área privada (role `manager`) com sidebar própria (Dashboard, Tarefas, Equipa). Dashboard mostra tarefas do dia + estado da equipa operacional (staff + managers com carga de trabalho). Sub-rotas `/manager/tarefas` e `/manager/equipa` são placeholders por agora.

---

## 13. Histórico de alterações (frontend)

| Data    | Versão | Alteração                                                                       |
|---------|--------|---------------------------------------------------------------------------------|
| Inicial | 1.0.0  | Scaffold Next.js 14 + TS + Tailwind + shadcn; rotas `/admin` (sidebar + dashboard + placeholders) e `/staff` (mobile-first com cartões de tarefas); mock data. Build validado. |
| v1.1.0  | 1.1.0  | Ecrã de Detalhe da Tarefa (`/staff/tarefas/[id]`): checklist interativa gerada de array, textarea de observações, botão "Concluir Tarefa" desativado até todas as checkboxes marcadas (React State). Componentes UI Checkbox e Textarea. TaskCard agora abre o detalhe via Link. |
| v1.1.1  | 1.1.1  | Fix deploy Vercel: adicionado `vercel.json` (`"framework": "nextjs"`) para forçar a deteção do framework e evitar o erro `No Output Directory named "public"`. Documentação de deploy atualizada com definições obrigatórias (Root Directory = `frontend`, Framework Preset = Next.js). |
| v1.2.0  | 1.2.0  | Integração com a API real na secção Propriedades: `lib/api.ts` (helpers `adminGet`/`adminPost` + `EMPRESA_ID` placeholder via header `x-empresa-id`); `/admin/propriedades` convertido em Client Component com `useEffect` (GET), tabela HTML (Nome, Smoobu ID, Tempo, Estado) e formulário inline de criação (POST + refresh automático). Componente UI `Input`. Mock-data abandonado nesta secção. |
| v1.2.1  | 1.2.1  | `EMPRESA_ID` preenchido com o ID real do “Cliente Zero” (`6a400c9009e37b27fe0bc362`) devolvido por `GET /api/admin/setup`. Placeholder `COLA_AQUI_O_ID` removido. |
| v1.3.0  | 1.3.0  | **Rebranding Premium:** primary mudada de emerald-600 → Azul Marinho Premium (`blue-950`); `--radius` reduzido de `0.5rem` → `0.3rem` (visual "sharp"); `Card` e `Button` com `shadow-sm` + borders hairline (`border-border/60`); landing page reescrita (gradiente verde removido, fundo limpo com padrão de pontos, tipografia `font-light`/`font-semibold`, cartões com elevação no hover `hover:-translate-y-0.5`). |
| v1.4.0  | 1.4.0  | **Autenticação JWT:** `lib/auth.ts` (guardar/ler/remover token + descodificar payload + `rotaPorRole`); `lib/api.ts` atualizado para enviar `Authorization: Bearer <token>` (com fallback legacy `x-empresa-id` e limpeza de token em `401`); nova rota `/login` (ecrã minimalista premium, `POST /api/auth/login`, redirect admin→`/admin` / staff→`/staff`). |
| v1.5.0  | 1.5.0  | **Proteção de rotas + landing simplificada:** `middleware.ts` (Edge) protege `/admin/**` e `/staff/**` (sem token → `/login?from=`), redireciona autenticados de `/` e `/login`, e valida role por área; `lib/auth.ts` passou a guardar token em **cookie** (middleware lê) em vez de localStorage; `components/auth/route-guard.tsx` (2ª camada client-side) aplicado nos layouts admin/staff; landing page simplificada (removidos cartões Admin/Staff, 1 botão 'Entrar na Plataforma' → `/login`); `/login` lê `?from=` e redireciona autenticados via `useEffect`. |
| v1.6.0  | 1.6.0  | **Novo role `manager` (Responsável de Limpezas):** tipo `Role = admin \| manager \| staff` em `lib/auth.ts`, `lib/api.ts`, `middleware.ts`, `route-guard.tsx`; `rotaPorRole` atualizada (manager → `/manager`); nova área `/manager` (layout + `manager-sidebar.tsx` + dashboard com tarefas + equipa + placeholders `/manager/tarefas` e `/manager/equipa`); `middleware.ts` protege `/manager/**`; `mock-data` atualizado com role manager + membro manager na equipa; dashboard admin inclui managers na equipa operacional. |
