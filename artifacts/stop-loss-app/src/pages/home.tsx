import { useState } from 'react';
import { Activity, ArrowUpRight, Check, CircleAlert, ClipboardCheck, FileSpreadsheet, Filter, RefreshCw, ShieldCheck, UploadCloud } from 'lucide-react';
import { Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { getGetSheetsStatusQueryKey, useGetSheetsStatus } from '@workspace/api-client-react';
import { formatSyncedAt, useApplicationTabs } from '@/hooks/use-sheet-workspace';
import { MetricCard, PageHeader, SectionCard, StatusPill } from '@/components/workspace-shell';

const journey = [
  { name: 'RFP intake', meta: '3 submissions', done: true },
  { name: 'Data review', meta: '1 item to clear', done: true },
  { name: 'Pricing', meta: 'Redwood Logistics', current: true },
  { name: 'Submission', meta: 'Next up' },
  { name: 'Issued', meta: 'Policy ready' },
];

export default function Home() {
  const [selectedStep, setSelectedStep] = useState(2);
  const [showAllActivity, setShowAllActivity] = useState(false);
  const localTabs = useApplicationTabs();
  const queryClient = useQueryClient();
  const { data: sheetsStatus, isLoading: statusLoading, isError: statusError } = useGetSheetsStatus();
  const refresh = () => void queryClient.invalidateQueries({ queryKey: getGetSheetsStatusQueryKey() });
  const activity = [
    ['09:42', 'Redwood Logistics', 'Pricing assumptions updated', 'Avery Ross'],
    ['09:18', 'Juniper Health', 'Submission package assembled', 'Mina Patel'],
    ['Yesterday', 'Atlas Fabrication', 'Policy issued · SL-24-0187', 'System'],
    ['Yesterday', 'Harbor & Pine', 'RFP intake started', 'Avery Ross'],
  ];

  return (
    <div className="content">
      <PageHeader
        eyebrow="Tuesday · July 08, 2025"
        title={<>Good morning, <em>Avery.</em></>}
        subtitle="Three accounts need a decision today. Your desk is current through the latest Sheets pull."
        actions={<>
          <button className="btn btn-outline" onClick={refresh} data-testid="button-refresh-workspace"><RefreshCw size={14} /> Refresh desk</button>
          <Link href="/opportunities" className="btn btn-primary" data-testid="link-open-pipeline"><ArrowUpRight size={14} /> Open pipeline</Link>
        </>}
      />

      <div className="grid grid-kpis">
        <MetricCard label="Open opportunities" value="12" note="+2 since last Monday" testId="metric-open-opportunities" />
        <MetricCard label="Quoted premium" value="$1.84m" note="Across 7 active quotes" testId="metric-quoted-premium" />
        <MetricCard label="Awaiting review" value="04" note="One needs escalation" testId="metric-awaiting-review" />
        <MetricCard label="Issued this quarter" value="09" note="82.6% bind rate" testId="metric-issued-quarter" />
      </div>

      <div className="grid workspace-grid">
        <div>
          <SectionCard title="Quote journey" description="Redwood Logistics · renewal 01 Oct 2025" action={<StatusPill tone="warn" testId="status-quote-pricing">Pricing in progress</StatusPill>}>
            <div className="journey-wrap">
              <div className="journey" data-testid="quote-journey">
                {journey.map((step, index) => (
                  <button key={step.name} onClick={() => setSelectedStep(index)} className={`journey-step ${step.done ? 'done' : ''} ${step.current ? 'current' : ''}`} style={{ background: 'transparent', border: 0, cursor: 'pointer' }} data-testid={`button-journey-${index}`}>
                    <div className="journey-dot">{step.done ? <Check size={13} /> : index + 1}</div>
                    <div className="journey-name">{step.name}</div>
                    <div className="journey-meta">{selectedStep === index ? 'Selected' : step.meta}</div>
                  </button>
                ))}
              </div>
            </div>
            <div className="detail-grid" style={{ marginTop: 14 }}>
              <div className="detail-cell"><span className="detail-label">Selected phase</span><span className="detail-value" data-testid="text-selected-phase">{journey[selectedStep].name}</span></div>
              <div className="detail-cell"><span className="detail-label">Target premium</span><span className="detail-value mono">$468,200</span></div>
              <div className="detail-cell"><span className="detail-label">Owner</span><span className="detail-value">Avery Ross</span></div>
            </div>
          </SectionCard>

          <SectionCard title="Work queue" description="The next decisions across quote and policy work" action={<button className="btn btn-quiet" onClick={() => setShowAllActivity(!showAllActivity)} data-testid="button-toggle-queue"><Filter size={13} /> {showAllActivity ? 'Show priority' : 'Show all'}</button>}>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Account</th><th>Work item</th><th>Owner</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {(showAllActivity ? activity : activity.slice(0, 3)).map((row, index) => (
                    <tr key={row[0] + row[1]} data-testid={`row-work-queue-${index}`}>
                      <td><span className="strong">{row[1]}</span><br /><span className="muted">{row[0]}</span></td>
                      <td>{row[2]}</td><td className="muted">{row[3]}</td>
                      <td><StatusPill tone={index === 0 ? 'warn' : index === 2 ? 'good' : 'neutral'}>{index === 0 ? 'Needs action' : index === 2 ? 'Complete' : 'In review'}</StatusPill></td>
                      <td><button className="btn btn-quiet" onClick={() => setShowAllActivity(true)} data-testid={`button-open-queue-${index}`}><ArrowUpRight size={14} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </div>

        <div>
          <SectionCard title="Sheets connection" description="Your source of truth for shared underwriting data" className="sheet-card" action={<FileSpreadsheet size={17} color="hsl(var(--secondary))" />}>
            {statusLoading ? <div><div className="skeleton" style={{ height: 18, width: '65%' }} /><div className="skeleton" style={{ height: 12, width: '82%', marginTop: 10 }} /></div> :
              statusError ? <div className="callout"><CircleAlert size={16} /><span>Connection status unavailable. <Link href="/sync" style={{ color: 'hsl(var(--secondary))', fontWeight: 700 }}>Open sync center</Link> to retry.</span></div> :
              <div>
                <div className="status-row"><StatusPill tone={sheetsStatus?.configured ? 'good' : 'warn'} testId="status-sheets-home">{sheetsStatus?.configured ? 'Connected' : 'Setup needed'}</StatusPill><span className="muted">{sheetsStatus?.connection || 'Waiting for workbook'}</span></div>
                <p className="muted" style={{ fontSize: 11, lineHeight: 1.55, margin: '13px 0' }}>{sheetsStatus?.message || 'Connect a workbook to pull snapshots and keep handoffs aligned.'}</p>
                <div className="detail-cell" style={{ background: 'hsl(var(--card) / .55)', borderRadius: 6, padding: 11 }}>
                  <span className="detail-label">Last synced</span><span className="detail-value" data-testid="text-last-sync-home">{formatSyncedAt(sheetsStatus?.lastSyncedAt)}</span>
                </div>
                <Link href="/sync" className="btn btn-teal" style={{ width: '100%', marginTop: 13 }} data-testid="link-manage-sheets"><UploadCloud size={14} /> Manage workbook</Link>
              </div>}
          </SectionCard>

          <SectionCard title="Policy & CRM" description="Jump into the records that connect the quote to the relationship">
            <div style={{ display: 'grid', gap: 9 }}>
              <Link href="/policies" className="btn btn-outline" style={{ justifyContent: 'space-between' }} data-testid="link-active-policies"><span><ShieldCheck size={14} style={{ verticalAlign: 'middle', marginRight: 7 }} />Active policies</span><ArrowUpRight size={13} /></Link>
              <Link href="/opportunities" className="btn btn-outline" style={{ justifyContent: 'space-between' }} data-testid="link-crm-opportunities"><span><ClipboardCheck size={14} style={{ verticalAlign: 'middle', marginRight: 7 }} />CRM opportunities</span><ArrowUpRight size={13} /></Link>
            </div>
          </SectionCard>

           <div className="callout" style={{ marginTop: 16 }}><ActivityIcon /><span><strong>Trust check:</strong> {localTabs.length} workbook tabs are ready to sync. Review changes before pushing.</span></div>
        </div>
      </div>
    </div>
  );
}

function ActivityIcon() {
  return <Activity size={16} />;
}