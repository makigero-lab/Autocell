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
    ├── app/
    │   ├── globals.css       # Variáveis CSS do tema (light/dark) — primary emerald
    │   ├── layout.tsx        # Layout root (fonte Inter, lang pt-PT)
    │   ├── page.tsx          # Landing page com links para /admin e /staff
    │   ├── admin/
    │   │   ├── layout.tsx    # Layout do painel admin (sidebar + main)
    │   │   ├── page.tsx      # Dashboard (estatísticas, tarefas, equipa)
    │   │   ├── propriedades/page.tsx   # Placeholder
    │   │   ├── equipa/page.tsx         # Placeholder
    │   │   └── calendario/page.tsx     # Placeholder
    │   └── staff/
    │       └── page.tsx      # Área do Staff (mobile-first)
    ├── components/
    │   ├── ui/               # shadcn: button, card, badge, avatar, separator
    │   ├── admin/
    │   │   ├── admin-sidebar.tsx    # Sidebar responsiva (desktop fixa / mobile overlay)
    │   │   └── placeholder-page.tsx # Componente de página "Em breve"
    │   └── staff/
    │       └── task-card.tsx        # Cartão de tarefa de limpeza
    └── lib/
        ├── utils.ts          # cn() — clsx + tailwind-merge
        └── mock-data.ts      # Dados fictícios (espelham modelos do backend)
```

---

## 3. Sistema de rotas

A aplicação tem **duas áreas distintas**, cada uma com layout próprio:

| Rota            | Descrição                                          | Abordagem         |
|-----------------|----------------------------------------------------|-------------------|
| `/`             | Landing page — escolha entre Admin e Staff         | —                 |
| `/admin`        | Painel de Administração (Dashboard)                | Desktop-first     |
| `/admin/propriedades` | Placeholder (Propriedades)                   | Desktop-first     |
| `/admin/equipa`       | Placeholder (Equipa)                         | Desktop-first     |
| `/admin/calendario`   | Placeholder (Calendário de Folgas)           | Desktop-first     |
| `/staff`        | Área do Staff — tarefas de limpeza do dia          | Mobile-first      |

### 3.1 Área Admin (`/admin`)

- **Barra lateral** (`admin-sidebar.tsx`) com 4 itens: **Dashboard**, **Propriedades**, **Equipa**, **Calendário de Folgas**.
  - Desktop (`lg+`): sidebar fixa à esquerda, sempre visível.
  - Mobile: colapsada; abre como **overlay** ao tocar no botão de menu (hambúrguer).
  - Item ativo destacado com cor primária (emerald).
- **Dashboard** (`/admin`): cartões de estatística (Propriedades, Staff ativo, Tarefas hoje, Por atribuir), lista de tarefas do dia e estado da equipa com carga de trabalho.
- Secções **Propriedades**, **Equipa** e **Calendário de Folgas**: páginas placeholder ("Em breve") — apenas layout visual.

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
  - Botão "Iniciar tarefa" (desativado se por atribuir)
- **Rodapé** fixo com identidade "Autocell · Área do Staff".

---

## 4. Tema visual

- **Cor primária:** emerald-600 (`hsl(161 94% 30%)`) — associada a limpeza/frescura. **Sem azul/índigo**.
- **Estilo shadcn:** *New York*, base color *zinc*, com CSS variables (suporte light/dark preparado).
- **Tipografia:** Inter (via `next/font/google`).
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

Inclui: `staffAtual` (utilizador staff simulado), `tarefasHoje` (4 tarefas), `equipa` (4 membros), `propriedades` (4 alojamentos) e `resumoDashboard` (estatísticas agregadas).

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

| Definição      | Valor            |
|----------------|------------------|
| Root Directory | `frontend`       |
| Framework      | Next.js (auto)   |
| Build Command  | `next build` (auto) |
| Output         | `.next` (auto)   |
| Env Vars       | `NEXT_PUBLIC_API_URL` (URL do backend no Render) |

---

## 10. Regras e convenções

- **Branch de desenvolvimento:** `dev`.
- **Documentação:** sempre que o frontend é alterado, este ficheiro e o `README.md` são atualizados.
- **Linguagem:** interface e comentários em **pt-pt**.
- **Sem dependência da API nesta fase:** todos os dados vêm de `mock-data.ts`.

---

## 11. Histórico de alterações (frontend)

| Data    | Versão | Alteração                                                                       |
|---------|--------|---------------------------------------------------------------------------------|
| Inicial | 1.0.0  | Scaffold Next.js 14 + TS + Tailwind + shadcn; rotas `/admin` (sidebar + dashboard + placeholders) e `/staff` (mobile-first com cartões de tarefas); mock data. Build validado. |
