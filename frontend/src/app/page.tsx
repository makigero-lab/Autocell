import Link from "next/link";
import {
  LayoutDashboard,
  Smartphone,
  Sparkles,
  ArrowRight,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Página inicial — ponto de entrada.
 * Redireciona visualmente o utilizador para as duas áreas da aplicação:
 *  - /admin  → Painel de Administração (desktop-first)
 *  - /staff  → Área do Staff (mobile-first)
 */
export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-emerald-50 to-background p-6">
      <div className="mb-10 flex flex-col items-center text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
          <Sparkles className="h-7 w-7" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Autocell
        </h1>
        <p className="mt-2 max-w-md text-muted-foreground">
          SaaS de gestão para Alojamento Local. Escolhe a área que queres
          visualizar.
        </p>
      </div>

      <div className="grid w-full max-w-3xl gap-6 sm:grid-cols-2">
        <Card className="group transition-shadow hover:shadow-lg">
          <CardHeader>
            <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <LayoutDashboard className="h-6 w-6" />
            </div>
            <CardTitle className="text-xl">Painel de Administração</CardTitle>
            <CardDescription>
              Dashboard com barra lateral: Propriedades, Equipa e Calendário de
              Folgas.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/admin" prefetch>
              <Button className="w-full sm:w-auto">
                Abrir Admin
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="group transition-shadow hover:shadow-lg">
          <CardHeader>
            <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Smartphone className="h-6 w-6" />
            </div>
            <CardTitle className="text-xl">Área do Staff</CardTitle>
            <CardDescription>
              Interface mobile-first com as tarefas de limpeza do dia.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/staff" prefetch>
              <Button className="w-full sm:w-auto" variant="outline">
                Abrir Staff
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      <p className="mt-10 text-xs text-muted-foreground">
        Dados fictícios (mock) — sem ligação à API nesta fase.
      </p>
    </main>
  );
}
