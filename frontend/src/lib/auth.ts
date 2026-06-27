/**
 * Utilitários de Autenticação (frontend) — Autocell
 *
 * Gere o token JWT no navegador:
 *   - guardado em localStorage (chave `autocell_token`)
 *   - funções para guardar / ler / remover
 *   - helper para descodificar o payload (sem verificar a assinatura — isso
 *     é responsabilidade do backend; o frontend só lê os dados para UX).
 *
 * NOTA: localStorage é suficiente para esta fase. Para maior segurança,
 * considerar migrar para httpOnly cookies no futuro.
 */

const STORAGE_KEY = "autocell_token";

export interface JwtPayload {
  id: string;
  role: "admin" | "staff";
  empresa_id: string;
  iat?: number;
  exp?: number;
}

/** Guarda o token no localStorage. */
export function guardarToken(token: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, token);
}

/** Lê o token do localStorage (ou null se não existir). */
export function lerToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEY);
}

/** Remove o token (logout). */
export function removerToken(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Descodifica o payload do JWT (parte do meio, base64url).
 * Não verifica a assinatura — apenas para leitura de dados no cliente.
 * Devolve null se o token for inválido ou estiver expirado.
 */
export function lerUtilizadorDoToken(): JwtPayload | null {
  const token = lerToken();
  if (!token) return null;

  const partes = token.split(".");
  if (partes.length !== 3) return null;

  try {
    // base64url -> base64 -> JSON
    const base64 = partes[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    const payload = JSON.parse(json) as JwtPayload;

    // Verifica expiração (exp em segundos Unix).
    if (payload.exp && Date.now() >= payload.exp * 1000) {
      removerToken();
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

/** True se houver token válido (não expirado). */
export function estaAutenticado(): boolean {
  return lerUtilizadorDoToken() !== null;
}

/**
 * Determina para onde redirecionar o utilizador após login, com base no role.
 * - admin  -> /admin
 * - staff  -> /staff
 */
export function rotaPorRole(role: "admin" | "staff"): string {
  return role === "admin" ? "/admin" : "/staff";
}
