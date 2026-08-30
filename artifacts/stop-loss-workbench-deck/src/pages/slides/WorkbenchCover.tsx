const base = import.meta.env.BASE_URL;

export default function WorkbenchCover() {
  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#FAFBFC] px-[4vw] py-[4vh] font-body text-primary">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_34%,rgba(13,148,136,0.09),transparent_24%),linear-gradient(135deg,#FAFBFC_0%,#F3F7F8_100%)]" />
      <div className="relative grid h-full grid-cols-[3fr_2fr] grid-rows-[auto_1fr_auto] gap-x-[4vw] gap-y-[4vh]">
        <header className="col-span-2 flex items-center justify-between border-b border-[#E2E8F0] pb-[2vh]">
          <div className="flex items-center gap-[1vw]">
            <div className="h-[2vw] w-[2vw] rounded-[0.4vw] bg-accent" />
            <div className="font-display text-[1.5vw] font-bold tracking-[0.02em]">TINUBU</div>
            <div className="text-[1.5vw] font-medium uppercase tracking-[0.14em] text-muted">Self-Funded Operations</div>
          </div>
          <div className="flex gap-[2vw] text-[1.5vw] font-medium uppercase tracking-[0.08em] text-muted">
            <div>WORKSPACE OVERVIEW</div>
            <div>2026</div>
          </div>
        </header>

        <main className="flex flex-col justify-center">
          <div className="mb-[1vh] text-[1.5vw] font-bold uppercase tracking-[0.12em] text-accent">Stop Loss Workbench</div>
          <h1 className="max-w-[46vw] font-display text-[5vw] font-extrabold leading-[1.04] tracking-[-0.045em] text-primary">
            Tinubu Stop Loss Workbench
          </h1>
          <p className="mt-[2.5vh] max-w-[38vw] text-[2vw] leading-[1.35] text-[#475569]">
            Connected quote-to-policy operations for self-funded business
          </p>
          <p className="mt-[1.5vh] max-w-[38vw] text-[1.5vw] leading-[1.4] text-muted">
            From first submission through underwriting, issuance, billing, claims, and audit
          </p>
          <div className="mt-[4vh] flex gap-[1.5vw]">
            <div className="min-w-[12vw] rounded-[1vw] border border-[#E2E8F0] bg-white px-[1.6vw] py-[2.2vh] shadow-[0_0.5vw_1.5vw_rgba(30,58,95,0.05)]">
              <div className="text-[1.5vw] font-bold uppercase tracking-[0.08em] text-muted">Workflow</div>
              <div className="mt-[1vh] font-display text-[2.2vw] font-bold text-primary">Quote → Policy</div>
            </div>
            <div className="min-w-[12vw] rounded-[1vw] border border-[#E2E8F0] bg-white px-[1.6vw] py-[2.2vh] shadow-[0_0.5vw_1.5vw_rgba(30,58,95,0.05)]">
              <div className="text-[1.5vw] font-bold uppercase tracking-[0.08em] text-muted">Coverage</div>
              <div className="mt-[1vh] font-display text-[2.2vw] font-bold text-primary">Specific + Aggregate</div>
            </div>
          </div>
        </main>

        <div className="flex items-center justify-center">
          <div className="relative h-[62vh] w-full overflow-hidden rounded-[1.1vw] border border-[#DCE6EA] bg-white p-[1vw] shadow-[0_0.8vw_2vw_rgba(30,58,95,0.08)]">
            <div className="absolute left-[2.2vw] top-[2.5vh] z-10 rounded-full bg-[rgba(13,148,136,0.1)] px-[1vw] py-[0.8vh] text-[1.5vw] font-bold uppercase tracking-[0.12em] text-accent">
              Connected operations
            </div>
            <img
              src={`${base}underwriting-network.png`}
              crossOrigin="anonymous"
              alt="Abstract connected underwriting operations visual"
              className="h-full w-full rounded-[0.7vw] object-cover"
            />
            <div className="absolute bottom-[2.5vh] left-[2.2vw] right-[2.2vw] rounded-[0.8vw] border border-white/70 bg-[#1E3A5F]/90 px-[1.2vw] py-[1.5vh] text-[1.5vw] font-medium text-white">
              Submission data, documents, and controls in one operating view
            </div>
          </div>
        </div>

        <footer className="col-span-2 flex items-center justify-between border-t border-[#E2E8F0] pt-[2vh] text-[1.5vw] font-medium text-[#94A3B8]">
          <div>Tinubu Stop Loss Workbench</div>
          <div>Connected quote-to-policy operations</div>
        </footer>
      </div>
    </div>
  );
}