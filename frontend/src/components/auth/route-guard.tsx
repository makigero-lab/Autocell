"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { lerUtilizadorDoToken, rotaPorRole } from "@/lib/auth";

interface RouteGuardProps {
  /** Role exigida para esta área ("admin" | "staff"). */
  role: "admin" | "staff";
  children: React.ReactNode;
}

/**
 * RouteGuard — camada de proteção client-side para áreas privadas.
 *
 * O `middleware.ts` já bloqueia o acesso no servidor (redireciona para /login
 * sem token). Este componente é uma **segunda camada** que:
 *   - valida novamente o token no client (caso o cookie exista mas esteja
 *     expirado/inválido e o middleware tenha deixado passar por race condition);
 *   - garante que o role do utilizador corresponde ao role da área;
 *   - mostra um spinner enquanto valida (evita flash de conteúdo protegido).
 *
 * Se algo falhar, redireciona para /login.
 */
export function RouteGuard({ role, children }: RouteGuardProps) {
  const router = useRouter();
  const [ok, setOk] = useState(false);

  useEffect(() => {
    const user = lerUtilizadorDoToken();
    if (!user || user.role !== role) {
      router.replace("/login");
      return;
    }
    setOk(true);
  }, [role, router]);

  if (!ok) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <>{children}</>;
}
