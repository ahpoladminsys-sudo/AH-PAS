import { useMemo, useState, type ReactNode } from 'react';
import { BarChart3, BriefcaseBusiness, ChevronRight, FileSpreadsheet, Files, LayoutDashboard, Menu, RefreshCw } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { useGetSheetsStatus } from '@workspace/api-client-react';

const nav = [
  { href: '/', label: 'Underwriting desk', icon: LayoutDashboard },
  { href: '/opportunities', label: 'Opportunities', icon: BriefcaseBusiness },
  { href: '/policies', label: 'Policies', icon: Files },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
];

export function WorkspaceShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data: sheetsStatus, isLoading: sheetsLoading } = useGetSheetsStatus();
  const activeLabel = useMemo(() => nav.find((item) => item.href === location)?.label ?? 'Workspace', [location]);
  const configured = Boolean(sheetsStatus?.configured);

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`} aria-label="Primary navigation">
        <div className="brand">
          <div className="brand-mark">sl</div>
          <div>
            <div className="brand-name">Northstar</div>
            <div className="brand-kicker">Stop loss workspace</div>
          </div>
        </div>
        <div className="nav-label">Workspace</div>
        {nav.map((item) => {
          const Icon = item.icon;
          const active = location === item.href;
          return (
            <Link href={item.href} key={item.href} onClick={() => setMobileOpen(false)} className={`nav-link ${active ? 'active' : ''}`} data-testid={`link-${item.label.toLowerCase().replaceAll(' ', '-')}`}>
              <Icon size={16} strokeWidth={active ? 2.2 : 1.8} />
              <span>{item.label}</span>
              {active && <ChevronRight size={13} className="ml-auto" />}
            </Link>
          );
        })}
        <div className="nav-label">Connected tools</div>
        <Link href="/sync" onClick={() => setMobileOpen(false)} className={`nav-link ${location === '/sync' ? 'active' : ''}`} data-testid="link-sheets-sync">
          <FileSpreadsheet size={16} />
          <span>Google Sheets sync</span>
        </Link>
        <div className="sidebar-foot">
          <div className="sync-mini">
            <span className={`dot ${configured ? 'pulse' : ''}`} />
            <span>{sheetsLoading ? 'Checking connection' : configured ? 'Sheets connected' : 'Sheets not configured'}</span>
          </div>
          <div className="muted" style={{ color: 'hsl(var(--sidebar-foreground) / .48)', fontSize: 10, marginTop: 7, lineHeight: 1.45 }}>
            Trustworthy intake, pricing, and policy handoff.
          </div>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="top-actions">
            <button className="btn btn-quiet mobile-menu" onClick={() => setMobileOpen((open) => !open)} data-testid="button-open-menu" aria-label="Open navigation"><Menu size={18} /></button>
            <div className="crumb"><strong>Northstar</strong><span style={{ margin: '0 7px', opacity: .5 }}>/</span>{activeLabel}</div>
          </div>
          <div className="top-actions">
            <Link href="/sync" className="btn btn-outline" data-testid="link-sync-topbar"><RefreshCw size={13} /> Sync center</Link>
            <div className="avatar" data-testid="text-user-avatar">AR</div>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}

export function StatusPill({ tone = 'neutral', children, testId }: { tone?: 'good' | 'warn' | 'bad' | 'neutral'; children: ReactNode; testId?: string }) {
  return <span className={`status-pill ${tone}`} data-testid={testId}><span className="dot" style={{ background: 'currentColor', width: 5, height: 5 }} />{children}</span>;
}

export function PageHeader({ eyebrow, title, subtitle, actions }: { eyebrow: string; title: ReactNode; subtitle: string; actions?: ReactNode }) {
  return (
    <div className="heading-row">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1 className="page-title">{title}</h1>
        <p className="page-subtitle">{subtitle}</p>
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}

export function MetricCard({ label, value, note, testId }: { label: string; value: string; note: string; testId: string }) {
  return <div className="metric" data-testid={testId}><div className="metric-label">{label}</div><div className="metric-value mono">{value}</div><div className="metric-note">{note}</div></div>;
}

export function SectionCard({ title, description, children, className = '', action }: { title: string; description?: string; children: ReactNode; className?: string; action?: ReactNode }) {
  return <section className={`card ${className}`}><div className="card-head"><div><div className="card-title">{title}</div>{description && <div className="card-desc">{description}</div>}</div>{action}</div><div className="card-body">{children}</div></section>;
}

export function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-label="Loading" />;
}