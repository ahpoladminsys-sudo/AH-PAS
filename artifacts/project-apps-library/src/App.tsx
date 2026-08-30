import { useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  ArrowUpRight, BookOpen, Check, ChevronRight, CircleAlert, Cloud,
  Copy, Database, ExternalLink, FileArchive, FileText, FolderOpen, HardDrive,
  LayoutGrid, Link2, Loader2, LockKeyhole, Menu, MoreHorizontal, RefreshCw,
  Search, Settings2, ShieldCheck, SlidersHorizontal, Sparkles, Upload, X
} from 'lucide-react';
import {
  getGetDriveDocumentContentQueryKey,
  getGetDriveDocumentsQueryKey,
  getGetLibraryCatalogEnrichmentQueryKey,
  getGetLibraryCatalogQueryKey,
  getGetSheetsSnapshotQueryKey,
  getGetSheetsStatusQueryKey,
  useConfigureSheets,
  useGetDriveDocumentContent,
  useGetDriveDocuments,
  useGetDriveStatus,
  useGetLibraryCatalogEnrichment,
  useGetLibraryCatalog,
  useGetSheetsSnapshot,
  useGetSheetsStatus,
  useInitializeSheets,
  useSyncSheets,
  useUploadDriveDocument,
  useRebuildLibraryArtifact
} from '@workspace/api-client-react';
import type { DriveDocument, LibraryArtifact, LibraryCatalog, LibraryRecord, SheetsSnapshot } from '@workspace/api-client-react';
import {
  Route,
  Switch,
  Router as WouterRouter,
  useLocation,
} from 'wouter';

const queryClient = new QueryClient();

const cn = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' ');
const dateLabel = (value?: string | null) => value ? new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value)) : 'Not recorded';
const sourceTone = (state?: string) => state === 'connected' ? 'connected' : state === 'read_only' ? 'readonly' : state === 'local' ? 'local' : 'offline';
const kindIcon = (kind: string) => kind.toLowerCase().includes('document') ? FileText : kind.toLowerCase().includes('presentation') ? LayoutGrid : BookOpen;
const libraryCacheKey = 'project-apps-library.catalog.v1';

function readCachedCatalog(): LibraryCatalog | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const cached = JSON.parse(window.localStorage.getItem(libraryCacheKey) || 'null');
    return cached && Array.isArray(cached.artifacts) && Array.isArray(cached.records) ? cached as LibraryCatalog : undefined;
  } catch {
    return undefined;
  }
}

function requestErrorMessage(error: unknown, subject: string) {
  const candidate = error as { status?: number };
  if (candidate?.status === 401) return `Sign in to load protected ${subject}. The local catalog remains available.`;
  if (candidate?.status === 403) return `Your account is signed in but is not authorized for protected ${subject}. Ask an administrator for access.`;
  if (candidate?.status && candidate.status >= 500) return `${subject} service is unavailable right now. Retry when the API is back online.`;
  if (candidate?.status) return `${subject} request failed (${candidate.status}). Retry the request or check the connector.`;
  return `The ${subject} service could not be reached. Check your connection and retry; cached data is clearly marked as local.`;
}

function recordsToSheetRows(records: LibraryRecord[]) {
  return records.map((record) => ({
    id: record.id,
    title: record.title,
    type: record.type,
    status: record.status,
    description: record.description,
    artifactSlug: record.artifactSlug ?? '',
    artifactUrl: record.artifactUrl ?? '',
    tags: JSON.stringify(record.tags),
    updatedAt: record.updatedAt ?? '',
    driveFileId: record.driveFileId ?? '',
    driveWebViewLink: record.driveWebViewLink ?? '',
  }));
}

function recordFromSheetRow(row: Record<string, unknown>, index: number): LibraryRecord | null {
  const title = String(row.title || row.name || '').trim();
  if (!title) return null;
  const rawTags = String(row.tags || '').trim();
  let tags: string[] = [];
  try {
    const parsed = JSON.parse(rawTags);
    tags = Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    tags = rawTags.split(',').map((tag) => tag.trim()).filter(Boolean);
  }
  return {
    id: String(row.id || `library-record-${index + 1}`),
    title,
    type: String(row.type || 'output'),
    status: String(row.status || 'active'),
    description: String(row.description || ''),
    artifactSlug: row.artifactSlug ? String(row.artifactSlug) : null,
    artifactUrl: row.artifactUrl ? String(row.artifactUrl) : null,
    tags,
    updatedAt: row.updatedAt ? String(row.updatedAt) : null,
    driveFileId: row.driveFileId ? String(row.driveFileId) : null,
    driveWebViewLink: row.driveWebViewLink ? String(row.driveWebViewLink) : null,
  };
}

function base64Utf8(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function StatusPill({ state, label }: { state?: string; label?: string }) {
  const tone = sourceTone(state);
  return <span data-testid={`status-source-${label ?? state}`} className={`status-pill ${tone}`}><span className="status-dot" />{label ?? (state === 'read_only' ? 'Read only' : state === 'local' ? 'Local cache' : state ?? 'Unavailable')}</span>;
}

function Skeleton() {
  return <div data-testid="loading-library" className="space-y-4"><div className="skeleton h-28 rounded-2xl" /><div className="grid grid-cols-1 gap-4 md:grid-cols-3"><div className="skeleton h-48 rounded-2xl" /><div className="skeleton h-48 rounded-2xl" /><div className="skeleton h-48 rounded-2xl" /></div><div className="skeleton h-72 rounded-2xl" /></div>;
}

function EmptyState({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) {
  return <div data-testid="empty-library-state" className="empty-state"><div className="empty-mark"><Database size={21} /></div><div><h3 className="font-display text-lg font-semibold">{title}</h3><p className="mt-1 max-w-md text-sm text-muted-foreground">{detail}</p>{action && <div className="mt-4">{action}</div>}</div></div>;
}

function SourceCard({ label, state, message, onOpen }: { label: string; state?: string; message?: string; onOpen: () => void }) {
  const Icon = label === 'Sheets' ? Database : HardDrive;
  return <button data-testid={`button-open-${label.toLowerCase()}`} onClick={onOpen} className="source-card text-left">
    <div className="flex items-start justify-between"><div className="source-icon"><Icon size={17} /></div><StatusPill state={state} /></div>
    <div className="mt-5 text-xs font-mono-app uppercase tracking-[.16em] text-muted-foreground">{label}</div>
    <div data-testid={`text-${label.toLowerCase()}-message`} className="mt-1 line-clamp-2 text-sm leading-6 text-foreground/75">{message || 'No connection message provided.'}</div>
    <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-primary">Manage source <ChevronRight size={14} /></div>
  </button>;
}

function RecordCard({ record, onOpen }: { record: LibraryRecord; onOpen: () => void }) {
  return <button data-testid={`card-record-${record.id}`} onClick={onOpen} className="record-card text-left">
    <div className="flex items-start justify-between gap-3"><span className="record-type">{record.type}</span><MoreHorizontal size={17} className="shrink-0 text-muted-foreground" /></div>
    <h3 data-testid={`text-record-title-${record.id}`} className="mt-4 font-display text-[1.08rem] font-semibold leading-snug">{record.title}</h3>
    <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">{record.description || 'No description provided.'}</p>
    <div className="mt-5 flex flex-wrap gap-1.5">{record.tags.slice(0, 3).map(tag => <span data-testid={`tag-record-${record.id}-${tag}`} className="tag" key={tag}>{tag}</span>)}</div>
    <div className="mt-5 flex items-center justify-between border-t border-border/70 pt-3 text-xs text-muted-foreground"><span>{dateLabel(record.updatedAt)}</span><span className="flex items-center gap-1"><span className={`record-status ${record.status.toLowerCase().replace(/\s/g, '-')}`} />{record.status}</span></div>
  </button>;
}

function formatBytes(value?: string | null) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes)) return 'Size unavailable';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ArtifactBuildCard({
  artifact,
  localRuntime,
  exporting,
  rebuildable,
  onDownload,
}: {
  artifact: LibraryArtifact;
  localRuntime: boolean;
  exporting: boolean;
  rebuildable: boolean;
  onDownload: (artifact: LibraryArtifact) => void;
}) {
  const build = artifact.build;
  const stateLabel = build.state === 'current' ? 'Current build' : build.state === 'stale' ? 'Stale build' : 'Export unavailable';
  const downloadDisabled = localRuntime || exporting || (!rebuildable && build.state !== 'current') || (!rebuildable && !build.downloadUrl);
  return <div data-testid={`card-artifact-build-${artifact.slug}`} className="artifact-feature">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3">
        <div className="artifact-feature-mark"><FileArchive size={20} /></div>
        <div className="min-w-0">
          <div className="eyebrow"><span className="eyebrow-line" /> Primary workspace</div>
          <h2 className="mt-2 font-display text-2xl font-semibold">{artifact.title}</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{artifact.description}</p>
        </div>
      </div>
      <span data-testid={`status-artifact-build-${artifact.slug}`} className={`artifact-build-state ${build.state}`}>{stateLabel}</span>
    </div>
    <div className="artifact-feature-meta">
      <div><span>Build generated</span><strong>{dateLabel(build.builtAt)}</strong></div>
      <div><span>Source checked</span><strong>{dateLabel(build.sourceModifiedAt)}</strong></div>
      <div><span>File size</span><strong>{formatBytes(build.size)}</strong></div>
    </div>
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <a data-testid={`link-open-live-${artifact.slug}`} href={artifact.route} target="_blank" rel="noreferrer" className="button-primary"><ArrowUpRight size={14} /> Open live workspace</a>
      <button data-testid={`button-download-artifact-${artifact.slug}`} className="button-secondary" disabled={downloadDisabled} onClick={() => onDownload(artifact)}>{exporting ? <Loader2 className="animate-spin" size={14} /> : <FileArchive size={14} />} {rebuildable && build.state !== 'current' ? 'Build & download latest HTML' : 'Download current HTML'}</button>
    </div>
    <p data-testid={`text-artifact-build-message-${artifact.slug}`} className="mt-3 text-xs leading-5 text-muted-foreground">{localRuntime ? 'Cloud downloads require the hosted library over HTTP(S).' : build.message}</p>
  </div>;
}

function DetailPanel({ record, artifact, onClose, onEdit }: { record: LibraryRecord; artifact?: LibraryArtifact; onClose: () => void; onEdit: () => void }) {
  return <aside data-testid="panel-record-detail" className="detail-panel">
    <div className="flex items-center justify-between border-b border-border px-5 py-4"><div className="flex items-center gap-2 text-xs font-mono-app uppercase tracking-[.14em] text-muted-foreground"><BookOpen size={14} /> Record detail</div><button data-testid="button-close-record-detail" className="icon-button" onClick={onClose}><X size={17} /></button></div>
    <div className="scrollbar-thin flex-1 overflow-y-auto p-5"><span className="record-type">{record.type}</span><h2 data-testid="text-detail-title" className="mt-4 font-display text-2xl font-semibold leading-tight">{record.title}</h2><p data-testid="text-detail-description" className="mt-3 text-sm leading-6 text-muted-foreground">{record.description || 'No description provided.'}</p>
      <div className="mt-7 space-y-4"><div className="meta-row"><span>Status</span><strong>{record.status}</strong></div><div className="meta-row"><span>Last updated</span><strong>{dateLabel(record.updatedAt)}</strong></div><div className="meta-row"><span>Artifact slug</span><strong className="font-mono-app text-xs">{record.artifactSlug || '—'}</strong></div></div>
      {artifact && <div className="mt-7 rounded-xl border border-border bg-muted/45 p-4"><div className="text-xs font-mono-app uppercase tracking-[.14em] text-muted-foreground">Workspace artifact</div><div className="mt-2 font-display font-semibold">{artifact.title}</div><div className="mt-1 text-xs text-muted-foreground">{artifact.artifactPath}</div><div className="mt-3 flex flex-wrap gap-2">{artifact.serviceNames.map(service => <span className="tag" key={service}>{service}</span>)}</div><a data-testid="link-artifact-route" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline" href={artifact.route} target="_blank" rel="noreferrer">Open app <ArrowUpRight size={14} /></a></div>}
       <div className="mt-7 space-y-2">{record.artifactUrl && <a data-testid="link-record-artifact" className="action-link" href={record.artifactUrl} target="_blank" rel="noreferrer"><Link2 size={15} /> Open artifact link <ArrowUpRight size={14} /></a>}{record.driveWebViewLink && <a data-testid="link-record-drive" className="action-link" href={record.driveWebViewLink} target="_blank" rel="noreferrer"><HardDrive size={15} /> Open Drive file <ArrowUpRight size={14} /></a>} {!record.artifactUrl && !record.driveWebViewLink && <div className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">No linked artifact or Drive file.</div>}<button data-testid="button-edit-record" className="button-secondary w-full" onClick={onEdit}><Settings2 size={15} /> Edit library record</button></div>
    </div>
  </aside>;
}

function RecordEditor({ initial, artifacts, driveFiles, onSave, onClose }: { initial?: LibraryRecord; artifacts: LibraryArtifact[]; driveFiles: LibraryCatalog['driveFiles']; onSave: (record: LibraryRecord) => void; onClose: () => void }) {
  const [title, setTitle] = useState(initial?.title || '');
  const [type, setType] = useState(initial?.type || 'output');
  const [status, setStatus] = useState(initial?.status || 'active');
  const [description, setDescription] = useState(initial?.description || '');
  const [artifactSlug, setArtifactSlug] = useState(initial?.artifactSlug || '');
  const [artifactUrl, setArtifactUrl] = useState(initial?.artifactUrl || '');
  const [tags, setTags] = useState(initial?.tags.join(', ') || '');
  const [driveFileId, setDriveFileId] = useState(initial?.driveFileId || '');
  const save = () => {
    if (!title.trim()) return;
    const driveFile = driveFiles.find((file) => file.id === driveFileId);
    onSave({
      id: initial?.id || `library-record-${Date.now()}`,
      title: title.trim(),
      type: type.trim() || 'output',
      status: status.trim() || 'active',
      description: description.trim(),
      artifactSlug: artifactSlug || null,
      artifactUrl: artifactUrl.trim() || null,
      tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean),
      updatedAt: new Date().toISOString(),
      driveFileId: driveFileId || null,
      driveWebViewLink: driveFile?.webViewLink || initial?.driveWebViewLink || null,
    });
  };
  return <aside data-testid="panel-record-editor" className="detail-panel">
    <div className="flex items-center justify-between border-b border-border px-5 py-4"><div className="flex items-center gap-2 text-xs font-mono-app uppercase tracking-[.14em] text-muted-foreground"><Settings2 size={14} /> {initial ? 'Edit record' : 'New record'}</div><button data-testid="button-close-record-editor" className="icon-button" onClick={onClose}><X size={17} /></button></div>
    <div className="scrollbar-thin flex-1 overflow-y-auto p-5">
      <label className="field-label">Title<input data-testid="input-record-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Renewal brief" /></label>
      <div className="mt-3 grid grid-cols-2 gap-3"><label className="field-label">Type<input data-testid="input-record-type" value={type} onChange={(event) => setType(event.target.value)} /></label><label className="field-label">Status<input data-testid="input-record-status" value={status} onChange={(event) => setStatus(event.target.value)} /></label></div>
      <label className="field-label mt-3">Description<textarea data-testid="input-record-description" value={description} onChange={(event) => setDescription(event.target.value)} rows={4} placeholder="What is this output for?" /></label>
      <label className="field-label mt-3">Tags<input data-testid="input-record-tags" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="planning, client-ready" /></label>
      <label className="field-label mt-3">Workspace artifact<select data-testid="select-record-artifact" value={artifactSlug} onChange={(event) => setArtifactSlug(event.target.value)}><option value="">Not linked</option>{artifacts.map((artifact) => <option value={artifact.slug} key={artifact.slug}>{artifact.title}</option>)}</select></label>
      <label className="field-label mt-3">Artifact URL<input data-testid="input-record-artifact-url" type="url" value={artifactUrl} onChange={(event) => setArtifactUrl(event.target.value)} placeholder="https://…" /></label>
      <label className="field-label mt-3">Drive file<select data-testid="select-record-drive-file" value={driveFileId} onChange={(event) => setDriveFileId(event.target.value)}><option value="">Not linked</option>{driveFiles.map((file) => <option value={file.id} key={file.id}>{file.name}</option>)}</select></label>
      <div className="notice mt-5"><LockKeyhole size={15} /><span>Record edits are kept in this browser until you explicitly push the Project Library tab to Sheets.</span></div>
      <button data-testid="button-save-record" className="button-primary mt-5 w-full" disabled={!title.trim()} onClick={save}><Check size={15} /> Save locally</button>
    </div>
  </aside>;
}

function SourceDrawer({ source, catalog, records, onPullRecords, onClose, onRefresh }: { source: 'sheets' | 'drive'; catalog: LibraryCatalog; records: LibraryRecord[]; onPullRecords: (records: LibraryRecord[]) => void; onClose: () => void; onRefresh: () => void }) {
  const queryClient = useQueryClient();
  const sheetsStatus = useGetSheetsStatus();
  const sheetsSnapshot = useGetSheetsSnapshot({ query: { queryKey: getGetSheetsSnapshotQueryKey(), enabled: source === 'sheets' } });
  const driveStatus = useGetDriveStatus();
  const driveDocuments = useGetDriveDocuments({ query: { queryKey: getGetDriveDocumentsQueryKey(), enabled: source === 'drive' } });
  const configure = useConfigureSheets();
  const initialize = useInitializeSheets();
  const sync = useSyncSheets();
  const upload = useUploadDriveDocument();
  const [sheetId, setSheetId] = useState('');
  const [sheetTitle, setSheetTitle] = useState('Project Apps Library');
  const [uploadState, setUploadState] = useState('');
  const [selectedDriveId, setSelectedDriveId] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [syncState, setSyncState] = useState('');
  const [appliedRevision, setAppliedRevision] = useState('');
  const snapshot = sheetsSnapshot.data as SheetsSnapshot | undefined;
  const tabs = snapshot?.tabs ?? [];
  const driveFiles = driveDocuments.data?.files ?? [];
  const refreshAll = () => {
    void queryClient.invalidateQueries({ queryKey: getGetLibraryCatalogQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getGetSheetsStatusQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getGetSheetsSnapshotQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getGetDriveDocumentsQueryKey() });
    onRefresh();
  };
  const canWriteSheets = Boolean(sheetsStatus.data?.configured && appliedRevision);
  const libraryRows = recordsToSheetRows(records);
  const snapshotWithLibrary = tabs.some((tab) => tab.name === 'Project Library')
    ? tabs.map((tab) => tab.name === 'Project Library' ? { ...tab, rows: libraryRows } : tab)
    : [...tabs, { name: 'Project Library', rows: libraryRows }];
  const backupToDrive = (reason: string) => {
    const contentBase64 = base64Utf8(JSON.stringify({ schema: 'project-library-v1', savedAt: new Date().toISOString(), records }, null, 2));
    upload.mutate({ data: { name: `project-library-backup-${new Date().toISOString().slice(0, 10)}.json`, mimeType: 'application/json', contentBase64 } }, {
      onSuccess: () => setSyncState(`${reason} A Drive JSON backup was saved. The library was not written to Sheets.`),
      onError: () => setSyncState(`${reason} Sheets was not written, and the Drive backup also failed. Keep the local cache and retry later.`),
    });
  };
  const doConfigure = () => configure.mutate({ data: { spreadsheetId: sheetId || undefined, title: sheetTitle } }, { onSuccess: () => { setAppliedRevision(''); setSyncState('Sheets connection saved. Pull the Project Library tab to confirm its contents.'); }, onError: (error) => setSyncState(error instanceof Error ? error.message : 'Sheets connection could not be saved.') });
  const doPull = () => { void sheetsSnapshot.refetch().then((result) => { if (result.error || !result.data?.revision) { setAppliedRevision(''); setSyncState(result.error instanceof Error ? result.error.message : 'Sheets pull failed. Local records were kept.'); return; } const libraryTab = result.data.tabs.find((tab) => tab.name === 'Project Library'); const pulled = (libraryTab?.rows || []).map(recordFromSheetRow).filter((record): record is LibraryRecord => Boolean(record)); if (libraryTab) onPullRecords(pulled); setAppliedRevision(result.data.revision); setSyncState(libraryTab ? `Pulled ${pulled.length} library record${pulled.length === 1 ? '' : 's'} from Sheets.` : 'Sheets has no Project Library tab yet. The current cloud revision was reviewed and local records were kept.'); }).catch((error: unknown) => { setAppliedRevision(''); setSyncState(error instanceof Error ? error.message : 'Sheets pull failed. Local records were kept.'); }); };
  const doInitialize = () => initialize.mutate({ data: { title: sheetTitle, ...(sheetId ? { spreadsheetId: sheetId } : {}), tabs: snapshotWithLibrary } }, { onSuccess: () => { setAppliedRevision(''); setSyncState('Workbook initialized. Pull the Project Library tab before the next push.'); refreshAll(); }, onError: (error) => backupToDrive(error instanceof Error ? error.message : 'Sheets initialization failed.') });
  const doSync = () => {
    if (!snapshot || !appliedRevision) {
      setSyncState('Pull the latest workbook before pushing. The local catalog remains available and no cloud write was attempted.');
      return;
    }
    sync.mutate({ data: { tabs: snapshotWithLibrary, expectedRevision: appliedRevision } }, {
      onSuccess: (result) => {
        queryClient.setQueryData<SheetsSnapshot>(getGetSheetsSnapshotQueryKey(), {
          ...snapshot,
          tabs: snapshotWithLibrary,
          revision: result.revision,
        });
        setAppliedRevision(result.revision);
        setSyncState(`${result.updatedRows} rows across ${result.updatedTabs} tabs were pushed to Sheets.`);
        refreshAll();
      },
      onError: (error) => backupToDrive(`${error instanceof Error ? error.message : 'Sheets push failed.'} The cloud write was not applied. Keep the local cache and pull the latest workbook before retrying.`),
    });
  };
  const onUpload = (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file) return; setUploadState(`Reading ${file.name}`); const reader = new FileReader(); reader.onload = () => { const result = String(reader.result || ''); const contentBase64 = result.includes(',') ? result.split(',')[1] : result; upload.mutate({ data: { name: file.name, mimeType: file.type || 'application/octet-stream', contentBase64 } }, { onSuccess: (document) => { setUploadState(`${document.name} uploaded to Drive`); refreshAll(); }, onError: (error) => setUploadState(error instanceof Error ? error.message : 'Upload failed') }); }; reader.readAsDataURL(file); event.target.value = ''; };
  const selectedDrive = driveFiles.find(file => file.id === selectedDriveId);
  return <aside data-testid={`panel-source-${source}`} className="detail-panel">
    <div className="flex items-center justify-between border-b border-border px-5 py-4"><div className="flex items-center gap-2 text-xs font-mono-app uppercase tracking-[.14em] text-muted-foreground">{source === 'sheets' ? <Database size={14} /> : <HardDrive size={14} />}{source} source</div><button data-testid={`button-close-${source}-panel`} className="icon-button" onClick={onClose}><X size={17} /></button></div>
    <div className="scrollbar-thin flex-1 overflow-y-auto p-5">
       <StatusPill state={source === 'sheets' ? catalog.sources.sheets.state : catalog.sources.drive.state} label={source === 'sheets' ? (sheetsStatus.data?.configured ? 'Connected · read only' : 'Unavailable') : (driveStatus.data?.configured ? 'Connected' : 'Unavailable')} />
      <h2 className="mt-5 font-display text-2xl font-semibold">{source === 'sheets' ? 'A deliberate source of truth.' : 'Documents, without the scavenger hunt.'}</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{source === 'sheets' ? sheetsStatus.data?.message || catalog.sources.sheets.message : driveStatus.data?.message || catalog.sources.drive.message}</p>
      {source === 'sheets' ? <div className="mt-7 space-y-5">
        <div className="source-metric"><span>Workbook</span><strong>{sheetsStatus.data?.spreadsheetId || 'Not configured'}</strong></div>
        {sheetsStatus.data?.spreadsheetUrl && <a data-testid="link-spreadsheet" className="action-link" href={sheetsStatus.data.spreadsheetUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Open spreadsheet</a>}
         <div className="border-t border-border pt-5"><label className="field-label">Spreadsheet ID or URL<input data-testid="input-spreadsheet-id" value={sheetId} onChange={e => setSheetId(e.target.value)} placeholder="Paste a Google Sheets destination" /></label><label className="field-label mt-3">Workbook title<input data-testid="input-spreadsheet-title" value={sheetTitle} onChange={e => setSheetTitle(e.target.value)} /></label><button data-testid="button-configure-sheets" className="button-primary mt-4 w-full" disabled={configure.isPending || !sheetId} onClick={doConfigure}>{configure.isPending ? <Loader2 className="animate-spin" size={15} /> : <Settings2 size={15} />} Configure destination</button></div>
         <div className="flex flex-wrap gap-2"><button data-testid="button-pull-library" className="button-secondary flex-1" disabled={sheetsSnapshot.isFetching || !sheetsStatus.data?.configured} onClick={doPull}>{sheetsSnapshot.isFetching ? <Loader2 className="animate-spin" size={15} /> : <Cloud size={15} />} Pull library tab</button><button data-testid="button-initialize-sheets" className="button-secondary flex-1" disabled={initialize.isPending || !sheetTitle} onClick={doInitialize}>{initialize.isPending ? <Loader2 className="animate-spin" size={15} /> : <Sparkles size={15} />} Initialize</button><button data-testid="button-sync-sheets" className="button-primary w-full" disabled={!canWriteSheets || sync.isPending} onClick={doSync}>{sync.isPending ? <Loader2 className="animate-spin" size={15} /> : <RefreshCw size={15} />} Push library records</button></div>
          <div className="notice"><LockKeyhole size={15} /><span>Sheets is shown as read only until a push succeeds. Push requires the revision from the latest pull; if newer cloud data exists, the write is rejected, a Drive JSON backup is offered, and this browser cache stays intact.</span></div>
         {syncState && <div data-testid="status-sheets-action" className="notice"><Check size={15} /><span>{syncState}</span></div>}
        <div><div className="flex items-center justify-between"><div className="text-xs font-mono-app uppercase tracking-[.14em] text-muted-foreground">Snapshot tabs</div><span className="text-xs text-muted-foreground">{tabs.length} tabs</span></div>{tabs.length ? tabs.map(tab => <div data-testid={`row-sheet-tab-${tab.name}`} key={tab.name} className="file-row"><span>{tab.name}</span><span className="text-xs text-muted-foreground">{tab.rows.length} rows</span></div>) : <div className="mt-3 text-sm text-muted-foreground">No snapshot available.</div>}</div>
      </div> : <div className="mt-7 space-y-5">
        <div className="flex items-center justify-between"><div className="text-xs font-mono-app uppercase tracking-[.14em] text-muted-foreground">Drive files</div><label data-testid="button-upload-drive" className="button-primary cursor-pointer"><Upload size={15} /> Upload<input className="hidden" type="file" onChange={onUpload} /></label></div>
        {uploadState && <div data-testid="status-upload-drive" className="notice"><Check size={15} /><span>{uploadState}</span></div>}
        {driveDocuments.isLoading ? <div className="space-y-2"><div className="skeleton h-14 rounded-lg" /><div className="skeleton h-14 rounded-lg" /></div> : driveFiles.length ? <div className="space-y-2">{driveFiles.map(file => <button data-testid={`row-drive-file-${file.id}`} key={file.id} onClick={() => setSelectedDriveId(file.id)} className={cn('file-row w-full text-left', selectedDriveId === file.id && 'file-row-selected')}><FileArchive size={16} className="shrink-0 text-primary" /><span className="min-w-0 flex-1 truncate">{file.name}<small>{file.mimeType}</small></span><ChevronRight size={15} /></button>)}</div> : <EmptyState title="No Drive files found" detail="The API returned an empty document list. Upload a document when the connection is available." />}
        {selectedDrive && <DrivePreview file={selectedDrive} copied={copied} setCopied={setCopied} />}
      </div>}
    </div>
  </aside>;
}

function DrivePreview({ file, copied, setCopied }: { file: DriveDocument; copied: boolean; setCopied: (value: boolean) => void }) {
  const content = useGetDriveDocumentContent(file.id, { query: { queryKey: getGetDriveDocumentContentQueryKey(file.id), enabled: !!file.id } });
  const copyLink = () => { void navigator.clipboard?.writeText(file.webViewLink); setCopied(true); window.setTimeout(() => setCopied(false), 1600); };
  const download = () => {
    if (!content.data) return;
    const binary = atob(content.data.contentBase64);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([bytes], { type: content.data.mimeType || file.mimeType }));
    link.download = content.data.name || file.name;
    link.click();
    URL.revokeObjectURL(link.href);
  };
  const mime = content.data?.mimeType || file.mimeType;
  const dataUrl = content.data ? `data:${mime};base64,${content.data.contentBase64}` : '';
  const preview = content.data && mime.startsWith('image/') ? <img data-testid="img-drive-preview" src={dataUrl} alt={file.name} className="max-h-40 max-w-full rounded-lg object-contain" /> : content.data && mime === 'application/pdf' ? <iframe data-testid="iframe-drive-preview" src={dataUrl} title={file.name} className="h-40 w-full rounded-lg border-0" /> : content.data && (mime.startsWith('text/') || mime === 'application/json') ? <div data-testid="text-drive-content" className="max-h-32 overflow-auto whitespace-pre-wrap text-xs leading-5 text-muted-foreground">{decodeBase64(content.data.contentBase64)}</div> : <div className="mt-4 text-xs text-muted-foreground">Preview is not supported for this file type. Open it in Drive or download it.</div>;
  return <div data-testid="panel-drive-preview" className="mt-6 rounded-xl border border-border bg-muted/45 p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-xs font-mono-app uppercase tracking-[.14em] text-muted-foreground">Preview</div><h3 className="mt-1 truncate font-semibold">{file.name}</h3></div><button data-testid="button-copy-drive-link" onClick={copyLink} className="icon-button">{copied ? <Check size={15} /> : <Copy size={15} />}</button></div>{content.isLoading ? <div className="skeleton mt-4 h-24 rounded-lg" /> : content.isError ? <div data-testid="error-drive-preview" className="mt-4 text-xs text-muted-foreground">Drive content could not be loaded. The file metadata is still available.</div> : content.data ? <div className="mt-4 flex justify-center">{preview}</div> : <div className="mt-4 text-xs text-muted-foreground">Preview unavailable for this file type.</div>}<div className="mt-4 flex gap-2"><button data-testid="button-download-drive-file" className="button-secondary flex-1" disabled={!content.data} onClick={download}><ArrowUpRight size={14} /> Download</button><a data-testid="link-drive-preview" href={file.webViewLink} target="_blank" rel="noreferrer" className="action-link flex-1 justify-center"><ExternalLink size={14} /> Open in Drive</a></div></div>;
}

function decodeBase64(value: string) { try { return atob(value); } catch { return 'Encoded content is not previewable in this runtime.'; } }

function LibraryDashboard() {
  const catalogQuery = useGetLibraryCatalog();
  const cloudCatalogQuery = useGetLibraryCatalogEnrichment({ query: { queryKey: getGetLibraryCatalogEnrichmentQueryKey(), retry: false, refetchOnWindowFocus: false } });
  const rebuildArtifact = useRebuildLibraryArtifact();
  const cachedCatalog = useState<LibraryCatalog | undefined>(() => readCachedCatalog())[0];
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All');
  const [localRecords, setLocalRecords] = useState<LibraryRecord[]>(() => cachedCatalog?.records ?? []);
  const [localChanges, setLocalChanges] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<LibraryRecord>();
  const [editingRecord, setEditingRecord] = useState<LibraryRecord | null | undefined>(undefined);
  const [activeSource, setActiveSource] = useState<'sheets' | 'drive'>();
  const [mobileNav, setMobileNav] = useState(false);
  const catalog = catalogQuery.data as LibraryCatalog | undefined;
  const cloudCatalog = cloudCatalogQuery.data;
  const cachedRecords = cachedCatalog?.records ?? [];
  const remoteRecords = cloudCatalog?.records ?? (catalog?.records.length ? catalog.records : cachedRecords);
  const remoteDriveFiles = cloudCatalog?.driveFiles ?? (catalog?.driveFiles.length ? catalog.driveFiles : cachedCatalog?.driveFiles ?? []);
  const remoteSources = cloudCatalog?.sources ?? (cloudCatalogQuery.isError
    ? {
        sheets: { state: 'local' as const, message: 'Protected Sheets enrichment failed; showing browser-cached records as local/stale.' },
        drive: { state: 'local' as const, message: 'Protected Drive enrichment failed; showing browser-cached files as local/stale.' },
      }
    : catalog?.sources ?? cachedCatalog?.sources);
  useEffect(() => {
    if (!cloudCatalog || localChanges) return;
    setLocalRecords(cloudCatalog.records);
  }, [cloudCatalog, localChanges]);
  useEffect(() => {
    const sourceCatalog = catalog ?? cachedCatalog;
    if (!sourceCatalog) return;
    try {
      window.localStorage.setItem(
        libraryCacheKey,
        JSON.stringify({
          ...sourceCatalog,
          records: localChanges ? localRecords : remoteRecords,
          driveFiles: remoteDriveFiles,
          sources: remoteSources ?? sourceCatalog.sources,
        }),
      );
    } catch {
      // Cache is best effort and must never block browsing.
    }
  }, [catalog, cachedCatalog, localChanges, localRecords, remoteDriveFiles, remoteRecords, remoteSources]);
  const baseCatalog = catalog ?? cachedCatalog;
  const viewCatalog = baseCatalog
    ? {
        ...baseCatalog,
        records: localRecords,
        driveFiles: remoteDriveFiles,
        sources: remoteSources ?? {
          sheets: { state: 'local' as const, message: 'Showing browser-cached source information.' },
          drive: { state: 'local' as const, message: 'Showing browser-cached source information.' },
        },
      }
    : undefined;
  const records = viewCatalog?.records ?? [];
  const artifacts = viewCatalog?.artifacts ?? [];
  const stopLossArtifact = artifacts.find((artifact) => artifact.slug === 'stop-loss-app');
  const filteredRecords = useMemo(() => records.filter(record => { const needle = query.toLowerCase().trim(); const searchable = `${record.title} ${record.description} ${record.type} ${record.tags.join(' ')}`.toLowerCase(); return (!needle || searchable.includes(needle)) && (filter === 'All' || record.type === filter); }), [records, query, filter]);
  const recordTypes = useMemo(() => ['All', ...Array.from(new Set(records.map(record => record.type)))], [records]);
  const selectedArtifact = selectedRecord?.artifactSlug ? artifacts.find(item => item.slug === selectedRecord.artifactSlug) : undefined;
  const localRuntime = typeof window !== 'undefined' && window.location.protocol === 'file:';
  const [exportingArtifact, setExportingArtifact] = useState<string>();
  const [exportState, setExportState] = useState<string>();
  const saveRecord = (record: LibraryRecord) => {
    const nextRecords = localRecords.some((item) => item.id === record.id)
      ? localRecords.map((item) => item.id === record.id ? record : item)
      : [...localRecords, record];
    setLocalRecords(nextRecords);
    setLocalChanges(true);
    try {
      window.localStorage.setItem(
        libraryCacheKey,
        JSON.stringify({ ...(viewCatalog as LibraryCatalog), records: nextRecords }),
      );
    } catch {
      // Cache is best effort.
    }
    setEditingRecord(undefined);
    setSelectedRecord(record);
  };
  const refreshCatalog = () => { void Promise.all([catalogQuery.refetch(), cloudCatalogQuery.refetch()]); };
  const downloadArtifact = async (artifact: LibraryArtifact) => {
    const rebuildable = artifact.slug === 'stop-loss-app';
    if (localRuntime) {
      setExportState('Cloud downloads require the hosted library over HTTP(S) and an authenticated session.');
      return;
    }
    if (!rebuildable && (!artifact.build.downloadUrl || artifact.build.state !== 'current')) {
      setExportState(`${artifact.title} does not have a current validated export. Only the Stop Loss workspace is approved for a controlled rebuild.`);
      return;
    }
    setExportingArtifact(artifact.slug);
    setExportState(`${artifact.title}: checking the latest source and preparing a clean build…`);
    try {
      let build = artifact.build;
      if (rebuildable) {
        setExportState(`${artifact.title}: rebuilding the standalone HTML from the latest source…`);
        build = await rebuildArtifact.mutateAsync({ slug: artifact.slug });
      }
      if (build.state !== 'current' || !build.downloadUrl) {
        throw new Error(build.message || 'The validated standalone HTML export is not available.');
      }
      setExportState(`${artifact.title}: validating the generated file before download…`);
      const response = await fetch(build.downloadUrl, { credentials: 'include', cache: 'no-store' });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error(requestErrorMessage({ status: response.status }, 'HTML export'));
        }
        let detail = '';
        try {
          const payload = await response.json() as { error?: string };
          detail = payload.error || '';
        } catch {
          // Keep the status-specific fallback below.
        }
        throw new Error(detail || `The HTML export could not be downloaded (${response.status}). Retry the build.`);
      }
      const responseBuildAt = response.headers.get('X-Library-Build-At');
      if (build.builtAt && responseBuildAt && build.builtAt !== responseBuildAt) {
        throw new Error('The export changed while it was being downloaded. Refresh the catalog and retry.');
      }
      const blob = await response.blob();
      if (build.size && Number(build.size) !== blob.size) {
        throw new Error('The downloaded file did not match the validated build size. No download was started.');
      }
      const link = document.createElement('a');
      const objectUrl = URL.createObjectURL(blob);
      link.href = objectUrl;
      const disposition = response.headers.get('Content-Disposition') || '';
      const filename = disposition.match(/filename="([^"]+)"/i)?.[1];
      link.download = filename || `${artifact.slug}.html`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      setExportState(`${artifact.title} export downloaded.`);
      void catalogQuery.refetch();
    } catch (error) {
      setExportState(error instanceof Error ? error.message : 'The current export could not be downloaded. Retry the build.');
    } finally {
      setExportingArtifact(undefined);
    }
  };
  const showLoading = catalogQuery.isLoading && !viewCatalog;
  const showError = catalogQuery.isError && !viewCatalog;
  const catalogError = catalogQuery.error ? requestErrorMessage(catalogQuery.error, 'local library catalog') : '';
  const cloudError = cloudCatalogQuery.error ? requestErrorMessage(cloudCatalogQuery.error, 'Sheets and Drive enrichment') : '';
  return <div className="library-noise min-h-[100dvh] bg-background">
    <aside className={cn('app-sidebar', mobileNav && 'app-sidebar-open')}><div className="flex items-start justify-between"><div><div className="brand-kicker">PROJECT APPS</div><div className="mt-2 font-display text-2xl font-bold tracking-tight text-[#fff8eb]">Library<span className="text-[#f7b84b]">.</span></div></div><button data-testid="button-close-mobile-nav" onClick={() => setMobileNav(false)} className="icon-button sidebar-close"><X size={18} /></button></div><div className="mt-12 text-[10px] font-mono-app uppercase tracking-[.18em] text-white/40">Workspace</div><nav className="mt-3 space-y-1"><button data-testid="nav-library" className="sidebar-nav active"><LayoutGrid size={17} /> Library <span className="ml-auto font-mono-app text-[10px]">01</span></button><button data-testid="nav-sources" onClick={() => setActiveSource('sheets')} className="sidebar-nav"><Cloud size={17} /> Sources <span className="ml-auto text-[10px] text-white/35">02</span></button><button data-testid="nav-files" onClick={() => setActiveSource('drive')} className="sidebar-nav"><FolderOpen size={17} /> Documents <span className="ml-auto text-[10px] text-white/35">03</span></button></nav><div className="sidebar-bottom"><div className="rounded-xl border border-white/10 bg-white/[.055] p-4"><div className="flex items-center gap-2 text-xs font-semibold text-white/80"><ShieldCheck size={15} className="text-[#8de0bf]" /> Protected workspace</div><p className="mt-2 text-[11px] leading-5 text-white/45">Cloud actions reflect the current authenticated session.</p></div><div className="mt-5 flex items-center gap-3 text-xs text-white/45"><div className="avatar">PL</div><div><div className="text-white/75">Project librarian</div><div className="font-mono-app text-[10px]">authenticated</div></div></div></div></aside>
     <main className="app-main"><header className="topbar"><button data-testid="button-open-mobile-nav" onClick={() => setMobileNav(true)} className="icon-button mobile-menu"><Menu size={19} /></button><div className="topbar-path"><span>Workspace</span><ChevronRight size={13} /><strong>Apps library</strong></div><div className="ml-auto flex items-center gap-2"><div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex"><span className="live-dot" /> Session protected</div><button data-testid="button-download-html" onClick={() => stopLossArtifact && void downloadArtifact(stopLossArtifact)} disabled={!stopLossArtifact || localRuntime || Boolean(exportingArtifact)} className="button-secondary hidden sm:inline-flex"><FileArchive size={14} /> {exportingArtifact ? 'Preparing HTML…' : 'Download Stop Loss HTML'}</button><button data-testid="button-refresh-catalog" onClick={refreshCatalog} className="icon-button" title="Refresh catalog"><RefreshCw size={17} className={catalogQuery.isFetching || cloudCatalogQuery.isFetching ? 'animate-spin' : ''} /></button></div></header>
      <div className="content-wrap">{localRuntime && <div data-testid="status-file-runtime" className="runtime-banner"><CircleAlert size={17} /><div><strong>Local runtime boundary</strong><span>This page was opened with file://. Cloud requests require the hosted workspace preview and an authenticated browser session.</span></div></div>}
        <section className="hero-row fade-up"><div><div className="eyebrow"><span className="eyebrow-line" /> Catalog / maintained</div><h1 data-testid="heading-library" className="mt-4 font-display text-4xl font-bold tracking-[-.045em] text-foreground sm:text-5xl">Everything your<br /><em>projects</em> made.</h1><p className="mt-4 max-w-xl text-[15px] leading-7 text-muted-foreground">A considered index of apps, presentations, and generated documents — with enough provenance to find the source again.</p></div><div className="hero-stamp"><Sparkles size={16} /><span>Library<br />edition 01</span></div></section>
          {showLoading ? <Skeleton /> : showError ? <div data-testid="error-library" className="error-state"><CircleAlert size={22} /><div><h3 className="font-semibold">The local library catalog is unavailable.</h3><p className="mt-1 text-sm text-muted-foreground">{catalogError || 'The catalog service could not be reached and no browser cache is available.'}</p><button data-testid="button-retry-catalog" className="button-secondary mt-4" onClick={refreshCatalog}><RefreshCw size={15} /> Retry catalog</button></div></div> : !viewCatalog ? <EmptyState title="No catalog response" detail="Waiting for the library service to return a catalog." /> : <><section className="stats-grid fade-up"><div className="stat-block stat-orange"><span className="stat-label">Registered artifacts</span><strong data-testid="stat-artifacts">{artifacts.length.toString().padStart(2, '0')}</strong><span className="stat-foot">workspace apps & outputs</span></div><div className="stat-block stat-mint"><span className="stat-label">Library records</span><strong data-testid="stat-records">{records.length.toString().padStart(2, '0')}</strong><span className="stat-foot">maintained entries</span></div><div className="stat-block stat-cream"><span className="stat-label">Generated</span><strong data-testid="stat-generated">{dateLabel(viewCatalog.generatedAt)}</strong><span className="stat-foot">last catalog snapshot</span></div></section>
            {catalogQuery.isError && <div data-testid="status-local-cache" className="runtime-banner"><CircleAlert size={17} /><div><strong>Local catalog refresh failed</strong><span>{catalogError} The browser cache remains available and is not presented as current.</span></div></div>}
            {cloudCatalogQuery.isError && <div data-testid="status-cloud-enrichment" className="runtime-banner"><CircleAlert size={17} /><div><strong>Protected cloud enrichment unavailable</strong><span>{cloudError} {cachedRecords.length ? 'Cached cloud records are shown as local/stale.' : 'No cloud records are being presented as current.'}</span></div></div>}
            {cloudCatalogQuery.isFetching && !cloudCatalog && <div data-testid="status-cloud-loading" className="notice"><Loader2 className="animate-spin" size={15} /><span>Checking protected Sheets and Drive enrichment. Local artifact metadata remains usable.</span></div>}
            <section className="source-grid fade-up"><SourceCard label="Sheets" state={viewCatalog.sources.sheets.state} message={viewCatalog.sources.sheets.message} onOpen={() => setActiveSource('sheets')} /><SourceCard label="Drive" state={viewCatalog.sources.drive.state} message={viewCatalog.sources.drive.message} onOpen={() => setActiveSource('drive')} /></section>
            {exportState && <div data-testid="status-artifact-export" className="notice mt-4"><FileArchive size={15} /><span>{exportState}</span></div>}
            {stopLossArtifact && <section className="mt-12 fade-up"><ArtifactBuildCard artifact={stopLossArtifact} localRuntime={localRuntime} exporting={exportingArtifact === stopLossArtifact.slug} rebuildable={stopLossArtifact.slug === 'stop-loss-app'} onDownload={downloadArtifact} /></section>}
           <section className="mt-12 fade-up"><div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> Browse the index</div><h2 className="mt-2 font-display text-2xl font-semibold">Library records</h2></div><div className="flex items-center gap-3"><span data-testid="text-filter-count" className="font-mono-app text-xs text-muted-foreground">{filteredRecords.length} / {records.length}</span><button data-testid="button-add-record" className="button-primary" onClick={() => { setSelectedRecord(undefined); setEditingRecord(null); }}><Upload size={14} /> Add record</button></div></div>
            <div className="catalog-toolbar"><div className="search-wrap"><Search size={17} /><input data-testid="input-library-search" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search title, type, or tag" /></div><div className="filter-wrap"><SlidersHorizontal size={15} />{recordTypes.map(type => <button data-testid={`button-filter-${type.toLowerCase().replace(/\s/g, '-')}`} key={type} onClick={() => setFilter(type)} className={cn('filter-button', filter === type && 'selected')}>{type}</button>)}</div></div>
            {filteredRecords.length ? <div className="record-grid">{filteredRecords.map(record => <RecordCard key={record.id} record={record} onOpen={() => setSelectedRecord(record)} />)}</div> : <EmptyState title="No records match that search" detail="Try another title, type, or tag. The catalog itself remains unchanged." action={<button data-testid="button-clear-library-search" onClick={() => { setQuery(''); setFilter('All'); }} className="button-secondary">Clear filters</button>} />}
          </section>
          <section className="mt-14 fade-up"><div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> Workspace inventory</div><h2 className="mt-2 font-display text-2xl font-semibold">Registered artifacts</h2></div><span className="font-mono-app text-xs text-muted-foreground">{artifacts.length} total</span></div>{artifacts.length ? <div className="artifact-list">{artifacts.map(artifact => { const Icon = kindIcon(artifact.kind); return <div data-testid={`row-artifact-${artifact.id}`} className="artifact-row" key={artifact.id}><div className="artifact-mark"><Icon size={18} /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-display font-semibold">{artifact.title}</h3><span className="tag">{artifact.kind}</span>{artifact.productionConfigured && <span className="configured-mark"><Check size={12} /> production</span>}</div><p className="mt-1 truncate text-sm text-muted-foreground">{artifact.description}</p></div><a data-testid={`link-artifact-${artifact.id}`} href={artifact.route} target="_blank" rel="noreferrer" className="icon-button"><ArrowUpRight size={17} /></a></div>; })}</div> : <EmptyState title="No artifacts registered" detail="The workspace returned an empty artifact catalog." />}</section>
        </>}
      </div>
    </main>
    {selectedRecord && <DetailPanel record={selectedRecord} artifact={selectedArtifact} onClose={() => setSelectedRecord(undefined)} onEdit={() => { setEditingRecord(selectedRecord); setSelectedRecord(undefined); }} />}
    {editingRecord !== undefined && viewCatalog && <RecordEditor key={editingRecord?.id || 'new-record'} initial={editingRecord || undefined} artifacts={artifacts} driveFiles={viewCatalog.driveFiles} onSave={saveRecord} onClose={() => setEditingRecord(undefined)} />}
    {activeSource && viewCatalog && <SourceDrawer source={activeSource} catalog={viewCatalog} records={records} onPullRecords={(next) => { setLocalRecords(next); setLocalChanges(false); }} onClose={() => setActiveSource(undefined)} onRefresh={refreshCatalog} />}
    {(selectedRecord || editingRecord !== undefined || activeSource) && <button data-testid="button-close-overlay" className="drawer-scrim" onClick={() => { setSelectedRecord(undefined); setEditingRecord(undefined); setActiveSource(undefined); }} aria-label="Close panel" />}
  </div>;
}

function Router() {
  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={LibraryDashboard} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
