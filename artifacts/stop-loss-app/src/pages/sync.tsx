import { useState, type ChangeEvent } from 'react';
import { Check, CloudDownload, CloudUpload, FileSpreadsheet, Info, RefreshCw, Settings2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { getGetSheetsSnapshotQueryKey, getGetSheetsStatusQueryKey, useConfigureSheets, useGetDriveStatus, useGetSheetsSnapshot, useGetSheetsStatus, useInitializeSheets, useSyncSheets, useTransferSheetToDrive, useUploadDriveDocument } from '@workspace/api-client-react';
import type { SheetTab, SheetsSnapshot } from '@workspace/api-client-react';
import { formatSyncedAt, getApplicationTabs, replaceApplicationTabs, useApplicationTabs } from '@/hooks/use-sheet-workspace';
import { PageHeader, SectionCard, SkeletonBlock, StatusPill } from '@/components/workspace-shell';

export default function Sync() {
  const queryClient = useQueryClient();
  const localTabs = useApplicationTabs();
  const { data: status, isLoading: statusLoading, isError: statusError } = useGetSheetsStatus();
  const snapshotQuery = useGetSheetsSnapshot({ query: { enabled: Boolean(status?.configured), queryKey: getGetSheetsSnapshotQueryKey() } });
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('Northstar Stop Loss · 2025');
  const [destinationEmail, setDestinationEmail] = useState('ahpoladminsys@gmail.com');
  const [notice, setNotice] = useState<{ tone: 'good' | 'warn' | 'bad'; text: string } | null>(null);
  const [appliedRevision, setAppliedRevision] = useState('');
  const configure = useConfigureSheets();
  const initialize = useInitializeSheets();
  const sync = useSyncSheets();
  const driveStatus = useGetDriveStatus();
  const uploadDrive = useUploadDriveDocument();
  const transferSheet = useTransferSheetToDrive();
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: getGetSheetsStatusQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getGetSheetsSnapshotQueryKey() });
  };
  const configureWorkbook = () => {
    if (!url.trim()) { setNotice({ tone: 'warn', text: 'Add a Google Sheets URL or spreadsheet ID first.' }); return; }
    configure.mutate({ data: { spreadsheetUrl: url.trim(), title: title.trim() } }, {
      onSuccess: () => { setAppliedRevision(''); setNotice({ tone: 'good', text: 'Workbook connected. You can initialize it or pull a snapshot.' }); invalidate(); },
       onError: (error) => setNotice({ tone: 'bad', text: error instanceof Error ? error.message : 'The workbook could not be connected. Check the URL and try again.' }),
    });
  };
  const initializeWorkbook = () => {
    initialize.mutate({ data: { title: title.trim(), tabs: getApplicationTabs() } }, {
      onSuccess: () => { setAppliedRevision(''); setNotice({ tone: 'good', text: 'Workbook initialized with the current application dataset. Pull its snapshot before the next push.' }); invalidate(); },
       onError: (error) => setNotice({ tone: 'bad', text: error instanceof Error ? error.message : 'Initialization did not complete. Confirm the connection has write access.' }),
    });
  };
  const pullSnapshot = () => {
    void snapshotQuery.refetch().then((result) => {
      if (result.data?.tabs && result.data.revision) {
        replaceApplicationTabs(result.data.tabs);
        setAppliedRevision(result.data.revision);
      } else {
        setAppliedRevision('');
      }
      setNotice(result.error || !result.data?.revision ? { tone: 'bad', text: 'Snapshot pull failed. Local workspace data was kept.' } : { tone: 'good', text: 'Snapshot pulled and loaded into the workspace. Push is now enabled for this revision.' });
    });
  };
  const pushCurrent = () => {
    const snapshot = snapshotQuery.data;
    if (!snapshot || !appliedRevision) {
      setNotice({ tone: 'warn', text: 'Pull the latest workbook before pushing. Local workspace data remains available and no cloud write was attempted.' });
      return;
    }
    const tabs = getApplicationTabs();
    sync.mutate({ data: { tabs, expectedRevision: appliedRevision } }, {
      onSuccess: (result) => {
        queryClient.setQueryData<SheetsSnapshot>(getGetSheetsSnapshotQueryKey(), { ...snapshot, tabs, revision: result.revision });
        setAppliedRevision(result.revision);
        setNotice({ tone: 'good', text: `${result.updatedRows} rows across ${result.updatedTabs} tabs pushed to Sheets.` });
        invalidate();
      },
      onError: (error) => setNotice({ tone: 'bad', text: `${error instanceof Error ? error.message : 'Push failed.'} The cloud write was not applied; local workspace data remains available. Pull the latest workbook before retrying.` }),
    });
  };
  const transferWorkbook = () => {
    const spreadsheetId = status?.spreadsheetId;
    if (!spreadsheetId) {
      setNotice({ tone: 'warn', text: 'Save the replacement Google Sheets link before transferring the workbook.' });
      return;
    }
    transferSheet.mutate({ data: { spreadsheetId, destinationEmail: destinationEmail.trim(), role: 'owner' } }, {
      onSuccess: (result) => setNotice({ tone: 'good', text: result.message }),
      onError: (error) => setNotice({ tone: 'bad', text: error instanceof Error ? error.message : 'The workbook transfer could not be completed.' }),
    });
  };
  const uploadToDrive = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const contentBase64 = result.includes(',') ? result.split(',')[1] : result;
      uploadDrive.mutate({ data: { name: file.name, mimeType: file.type || 'application/octet-stream', contentBase64, shareWithEmail: destinationEmail.trim() } }, {
        onSuccess: (document) => setNotice({ tone: 'good', text: `${document.name} was saved to Google Drive.` }),
        onError: (error) => setNotice({ tone: 'bad', text: error instanceof Error ? error.message : 'The document could not be saved to Google Drive.' }),
      });
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };
  const currentTabs = snapshotQuery.data?.tabs ?? localTabs;
  return <div className="content">
    <PageHeader eyebrow="Connected tools · Google Sheets" title={<>Keep the workbook <em>honest.</em></>} subtitle="Configure once, then make deliberate pulls and pushes with a visible audit trail." actions={<button className="btn btn-outline" onClick={pullSnapshot} disabled={!status?.configured || snapshotQuery.isFetching} data-testid="button-pull-top"><CloudDownload size={14} /> {snapshotQuery.isFetching ? 'Pulling…' : 'Pull snapshot'}</button>} />
    {notice && <div className="callout" style={{ marginBottom: 18, borderColor: notice.tone === 'bad' ? 'hsl(var(--destructive) / .3)' : undefined }} data-testid="status-sync-notice"><Info size={16} /><span>{notice.text}</span></div>}
    <div className="grid report-grid">
      <div>
        <SectionCard title="Connection" description="Point Northstar at the workbook your team already trusts" action={<Settings2 size={16} color="hsl(var(--secondary))" />}>
          {statusLoading ? <><SkeletonBlock className="h-4 w-1/2" /><SkeletonBlock className="mt-3 h-10 w-full" /></> : statusError ? <div className="empty"><Info size={22} /><div>Connection status is unavailable.<br /><button className="btn btn-outline" style={{ marginTop: 10 }} onClick={() => void queryClient.invalidateQueries({ queryKey: getGetSheetsStatusQueryKey() })} data-testid="button-retry-sheets-status">Retry status</button></div></div> : <div>
             <div className="status-row" style={{ marginBottom: 17 }}><StatusPill tone={status?.configured && status.writable ? 'good' : 'warn'} testId="status-sheets-connection">{status?.configured ? (status.writable ? 'Configured' : 'Read only') : 'Not configured'}</StatusPill><span className="muted">{status?.connection || 'No workbook selected'}</span></div>
            <div className="form-grid"><div className="field full"><label htmlFor="workbook-url">Spreadsheet URL or ID</label><input id="workbook-url" value={url || status?.spreadsheetUrl || status?.spreadsheetId || ''} onChange={(event) => setUrl(event.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" data-testid="input-spreadsheet-url" /></div><div className="field full"><label htmlFor="workbook-title">Workbook title</label><input id="workbook-title" value={title} onChange={(event) => setTitle(event.target.value)} data-testid="input-workbook-title" /></div></div>
            <div className="actions" style={{ marginTop: 16 }}><button className="btn btn-teal" onClick={configureWorkbook} disabled={configure.isPending} data-testid="button-configure-sheets"><Settings2 size={14} /> {configure.isPending ? 'Connecting…' : 'Save connection'}</button><button className="btn btn-outline" onClick={initializeWorkbook} disabled={!status?.configured || initialize.isPending} data-testid="button-initialize-sheets"><FileSpreadsheet size={14} /> {initialize.isPending ? 'Initializing…' : 'Initialize workbook'}</button></div>
          </div>}
        </SectionCard>
         <SectionCard title="Sync actions" description="Move data intentionally — every action returns a result">
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <button className="btn btn-outline" style={{ justifyContent: 'flex-start', minHeight: 83, flexDirection: 'column', alignItems: 'flex-start' }} onClick={pullSnapshot} disabled={!status?.configured || snapshotQuery.isFetching} data-testid="button-pull-snapshot"><CloudDownload size={17} color="hsl(var(--secondary))" /><span>{snapshotQuery.isFetching ? 'Pulling snapshot…' : 'Pull snapshot'}</span><small className="muted">Review workbook rows locally</small></button>
             <button className="btn btn-primary" style={{ justifyContent: 'flex-start', minHeight: 83, flexDirection: 'column', alignItems: 'flex-start' }} onClick={pushCurrent} disabled={!status?.configured || !appliedRevision || sync.isPending || snapshotQuery.isFetching} data-testid="button-push-current"><CloudUpload size={17} /><span>{sync.isPending ? 'Pushing current data…' : 'Push current data'}</span><small style={{ color: 'hsl(var(--primary-foreground) / .68)' }}>Pull first, then write application rows</small></button>
          </div>
           <div className="detail-grid" style={{ marginTop: 16 }}><div className="detail-cell"><span className="detail-label">Last synced</span><span className="detail-value" data-testid="text-last-synced">{formatSyncedAt(status?.lastSyncedAt)}</span></div><div className="detail-cell"><span className="detail-label">Writable</span><span className="detail-value">{status?.writable ? 'Yes' : 'Not confirmed'}</span></div><div className="detail-cell"><span className="detail-label">Tabs ready</span><span className="detail-value mono">{localTabs.length}</span></div></div>
        </SectionCard>
         <SectionCard title="Drive document vault" description="Every uploaded or generated document is saved to the connected Google Drive">
           <div className="status-row" style={{ marginBottom: 13 }}><StatusPill tone={driveStatus.data?.configured ? 'good' : 'warn'}>{driveStatus.data?.configured ? 'Connected' : 'Unavailable'}</StatusPill><span className="muted">{driveStatus.data?.message || 'Google Drive is not connected.'}</span></div>
           <div className="form-grid">
             <div className="field full"><label htmlFor="destination-email">Destination Google account</label><input id="destination-email" value={destinationEmail} onChange={(event) => setDestinationEmail(event.target.value)} type="email" data-testid="input-drive-destination-email" /></div>
             <div className="field full"><label htmlFor="drive-upload">Upload document to Drive</label><input id="drive-upload" type="file" onChange={uploadToDrive} disabled={uploadDrive.isPending || !driveStatus.data?.configured} data-testid="input-drive-document" /></div>
           </div>
           <div className="actions" style={{ marginTop: 14 }}><button className="btn btn-outline" onClick={transferWorkbook} disabled={!status?.spreadsheetId || transferSheet.isPending} data-testid="button-transfer-workbook"><CloudUpload size={14} /> {transferSheet.isPending ? 'Transferring…' : 'Transfer workbook'}</button><span className="muted" style={{ alignSelf: 'center', fontSize: 11 }}>Requests ownership transfer for the replacement workbook.</span></div>
         </SectionCard>
      </div>
      <div>
        <SectionCard title="Workbook snapshot" description={snapshotQuery.data ? `${currentTabs.length} tabs · pulled from Sheets` : 'The latest local dataset ready for transfer'} action={<button className="btn btn-quiet" onClick={() => void snapshotQuery.refetch()} disabled={!status?.configured} data-testid="button-refresh-snapshot"><RefreshCw size={14} /></button>}>
          <div style={{ display: 'grid', gap: 9 }}>{currentTabs.map((tab) => <TabPreview key={tab.name} tab={tab} />)}</div>
          {!status?.configured && <div className="empty" style={{ minHeight: 100 }}><Info size={20} /><div>Configure a workbook to see live rows.</div></div>}
        </SectionCard>
           <div className="callout"><Check size={16} /><span>Pulls load workbook rows into this workspace. Saves and explicit pushes write the current dataset back to the workbook.</span></div>
      </div>
    </div>
  </div>;
}

function TabPreview({ tab }: { tab: SheetTab }) {
  const columns = Object.keys(tab.rows[0] ?? {}).slice(0, 3);
  return <div style={{ border: '1px solid hsl(var(--border))', borderRadius: 7, overflow: 'hidden' }} data-testid={`card-sheet-tab-${tab.name.toLowerCase()}`}><div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 11px', background: 'hsl(var(--muted) / .55)' }}><span className="strong" style={{ fontSize: 12 }}>{tab.name}</span><span className="count">{tab.rows.length} rows</span></div><div style={{ padding: '9px 11px', display: 'flex', gap: 5, flexWrap: 'wrap' }}>{columns.length ? columns.map((column) => <span className="tag" key={column}>{column}</span>) : <span className="muted" style={{ fontSize: 11 }}>No rows in this tab</span>}</div></div>;
}