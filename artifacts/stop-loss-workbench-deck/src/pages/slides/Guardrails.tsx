export default function Guardrails() {
  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#FAFBFC] px-[4vw] py-[4vh] font-body text-primary">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_92%_72%,rgba(13,148,136,0.08),transparent_24%),linear-gradient(135deg,#FAFBFC_0%,#F3F7F8_100%)]" />
      <div className="relative grid h-full grid-rows-[auto_1fr_auto] gap-y-[4vh]">
        <header className="flex items-center justify-between border-b border-[#E2E8F0] pb-[2vh]">
          <div className="flex items-center gap-[1vw]">
            <div className="h-[2vw] w-[2vw] rounded-[0.4vw] bg-accent" />
            <div className="font-display text-[1.5vw] font-bold tracking-[0.02em]">TINUBU</div>
            <div className="text-[1.5vw] font-medium uppercase tracking-[0.14em] text-muted">Self-Funded Operations</div>
          </div>
          <div className="flex gap-[2vw] text-[1.5vw] font-medium uppercase tracking-[0.08em] text-muted">
            <div>UNDERWRITING CONTROL</div>
            <div>03 / 05</div>
          </div>
        </header>

        <main className="grid grid-cols-[1.05fr_0.95fr] gap-[4vw]">
          <div className="flex flex-col justify-center">
            <div className="mb-[1vh] text-[1.5vw] font-bold uppercase tracking-[0.12em] text-accent">Eligibility logic</div>
            <h1 className="max-w-[42vw] font-display text-[3.7vw] font-extrabold leading-[1.06] tracking-[-0.04em] text-primary">
              Underwriting decisions with guardrails
            </h1>
            <div className="mt-[4vh] grid grid-cols-2 gap-[1.2vw]">
              <div className="rounded-[0.9vw] border border-[#E2E8F0] bg-white px-[1.4vw] py-[2vh] shadow-[0_0.5vw_1.5vw_rgba(30,58,95,0.05)]">
                <div className="text-[1.5vw] font-bold uppercase tracking-[0.08em] text-muted">Authority</div>
                <div className="mt-[1vh] text-[1.5vw] font-bold leading-[1.2] text-primary">State + date</div>
              </div>
              <div className="rounded-[0.9vw] border border-[#E2E8F0] bg-white px-[1.4vw] py-[2vh] shadow-[0_0.5vw_1.5vw_rgba(30,58,95,0.05)]">
                <div className="text-[1.5vw] font-bold uppercase tracking-[0.08em] text-muted">Outcome</div>
                <div className="mt-[1vh] text-[1.5vw] font-bold leading-[1.2] text-primary">Progression + binding</div>
              </div>
            </div>
          </div>

          <div className="flex flex-col justify-center gap-[1.5vh]">
            <div className="rounded-[0.9vw] border border-[#E2E8F0] bg-white px-[1.5vw] py-[1.8vh] shadow-[0_0.5vw_1.5vw_rgba(30,58,95,0.05)]">
              <div className="text-[2vw] font-medium leading-[1.2] text-primary">Dynamic broker and licensed-agent selection by product, state, and effective date</div>
            </div>
            <div className="rounded-[0.9vw] border border-[#E2E8F0] bg-white px-[1.5vw] py-[1.8vh] shadow-[0_0.5vw_1.5vw_rgba(30,58,95,0.05)]">
              <div className="text-[2vw] font-medium leading-[1.2] text-primary">License status, authority dates, and expiration visible before selection</div>
            </div>
            <div className="rounded-[0.9vw] border border-[#E2E8F0] bg-white px-[1.5vw] py-[1.8vh] shadow-[0_0.5vw_1.5vw_rgba(30,58,95,0.05)]">
              <div className="text-[2vw] font-medium leading-[1.2] text-primary">TPA Partner and Program Name selected from indexed relationship/program data</div>
            </div>
            <div className="rounded-[0.9vw] border border-[#B7E1DC] bg-[rgba(13,148,136,0.08)] px-[1.5vw] py-[1.8vh] shadow-[0_0.5vw_1.5vw_rgba(30,58,95,0.05)]">
              <div className="text-[2vw] font-bold leading-[1.2] text-primary">Ineligible or expired authority is blocked before quote progression or binding</div>
            </div>
            <div className="rounded-[0.9vw] border border-[#E2E8F0] bg-white px-[1.5vw] py-[1.8vh] shadow-[0_0.5vw_1.5vw_rgba(30,58,95,0.05)]">
              <div className="text-[2vw] font-medium leading-[1.2] text-primary">BTA War Risk and tagged multi-document opportunity uploads stay in context</div>
            </div>
          </div>
        </main>

        <footer className="flex items-center justify-between border-t border-[#E2E8F0] pt-[2vh] text-[1.5vw] font-medium text-[#94A3B8]">
          <div>Tinubu Stop Loss Workbench</div>
          <div>Authority before action</div>
        </footer>
      </div>
    </div>
  );
}