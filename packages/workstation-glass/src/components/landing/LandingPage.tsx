import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BrainCircuit,
  ChartNoAxesCombined,
  ChevronRight,
  Database,
  Fingerprint,
  GitBranch,
  ShieldCheck,
  Workflow,
  Zap,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import "./landing-page.css";

const capabilities = [
  {
    icon: ChartNoAxesCombined,
    code: "01 / EXECUTION",
    title: "A deterministic trading core",
    description:
      "Orders, position state, and risk checks follow explicit rules—not agent improvisation.",
    tags: ["OMS", "ORDER FLOW", "AUDIT TRAIL"],
  },
  {
    icon: Activity,
    code: "02 / INTELLIGENCE",
    title: "Research with receipts",
    description:
      "Turn market observations into testable hypotheses, reproducible backtests, and measurable decisions.",
    tags: ["MARKET DATA", "BACKTESTS", "ANALYTICS"],
  },
  {
    icon: ShieldCheck,
    code: "03 / CONTROL",
    title: "Risk is a first-class system",
    description:
      "Keep exposure, drawdown, and execution constraints visible before they become expensive lessons.",
    tags: ["LIMITS", "MONITORING", "JOURNAL"],
  },
];

const operatingRules = [
  ["01", "Deterministic engines calculate.", "Rules, math, and explicit state transitions own the critical path."],
  ["02", "Agents interpret.", "AI helps explain, investigate, and organize—without silently changing execution rules."],
  ["03", "JARVIS orchestrates.", "A single operator layer coordinates tools and surfaces the next useful action."],
  ["04", "You stay in command.", "Every important decision remains inspectable, testable, and accountable."],
];

function BrandMark() {
  return (
    <svg viewBox="0 0 36 36" className="tl-brand-mark" aria-hidden="true">
      <path d="M18 2 34 18 18 34 2 18Z" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M18 9 27 18 18 27 9 18Z" fill="currentColor" />
      <path d="M18 13v10M13 18h10" stroke="#0A0A0B" strokeWidth="1.5" />
    </svg>
  );
}

export function LandingPage() {
  return (
    <div className="tl-landing">
      <header className="tl-header">
        <a className="tl-brand" href="#platform" aria-label="TradeLedger home">
          <BrandMark />
          <span>TradeLedger</span>
          <span className="tl-system-tag"><i /> RONIN / SYS_01</span>
        </a>
        <nav className="tl-nav" aria-label="Main navigation">
          <a href="#platform">Platform</a>
          <a href="#features">Capabilities</a>
          <a href="#method">Method</a>
          <a href="#security">Security</a>
        </nav>
        <div className="tl-header-actions">
          <Link to="/auth" search={{ mode: "signin" }} className="tl-signin">Sign in</Link>
          <Link to="/auth" search={{ mode: "signup" }} className="tl-button tl-button-primary tl-button-small">
            Get started <ArrowUpRight size={14} />
          </Link>
        </div>
      </header>

      <main>
        <section className="tl-hero" id="platform">
          <div className="tl-hero-art" aria-hidden="true" />
          <div className="tl-hero-grid" aria-hidden="true" />
          <div className="tl-hero-content">
            <div className="tl-eyebrow"><span className="tl-live-dot" /> QUANTITATIVE TRADING OPERATING SYSTEM</div>
            <h1>Precision over<br /><span>prediction.</span></h1>
            <p className="tl-hero-copy">
              One disciplined environment for execution, research, risk, and review.
              Built for traders who want to understand every decision—not just its outcome.
            </p>
            <div className="tl-hero-actions">
              <Link to="/auth" search={{ mode: "signup" }} className="tl-button tl-button-primary">
                Enter the workstation <ArrowUpRight size={16} />
              </Link>
              <a href="#features" className="tl-button tl-button-quiet">
                Explore the system <ArrowRight size={16} />
              </a>
            </div>
            <div className="tl-hero-footnote">
              <span><i className="tl-square-dot" /> RULE-BASED CORE</span>
              <span><i className="tl-square-dot" /> AUDITABLE BY DESIGN</span>
              <span><i className="tl-square-dot" /> HUMAN IN CONTROL</span>
            </div>
          </div>
          <div className="tl-hero-index" aria-hidden="true">
            <span>TL / 001</span><span>DISCIPLINE IS AN EDGE</span><span>EST. FOR THE LONG GAME</span>
          </div>
          <div className="tl-scroll-cue"><span /> SCROLL TO EXPLORE</div>
        </section>

        <section className="tl-ticker" aria-label="Platform principles">
          <div><span>01</span> EXECUTE WITH INTENT</div>
          <div><span>02</span> MEASURE WHAT MATTERS</div>
          <div><span>03</span> PROTECT THE DOWNSIDE</div>
          <div><span>04</span> LEARN FROM THE TAPE</div>
        </section>

        <section className="tl-section tl-capabilities" id="features">
          <div className="tl-section-heading">
            <div>
              <p className="tl-eyebrow">THE PLATFORM / BUILT IN LAYERS</p>
              <h2>Every moving part.<br /><span>One operating picture.</span></h2>
            </div>
            <p className="tl-section-intro">
              TradeLedger brings the tools around your trading process into one coherent workflow—from the first hypothesis to the post-trade review.
            </p>
          </div>
          <div className="tl-capability-grid">
            {capabilities.map((item) => {
              const Icon = item.icon;
              return (
                <article className="tl-capability" key={item.code}>
                  <div className="tl-capability-top">
                    <span>{item.code}</span>
                    <Icon size={20} strokeWidth={1.5} />
                  </div>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                  <div className="tl-tags">{item.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
                  <div className="tl-card-rule" />
                </article>
              );
            })}
          </div>
        </section>

        <section className="tl-method" id="method">
          <div className="tl-method-visual">
            <div className="tl-method-orbit tl-orbit-one" />
            <div className="tl-method-orbit tl-orbit-two" />
            <div className="tl-method-core"><BrandMark /><span>CONTROL<br />PLANE</span></div>
            <div className="tl-orbit-label tl-orbit-label-a"><Database size={14} /> DETERMINISTIC CORE</div>
            <div className="tl-orbit-label tl-orbit-label-b"><BrainCircuit size={14} /> AGENT LAYER</div>
            <div className="tl-orbit-label tl-orbit-label-c"><Workflow size={14} /> ORCHESTRATION</div>
            <div className="tl-method-crosshair" />
          </div>
          <div className="tl-method-copy">
            <p className="tl-eyebrow">THE OPERATING PHILOSOPHY</p>
            <h2>Intelligence with<br /><span>guardrails.</span></h2>
            <p className="tl-section-intro">AI is useful when its role is clear. TradeLedger separates calculation from interpretation so you can move faster without surrendering control.</p>
            <div className="tl-rules">
              {operatingRules.map(([number, title, description]) => (
                <div className="tl-rule" key={number}>
                  <span className="tl-rule-number">{number}</span>
                  <div><h3>{title}</h3><p>{description}</p></div>
                  <ChevronRight size={16} />
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="tl-security" id="security">
          <div className="tl-security-icon"><Fingerprint size={27} strokeWidth={1.3} /></div>
          <div className="tl-security-copy">
            <p className="tl-eyebrow">BUILT AROUND ACCOUNTABILITY</p>
            <h2>Trust the process.<br /><span>Verify the details.</span></h2>
            <p>Clear boundaries between the interface, authenticated services, and persistent data. Your journal and account views should be private, traceable, and governed by explicit access controls.</p>
          </div>
          <div className="tl-security-points">
            <div><ShieldCheck size={17} /><span>Authenticated access</span><ArrowUpRight size={13} /></div>
            <div><GitBranch size={17} /><span>Traceable changes</span><ArrowUpRight size={13} /></div>
            <div><Zap size={17} /><span>Explicit risk rules</span><ArrowUpRight size={13} /></div>
          </div>
        </section>

        <section className="tl-final-cta">
          <div className="tl-final-cta-mark"><BrandMark /></div>
          <p className="tl-eyebrow">YOUR PROCESS. YOUR EDGE.</p>
          <h2>Make every decision<br /> <span>count.</span></h2>
          <p>Bring your execution, research, and reflection into the same system.</p>
          <Link to="/auth" search={{ mode: "signup" }} className="tl-button tl-button-primary">
            Build your process <ArrowUpRight size={16} />
          </Link>
          <span className="tl-cta-foot"><ArrowDownRight size={13} /> BEGIN WITH DISCIPLINE</span>
        </section>
      </main>

      <footer className="tl-footer">
        <a className="tl-brand tl-footer-brand" href="#platform"><BrandMark /><span>TradeLedger</span></a>
        <span>DETERMINISTIC BY DESIGN. HUMAN BY CHOICE.</span>
        <a href="#platform">BACK TO TOP ↑</a>
        <span className="tl-footer-copy">© {new Date().getFullYear()} TRADELEDGER</span>
      </footer>
    </div>
  );
}
