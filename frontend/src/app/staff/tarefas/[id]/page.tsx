import { notFound } from "next/navigation";

import { DetalheTarefaClient } from "@/components/staff/detalhe-tarefa-client";
import { getTarefaPorId, checklistPorDefeito } from "@/lib/mock-data";

/**
 * Ecrã de Detalhe da Tarefa — /staff/tarefas/[id]
 *
 * Server Component: valida o id contra o mock data e passa a tarefa ao
 * Client Component que gere o estado interativo (checklist + observações).
 */
export default function DetalheTarefaPage({
  params,
}: {
  params: { id: string };
}) {
  const tarefa = getTarefaPorId(params.id);

  if (!tarefa) {
    notFound();
  }

  // Resolve a checklist efetiva (a da tarefa, ou a por defeito se vier vazia).
  const checklist =
    tarefa.checklist && tarefa.checklist.length > 0
      ? tarefa.checklist
      : checklistPorDefeito;

  return <DetalheTarefaClient tarefa={tarefa} checklist={checklist} />;
}
