"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CalendarDays,
  Plus,
  Loader2,
  AlertCircle,
  RefreshCw,
  Trash2,
  Plane,
  Sun,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  adminGet,
  adminPost,
  adminDelete,
  type AusenciaDTO,
  type UtilizadorDTO,
  type TipoAusencia,
} from "@/lib/api";

/**
 * Página de Calendário de Folgas e Férias — Painel de Administração.
 *
 * Consome a API real (GET/POST/DELETE /api/admin/ausencias) com JWT.
 *
 * Funcionalidades:
 *   - Formulário "Marcar Ausência" no topo (funcionário, datas, tipo, botão Agendar).
 *   - Tabela de ausências agendadas (Funcionário, Tipo, Período, Ações).
 *   - Botão eliminar (🗑️) por linha.
 *
 * O webhook do Smoobu consulta estas ausências para excluir staff
 * indisponível da atribuição automática de tarefas.
 */

const TIPO_LABEL: Record<TipoAusencia, string> = {
  ferias: "Férias",
  folga: "Folga",
};

function formatarData(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("pt-PT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatarPeriodo(inicio: string, fim: string): string {
  const i = formatarData(inicio);
  const f = formatarData(fim);
  return i === f ? i : `${i} → ${f}`;
}

export default function CalendarioPage() {
  const [ausencias, setAusencias] = useState<AusenciaDTO[]>([]);
  const [staff, setStaff] = useState<UtilizadorDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  // Formulário
  const [form, setForm] = useState({
    utilizador_id: "",
    data_inicio: "",
    data_fim: "",
    tipo: "folga" as TipoAusencia,
    notas: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [formErro, setFormErro] = useState<string | null>(null);

  /** Carrega ausências (futuras) + equipa (para o select). */
  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const [ausenciasRes, equipaRes] = await Promise.all([
        adminGet<{ ausencias: AusenciaDTO[] }>(
          "/api/admin/ausencias?futuras=true"
        ),
        adminGet<{ utilizadores: UtilizadorDTO[] }>("/api/admin/equipa"),
      ]);
      setAusencias(ausenciasRes.ausencias ?? []);
      // Só staff + manager podem ter ausências (admins não fazem limpezas).
      setStaff(
        (equipaRes.utilizadores ?? []).filter(
          (u) => u.role === "staff" || u.role === "manager"
        )
      );
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar dados.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  /** Submete o formulário de nova ausência. */
  async function handleSubmeter(e: React.FormEvent) {
    e.preventDefault();
    setFormErro(null);

    if (!form.utilizador_id || !form.data_inicio || !form.data_fim) {
      setFormErro("Funcionário, Data de Início e Data de Fim são obrigatórios.");
      return;
    }
    if (new Date(form.data_fim) < new Date(form.data_inicio)) {
      setFormErro("Data de Fim não pode ser anterior à Data de Início.");
      return;
    }

    setSubmitting(true);
    try {
      await adminPost("/api/admin/ausencias", {
        utilizador_id: form.utilizador_id,
        data_inicio: form.data_inicio,
        data_fim: form.data_fim,
        tipo: form.tipo,
        notas: form.notas || undefined,
      });
      setForm({
        utilizador_id: "",
        data_inicio: "",
        data_fim: "",
        tipo: "folga",
        notas: "",
      });
      await carregar();
    } catch (e) {
      setFormErro(e instanceof Error ? e.message : "Erro ao agendar ausência.");
    } finally {
      setSubmitting(false);
    }
  }

  /** Elimina uma ausência. */
  async function handleEliminar(a: AusenciaDTO) {
    // Otimismo: remove da UI imediatamente.
    setAusencias((prev) => prev.filter((x) => x._id !== a._id));
    try {
      await adminDelete(`/api/admin/ausencias/${a._id}`);
    } catch (e) {
      // Reverte em caso de erro.
      setAusencias((prev) => [...prev, a].sort((x, y) =>
        new Date(x.data_inicio).getTime() - new Date(y.data_inicio).getTime()
      ));
      setErro(e instanceof Error ? e.message : "Erro ao eliminar ausência.");
    }
  }

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="hidden flex-col gap-1 lg:flex">
          <h1 className="text-2xl font-bold tracking-tight">
            Calendário de Folgas
          </h1>
          <p className="text-sm text-muted-foreground">
            Férias e folgas da equipa — staff indisponível é excluído da
            atribuição automática de tarefas.
          </p>
        </div>

        <Button
          variant="outline"
          size="icon"
          onClick={carregar}
          disabled={loading}
          aria-label="Atualizar"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Formulário de Marcar Ausência */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="h-5 w-5 text-primary" />
            Marcar Ausência
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmeter} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <div className="space-y-1.5">
                <label htmlFor="funcionario" className="text-sm font-medium">
                  Funcionário
                </label>
                <select
                  id="funcionario"
                  value={form.utilizador_id}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, utilizador_id: e.target.value }))
                  }
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  required
                >
                  <option value="">Selecionar…</option>
                  {staff.map((u) => (
                    <option key={u._id} value={u._id}>
                      {u.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="data_inicio" className="text-sm font-medium">
                  Data de Início
                </label>
                <Input
                  id="data_inicio"
                  type="date"
                  value={form.data_inicio}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, data_inicio: e.target.value }))
                  }
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="data_fim" className="text-sm font-medium">
                  Data de Fim
                </label>
                <Input
                  id="data_fim"
                  type="date"
                  value={form.data_fim}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, data_fim: e.target.value }))
                  }
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="tipo" className="text-sm font-medium">
                  Tipo
                </label>
                <select
                  id="tipo"
                  value={form.tipo}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      tipo: e.target.value as TipoAusencia,
                    }))
                  }
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="folga">Folga</option>
                  <option value="ferias">Férias</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="notas" className="text-sm font-medium">
                  Notas{" "}
                  <span className="font-normal text-muted-foreground">
                    (opcional)
                  </span>
                </label>
                <Input
                  id="notas"
                  value={form.notas}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, notas: e.target.value }))
                  }
                  placeholder="Ex.: férias pagas"
                />
              </div>
            </div>

            {formErro && (
              <p className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                {formErro}
              </p>
            )}

            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  A agendar…
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Agendar
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Erro de carregamento */}
      {erro && !loading && (
        <Card className="border-destructive/50">
          <CardContent className="flex items-center gap-3 p-4 text-sm text-destructive">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <div className="flex-1">
              <p className="font-medium">Ocorreu um erro.</p>
              <p className="text-xs opacity-80">{erro}</p>
            </div>
            <Button variant="outline" size="sm" onClick={carregar}>
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Tabela de ausências agendadas */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              A carregar ausências…
            </div>
          ) : ausencias.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
              <CalendarDays className="h-10 w-10 opacity-40" />
              <p className="text-sm">Sem ausências agendadas.</p>
              <p className="text-xs">
                Marca férias ou folgas no formulário acima.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left">
                    <th className="px-4 py-3 font-medium">Funcionário</th>
                    <th className="px-4 py-3 font-medium">Tipo</th>
                    <th className="px-4 py-3 font-medium">Período</th>
                    <th className="px-4 py-3 font-medium">Notas</th>
                    <th className="px-4 py-3 text-right font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {ausencias.map((a) => (
                    <tr key={a._id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">
                        {a.utilizador?.nome ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={a.tipo === "ferias" ? "default" : "secondary"}
                          className="gap-1"
                        >
                          {a.tipo === "ferias" ? (
                            <Plane className="h-3 w-3" />
                          ) : (
                            <Sun className="h-3 w-3" />
                          )}
                          {TIPO_LABEL[a.tipo]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatarPeriodo(a.data_inicio, a.data_fim)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {a.notas || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => handleEliminar(a)}
                            aria-label={`Eliminar ausência de ${a.utilizador?.nome}`}
                            title="Eliminar"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
