"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Building2, Loader2, AlertCircle, RefreshCw } from "lucide-react";

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
  type PropriedadeDTO,
} from "@/lib/api";

/**
 * Página de Propriedades — Painel de Administração.
 *
 * Consome a API real (GET/POST /api/admin/propriedades) em vez do mock-data.
 *
 * O JWT é enviado automaticamente pelo helper `adminGet`/`adminPost`
 * (header `Authorization: Bearer <token>`, ver `src/lib/api.ts`).
 */
export default function PropriedadesPage() {
  const [propriedades, setPropriedades] = useState<PropriedadeDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  // Estado do formulário de criação
  const [mostrarForm, setMostrarForm] = useState(false);
  const [form, setForm] = useState({
    nome: "",
    smoobu_id: "",
    tempo_limpeza_minutos: "60",
  });
  const [submitting, setSubmitting] = useState(false);
  const [formErro, setFormErro] = useState<string | null>(null);

  /** Carrega as propriedades da API. */
  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const data = await adminGet<{ propriedades: PropriedadeDTO[] }>(
        "/api/admin/propriedades"
      );
      setPropriedades(data.propriedades ?? []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar propriedades.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  /** Submete o formulário de nova propriedade. */
  async function handleSubmeter(e: React.FormEvent) {
    e.preventDefault();
    setFormErro(null);

    if (!form.nome.trim() || !form.smoobu_id.trim()) {
      setFormErro("Nome e Smoobu ID são obrigatórios.");
      return;
    }

    const tempo = Number(form.tempo_limpeza_minutos);
    if (Number.isNaN(tempo) || tempo < 0) {
      setFormErro("Tempo de Limpeza deve ser um número maior ou igual a 0.");
      return;
    }

    setSubmitting(true);
    try {
      await adminPost("/api/admin/propriedades", {
        nome: form.nome.trim(),
        smoobu_id: form.smoobu_id.trim(),
        tempo_limpeza_minutos: tempo,
      });
      // Limpa o formulário e atualiza a tabela automaticamente.
      setForm({ nome: "", smoobu_id: "", tempo_limpeza_minutos: "60" });
      setMostrarForm(false);
      await carregar();
    } catch (e) {
      setFormErro(e instanceof Error ? e.message : "Erro ao criar propriedade.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="hidden flex-col gap-1 lg:flex">
          <h1 className="text-2xl font-bold tracking-tight">Propriedades</h1>
          <p className="text-sm text-muted-foreground">
            Alojamentos sincronizados com o Smoobu.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={carregar}
            disabled={loading}
            aria-label="Atualizar"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button onClick={() => setMostrarForm((v) => !v)}>
            <Plus className="h-4 w-4" />
            Nova Propriedade
          </Button>
        </div>
      </div>

      {/* Formulário inline de criação */}
      {mostrarForm && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-5 w-5 text-primary" />
              Nova Propriedade
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmeter} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <label htmlFor="nome" className="text-sm font-medium">
                    Nome
                  </label>
                  <Input
                    id="nome"
                    value={form.nome}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, nome: e.target.value }))
                    }
                    placeholder="Ex.: Apartamento Maré Alta"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="smoobu_id" className="text-sm font-medium">
                    Smoobu ID
                  </label>
                  <Input
                    id="smoobu_id"
                    value={form.smoobu_id}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, smoobu_id: e.target.value }))
                    }
                    placeholder="Ex.: 67890"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label
                    htmlFor="tempo_limpeza_minutos"
                    className="text-sm font-medium"
                  >
                    Tempo de Limpeza (min)
                  </label>
                  <Input
                    id="tempo_limpeza_minutos"
                    type="number"
                    min={0}
                    value={form.tempo_limpeza_minutos}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        tempo_limpeza_minutos: e.target.value,
                      }))
                    }
                    placeholder="60"
                  />
                </div>
              </div>

              {formErro && (
                <p className="flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  {formErro}
                </p>
              )}

              <div className="flex items-center gap-2">
                <Button type="submit" disabled={submitting}>
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      A guardar…
                    </>
                  ) : (
                    "Guardar Propriedade"
                    )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setMostrarForm(false);
                    setFormErro(null);
                    setForm({ nome: "", smoobu_id: "", tempo_limpeza_minutos: "60" });
                  }}
                  disabled={submitting}
                >
                  Cancelar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Erro de carregamento */}
      {erro && !loading && (
        <Card className="border-destructive/50">
          <CardContent className="flex items-center gap-3 p-4 text-sm text-destructive">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <div className="flex-1">
              <p className="font-medium">Não foi possível carregar as propriedades.</p>
              <p className="text-xs opacity-80">{erro}</p>
            </div>
            <Button variant="outline" size="sm" onClick={carregar}>
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Tabela de propriedades */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              A carregar propriedades…
            </div>
          ) : propriedades.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
              <Building2 className="h-10 w-10 opacity-40" />
              <p className="text-sm">Ainda não há propriedades.</p>
              <p className="text-xs">
                Clica em “Nova Propriedade” para adicionar a primeira.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left">
                    <th className="px-4 py-3 font-medium">Nome</th>
                    <th className="px-4 py-3 font-medium">Smoobu ID</th>
                    <th className="px-4 py-3 font-medium">Tempo de Limpeza</th>
                    <th className="px-4 py-3 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {propriedades.map((p) => (
                    <tr key={p._id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{p.nome}</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {p.smoobu_id}
                      </td>
                      <td className="px-4 py-3">{p.tempo_limpeza_minutos} min</td>
                      <td className="px-4 py-3">
                        <Badge variant={p.ativo ? "success" : "secondary"}>
                          {p.ativo ? "Ativo" : "Inativo"}
                        </Badge>
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
