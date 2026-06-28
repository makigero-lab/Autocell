/**
 * Proxy route: POST /api/auth/logout
 *
 * Limpa o cookie httpOnly que guarda o token JWT. Como o token vive
 * exclusivamente no cookie httpOnly, o cliente não consegue removê-lo
 * diretamente — tem de passar por esta rota de servidor.
 */

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const COOKIE_NAME = "autocell_token";

export async function POST() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);

  return NextResponse.json({ mensagem: "Logout efetuado com sucesso." });
}
