"use client";

import { useEffect, useState } from "react";
import { notFound } from "next/navigation";
import { Loader2 } from "lucide-react";

import { DetalheTarefaClient } from "@/components/staff/detalhe-tarefa-client";
import { checklistPorDefeito } from "@/lib/mock-data";

/**
 * Ecrã de Detalhe da Tarefa — /staff/tarefas/[id]
 *
 * Client Component: busca a tarefa real da API (/api/auth/me/tarefas/:id)
 * e passa ao DetalheTarefaClient que gere o estado interativo.
 */
export default function DetalheTarefaPage({
  params,
}: {
  params: { id: string };
}) {
  const [tarefa, setTarefa] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/auth/me/tarefas/${params.id}`, {
          credentials: "include",
          cache: "no-store",
        });
        if (res.ok) {
          const data = await res.json();
          setTarefa(data.tarefa);
        }
      } catch {
        // silencioso
      } finally {
        setLoading(false);
      }
    })();
  }, [params.id]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!tarefa) {
    notFound();
  }

  // Adapta a tarefa real para o formato esperado pelo DetalheTarefaClient.
  const tarefaAdaptada = {
    id: tarefa._id,
    propriedade_nome: tarefa.propriedade_id?.nome ?? "Propriedade",
    hora_limite: "",
    tempo_estimado_minutos: tarefa.tempo_limpeza_minutos,
    estado: tarefa.estado,
    tipo: tarefa.tipo,
    endereco: tarefa.propriedade_id?.morada,
  };

  return (
    <DetalheTarefaClient
      tarefa={tarefaAdaptada}
      checklist={checklistPorDefeito}
    />
  );
}
