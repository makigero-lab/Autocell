import { Clock, ClipboardList } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { TaskCard } from "@/components/staff/task-card";
import { staffAtual, tarefasHoje } from "@/lib/mock-data";

/**
 * Área do Staff (/staff) — mobile-first.
 * Cabeçalho "Bem-vindo, [Nome]" + lista de cartões de tarefas do dia.
 */
export default function StaffPage() {
  const nome = staffAtual.nome;
  const iniciais = nome
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const totalMinutos = tarefasHoje.reduce(
    (acc, t) => acc + t.tempo_estimado_minutos,
    0
  );

  const hoje = new Date().toLocaleDateString("pt-PT", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-muted/20">
      {/* Cabeçalho */}
      <header className="sticky top-0 z-10 border-b bg-background/95 px-5 pb-4 pt-6 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Avatar>
              <AvatarFallback>{iniciais}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground">Bem-vindo,</span>
              <span className="text-lg font-semibold leading-tight">
                {nome}
              </span>
            </div>
          </div>
        </div>

        {/* Data + resumo */}
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm capitalize text-muted-foreground">{hoje}</p>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <ClipboardList className="h-3.5 w-3.5" />
              {tarefasHoje.length} tarefas
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {Math.floor(totalMinutos / 60)}h{String(totalMinutos % 60).padStart(2, "0")}
            </span>
          </div>
        </div>
      </header>

      {/* Lista de tarefas */}
      <main className="flex-1 space-y-4 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Tarefas de hoje
        </h2>
        <div className="space-y-4">
          {tarefasHoje.map((tarefa) => (
            <TaskCard key={tarefa.id} tarefa={tarefa} />
          ))}
        </div>

        {tarefasHoje.length === 0 && (
          <div className="mt-10 flex flex-col items-center gap-2 text-center text-muted-foreground">
            <ClipboardList className="h-10 w-10 opacity-40" />
            <p className="text-sm">Sem tarefas atribuídas para hoje.</p>
          </div>
        )}
      </main>

      {/* Rodapé */}
      <footer className="border-t px-5 py-4 text-center text-xs text-muted-foreground">
        Autocell · Área do Staff
      </footer>
    </div>
  );
}
