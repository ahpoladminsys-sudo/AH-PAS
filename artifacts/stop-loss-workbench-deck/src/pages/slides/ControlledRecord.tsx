export default function ControlledRecord() {
  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#FAFBFC] px-[4vw] py-[4vh] font-body text-primary">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_18%,rgba(13,148,136,0.1),transparent_25%),linear-gradient(135deg,#FAFBFC_0%,#F3F7F8_100%)]" />
      <div className="relative grid h-full grid-rows-[auto_1fr_auto] gap-y-[4vh]">
        <header className="flex items-center justify-between border-b border-[#E2E8F0] pb-[2vh]">
          <div className="flex items-center gap-[1vw]">
            <div className="h-[2vw] w-[2vw] rounded-[0.4vw] bg-accent" />
            <div className="font-display text-[1.5vw] font-bold tracking-[0.02em]">TINUBU</div>
            <div className="text-[1.5vw] font-medium uppercase tracking-[0.14em] text-muted">Self-Funded Operations</div>
          </div>
          <div className="flex gap-[2vw] text-[1.5vw] font-medium uppercase tracking-[0.08em] text-muted">
            <div>SYSTEM OF RECORD</div>
            <div>05 / 05</div>
          </div>
        </header>

        <main className="grid grid-cols-[1.15fr_0.85fr] gap-[4vw]">
          <div className="flex flex-col justify-center">
            <div className="mb-[1vh] text-[1.5vw] font-bold uppercase tracking-[0.12em] text-accent">Control layer</div>
            <h1 className="max-w-[45vw] font-display text-[3.9vw] font-extrabold leading-[1.04] tracking-[-0.04em] text-primary">
              A controlled system of record
            </h1>
            <div className="mt-[4vh] flex flex-col gap-[1.7vh]">
              <div className="text-[2vw] font-medium leading-[1.2] text-primary">Policy, quote, CRM, licensing, document, and underwriting actions are auditable</div>
              <div className="text-[2vw] font-medium leading-[1.2] text-primary">Server-authoritative licensing state validates the same records Operations edits</div>
              <div className="text-[2vw] font-medium leading-[1.2] text-primary">Protected APIs keep Sheets, Drive, Gemini, and licensing actions behind server controls</div>
              <div className="text-[2vw] font-medium leading-[1.2] text-primary">Reviewable lifecycle transitions reduce handoff risk from submission to policy</div>
              <div className="rounded-[0.8vw] border border-[#B7E1DC] bg-[rgba(13,148,136,0.08)] px-[1.2vw] py-[1.3vh] text-[2vw] font-bold leading-[1.2] text-primary">
                Next step: publish the connected workspace for team use
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center">
            <div className="relative flex h-[58vh] w-full flex-col items-center justify-center rounded-[1.1vw] border border-[#DCE6EA] bg-white px-[2vw] shadow-[0_0.8vw_2vw_rgba(30,58,95,0.08)]">
              <div className="absolute left-[1.8vw] top-[2.6vh] text-[1.5vw] font-bold uppercase tracking-[0.12em] text-muted">Record controls</div>
              <div className="flex h-[13vw] w-[13vw] items-center justify-center rounded-full border-[1.2vw] border-[#BDE3DF]">
                <div className="flex h-[8.5vw] w-[8.5vw] flex-col items-center justify-center rounded-full bg-primary text-center font-display text-[1.5vw] font-bold leading-[1.15] text-white">
                  <span>Quote</span>
                  <span>to policy</span>
                </div>
              </div>
              <div className="mt-[4vh] grid w-full grid-cols-2 gap-[1vw]">
                <div className="rounded-[0.7vw] bg-[#F3F7F8] px-[1vw] py-[1.5vh] text-center text-[1.5vw] font-bold uppercase tracking-[0.06em] text-primary">Audit trail</div>
                <div className="rounded-[0.7vw] bg-[#F3F7F8] px-[1vw] py-[1.5vh] text-center text-[1.5vw] font-bold uppercase tracking-[0.06em] text-primary">API controls</div>
                <div className="rounded-[0.7vw] bg-[#F3F7F8] px-[1vw] py-[1.5vh] text-center text-[1.5vw] font-bold uppercase tracking-[0.06em] text-primary">Authority checks</div>
                <div className="rounded-[0.7vw] bg-[#F3F7F8] px-[1vw] py-[1.5vh] text-center text-[1.5vw] font-bold uppercase tracking-[0.06em] text-primary">Source retention</div>
              </div>
            </div>
          </div>
        </main>

        <footer className="flex items-center justify-between border-t border-[#E2E8F0] pt-[2vh] text-[1.5vw] font-medium text-[#94A3B8]">
          <div>Tinubu Stop Loss Workbench</div>
          <div>From submission to policy, with evidence</div>
        </footer>
      </div>
    </div>
  );
}