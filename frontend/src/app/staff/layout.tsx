import { RouteGuard } from "@/components/auth/route-guard";

/**
 * Layout da Área do Staff (mobile-first).
 *
 * Protegido por RouteGuard (role "staff") — camada client-side complementar
 * ao middleware.ts. Sem token válido (ou role errado) → redireciona para /login.
 */
export default function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RouteGuard role="staff">{children}</RouteGuard>;
}
