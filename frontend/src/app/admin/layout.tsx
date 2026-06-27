import { AdminSidebar } from "@/components/admin/admin-sidebar";

/**
 * Layout do Painel de Administração.
 * Sidebar fixa (desktop) / overlay (mobile) + área de conteúdo.
 */
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-muted/30 lg:flex-row">
      <AdminSidebar />
      <main className="flex-1 lg:overflow-x-hidden">{children}</main>
    </div>
  );
}
