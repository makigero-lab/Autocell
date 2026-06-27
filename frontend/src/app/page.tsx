import Link from "next/link";
import {
  LayoutDashboard,
  Smartphone,
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
 * Página inicial — ponto de entrada (rebranding premium).
 *
 * Estética: fundo limpo (branco/zinc-50), tipografia pesada/sóbria,
 * cartões luxuosos com borda discreta e sombra suave. Sem gradientes
 * coloridos — ar corporativo de Property Management de alto nível.
 */
export default function HomePage() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-6 py-16">
      {/* Padrão de fundo subtil (grid em pontos) — dá profundidade sem distrair */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,hsl(var(--foreground)/0.04)_1px,transparent_1px)] [background-size:24px_24px]"
      />

      <div className="relative z-10 mb-12 flex flex-col items-center text-center">
        {/* Marca minimalista */}
        <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm ring-1 ring-primary/20">
          <span className="text-lg font-bold tracking-tight">A</span>
        </div>

        <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          Autocell
        </h1>
        <p className="mt-3 max-w-md text-base font-light leading-relaxed text-muted-foreground">
          SaaS de gestão para Alojamento Local.
          <br className="hidden sm:block" />
          Escolhe a área que queres visualizar.
        </p>

        {/* Separador discreto */}
        <div className="mt-6 h-px w-16 bg-border" />
      </div>

      <div className="relative z-10 grid w-full max-w-3xl gap-5 sm:grid-cols-2">
        {/* Cartão Admin */}
        <Card className="group overflow-hidden border-border/60 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md">
          <CardHeader className="space-y-4 pb-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-md bg-primary/5 text-primary ring-1 ring-primary/10 transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
              <LayoutDashboard className="h-5 w-5" strokeWidth={1.75} />
            </div>
            <div className="space-y-1.5">
              <CardTitle className="text-xl font-semibold tracking-tight">
                Painel de Administração
              </CardTitle>
              <CardDescription className="font-light leading-relaxed">
                Dashboard com barra lateral: Propriedades, Equipa e
                Calendário de Folgas.
              </CardDescription>
            </div>
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

        {/* Cartão Staff */}
        <Card className="group overflow-hidden border-border/60 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md">
          <CardHeader className="space-y-4 pb-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-md bg-primary/5 text-primary ring-1 ring-primary/10 transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
              <Smartphone className="h-5 w-5" strokeWidth={1.75} />
            </div>
            <div className="space-y-1.5">
              <CardTitle className="text-xl font-semibold tracking-tight">
                Área do Staff
              </CardTitle>
              <CardDescription className="font-light leading-relaxed">
                Interface mobile-first com as tarefas de limpeza do dia.
              </CardDescription>
            </div>
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

      <p className="relative z-10 mt-12 text-xs font-light tracking-wide text-muted-foreground">
        Autocell · Gestão de Alojamento Local
      </p>
    </main>
  );
}
