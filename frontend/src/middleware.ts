/**
 * Middleware de Proteção de Rotas — Autocell (Next.js)
 *
 * Executado no Edge (servidor) antes de renderizar qualquer página. Lê o
 * cookie `autocell_token` (definido em lib/auth.ts após o login) e:
 *
 *   1. **Rotas privadas** (`/admin/*`, `/staff/*`):
 *      - Sem token      → redireciona para /login
 *      - Token inválido → redireciona para /login
 *      - Token válido   → deixa passar
 *        (se o role não corresponder à área → redireciona para o painel certo)
 *
 *   2. **Rotas públicas para autenticados** (`/`, `/login`):
 *      - Com token válido → redireciona para o painel do role (/admin ou /staff)
 *      - Sem token        → deixa passar (mostra a landing/login)
 *
 *   3. **Outras rotas**: passa sem interferir.
 *
 * NOTA: o middleware NÃO verifica a assinatura do JWT (isso exigiria o
 * segredo no edge, o que é arriscado). A verificação real é feita pelo backend
 * em cada pedido à API. Aqui só validamos o formato e a expiração (exp).
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const TOKEN_COOKIE = "autocell_token";

interface JwtPayload {
  id?: string;
  role?: "admin" | "staff";
  empresa_id?: string;
  exp?: number;
}

/** Lê o token do cookie (servidor). */
function lerTokenDoCookie(req: NextRequest): string | null {
  const token = req.cookies.get(TOKEN_COOKIE)?.value;
  return token ?? null;
}

/**
 * Descodifica o payload do JWT (base64url) SEM verificar a assinatura.
 * Devolve null se inválido ou expirado.
 */
function descodificarToken(token: string): JwtPayload | null {
  const partes = token.split(".");
  if (partes.length !== 3) return null;

  try {
    // base64url -> base64 -> JSON (compatível com Edge)
    const base64 = partes[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(base64);
    const payload = JSON.parse(json) as JwtPayload;

    // Verifica expiração (exp em segundos Unix).
    if (payload.exp && Date.now() >= payload.exp * 1000) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

function rotaPorRole(role: "admin" | "staff"): string {
  return role === "admin" ? "/admin" : "/staff";
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = lerTokenDoCookie(req);
  const payload = token ? descodificarToken(token) : null;
  const autenticado = payload !== null && !!payload.role;

  // --- Rotas privadas ---
  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");
  const isStaff = pathname === "/staff" || pathname.startsWith("/staff/");

  if (isAdmin || isStaff) {
    if (!autenticado) {
      // Sem token válido → /login (preserva a rota pretendida em ?from=).
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.search = `?from=${encodeURIComponent(pathname)}`;
      return NextResponse.redirect(loginUrl);
    }

    // Token válido: verifica se o role corresponde à área.
    const rotaEsperada = rotaPorRole(payload!.role!);
    if (isAdmin && payload!.role !== "admin") {
      const url = req.nextUrl.clone();
      url.pathname = rotaEsperada;
      url.search = "";
      return NextResponse.redirect(url);
    }
    if (isStaff && payload!.role !== "staff") {
      const url = req.nextUrl.clone();
      url.pathname = rotaEsperada;
      url.search = "";
      return NextResponse.redirect(url);
    }

    return NextResponse.next();
  }

  // --- Rotas públicas para autenticados: / e /login ---
  if (autenticado && (pathname === "/" || pathname === "/login")) {
    const url = req.nextUrl.clone();
    url.pathname = rotaPorRole(payload!.role!);
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  /**
   * Aplica o middleware apenas às rotas relevantes (ignora _next, api,
   * ficheiros estáticos, etc.).
   */
  matcher: ["/", "/login", "/admin/:path*", "/staff/:path*"],
};
