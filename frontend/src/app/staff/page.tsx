"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Clock, ClipboardList, LogOut, CalendarDays, Loader2 } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { TaskCard } from "@/components/staff/task-card";
import { fazerLogout, lerUtilizador } from "@/lib/auth";
import type { UtilizadorAuth } from "@/lib/auth";

/**
 * Interface para a tarefa real vinda da API.
 * Espelha o que o backend devolve em /api/auth/me/tarefas.
 */
interface TarefaReal {
  _id: string;
  propriedade_id?: { nome: string; morada?: string } | null;
  data: string;
  tipo: string;
  estado: string;
  tempo_limpeza_minutos: number;
}

/**
 * Adapta a tarefa real da API para o formato que o TaskCard espera
 * (que foi desenhado para o mock-data).
 */
function adaptarTarefa(t: TarefaReal) {
  return {
    id: t._id,
    propriedade_nome: t.propriedade_id?.nome ?? "Propriedade",
    hora_limite: "",
    tempo_estimado_minutos: t.tempo_limpeza_minutos,
    estado: t.estado as "por_atribuir" | "atribuida" | "em_curso" | "concluida" | "cancelada",
    tipo: t.tipo as "limpeza" | "check_in" | "check_out" | "manutencao" | "outro",
    endereco: t.propriedade_id?.morada,
  };
}

/**
 * Área do Staff (/staff) — mobile-first.
 * Cabeçalho "Bem-vindo, [Nome]" + lista de cartões de tarefas do dia.
 *
 * Dados reais: busca o nome do utilizador via /api/auth/me e as tarefas
 * de hoje via /api/auth/me/tarefas (substitui o mock-data).
 */
export default function StaffPage() {
  const [user, setUser] = useState<UtilizadorAuth | null>(null);
  const [tarefas, setTarefas] = useState<TarefaReal[]>([]);
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [userRes, tarefasRes] = await Promise.all([
        fetch("/api/auth/me", { credentials: "include", cache: "no-store" }),
        fetch("/api/auth/me/tarefas", { credentials: "include", cache: "no-store" }),
      ]);

      if (userRes.ok) {
        const userData = await userRes.json();
        if (userData?.utilizador) setUser(userData.utilizador);
      }

      if (tarefasRes.ok) {
        const data = await tarefasRes.json();
        setTarefas(data.tarefas ?? []);
      }
    } catch {
      // silencioso
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const nome = user?.nome ?? "Staff";
  const iniciais = nome
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const totalMinutos = tarefas.reduce(
    (acc, t) => acc + t.tempo_limpeza_minutos,
    0
  );

  const hoje = new Date().toLocaleDateString("pt-PT", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  // Filtra apenas tarefas não concluídas para a lista principal.
  const tarefasAtivas = tarefas.filter((t) => t.estado !== "concluida");
  const tarefasConcluidas = tarefas.filter((t) => t.estado === "concluida");

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
          {/* Botão logout */}
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-destructive"
            onClick={() => fazerLogout()}
            aria-label="Terminar sessão"
            title="Terminar sessão"
          >
            <LogOut className="h-5 w-5" />
          </Button>
        </div>

        {/* Data + resumo */}
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm capitalize text-muted-foreground">{hoje}</p>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <ClipboardList className="h-3.5 w-3.5" />
              {tarefas.length} tarefas
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
        {/* Botão Ver a minha Agenda */}
        <Link href="/staff/calendario" prefetch>
          <Button variant="outline" className="w-full justify-center gap-2">
            <CalendarDays className="h-4 w-4" />
            Ver a minha Agenda
          </Button>
        </Link>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            A carregar tarefas…
          </div>
        ) : (
          <>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Tarefas de hoje
            </h2>
            <div className="space-y-4">
              {tarefasAtivas.map((t) => (
                <TaskCard key={t._id} tarefa={adaptarTarefa(t)} />
              ))}
            </div>

            {tarefasConcluidas.length > 0 && (
              <>
                <h2 className="pt-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Concluídas ({tarefasConcluidas.length})
                </h2>
                <div className="space-y-4 opacity-60">
                  {tarefasConcluidas.map((t) => (
                    <TaskCard key={t._id} tarefa={adaptarTarefa(t)} />
                  ))}
                </div>
              </>
            )}

            {tarefas.length === 0 && (
              <div className="mt-10 flex flex-col items-center gap-2 text-center text-muted-foreground">
                <ClipboardList className="h-10 w-10 opacity-40" />
                <p className="text-sm">Sem tarefas atribuídas para hoje.</p>
              </div>
            )}
          </>
        )}
      </main>

      {/* Rodapé */}
      <footer className="border-t px-5 py-4 text-center text-xs text-muted-foreground">
        Autocell · Área do Staff
      </footer>
    </div>
  );
}
