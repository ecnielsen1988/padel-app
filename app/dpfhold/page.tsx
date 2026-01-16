// app/dpfhold/page.tsx
import Link from "next/link";

type Hold = {
  holdnavn: string;
  række: string;
  captajn: string;
  spillere: string[];
  historie: string;
};

const HOLD: Hold[] = [
  {
    holdnavn: "Titanes",
    række: "2. division",
    captajn: "Emil Nielsen",
    historie:
      "Titanes træder ind på banen som om den allerede tilhører dem. Ikke kun power – men ro. Når kampen spidser til, løfter de niveauet og knækker modstanderen stille og roligt. 🏛️💪",
    spillere: [
      "Gitte Haxen",
      "Emil Nielsen",
      "Daniel Vizel",
      "Anders Beck Nielsen",
      "Jan Vingaard",
      "Jesper Senior Nielsen",
      "Pauli",
      "Claus Cæsar Andersen",
      "Michelle Skov Jensen",
    ],
  },
  {
    holdnavn: "Gladiadores",
    række: "Danmarksserien",
    captajn: "René Kongerslev Thorning",
    historie:
      "Gladiadores spiller aldrig for uafgjort. Hver bold er en duel, hver kamp er en arena – og de fighter til sidste point. Smukt? Måske ikke. Effektivt? Altid. ⚔️🔥",
    spillere: [
      "Stefan Beck Nielsen",
      "Michael Berglund",
      "Mik Skoglund",
      "Tobias Beck Nielsen",
      "Kasper Lauest",
      "Jacob Karmann Larsen",
      "René Kongerslev Thorning",
      "Christopher Porsgaard",
      "Søren Frodegaard",
    ],
  },
  {
    holdnavn: "Espartanos",
    række: "Serie 1",
    captajn: "Kim Kranker",
    historie:
      "Espartanos kører disciplin: struktur, fokus og hårdt arbejde. Ingen brok. Ingen undskyldninger. Kun padel. De giver aldrig noget gratis. 🛡️💥",
    spillere: [
      "Mads Brandt",
      "Kim Kranker",
      "Christian Østermark",
      "Thomas TJ Jensen",
      "Mads Jørgensen",
      "Marcus Christesen",
      "Steffen Kløve",
      "Lasse Ryborg",
      "Skipper",
    ],
  },
  {
    holdnavn: "Barbaros",
    række: "Serie 2",
    captajn: "Stanley Nielsen",
    historie:
      "Barbaros spiller uden filter og uden frygt. De elsker kaos, tempo og vilde dueller – og trives bedst, når kampen bliver grim. Modstanderen ved aldrig helt, hvad der rammer dem. 🪓😈",
    spillere: [
      "Thomas Olsen",
      "Stanley Nielsen",
      "Markus Ley",
      "Lasse Nedergaard",
      "Philip Beck",
      "Michael Toft",
      "Kennie Jørgensen",
      "Martin Yde",
      "Lukas Christiansen",
    ],
  },
  {
    holdnavn: "Reclutas",
    række: "Serie 3",
    captajn: "Simon Petersen",
    historie:
      "Reclutas er sultne og lærevillige. De suger erfaring til sig og vokser for hver kamp. Undervurder dem – og du kommer til at fortryde det. 🎯📈",
    spillere: [
      "Claus Asmussen",
      "Tobias Lønnecker",
      "Simon Petersen",
      "Christian Jensen",
      "Isac Wiingaard",
      "Jonas Hald",
      "Aske Lundsgaard Havmøller",
      "Morten Hegelund",
      "Jonas Holm",
    ],
  },
  {
    holdnavn: "Exploradores",
    række: "Serie 4",
    captajn: "Mads Kreutzer",
    historie:
      "Exploradores finder linjerne, vinklerne og de mærkelige løsninger, som ingen andre ser. De udforsker kampen, læser modstanderen – og vinder på snuhed. 🧭🧠",
    spillere: [
      "Kasper Diebel",
      "Mads Nielsen",
      "Mads Bukhave",
      "Torben Høier",
      "Samuel Nielsen",
      "Mads Kreutzer",
      "Thomas Tingleff",
      "Lasse Teubner",
      "Claes Vinge Olsen",
    ],
  },
  {
    holdnavn: "Novatos",
    række: "Serie 5",
    captajn: "Steffan Rasmussen",
    historie:
      "Novatos er nye, nysgerrige og fulde af energi. De spiller med smil og mod – og hver kamp er et skridt frem. Rejsen er først lige begyndt. 🚀🎾",
    spillere: [
      "Steffan Rasmussen",
      "Brian Pedersen",
      "Philip Hemmingsen",
      "Martin Lauritsen",
      "Niklas Jordan Loft",
      "Pierpaolo PP Sportelli",
      "Dennis Larsen",
      "Nikolaj Gerner",
      "Christian Olesen",
      "Bastian Hoffmann",
      "Jimmy Duvander",
    ],
  },
];

export default function DpfHoldPage() {
  return (
    <main style={s.page}>
      <header style={s.topBar}>
        <div>
          <div style={s.kicker}>🎾 DPF HOLDKAMPE • 7 HOLD • 1 MISSION</div>
          <h1 style={s.title}>Hvem spiller hvor? 🧾</h1>
          <p style={s.subtitle}>
            Find dit hold, find din kaptajn – og læs holdets lore 📣😎
          </p>
        </div>

        <div style={s.actions}>
          <Link href="/" style={s.backBtn}>
            🏠 Tilbage
          </Link>
        
        </div>
      </header>

      <section style={s.grid}>
        {HOLD.map((h, idx) => (
          <article key={h.holdnavn} style={s.card}>
            {/* Top banner */}
            <div style={s.banner}>
              <div style={s.bannerLeft}>
                <span style={s.bannerIcon}>{holdIcon(h.holdnavn)}</span>
                <span style={s.bannerName}>{h.holdnavn}</span>
               
              </div>
              <div style={s.bannerRight}>
                <span style={s.bannerChip}>🏆 {h.række}</span>
                <span style={s.bannerChip}>🧍 {h.spillere.length} spillere</span>
              </div>
            </div>

            {/* Captain + mini info */}
            <div style={s.metaRow}>
              <div style={s.captajnBox}>
                <div style={s.captajnLabel}>👑 Captajn</div>
                <div style={s.captajnName}>{h.captajn}</div>
              </div>

            
            </div>

            {/* Story */}
            <div style={s.storyBox}>
              <div style={s.storyTitle}>📣 Holdets historie</div>
              <div style={s.storyText}>{h.historie}</div>
            </div>

            {/* Players */}
            <div style={s.playersTitle}>
              🧍 Spillere <span style={s.playersCount}>({h.spillere.length})</span>
            </div>

            <ul style={s.playerGrid}>
              {h.spillere.map((navn, i) => (
                <li key={navn} style={s.playerChip}>
                  <span style={s.playerIcon}>{playerEmoji(i)}</span>
                  <span style={s.playerName}>{navn}</span>
                </li>
              ))}
            </ul>

            <div style={s.shine} />
          </article>
        ))}
      </section>

      <footer style={s.footer}>
        
      </footer>
    </main>
  );
}

function holdIcon(navn: string) {
  const map: Record<string, string> = {
    Titanes: "🏛️",
    Gladiadores: "⚔️",
    Espartanos: "🛡️",
    Barbaros: "🪓",
    Reclutas: "🎯",
    Exploradores: "🧭",
    Novatos: "🚀",
  };
  return map[navn] ?? "🎾";
}

function playerEmoji(i: number) {
  const arr = ["🎾", "💪", "⚡️", "🔥", "🧠", "😎", "🤝", "🏆", "🧱", "🪄", "🧨", "🧊"];
  return arr[i % arr.length];
}

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    padding: 16,
    colorScheme: "light dark",
    color: "CanvasText",
    background:
      "radial-gradient(1200px 600px at 10% -10%, color-mix(in oklab, HotPink, transparent 55%) 0%, transparent 60%)," +
      "radial-gradient(900px 500px at 110% 10%, color-mix(in oklab, DeepPink, transparent 62%) 0%, transparent 55%)," +
      "linear-gradient(180deg, Canvas 0%, color-mix(in oklab, Canvas, HotPink 18%) 100%)",
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji"',
  },

  topBar: {
    maxWidth: 1100,
    margin: "0 auto 14px auto",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    flexWrap: "wrap",
  },

  kicker: {
    display: "inline-block",
    padding: "8px 12px",
    borderRadius: 999,
    background: "color-mix(in oklab, Canvas, HotPink 22%)",
    border: "1px solid color-mix(in oklab, HotPink, transparent 45%)",
    fontWeight: 950,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    fontSize: 12,
  },

  title: {
    margin: "10px 0 0 0",
    fontSize: 34,
    fontWeight: 1000 as any,
    letterSpacing: -0.6,
    lineHeight: 1.05,
  },

  subtitle: {
    margin: "8px 0 0 0",
    opacity: 0.82,
    lineHeight: 1.35,
    maxWidth: "62ch",
  },

  actions: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    alignItems: "flex-end",
  },

  backBtn: {
    textDecoration: "none",
    padding: "10px 12px",
    borderRadius: 14,
    fontWeight: 950,
    background:
      "linear-gradient(135deg, color-mix(in oklab, HotPink, white 28%) 0%, color-mix(in oklab, DeepPink, white 10%) 100%)",
    color: "black",
    border: "1px solid color-mix(in oklab, HotPink, transparent 40%)",
    boxShadow: "0 16px 34px color-mix(in oklab, HotPink, transparent 72%)",
    whiteSpace: "nowrap",
  },

  pill: {
    padding: "8px 10px",
    borderRadius: 999,
    background: "color-mix(in oklab, Canvas, HotPink 18%)",
    border: "1px solid color-mix(in oklab, HotPink, transparent 55%)",
    fontWeight: 900,
    fontSize: 12,
    opacity: 0.95,
  },

  dot: { opacity: 0.6, margin: "0 6px" },

  grid: {
    maxWidth: 1100,
    margin: "0 auto",
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(310px, 1fr))",
    gap: 14,
  },

  card: {
    position: "relative",
    overflow: "hidden",
    borderRadius: 24,
    padding: 14,
    background:
      "linear-gradient(180deg, color-mix(in oklab, Canvas, HotPink 12%) 0%, color-mix(in oklab, Canvas, DeepPink 10%) 100%)",
    border: "1px solid color-mix(in oklab, HotPink, transparent 52%)",
    boxShadow:
      "0 18px 55px color-mix(in oklab, HotPink, transparent 78%), 0 10px 26px rgba(0,0,0,0.12)",
  },

  banner: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 18,
    background:
      "linear-gradient(135deg, color-mix(in oklab, HotPink, white 18%) 0%, color-mix(in oklab, DeepPink, white 6%) 100%)",
    border: "1px solid color-mix(in oklab, HotPink, transparent 45%)",
  },

  bannerLeft: {
  display: "flex",
  alignItems: "center",
  gap: 10,
  minWidth: 0,
  flex: "1 1 240px",         // ✅ giver venstre side plads
},


  bannerIcon: { fontSize: 22 },

  bannerName: {
  fontWeight: 1000 as any,
  fontSize: 18,
  letterSpacing: -0.2,
  whiteSpace: "normal",      // ✅ må wrappe
  overflow: "visible",       // ✅ ikke skjules
  textOverflow: "clip",      // ✅ ingen ...
  lineHeight: 1.1,
},

  bannerTag: {
    padding: "6px 10px",
    borderRadius: 999,
    fontWeight: 950,
    fontSize: 12,
    background: "rgba(255,255,255,0.55)",
    border: "1px solid rgba(0,0,0,0.08)",
    color: "black",
    flex: "0 0 auto",
  },

  bannerRight: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },

  bannerChip: {
    display: "inline-block",
    padding: "6px 10px",
    borderRadius: 999,
    fontWeight: 950,
    fontSize: 12,
    background: "rgba(255,255,255,0.35)",
    border: "1px solid rgba(0,0,0,0.08)",
    color: "black",
  },

  metaRow: {
    marginTop: 12,
    display: "flex",
    gap: 12,
    alignItems: "stretch",
    flexWrap: "wrap",
  },

  captajnBox: {
    padding: "10px 12px",
    borderRadius: 18,
    background:
      "linear-gradient(135deg, color-mix(in oklab, Canvas, CanvasText 6%) 0%, color-mix(in oklab, Canvas, HotPink 16%) 100%)",
    border: "1px solid color-mix(in oklab, CanvasText, transparent 78%)",
    minWidth: 190,
    flex: "0 0 auto",
  },

  captajnLabel: { fontSize: 12, fontWeight: 1000 as any, opacity: 0.9 },
  captajnName: { marginTop: 4, fontWeight: 1000 as any, fontSize: 14 },

  quickFacts: {
    flex: "1 1 220px",
    padding: "10px 12px",
    borderRadius: 18,
    background: "color-mix(in oklab, Canvas, HotPink 12%)",
    border: "1px solid color-mix(in oklab, HotPink, transparent 55%)",
    display: "grid",
    gap: 6,
  },

  fact: { fontSize: 12, opacity: 0.92 },

  storyBox: {
    marginTop: 12,
    padding: "10px 12px",
    borderRadius: 18,
    background:
      "linear-gradient(135deg, color-mix(in oklab, Canvas, HotPink 20%) 0%, color-mix(in oklab, Canvas, DeepPink 14%) 100%)",
    border: "1px solid color-mix(in oklab, HotPink, transparent 48%)",
  },

  storyTitle: {
    fontWeight: 1000 as any,
    fontSize: 13,
    marginBottom: 6,
  },

  storyText: {
    fontWeight: 850,
    opacity: 0.92,
    lineHeight: 1.3,
    fontSize: 13,
  },

  playersTitle: {
    marginTop: 12,
    fontWeight: 1000 as any,
    display: "flex",
    alignItems: "baseline",
    gap: 8,
    fontSize: 14,
  },

  playersCount: { opacity: 0.75, fontSize: 12, fontWeight: 900 },

  // ⭐ Auto-fit: 1 kolonne på smal mobil, 2+ på større skærme – uden media queries
  playerGrid: {
    listStyle: "none",
    padding: 0,
    margin: "10px 0 0 0",
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
    gap: 8,
  },

  playerChip: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 10px",
    borderRadius: 16,
    background:
      "linear-gradient(135deg, color-mix(in oklab, Canvas, HotPink 18%) 0%, color-mix(in oklab, Canvas, DeepPink 12%) 100%)",
    border: "1px solid color-mix(in oklab, HotPink, transparent 50%)",
    fontWeight: 950,
  },

  playerIcon: {
    width: 26,
    textAlign: "center",
    filter:
      "drop-shadow(0 10px 10px color-mix(in oklab, HotPink, transparent 75%))",
  },

  playerName: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  bold: { fontWeight: 1000 as any },

  shine: {
    position: "absolute",
    inset: -40,
    background:
      "radial-gradient(600px 180px at 20% 0%, rgba(255,255,255,0.18) 0%, transparent 60%)",
    pointerEvents: "none",
  },

  footer: { maxWidth: 1100, margin: "14px auto 0 auto" },

  footerBox: {
    padding: "12px 14px",
    borderRadius: 18,
    background: "color-mix(in oklab, Canvas, HotPink 16%)",
    border: "1px solid color-mix(in oklab, HotPink, transparent 55%)",
    fontWeight: 900,
    lineHeight: 1.3,
  },
};

