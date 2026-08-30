import { useState } from 'react';
import { CalendarDays, Download, FileBarChart, TrendingDown, TrendingUp } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/workspace-shell';
import { useUploadDriveDocument } from '@workspace/api-client-react';

export default function Reports() {
  const [period, setPeriod] = useState('Q2 2025');
  const [exported, setExported] = useState(false);
  const uploadDrive = useUploadDriveDocument();
  const exportReport = () => {
    const report = JSON.stringify({
      report: 'Stop Loss portfolio underwriting report',
      period,
      generatedAt: new Date().toISOString(),
      metrics: { enrolledLives: 18462, paidClaims: 2080000, averageLossRatio: 0.441, quoteToBind: 0.826 },
      note: 'Generated reports are stored in Google Drive by the Stop Loss workspace.',
    }, null, 2);
    const bytes = new TextEncoder().encode(report);
    let binary = '';
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    uploadDrive.mutate({ data: { name: `stop-loss-report-${period.replace(/\s+/g, '-').toLowerCase()}.json`, mimeType: 'application/json', contentBase64: btoa(binary), shareWithEmail: 'ahpoladminsys@gmail.com' } }, {
      onSuccess: () => setExported(true),
    });
  };
  return <div className="content">
    <PageHeader eyebrow="Reporting · portfolio view" title={<>Signals for the <em>next decision.</em></>} subtitle="Enrollment, claims, and quote performance assembled for underwriting review." actions={<><div className="field" style={{ display: 'flex', alignItems: 'center', flexDirection: 'row', gap: 7 }}><CalendarDays size={14} color="hsl(var(--muted-foreground))" /><select value={period} onChange={(event) => setPeriod(event.target.value)} style={{ border: '1px solid hsl(var(--border))', borderRadius: 6, padding: '8px 10px', background: 'hsl(var(--card))', color: 'hsl(var(--foreground))', fontSize: 12 }} data-testid="select-report-period"><option>Q2 2025</option><option>Q1 2025</option><option>Q4 2024</option></select></div><button className="btn btn-outline" onClick={exportReport} disabled={uploadDrive.isPending} data-testid="button-export-report"><Download size={14} /> {uploadDrive.isPending ? 'Saving to Drive…' : exported ? 'Report saved' : 'Export report'}</button></>} />
    <div className="grid grid-kpis"><div className="metric"><div className="metric-label">Enrolled lives</div><div className="metric-value mono">18,462</div><div className="metric-note"><TrendingUp size={12} style={{ verticalAlign: 'middle' }} /> 6.8% vs Q1</div></div><div className="metric"><div className="metric-label">Paid claims</div><div className="metric-value mono">$2.08m</div><div className="metric-note"><TrendingDown size={12} style={{ verticalAlign: 'middle' }} /> 3.2% vs Q1</div></div><div className="metric"><div className="metric-label">Average loss ratio</div><div className="metric-value mono">44.1%</div><div className="metric-note">Within 45% target</div></div><div className="metric"><div className="metric-label">Quote-to-bind</div><div className="metric-value mono">82.6%</div><div className="metric-note">+4.9 pts vs Q1</div></div></div>
    <div className="grid report-grid"><div><SectionCard title="Enrollment by segment" description={`Current period · ${period}`} action={<FileBarChart size={16} color="hsl(var(--secondary))" />}><div className="bar-list">{[['Manufacturing', '6,220', 82], ['Healthcare', '4,860', 64], ['Logistics', '3,940', 52], ['Professional services', '2,180', 29], ['Other', '1,262', 17]].map(([label, value, width]) => <div className="bar-row" key={String(label)} data-testid={`bar-enrollment-${label}`}><span>{label}</span><div className="bar-track"><div className="bar-fill" style={{ width: `${width}%` }} /></div><span className="mono muted">{value}</span></div>)}</div></SectionCard><SectionCard title="Claims development" description="Incurred vs paid by month"><div className="table-wrap"><table><thead><tr><th>Month</th><th>Incurred</th><th>Paid</th><th>Open count</th><th>Loss ratio</th></tr></thead><tbody>{[['Apr 2025', '$684,200', '$498,100', '42', '41.2%'], ['May 2025', '$712,880', '$536,420', '45', '44.7%'], ['Jun 2025', '$688,340', '$512,180', '39', '43.9%']].map((row, index) => <tr key={row[0]} data-testid={`row-claims-${index}`}>{row.map((cell, cellIndex) => <td key={cell} className={cellIndex > 0 ? 'mono' : 'strong'}>{cell}</td>)}</tr>)}</tbody></table></div></SectionCard></div><div><SectionCard title="Underwriting watchlist" description="Accounts worth a closer look"><div style={{ display: 'grid', gap: 11 }}>{[['Northline Foods', '68.4%', 'High utilization', 'warn'], ['Cinder & Co.', '57.8%', 'Large claimant open', 'warn'], ['Morrow Utilities', '29.1%', 'Favorable development', 'good']].map(([account, ratio, note, tone], index) => <div key={account} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, paddingBottom: 11, borderBottom: index < 2 ? '1px solid hsl(var(--border))' : 0 }} data-testid={`watchlist-${index}`}><div><div className="strong" style={{ fontSize: 12 }}>{account}</div><div className="muted" style={{ fontSize: 10, marginTop: 3 }}>{note}</div></div><div style={{ textAlign: 'right' }}><div className={`status-pill ${tone === 'good' ? 'good' : 'warn'}`}>{ratio}</div></div></div>)}</div></SectionCard><div className="callout"><TrendingUp size={16} /><span>Portfolio loss ratio is <strong>0.9 pts below target</strong> this period. Claims are developing favorably in logistics.</span></div></div></div>
  </div>;
}