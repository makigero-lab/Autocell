/**
 * Configuração e helpers para chamadas à API backend (Autocell).
 *
 * NOTA IMPORTANTE — EMPRESA_ID temporário:
 *   Ainda NÃO há login/JWT. Para a API conseguir saber a que empresa
 *   pertencem os dados, enviamos o header `x-empresa-id` com um ID estático.
 *
 *   >>> ID real do "Cliente Zero" já colado (devolvido por GET /api/admin/setup). <<<
 *   (Futuro) substituir tudo por um middleware de auth JWT.
 */

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

// ID real da empresa "Cliente Zero" (criado via GET /api/admin/setup).
export const EMPRESA_ID = "6a400c9009e37b27fe0bc362";

/**
 * Headers comuns a todos os pedidos admin (inclui o x-empresa-id temporário).
 */
export function adminHeaders(extra?: HeadersInit): HeadersInit {
  return {
    "Content-Type": "application/json",
    "x-empresa-id": EMPRESA_ID,
    ...extra,
  };
}

/**
 * Faz um GET a um endpoint admin.
 * Lança Error com a mensagem do backend se a resposta não for ok.
 */
export async function adminGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "GET",
    headers: adminHeaders(),
    // Em dev, evitar cache para ver sempre dados frescos.
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
    // Tenta extrair { erro } do corpo; fallback para statusText.
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
