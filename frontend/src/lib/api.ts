/**
 * Configuração e helpers para chamadas à API backend (Autocell).
 *
 * Autenticação (v1.3.0 — JWT):
 *   Os pedidos admin enviam agora o header `Authorization: Bearer <token>`
 *   lido do localStorage (ver `lib/auth.ts`).
 *
 *   Para a transição, mantém-se o header `x-empresa-id` como fallback
 *   (legacy) — se o utilizador ainda não tiver token (ex.: ainda não fez
 *   login), o backend aceita o x-empresa-id. Quando o frontend estiver
 *   100% com login, o fallback pode ser removido.
 */

import { lerToken } from "@/lib/auth";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

// Legacy — usado apenas como fallback quando não há JWT (transição).
// Será removido quando o frontend estiver 100% com login.
export const EMPRESA_ID = "6a400c9009e37b27fe0bc362";

/**
 * Headers comuns a todos os pedidos admin.
 * Inclui Authorization (JWT) se houver token; senão, inclui x-empresa-id.
 */
export function adminHeaders(extra?: HeadersInit): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const token = lerToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  } else {
    // Fallback legacy (transição).
    headers["x-empresa-id"] = EMPRESA_ID;
  }

  return { ...headers, ...(extra as Record<string, string>) };
}

/**
 * Faz um GET a um endpoint admin.
 * Lança Error com a mensagem do backend se a resposta não for ok.
 * Se receber 401, limpa o token (força novo login).
 */
export async function adminGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "GET",
    headers: adminHeaders(),
    cache: "no-store",
  });
  return handleResponse<T>(res);
}

/**
 * Faz um POST a um endpoint admin com JSON no corpo.
 */
export async function adminPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify(body),
    cache: "no-store",
  });
  return handleResponse<T>(res);
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    // 401 — token inválido/expirado: limpa para forçar novo login.
    if (res.status === 401 && typeof window !== "undefined") {
      const { removerToken } = await import("@/lib/auth");
      removerToken();
    }
    let mensagem = `${res.status} ${res.statusText}`;
    try {
      const data = await res.json();
      if (data?.erro) mensagem = data.erro;
    } catch {
      /* corpo não-JSON, manter mensagem padrão */
    }
    throw new Error(mensagem);
  }
  return (await res.json()) as T;
}

/* ------------------------------------------------------------------ */
/* Tipos que espelham os modelos do backend                            */
/* ------------------------------------------------------------------ */

export interface PropriedadeDTO {
  _id: string;
  smoobu_id: string;
  nome: string;
  empresa_id: string;
  tempo_limpeza_minutos: number;
  ativo: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/** Resposta do POST /api/auth/login */
export interface LoginResponse {
  token: string;
  utilizador: {
    id: string;
    nome: string;
    email: string;
    role: "admin" | "manager" | "staff";
    empresa_id: string;
  };
}
