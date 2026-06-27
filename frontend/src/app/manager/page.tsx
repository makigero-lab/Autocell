import {
  ClipboardList,
  Users,
  Clock,
  AlertCircle,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { equipa, tarefasHoje, resumoDashboard } from "@/lib/mock-data";

/**
 * Dashboard do Responsável de Limpezas (/manager).
 *
 * Vista alargada: tarefas do dia + estado da equipa (com carga de trabalho).
 * (Ainda usa mock data — integração com API real numa fase posterior.)
 */
export default function ManagerDashboardPage() {
  // Staff + Managers contam para "equipa operacional".
  const equipaOperacional = equipa.filter(
    (m) => m.role === "staff" || m.role === "manager"
  );

  const stats = [
    {
      label: "Tarefas hoje",
      value: resumoDashboard.tarefasHoje,
      icon: ClipboardList,
    },
    {
      label: "Por atribuir",
      value: resumoDashboard.tarefasPorAtribuir,
      icon: AlertCircle,
    },
    {
      label: "Equipa operacional",
      value: equipaOperacional.filter((m) => m.ativo).length,
      icon: Users,
    },
  ];

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <div className="hidden flex-col gap-1 lg:flex">
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Visão operacional das limpezas de hoje.
        </p>
      </div>

      {/* Cartões de estatística */}
      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label}>
              <CardContent className="flex items-center gap-4 p-5">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-6 w-6" />
                </div>
                <div className="flex flex-col">
                  <span className="text-2xl font-bold leading-none">
                    {s.value}
                  </span>
                  <span className="mt-1 text-sm text-muted-foreground">
                    {s.label}
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Tarefas do dia */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Tarefas de hoje</CardTitle>
            <CardDescription>
              Limpezas atribuídas automaticamente pelo sistema.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {tarefasHoje.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {t.propriedade_nome}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      {t.hora_limite} · {t.tempo_estimado_minutos} min
                    </p>
                  </div>
                  <Badge
                    variant={
                      t.estado === "por_atribuir" ? "warning" : "success"
                    }
                  >
                    {t.estado === "por_atribuir" ? "Por atribuir" : "Atribuída"}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Estado da equipa */}
        <Card>
          <CardHeader>
            <CardTitle>Estado da equipa</CardTitle>
            <CardDescription>Carga de trabalho de hoje.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {equipaOperacional.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        m.ativo ? "bg-emerald-500" : "bg-muted-foreground/40"
                      }`}
                    />
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{m.nome}</span>
                      <span className="text-xs capitalize text-muted-foreground">
                        {m.role === "manager" ? "Responsável" : m.role} ·{" "}
                        {m.tarefas_hoje} tarefas
                      </span>
                    </div>
                  </div>
                  <span className="text-xs font-medium text-muted-foreground">
                    {m.carga_minutos} min
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
