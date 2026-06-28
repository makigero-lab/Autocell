"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarDays,
  Loader2,
  AlertCircle,
  SprayCan,
  Plane,
  Sun,
  Clock,
} from "lucide-react";
import { format, parseISO, isSameDay, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
} from "@/components/ui/card";

/**
 * Página de Calendário Pessoal do Staff (/staff/calendario).
 *
 * Mostra os próximos 30 dias do utilizador autenticado:
 *   - Dias de trabalho: casas atribuídas + hora limite
 *   - Dias de folga/férias: cartão distinto (cor muted)
 *
 * Consome GET /api/auth/me/calendario (via proxy same-origin com cookie httpOnly).
 */

interface TarefaMinha {
  _id: string;
  propriedade_id?: { nome: string } | null;
  data: string;
  tipo: string;
  estado: string;
  tempo_limpeza_minutos: number;
}

interface AusenciaMinha {
  _id: string;
  data_inicio: string;
  data_fim: string;
  tipo: "ferias" | "folga";
  notas?: string;
}

interface DiaAgenda {
  data: Date;
  tarefas: TarefaMinha[];
  ausencia: AusenciaMinha | null;
}

export default function StaffCalendarioPage() {
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [dias, setDias] = useState<DiaAgenda[]>([]);

  useEffect(() => {
    let cancelado = false;

    (async () => {
      setLoading(true);
      setErro(null);
      try {
        const res = await fetch("/api/auth/me/calendario", {
          cache: "no-store",
          credentials: "include",
        });

        if (!res.ok) {
          throw new Error("Não foi possível carregar a agenda.");
        }

        const data = (await res.json()) as {
          tarefas: TarefaMinha[];
          ausencias: AusenciaMinha[];
        };

        if (cancelado) return;

        // Gera os próximos 30 dias.
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const proximos30: DiaAgenda[] = [];

        for (let i = 0; i < 30; i++) {
          const dia = addDays(hoje, i);
          const tarefasDoDia = data.tarefas.filter((t) =>
            isSameDay(parseISO(t.data), dia)
          );

          // Verifica se há ausência que cubre este dia.
          const ausenciaDoDia = data.ausencias.find((a) => {
            const inicio = parseISO(a.data_inicio);
            const fim = parseISO(a.data_fim);
            return dia >= inicio && dia <= fim;
          }) ?? null;

          proximos30.push({
            data: dia,
            tarefas: tarefasDoDia,
            ausencia: ausenciaDoDia,
          });
        }

        setDias(proximos30);
      } catch (e) {
        if (!cancelado) {
          setErro(e instanceof Error ? e.message : "Erro ao carregar agenda.");
        }
      } finally {
        if (!cancelado) setLoading(false);
      }
    })();

    return () => {
      cancelado = true;
    };
  }, []);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-muted/20">
      {/* Cabeçalho */}
      <header className="sticky top-0 z-10 border-b bg-background/95 px-5 pb-4 pt-6 backdrop-blur">
        <Link
          href="/staff"
          prefetch
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Link>
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold tracking-tight">
            A minha Agenda
          </h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Próximos 30 dias
        </p>
      </header>

      {/* Conteúdo */}
      <main className="flex-1 space-y-3 p-5">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            A carregar agenda…
          </div>
        ) : erro ? (
          <Card className="border-destructive/50">
            <CardContent className="flex items-center gap-3 p-4 text-sm text-destructive">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <span>{erro}</span>
            </CardContent>
          </Card>
        ) : (
          <>
            {dias.map((dia, idx) => {
              const diaFmt = format(dia.data, "EEE, d MMM", { locale: ptBR });
              const ehHoje = idx === 0;
              const temTarefas = dia.tarefas.length > 0;
              const temAusencia = dia.ausencia !== null;
              const ehFolga = !temTarefas && !temAusencia;

              return (
                <div key={idx}>
                  {/* Label do dia */}
                  <div className="mb-1 flex items-center gap-2">
                    <span
                      className={`text-xs font-semibold capitalize ${
                        ehHoje ? "text-primary" : "text-muted-foreground"
                      }`}
                    >
                      {ehHoje ? "Hoje" : diaFmt}
                    </span>
                    {ehHoje && (
                      <span className="h-px flex-1 bg-primary/30" />
                    )}
                  </div>

                  {/* Cartão de ausência (folga/férias) */}
                  {temAusencia && (
                    <Card
                      className={`border-0 ${
                        dia.ausencia!.tipo === "ferias"
                          ? "bg-orange-50 dark:bg-orange-950/20"
                          : "bg-yellow-50 dark:bg-yellow-950/20"
                      }`}
                    >
                      <CardContent className="flex items-center gap-3 p-3">
                        {dia.ausencia!.tipo === "ferias" ? (
                          <Plane className="h-4 w-4 text-orange-600" />
                        ) : (
                          <Sun className="h-4 w-4 text-yellow-600" />
                        )}
                        <span className="text-sm font-medium">
                          {dia.ausencia!.tipo === "ferias" ? "Férias" : "Folga"}
                        </span>
                        {dia.ausencia!.notas && (
                          <span className="text-xs text-muted-foreground">
                            · {dia.ausencia!.notas}
                          </span>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {/* Cartões de tarefas */}
                  {temTarefas && (
                    <div className="space-y-2">
                      {dia.tarefas.map((t) => (
                        <Card key={t._id} className="border-border/60">
                          <CardContent className="flex items-center gap-3 p-3">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                              <SprayCan className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">
                                {t.propriedade_id?.nome ?? "Propriedade"}
                              </p>
                              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                {t.tempo_limpeza_minutos} min
                              </p>
                            </div>
                            <Badge
                              variant={
                                t.estado === "concluida"
                                  ? "success"
                                  : t.estado === "por_atribuir"
                                  ? "warning"
                                  : "secondary"
                              }
                            >
                              {t.estado === "concluida"
                                ? "Concluída"
                                : t.estado === "por_atribuir"
                                ? "Por atribuir"
                                : "Atribuída"}
                            </Badge>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}

                  {/* Dia sem nada (folga livre) */}
                  {ehFolga && (
                    <Card className="border-dashed border-border/40 bg-transparent">
                      <CardContent className="p-3">
                        <span className="text-xs text-muted-foreground">
                          Dia livre
                        </span>
                      </CardContent>
                    </Card>
                  )}
                </div>
              );
            })}
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
