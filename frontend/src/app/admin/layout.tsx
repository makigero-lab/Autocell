import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { RouteGuard } from "@/components/auth/route-guard";

/**
 * Layout do Painel de Administração.
 * Sidebar fixa (desktop) / overlay (mobile) + área de conteúdo.
 *
 * Protegido por RouteGuard (role "admin") — camada client-side complementar
 * ao middleware.ts. Sem token válido (ou role errado) → redireciona para /login.
 */
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RouteGuard role="admin">
      <div className="flex min-h-screen flex-col bg-muted/30 lg:flex-row">
        <AdminSidebar />
        <main className="flex-1 lg:overflow-x-hidden">{children}</main>
      </div>
    </RouteGuard>
  );
}
