export default function ConnectedData() {
  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#FAFBFC] px-[4vw] py-[4vh] font-body text-primary">
      <div className="absolute inset-0 bg-[linear-gradient(135deg,#FAFBFC_0%,#F3F7F8_100%)]" />
      <div className="relative grid h-full grid-rows-[auto_auto_1fr_auto] gap-y-[3vh]">
        <header className="flex items-center justify-between border-b border-[#E2E8F0] pb-[2vh]">
          <div className="flex items-center gap-[1vw]">
            <div className="h-[2vw] w-[2vw] rounded-[0.4vw] bg-accent" />
            <div className="font-display text-[1.5vw] font-bold tracking-[0.02em]">TINUBU</div>
            <div className="text-[1.5vw] font-medium uppercase tracking-[0.14em] text-muted">Self-Funded Operations</div>
          </div>
          <div className="flex gap-[2vw] text-[1.5vw] font-medium uppercase tracking-[0.08em] text-muted">
            <div>CONNECTED DATA</div>
            <div>04 / 05</div>
          </div>
        </header>

        <div className="flex items-end justify-between">
          <div>
            <div className="mb-[1vh] text-[1.5vw] font-bold uppercase tracking-[0.12em] text-accent">Evidence flow</div>
            <h1 className="font-display text-[3.7vw] font-extrabold leading-[1.06] tracking-[-0.04em] text-primary">
              Connected documents, data, and AI
            </h1>
          </div>
          <div className="max-w-[30vw] pb-[0.5vh] text-right text-[1.5vw] leading-[1.35] text-muted">Every source stays attached to the operating record.</div>
        </div>

        <main className="grid grid-cols-2 grid-rows-3 gap-[1.3vw]">
          <div className="row-span-1 rounded-[0.9vw] border border-[#E2E8F0] bg-white px-[1.6vw] py-[2.4vh] shadow-[0_0.5vw_1.5vw_rgba(30,58,95,0.05)]">
            <div className="flex items-center gap-[1vw]">
              <div className="flex h-[2.6vw] w-[2.6vw] items-center justify-center rounded-[0.6vw] bg-[rgba(13,148,136,0.12)] font-display text-[1.5vw] font-bold text-accent">01</div>
              <div className="text-[2vw] font-medium leading-[1.2] text-primary">Google Sheets stores workspace snapshots and syncs operational records</div>
            </div>
          </div>
          <div className="row-span-1 rounded-[0.9vw] border border-[#E2E8F0] bg-white px-[1.6vw] py-[2.4vh] shadow-[0_0.5vw_1.5vw_rgba(30,58,95,0.05)]">
            <div className="flex items-center gap-[1vw]">
              <div className="flex h-[2.6vw] w-[2.6vw] items-center justify-center rounded-[0.6vw] bg-[rgba(13,148,136,0.12)] font-display text-[1.5vw] font-bold text-accent">02</div>
              <div className="text-[2vw] font-medium leading-[1.2] text-primary">Google Drive stores RFPs, policy documents, generated PDFs, and attachments</div>
            </div>
          </div>
          <div className="col-span-2 rounded-[0.9vw] border border-[#B7E1DC] bg-[rgba(13,148,136,0.08)] px-[1.6vw] py-[2.4vh] shadow-[0_0.5vw_1.5vw_rgba(30,58,95,0.05)]">
            <div className="flex items-center gap-[1vw]">
              <div className="flex h-[2.6vw] w-[2.6vw] items-center justify-center rounded-[0.6vw] bg-white font-display text-[1.5vw] font-bold text-accent">03</div>
              <div className="text-[2vw] font-bold leading-[1.2] text-primary">Browser cache and Drive backup provide continuity during cloud limits</div>
            </div>
          </div>
          <div className="row-span-1 rounded-[0.9vw] border border-[#E2E8F0] bg-white px-[1.6vw] py-[2.4vh] shadow-[0_0.5vw_1.5vw_rgba(30,58,95,0.05)]">
            <div className="flex items-center gap-[1vw]">
              <div className="flex h-[2.6vw] w-[2.6vw] items-center justify-center rounded-[0.6vw] bg-[rgba(13,148,136,0.12)] font-display text-[1.5vw] font-bold text-accent">04</div>
              <div className="text-[2vw] font-medium leading-[1.2] text-primary">Gemini-assisted extraction classifies documents and previews evidence before apply</div>
            </div>
          </div>
          <div className="row-span-1 rounded-[0.9vw] border border-[#E2E8F0] bg-white px-[1.6vw] py-[2.4vh] shadow-[0_0.5vw_1.5vw_rgba(30,58,95,0.05)]">
            <div className="flex items-center gap-[1vw]">
              <div className="flex h-[2.6vw] w-[2.6vw] items-center justify-center rounded-[0.6vw] bg-[rgba(13,148,136,0.12)] font-display text-[1.5vw] font-bold text-accent">05</div>
              <div className="text-[2vw] font-medium leading-[1.2] text-primary">Source files remain attached to the quote and flow into policy documents after binding</div>
            </div>
          </div>
        </main>

        <footer className="flex items-center justify-between border-t border-[#E2E8F0] pt-[2vh] text-[1.5vw] font-medium text-[#94A3B8]">
          <div>Tinubu Stop Loss Workbench</div>
          <div>Source → evidence → decision</div>
        </footer>
      </div>
    </div>
  );
}