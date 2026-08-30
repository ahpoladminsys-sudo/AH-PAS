import { useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, ClipboardList, Plus, Search, Send, SlidersHorizontal } from 'lucide-react';
import { Link } from 'wouter';
import { PageHeader, SectionCard, StatusPill } from '@/components/workspace-shell';
import { getApplicationTabs, updateApplicationTab } from '@/hooks/use-sheet-workspace';

type Opportunity = { account: string; market: string; renewal: string; employees: string; premium: string; owner: string; stage: string };
const initial: Opportunity[] = [
  { account: 'Redwood Logistics', market: 'Pacific Northwest', renewal: 'Oct 01, 2025', employees: '1,840', premium: '$468,200', owner: 'Avery Ross', stage: 'Pricing' },
  { account: 'Juniper Health', market: 'Midwest', renewal: 'Sep 15, 2025', employees: '620', premium: '$221,800', owner: 'Mina Patel', stage: 'Submission' },
  { account: 'Harbor & Pine', market: 'Southeast', renewal: 'Nov 01, 2025', employees: '312', premium: '$98,400', owner: 'Avery Ross', stage: 'RFP intake' },
  { account: 'Cinder & Co.', market: 'Northeast', renewal: 'Aug 15, 2025', employees: '940', premium: '$306,700', owner: 'Jules Wright', stage: 'Negotiation' },
  { account: 'Atlas Fabrication', market: 'Southwest', renewal: 'Jan 01, 2026', employees: '2,400', premium: '$610,200', owner: 'Mina Patel', stage: 'Bound' },
  { account: 'Lumen Dental', market: 'Mountain', renewal: 'Dec 01, 2025', employees: '488', premium: '$192,400', owner: 'Jules Wright', stage: 'Bound' },
];
const stages = ['RFP intake', 'Pricing', 'Submission', 'Negotiation'];

export default function Opportunities() {
  const [view, setView] = useState<'board' | 'table'>('board');
  const [query, setQuery] = useState('');
  const [saveNotice, setSaveNotice] = useState('');
  const [opportunities, setOpportunities] = useState(() => {
    const saved = getApplicationTabs().find((tab) => tab.name === 'Opportunities');
    if (!saved?.rows.length) return initial;
    return saved.rows.map((row) => ({
      account: String(row.name ?? row.account ?? 'Unnamed account'),
      market: String(row.market ?? row.state ?? row.product ?? 'Stop Loss'),
      renewal: String(row.renewal ?? row.effective ?? 'TBD'),
      employees: String(row.lives ?? row.employees ?? '0'),
      premium: formatPremium(row.premium),
      owner: String(row.owner ?? row.broker ?? 'Unassigned'),
      stage: String(row.stage ?? 'RFP intake'),
    }));
  });
  const [selected, setSelected] = useState<Opportunity | null>(null);
  const filtered = useMemo(() => opportunities.filter((item) => item.account.toLowerCase().includes(query.toLowerCase()) || item.owner.toLowerCase().includes(query.toLowerCase())), [opportunities, query]);
  const submit = () => {
    if (!selected) return;
    if (selected.account === 'New account') {
      const created = { ...selected, account: 'Portland Mutual', market: 'Pacific Northwest', renewal: 'Dec 15, 2025', employees: '540', premium: '$142,600', stage: 'Submission' };
      const next = [created, ...opportunities];
      setOpportunities(next);
      setSelected(created);
      saveOpportunities(next);
      setSaveNotice('Opportunity saved in the local workspace. Pull the latest workbook in Connected tools before an explicit cloud push.');
      return;
    }
    const next = opportunities.map((item) => item.account === selected.account ? { ...item, stage: 'Submission' } : item);
    setOpportunities(next);
    setSelected({ ...selected, stage: 'Submission' });
    saveOpportunities(next);
    setSaveNotice('Opportunity saved in the local workspace. Pull the latest workbook in Connected tools before an explicit cloud push.');
  };
  return <div className="content">
    <PageHeader eyebrow="CRM · Opportunity pipeline" title={<>Move every <em>submission</em> forward.</>} subtitle="A clean handoff from intake to pricing, with the context your underwriting team needs close at hand." actions={<><button className="btn btn-outline" onClick={() => setQuery('')} data-testid="button-clear-opportunity-filter"><SlidersHorizontal size={14} /> Clear filters</button><button className="btn btn-primary" onClick={() => setSelected({ account: 'New account', market: 'Unassigned', renewal: 'TBD', employees: '0', premium: '$0', owner: 'Avery Ross', stage: 'RFP intake' })} data-testid="button-add-opportunity"><Plus size={14} /> New opportunity</button></>} />
    {saveNotice && <div className="callout" style={{ marginBottom: 16 }} data-testid="status-opportunity-save">{saveNotice}</div>}
    <div className="tabs"><button className={`tab ${view === 'board' ? 'active' : ''}`} onClick={() => setView('board')} data-testid="button-opportunity-board">Pipeline board</button><button className={`tab ${view === 'table' ? 'active' : ''}`} onClick={() => setView('table')} data-testid="button-opportunity-table">List view</button></div>
    <div className="actions" style={{ justifyContent: 'space-between', marginBottom: 17 }}><div className="search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search accounts or owners" data-testid="input-opportunity-search" /></div><div className="muted" style={{ fontSize: 11 }}>{filtered.length} opportunities in view</div></div>
    {view === 'board' ? <div className="pipeline" data-testid="opportunity-pipeline">{stages.map((stage) => <div className="pipeline-col" key={stage}><div className="pipeline-head"><span>{stage}</span><span className="count">{filtered.filter((item) => item.stage === stage).length}</span></div>{filtered.filter((item) => item.stage === stage).map((item) => <OpportunityCard key={item.account} item={item} onClick={() => setSelected(item)} />)}</div>)}</div> : <SectionCard title="Opportunity register" description="Searchable view of active commercial work"><div className="table-wrap"><table><thead><tr><th>Account</th><th>Stage</th><th>Renewal</th><th>Employees</th><th>Premium</th><th>Owner</th><th /></tr></thead><tbody>{filtered.map((item, index) => <tr key={item.account} data-testid={`row-opportunity-${index}`}><td className="strong">{item.account}<br /><span className="muted" style={{ fontWeight: 400 }}>{item.market}</span></td><td><StatusPill tone={item.stage === 'Bound' ? 'good' : item.stage === 'Pricing' ? 'warn' : 'neutral'}>{item.stage}</StatusPill></td><td>{item.renewal}</td><td className="mono">{item.employees}</td><td className="mono">{item.premium}</td><td>{item.owner}</td><td><button className="btn btn-quiet" onClick={() => setSelected(item)} data-testid={`button-open-opportunity-${index}`}><ArrowRight size={14} /></button></td></tr>)}</tbody></table></div></SectionCard>}
    {selected && <div className="card" style={{ marginTop: 20, borderColor: 'hsl(var(--secondary) / .4)' }}><div className="card-head"><div><div className="card-title">{selected.account}</div><div className="card-desc">{selected.market} · renewal {selected.renewal}</div></div><button className="btn btn-quiet" onClick={() => setSelected(null)} data-testid="button-close-opportunity-detail">Close</button></div><div className="card-body"><div className="detail-grid"><div className="detail-cell"><span className="detail-label">Current stage</span><span className="detail-value">{selected.stage}</span></div><div className="detail-cell"><span className="detail-label">Estimated premium</span><span className="detail-value mono">{selected.premium}</span></div><div className="detail-cell"><span className="detail-label">Team size</span><span className="detail-value mono">{selected.employees}</span></div></div><div className="actions" style={{ marginTop: 15 }}><button className="btn btn-teal" onClick={submit} data-testid="button-submit-opportunity"><Send size={14} /> Send to submission</button><Link href="/" className="btn btn-outline" data-testid="link-return-underwriting"><ClipboardList size={14} /> Open underwriting desk</Link></div></div></div>}
  </div>;
}

function formatPremium(value: unknown) {
  if (typeof value === 'string' && value.trim().startsWith('$')) return value;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }) : '$0';
}

function saveOpportunities(items: Opportunity[]) {
  const existing = getApplicationTabs().find((tab) => tab.name === 'Opportunities')?.rows ?? [];
  const rows = items.map((item) => {
    const prior = existing.find((row) => String(row.name ?? row.account) === item.account);
    return {
      ...prior,
      name: item.account,
      market: item.market,
      renewal: item.renewal,
      employees: Number(item.employees.replaceAll(',', '')) || 0,
      premium: Number(item.premium.replace(/[$,]/g, '')) || 0,
      owner: item.owner,
      stage: item.stage,
    };
  });
  updateApplicationTab('Opportunities', rows);
}

function OpportunityCard({ item, onClick }: { item: Opportunity; onClick: () => void }) {
  return <button className="opportunity" onClick={onClick} style={{ textAlign: 'left', width: '100%' }} data-testid={`card-opportunity-${item.account.toLowerCase().replaceAll(' ', '-')}`}><div className="opportunity-name">{item.account}</div><div className="opportunity-meta">{item.market} · renewal {item.renewal}</div><div className="opportunity-footer"><span className="tag">{item.premium}</span><span className="muted" style={{ fontSize: 10 }}>{item.owner}</span></div></button>;
}