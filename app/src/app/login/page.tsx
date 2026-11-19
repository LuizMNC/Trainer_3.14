import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginView } from "@/components/LoginView";
import { sanitizeNextPath } from "@/lib/server/accessAuth";
import { getServerSessionStatus } from "@/lib/server/serverSession";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Entrar · TreinerLM",
  robots: {
    index: false,
    follow: false,
  },
};

interface LoginPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const rawNext = Array.isArray(params.next) ? params.next[0] : params.next;
  const safeNext = sanitizeNextPath(rawNext);
  const { state, authenticated } = await getServerSessionStatus();

  if (state === "disabled" || authenticated) {
    redirect(safeNext);
  }

  return (
    <LoginView
      configured={state !== "misconfigured"}
      nextPath={safeNext}
    />
  );
}
