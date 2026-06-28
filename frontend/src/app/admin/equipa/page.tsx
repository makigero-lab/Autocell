"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Plus,
  Users,
  Loader2,
  AlertCircle,
  RefreshCw,
  Pencil,
  Trash2,
  Power,
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
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
  DialogContent,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  adminGet,
  adminPost,
  adminPut,
  adminPatch,
  adminDelete,
  type UtilizadorDTO,
  type Role,
} from "@/lib/api";

/**
 * Página de Equipa — Painel de Administração (CRUD completo).
 *
 * Consome a API real (GET/POST/PUT/PATCH/DELETE /api/admin/equipa) com JWT
 * no header Authorization (via helpers adminGet/adminPost/adminPut/...).
 *
 * Lista os membros numa tabela (Nome, Email, Role, Estado, Ações) e permite:
 *   - Adicionar (formulário inline)
 *   - Editar (modal: nome, email, role, password opcional)
 *   - Ativar/Desativar (toggle instantâneo)
 *   - Eliminar (com confirmação)
 */

const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  manager: "Responsável",
  staff: "Staff",
};

const ROLE_VARIANT: Record<Role, "default" | "secondary" | "outline"> = {
  admin: "default",
  manager: "secondary",
  staff: "outline",
};

const DIAS_SEMANA = [
  { valor: 0, label: "Dom" },
  { valor: 1, label: "Seg" },
  { valor: 2, label: "Ter" },
  { valor: 3, label: "Qua" },
  { valor: 4, label: "Qui" },
  { valor: 5, label: "Sex" },
  { valor: 6, label: "Sáb" },
];

/** Componente de checkboxes para Folgas Semanais Fixas (0=Dom a 6=Sáb). */
function FolgasSemanaisCheckboxes({
  diasFolga,
  onChange,
}: {
  diasFolga: number[];
  onChange: (dias: number[]) => void;
}) {
  function toggle(dia: number) {
    if (diasFolga.includes(dia)) {
      onChange(diasFolga.filter((d) => d !== dia));
    } else {
      onChange([...diasFolga, dia].sort((a, b) => a - b));
    }
  }

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">
        Folgas Semanais Fixas{" "}
        <span className="font-normal text-muted-foreground">
          (dias de descanso habituais — o sistema ignora o staff nestes dias)
        </span>
      </label>
      <div className="flex flex-wrap gap-2">
        {DIAS_SEMANA.map((d) => {
          const checked = diasFolga.includes(d.valor);
          return (
            <button
              key={d.valor}
              type="button"
              onClick={() => toggle(d.valor)}
              className={`inline-flex h-9 min-w-[3rem] items-center justify-center rounded-md border px-3 text-sm font-medium transition-colors ${
                checked
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-background hover:bg-accent hover:text-accent-foreground"
              }`}
            >
              {d.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function EquipaPage() {
  const [utilizadores, setUtilizadores] = useState<UtilizadorDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  // Formulário de criação
  const [mostrarForm, setMostrarForm] = useState(false);
  const [form, setForm] = useState({
    nome: "",
    email: "",
    password: "",
    role: "staff" as Role,
    responsavel_id: "" as string,
    dias_folga: [] as number[],
  });
  const [submitting, setSubmitting] = useState(false);
  const [formErro, setFormErro] = useState<string | null>(null);

  // Modal de edição
  const [editando, setEditando] = useState<UtilizadorDTO | null>(null);
  const [editForm, setEditForm] = useState({
    nome: "",
    email: "",
    role: "staff" as Role,
    password: "", // vazia = não alterar
    responsavel_id: "" as string,
    dias_folga: [] as number[],
  });
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editErro, setEditErro] = useState<string | null>(null);

  // Modal de confirmação de eliminação
  const [eliminando, setEliminando] = useState<UtilizadorDTO | null>(null);
  const [elimSubmitting, setElimSubmitting] = useState(false);

  // Utilizadores que podem ser responsáveis (admin + manager).
  // Usado para popular o select de Responsável nos formulários.
  const responsaveisPossiveis = utilizadores.filter(
    (u) => u.role === "admin" || u.role === "manager"
  );

  /** Carrega os utilizadores da API. */
  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const data = await adminGet<{ utilizadores: UtilizadorDTO[] }>(
        "/api/admin/equipa"
      );
      setUtilizadores(data.utilizadores ?? []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar equipa.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  /** Submete o formulário de novo membro. */
  async function handleSubmeter(e: React.FormEvent) {
    e.preventDefault();
    setFormErro(null);

    if (!form.nome.trim() || !form.email.trim() || !form.password) {
      setFormErro("Nome, Email e Password são obrigatórios.");
      return;
    }
    if (form.password.length < 6) {
      setFormErro("A password deve ter pelo menos 6 caracteres.");
      return;
    }

    setSubmitting(true);
    try {
      await adminPost("/api/admin/equipa", {
        nome: form.nome.trim(),
        email: form.email.trim(),
        password: form.password,
        role: form.role,
        responsavel_id: form.responsavel_id || null,
        dias_folga: form.dias_folga,
      });
      setForm({ nome: "", email: "", password: "", role: "staff", responsavel_id: "", dias_folga: [] });
      setMostrarForm(false);
      await carregar();
    } catch (e) {
      setFormErro(e instanceof Error ? e.message : "Erro ao criar utilizador.");
    } finally {
      setSubmitting(false);
    }
  }

  /** Abre o modal de edição com os dados atuais do utilizador. */
  function abrirEdicao(u: UtilizadorDTO) {
    setEditando(u);
    setEditForm({
      nome: u.nome,
      email: u.email,
      role: u.role,
      password: "",
      responsavel_id: u.responsavel_id ?? "",
      dias_folga: u.dias_folga ?? [],
    });
    setEditErro(null);
  }

  /** Submete a edição (PUT). Password só é enviada se preenchida. */
  async function handleEditar(e: React.FormEvent) {
    e.preventDefault();
    if (!editando) return;
    setEditErro(null);

    if (!editForm.nome.trim() || !editForm.email.trim()) {
      setEditErro("Nome e Email são obrigatórios.");
      return;
    }
    if (editForm.password && editForm.password.length < 6) {
      setEditErro("A nova password deve ter pelo menos 6 caracteres.");
      return;
    }

    setEditSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        nome: editForm.nome.trim(),
        email: editForm.email.trim(),
        role: editForm.role,
        responsavel_id: editForm.responsavel_id || null,
        dias_folga: editForm.dias_folga,
      };
      if (editForm.password) body.password = editForm.password;

      await adminPut(`/api/admin/equipa/${editando._id}`, body);
      setEditando(null);
      await carregar();
    } catch (e) {
      setEditErro(e instanceof Error ? e.message : "Erro ao atualizar.");
    } finally {
      setEditSubmitting(false);
    }
  }

  /** Alterna ativo/desativo (PATCH). */
  async function handleToggleAtivo(u: UtilizadorDTO) {
    // Otimismo: atualiza UI imediatamente; reverte se falhar.
    setUtilizadores((prev) =>
      prev.map((x) => (x._id === u._id ? { ...x, ativo: !x.ativo } : x))
    );
    try {
      await adminPatch(`/api/admin/equipa/${u._id}/estado`);
    } catch (e) {
      // Reverte em caso de erro.
      setUtilizadores((prev) =>
        prev.map((x) => (x._id === u._id ? { ...x, ativo: u.ativo } : x))
      );
      setErro(e instanceof Error ? e.message : "Erro ao alterar estado.");
    }
  }

  /** Elimina utilizador (DELETE) com confirmação. */
  async function handleEliminar() {
    if (!eliminando) return;
    setElimSubmitting(true);
    try {
      await adminDelete(`/api/admin/equipa/${eliminando._id}`);
      setEliminando(null);
      await carregar();
    } catch (e) {
      setEditErro(e instanceof Error ? e.message : "Erro ao eliminar.");
    } finally {
      setElimSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="hidden flex-col gap-1 lg:flex">
          <h1 className="text-2xl font-bold tracking-tight">Equipa</h1>
          <p className="text-sm text-muted-foreground">
            Membros da equipa (Admin, Responsável e Staff).
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
            Adicionar Funcionário
          </Button>
        </div>
      </div>

      {/* Formulário inline de criação */}
      {mostrarForm && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-5 w-5 text-primary" />
              Novo Funcionário
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmeter} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                    placeholder="Ex.: Maria Ferreira"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="email" className="text-sm font-medium">
                    Email
                  </label>
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, email: e.target.value }))
                    }
                    placeholder="exemplo@autocell.pt"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="password" className="text-sm font-medium">
                    Password
                  </label>
                  <Input
                    id="password"
                    type="password"
                    value={form.password}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, password: e.target.value }))
                    }
                    placeholder="Mín. 6 caracteres"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="role" className="text-sm font-medium">
                    Role
                  </label>
                  <select
                    id="role"
                    value={form.role}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, role: e.target.value as Role }))
                    }
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <option value="staff">Staff</option>
                    <option value="manager">Responsável</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="responsavel" className="text-sm font-medium">
                    Responsável{" "}
                    <span className="font-normal text-muted-foreground">
                      (opcional)
                    </span>
                  </label>
                  <select
                    id="responsavel"
                    value={form.responsavel_id}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, responsavel_id: e.target.value }))
                    }
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <option value="">— Sem responsável —</option>
                    {responsaveisPossiveis.map((r) => (
                      <option key={r._id} value={r._id}>
                        {r.nome} ({ROLE_LABEL[r.role]})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Folgas Semanais Fixas */}
              <FolgasSemanaisCheckboxes
                diasFolga={form.dias_folga}
                onChange={(dias) => setForm((f) => ({ ...f, dias_folga: dias }))}
              />

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
                    "Guardar Funcionário"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setMostrarForm(false);
                    setFormErro(null);
                    setForm({ nome: "", email: "", password: "", role: "staff", responsavel_id: "", dias_folga: [] });
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
              <p className="font-medium">Não foi possível carregar a equipa.</p>
              <p className="text-xs opacity-80">{erro}</p>
            </div>
            <Button variant="outline" size="sm" onClick={carregar}>
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Tabela de utilizadores */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              A carregar equipa…
            </div>
          ) : utilizadores.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
              <Users className="h-10 w-10 opacity-40" />
              <p className="text-sm">Ainda não há membros na equipa.</p>
              <p className="text-xs">
                Clica em “Adicionar Funcionário” para adicionar o primeiro.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left">
                    <th className="px-4 py-3 font-medium">Nome</th>
                    <th className="px-4 py-3 font-medium">Email</th>
                    <th className="px-4 py-3 font-medium">Role</th>
                    <th className="px-4 py-3 font-medium">Responsável</th>
                    <th className="px-4 py-3 font-medium">Estado</th>
                    <th className="px-4 py-3 text-right font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {utilizadores.map((u) => (
                    <tr key={u._id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{u.nome}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {u.email}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={ROLE_VARIANT[u.role]}>
                          {ROLE_LABEL[u.role]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {u.responsavel ? u.responsavel.nome : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={u.ativo ? "success" : "secondary"}>
                          {u.ativo ? "Ativo" : "Inativo"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        {/* Admin: linha só de leitura (sem ações) */}
                        {u.role === "admin" ? (
                          <span className="text-xs text-muted-foreground">
                            —
                          </span>
                        ) : (
                          <div className="flex items-center justify-end gap-1">
                            {/* Editar */}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => abrirEdicao(u)}
                              aria-label={`Editar ${u.nome}`}
                              title="Editar"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            {/* Ativar/Desativar */}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleToggleAtivo(u)}
                              aria-label={u.ativo ? "Desativar" : "Ativar"}
                              title={u.ativo ? "Desativar" : "Ativar"}
                            >
                              <Power className="h-4 w-4" />
                            </Button>
                            {/* Eliminar */}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => setEliminando(u)}
                              aria-label={`Eliminar ${u.nome}`}
                              title="Eliminar"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal de Edição */}
      <Dialog
        open={editando !== null}
        onOpenChange={(o) => !o && setEditando(null)}
      >
        <DialogHeader>
          <div>
            <DialogTitle>Editar Utilizador</DialogTitle>
            <DialogDescription>
              Atualiza os dados do funcionário. Deixa a password vazia para
              manter a atual.
            </DialogDescription>
          </div>
          <DialogClose onClick={() => setEditando(null)} />
        </DialogHeader>
        <form onSubmit={handleEditar}>
          <DialogContent className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="edit-nome" className="text-sm font-medium">
                Nome
              </label>
              <Input
                id="edit-nome"
                value={editForm.nome}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, nome: e.target.value }))
                }
                required
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="edit-email" className="text-sm font-medium">
                Email
              </label>
              <Input
                id="edit-email"
                type="email"
                value={editForm.email}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, email: e.target.value }))
                }
                required
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="edit-role" className="text-sm font-medium">
                Role
              </label>
              <select
                id="edit-role"
                value={editForm.role}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, role: e.target.value as Role }))
                }
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="staff">Staff</option>
                <option value="manager">Responsável</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="edit-responsavel" className="text-sm font-medium">
                Responsável{" "}
                <span className="font-normal text-muted-foreground">
                  (opcional)
                </span>
              </label>
              <select
                id="edit-responsavel"
                value={editForm.responsavel_id}
                onChange={(e) =>
                  setEditForm((f) => ({
                    ...f,
                    responsavel_id: e.target.value,
                  }))
                }
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="">— Sem responsável —</option>
                {responsaveisPossiveis
                  .filter((r) => r._id !== editando?._id)
                  .map((r) => (
                    <option key={r._id} value={r._id}>
                      {r.nome} ({ROLE_LABEL[r.role]})
                    </option>
                  ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="edit-password" className="text-sm font-medium">
                Nova Password{" "}
                <span className="font-normal text-muted-foreground">
                  (opcional)
                </span>
              </label>
              <Input
                id="edit-password"
                type="password"
                value={editForm.password}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, password: e.target.value }))
                }
                placeholder="Deixa vazio para manter"
              />
              <p className="text-xs text-muted-foreground">
                Útil para redefinir a password se o funcionário se esquecer.
              </p>
            </div>

            {/* Folgas Semanais Fixas */}
            <FolgasSemanaisCheckboxes
              diasFolga={editForm.dias_folga}
              onChange={(dias) =>
                setEditForm((f) => ({ ...f, dias_folga: dias }))
              }
            />

            {editErro && (
              <p className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                {editErro}
              </p>
            )}
          </DialogContent>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditando(null)}
              disabled={editSubmitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={editSubmitting}>
              {editSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  A guardar…
                </>
              ) : (
                "Guardar Alterações"
              )}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>

      {/* Modal de Confirmação de Eliminação */}
      <Dialog
        open={eliminando !== null}
        onOpenChange={(o) => !o && setEliminando(null)}
      >
        <DialogHeader>
          <div>
            <DialogTitle>Eliminar Utilizador</DialogTitle>
            <DialogDescription>
              Esta ação é permanente e não pode ser desfeita.
            </DialogDescription>
          </div>
          <DialogClose onClick={() => setEliminando(null)} />
        </DialogHeader>
        <DialogContent className="space-y-3">
          <p className="text-sm">
            Tens a certeza que queres eliminar{" "}
            <span className="font-semibold">{eliminando?.nome}</span> (
            {eliminando?.email})?
          </p>
          <p className="text-xs text-muted-foreground">
            O utilizador perderá imediatamente o acesso à plataforma. Se só
            quiseres suspender o acesso temporariamente, usa o botão de
            Desativar.
          </p>
          {editErro && (
            <p className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              {editErro}
            </p>
          )}
        </DialogContent>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setEliminando(null)}
            disabled={elimSubmitting}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleEliminar}
            disabled={elimSubmitting}
          >
            {elimSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                A eliminar…
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4" />
                Eliminar Definitivamente
              </>
            )}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
