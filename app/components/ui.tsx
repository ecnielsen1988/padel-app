import Link from "next/link";
import type { ReactNode } from "react";

type PageShellProps = {
  children: ReactNode;
  className?: string;
};

type HeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
};

type ActionCardProps = {
  href: string;
  icon: string;
  title: string;
  description: string;
  accent?: "rose" | "gold" | "emerald" | "slate";
  badge?: string | number | null;
};

function joinClasses(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function PageShell({ children, className }: PageShellProps) {
  return (
    <main className={joinClasses("padel-page-shell", className)}>
      <div className="padel-page-glow padel-page-glow-left" />
      <div className="padel-page-glow padel-page-glow-right" />
      <div className="padel-page-content">{children}</div>
    </main>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: HeaderProps) {
  return (
    <section className="padel-surface padel-hero">
      <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
        <div className="max-w-2xl space-y-3">
          {eyebrow ? <p className="padel-eyebrow">{eyebrow}</p> : null}
          <h1 className="padel-title">{title}</h1>
          {description ? <p className="padel-lead">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </section>
  );
}

export function ActionCard({
  href,
  icon,
  title,
  description,
  accent = "rose",
  badge,
}: ActionCardProps) {
  return (
    <Link href={href} className={joinClasses("padel-action-card", `accent-${accent}`)}>
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <span className="padel-action-icon" aria-hidden="true">
              {icon}
            </span>
            <span className="padel-action-title">{title}</span>
          </div>
          <p className="padel-action-description">{description}</p>
        </div>
        {badge ? <span className="padel-badge">{badge}</span> : null}
      </div>
    </Link>
  );
}

export function StatusPill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning";
}) {
  return <span className={joinClasses("padel-status-pill", `tone-${tone}`)}>{children}</span>;
}

export function LoadingState({ text = "Indlæser..." }: { text?: string }) {
  return (
    <PageShell className="justify-center">
      <section className="padel-surface mx-auto max-w-md text-center">
        <p className="padel-eyebrow">Et øjeblik</p>
        <h1 className="padel-title text-3xl">{text}</h1>
      </section>
    </PageShell>
  );
}

export function LoggedOutState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <PageShell className="justify-center">
      <section className="padel-surface mx-auto max-w-md space-y-6 text-center">
        <div className="space-y-3">
          <p className="padel-eyebrow">Adgang kræves</p>
          <h1 className="padel-title text-3xl">{title}</h1>
          <p className="padel-lead">{description}</p>
        </div>
        <Link href="/login" className="padel-primary-button inline-flex">
          Log ind
        </Link>
      </section>
    </PageShell>
  );
}
