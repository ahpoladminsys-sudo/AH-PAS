export default function Lifecycle() {
  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#FAFBFC] px-[4vw] py-[4vh] font-body text-primary">
      <div className="absolute inset-0 bg-[linear-gradient(135deg,#FAFBFC_0%,#F3F7F8_100%)]" />
      <div className="relative grid h-full grid-rows-[auto_1fr_auto] gap-y-[4vh]">
        <header className="flex items-center justify-between border-b border-[#E2E8F0] pb-[2vh]">
          <div className="flex items-center gap-[1vw]">
            <div className="h-[2vw] w-[2vw] rounded-[0.4vw] bg-accent" />
            <div className="font-display text-[1.5vw] font-bold tracking-[0.02em]">TINUBU</div>
            <div className="text-[1.5vw] font-medium uppercase tracking-[0.14em] text-muted">Self-Funded Operations</div>
          </div>
          <div className="flex gap-[2vw] text-[1.5vw] font-medium uppercase tracking-[0.08em] text-muted">
            <div>WORKSPACE OVERVIEW</div>
            <div>02 / 05</div>
          </div>
        </header>

        <main className="grid grid-cols-[1fr_1.25fr] gap-[4vw]">
          <div className="flex flex-col justify-center">
            <div className="mb-[1vh] text-[1.5vw] font-bold uppercase tracking-[0.12em] text-accent">Operating model</div>
            <h1 className="max-w-[38vw] font-display text-[3.8vw] font-extrabold leading-[1.06] tracking-[-0.04em] text-primary">
              One workspace across the lifecycle
            </h1>
            <div className="mt-[4vh] h-[0.45vh] w-[8vw] rounded-full bg-accent" />
          </div>

          <div className="flex flex-col justify-center gap-[1.7vh]">
            <div className="grid grid-cols-[auto_1fr] items-center gap-[1.2vw] rounded-[0.9vw] border border-[#E2E8F0] bg-white px-[1.5vw] py-[1.8vh] shadow-[0_0.5vw_1.5vw_rgba(30,58,95,0.05)]">
              <div className="flex h-[2.8vw] w-[2.8vw] items-center justify-center rounded-full bg-[rgba(13,148,136,0.12)] font-display text-[1.5vw] font-bold text-accent">01</div>
              <div className="text-[2vw] font-medium leading-[1.2] text-primary">CRM opportunities, accounts, contacts, and relationships</div>
            </div>
            <div className="grid grid-cols-[auto_1fr] items-center gap-[1.2vw] rounded-[0.9vw] border border-[#E2E8F0] bg-white px-[1.5vw] py-[1.8vh] shadow-[0_0.5vw_1.5vw_rgba(30,58,95,0.05)]">
              <div className="flex h-[2.8vw] w-[2.8vw] items-center justify-center rounded-full bg-[rgba(13,148,136,0.12)] font-display text-[1.5vw] font-bold text-accent">02</div>
              <div className="text-[2vw] font-medium leading-[1.2] text-primary">RFP intake, census, plans, experience, losses, and coverage</div>
            </div>
            <div className="grid grid-cols-[auto_1fr] items-center gap-[1.2vw] rounded-[0.9vw] border border-[#E2E8F0] bg-white px-[1.5vw] py-[1.8vh] shadow-[0_0.5vw_1.5vw_rgba(30,58,95,0.05)]">
              <div className="flex h-[2.8vw] w-[2.8vw] items-center justify-center rounded-full bg-[rgba(13,148,136,0.12)] font-display text-[1.5vw] font-bold text-accent">03</div>
              <div className="text-[2vw] font-medium leading-[1.2] text-primary">Specific and aggregate rating with quote population</div>
            </div>
            <div className="grid grid-cols-[auto_1fr] items-center gap-[1.2vw] rounded-[0.9vw] border border-[#E2E8F0] bg-white px-[1.5vw] py-[1.8vh] shadow-[0_0.5vw_1.5vw_rgba(30,58,95,0.05)]">
              <div className="flex h-[2.8vw] w-[2.8vw] items-center justify-center rounded-full bg-[rgba(13,148,136,0.12)] font-display text-[1.5vw] font-bold text-accent">04</div>
              <div className="text-[2vw] font-medium leading-[1.2] text-primary">BTA, PA, Stop Loss, onboarding, conversion, and policy issuance</div>
            </div>
            <div className="grid grid-cols-[auto_1fr] items-center gap-[1.2vw] rounded-[0.9vw] border border-[#E2E8F0] bg-white px-[1.5vw] py-[1.8vh] shadow-[0_0.5vw_1.5vw_rgba(30,58,95,0.05)]">
              <div className="flex h-[2.8vw] w-[2.8vw] items-center justify-center rounded-full bg-[rgba(13,148,136,0.12)] font-display text-[1.5vw] font-bold text-accent">05</div>
              <div className="text-[2vw] font-medium leading-[1.2] text-primary">Invoices, premium booking, enrollment, sanctions, reports, and exports</div>
            </div>
          </div>
        </main>

        <footer className="flex items-center justify-between border-t border-[#E2E8F0] pt-[2vh] text-[1.5vw] font-medium text-[#94A3B8]">
          <div>Tinubu Stop Loss Workbench</div>
          <div>Quote intake → policy operations</div>
        </footer>
      </div>
    </div>
  );
}