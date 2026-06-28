/**
 * Utilitários de Autenticação (frontend) — Autocell
 *
 * Gere o token JWT no navegador EXCLUSIVAMENTE através de um **cookie**
 * (sem localStorage), de forma a que o `middleware.ts` do Next.js consiga
 * lê-lo no servidor e proteger/bloquear rotas antes de renderizar a página.
 *
 *   - Cookie: `autocell_token` (SameSite=Strict, Secure, path=/, expira em
 *     7 dias — alinhado com a expiração do JWT no backend).
 *   - Funções para guardar / ler / remover (todas operam apenas o cookie).
 *   - Helper para descodificar o payload (sem verificar a assinatura — isso
 *     é responsabilidade do backend; o frontend só lê os dados para UX).
 *
 * Segurança (v1.13.0):
 *   - O token vive EXCLUSIVAMENTE no cookie (sem localStorage). O localStorage
 *     é vulnerável a XSS — qualquer script injetado na página conseguiria
 *     ler o token. O cookie com SameSite=Strict + Secure reduz essa superfície.
 *   - SameSite=Strict: o cookie NÃO é enviado em pedidos cross-site (mitiga
 *     CSRF). O utilizador tem de estar já no domínio para o cookie ser enviado.
 *   - Secure: o cookie só é enviado over HTTPS (em dev http://localhost o
 *     cookie não será definido — testar em https ou ajustar temporariamente).
 *   - O cookie NÃO é httpOnly porque o frontend precisa de o ler (ex.: para
 *     descodificar o payload e saber o role). A verificação real da assinatura
 *     é sempre feita pelo backend em cada pedido à API.
 */

const COOKIE_KEY = "autocell_token";
const COOKIE_DIAS = 7;

export type Role = "admin" | "manager" | "staff";

export interface JwtPayload {
  id: string;
  role: Role;
  empresa_id: string;
  iat?: number;
  exp?: number;
}

/**
 * Define um cookie com nome, valor e dias de expiração.
 * Flags de segurança: SameSite=Strict (anti-CSRF) + Secure (apenas HTTPS).
 */
function setCookie(nome: string, valor: string, dias: number): void {
  if (typeof document === "undefined") return;
  const expires = new Date(Date.now() + dias * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `${nome}=${encodeURIComponent(valor)}; expires=${expires}; path=/; SameSite=Strict; Secure`;
}

/** Lê um cookie pelo nome (ou null se não existir). */
function getCookie(nome: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${nome}=`));
  if (!match) return null;
  return decodeURIComponent(match.slice(nome.length + 1));
}

/** Remove um cookie (mesmas flags de segurança para garantir a sobreposição). */
function deleteCookie(nome: string): void {
  if (typeof document === "undefined") return;
  document.cookie = `${nome}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Strict; Secure`;
}

/** Guarda o token EXCLUSIVAMENTE no cookie (sem localStorage). */
export function guardarToken(token: string): void {
  if (typeof window === "undefined") return;
  setCookie(COOKIE_KEY, token, COOKIE_DIAS);
}

/** Lê o token do cookie (ou null se não existir). */
export function lerToken(): string | null {
  if (typeof window === "undefined") return null;
  return getCookie(COOKIE_KEY);
}

/** Remove o token (apenas o cookie). */
export function removerToken(): void {
  if (typeof window === "undefined") return;
  deleteCookie(COOKIE_KEY);
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
 * - admin   -> /admin   (dono da conta)
 * - manager -> /manager  (responsável de limpezas)
 * - staff   -> /staff    (executante de limpezas)
 */
export function rotaPorRole(role: Role): string {
  if (role === "admin") return "/admin";
  if (role === "manager") return "/manager";
  return "/staff";
}
