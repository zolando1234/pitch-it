import { CONFIG } from "./config";
import type { Highlight, Metrics } from "./metrics";

export type Severity = "bad" | "warn";
export type GroupId = "setup" | "gestures" | "head" | "stage" | "posture";

export type Rule = {
  id: string;
  group: GroupId;
  severity: Severity;
  /** short headline for the feedback bubble */
  title: string;
  /** what to do instead */
  tip: string;
  /** how long the condition must hold before we speak up (ms) */
  activateMs: number;
  /**
   * Weight in the final score (default 1). Below 1 = minor advice that does not
   * count against mistake-free time; above 1 = hurts more than a typical warning.
   */
  scoreWeight?: number;
  test: (m: Metrics) => boolean;
};

export type Group = {
  id: GroupId;
  title: string;
  /** How great speakers do it (TED style) */
  principles: string[];
};

export const GROUPS: Group[] = [
  {
    id: "gestures",
    title: "Gestá a ruky",
    principles: [
      "Drž ruky v power zóne, medzi pásom a hrudníkom. Gestá odtiaľ pôsobia sebaisto.",
      "Dlane otvorené k publiku, lakte od tela. Otvorenosť buduje dôveru.",
      "Gestá ilustrujú obsah: ukáž veľkosť, smer, počet alebo kontrast („na jednej strane… na druhej…“).",
      "Gesto podrž, kým nedokončíš myšlienku. Potom ruky pokojne vráť do zóny.",
      "Široké gestá použi na dôraz, nad hlavu choď len vo vrchole príbehu.",
      "Používaj obe ruky a gestá striedaj, nech nie sú stále rovnaké.",
      "Otvorená dlaň namiesto ukazováka alebo zovretej päste.",
      "Dlaň hore ponúka a pozýva, dlaň dole tlmí a prikazuje, hrana dlane „seká“ a zdôrazňuje rozhodnosť.",
      "Žiadne vulgárne ani posmešné gestá: prostredník, palec dole, „pištoľ“ z prstov. V chrbtom ruky je v Británii urážka.",
      "Pri vymenúvaní počítaj na prstoch („po prvé, po druhé“), publikum si tak zapamätá štruktúru.",
      "Gestikuluj často: najsledovanejšie TED prednášky majú okolo 25 gest za minútu, najmenej sledované zhruba polovicu.",
      "Žiadne vrecká, ruky vbok, prekrížené či zopnuté ruky ani dotýkanie sa tváre.",
    ],
  },
  {
    id: "head",
    title: "Hlava a pohľad",
    principles: [
      "Hlava rovno, oči na publiku. Nie do zeme, nie do poznámok, nie s bradou hore.",
      "Rozdeľ si publikum na ľavú, strednú a pravú časť a striedaj ich.",
      "Pri jednej časti zostaň 3 až 5 sekúnd: jedna myšlienka, jeden človek.",
      "Hlavu drž pokojne: žiadne neustále prikyvovanie ani behajúce oči.",
    ],
  },
  {
    id: "stage",
    title: "Pohyb po pódiu",
    principles: [
      "Hýb sa s cieľom: pri prechode na novú myšlienku urob pár krokov a zastav.",
      "Kľúčové body hovor v stoji, nie za chôdze.",
      "Využi ľavú stranu, stred aj pravú stranu pódia.",
      "Žiadne chodenie sem a tam ani prešľapovanie z nohy na nohu.",
    ],
  },
  {
    id: "posture",
    title: "Postoj",
    principles: [
      "Stoj vzpriamene, váhu rovnomerne na oboch nohách, ramená uvoľnené.",
      "Nohy na šírku bokov, nekrížiť ich a nestáť s chodidlami tesne pri sebe.",
      "Natoč sa k publiku. Kam smeruje hrudník, tam smeruje tvoja pozornosť.",
    ],
  },
];

// Order = priority. When several rules fire at once, the higher one is shown.
export const RULES: Rule[] = [
  // ── Framing ───────────────────────────────────────────────
  {
    id: "too-close",
    group: "setup",
    severity: "warn",
    title: "Si príliš blízko",
    tip: "Odstúp, aby kamera videla celý trup aj ruky.",
    activateMs: 800,
    test: (m) => m.shoulderRatio > CONFIG.tooCloseShoulderRatio,
  },
  {
    id: "too-far",
    group: "setup",
    severity: "warn",
    title: "Si príliš ďaleko",
    tip: "Podíď bližšie ku kamere.",
    activateMs: 800,
    test: (m) => m.shoulderRatio < CONFIG.tooFarShoulderRatio,
  },
  {
    id: "edge",
    group: "stage",
    severity: "warn",
    title: "Si na okraji",
    tip: "Vráť sa bližšie k stredu. Z okraja ťa publikum takmer nevidí.",
    activateMs: 1500,
    test: (m) => m.nearEdge,
  },

  // ── Major mistakes ───────────────────────────────────────
  {
    id: "vulgar",
    group: "gestures",
    severity: "bad",
    title: "Vulgárne gesto",
    tip: "Vztýčený prostredník je urážka. Na pódium nepatrí ani zo žartu: publikum si zapamätá gesto, nie myšlienku.",
    activateMs: 300,
    scoreWeight: 3,
    test: (m) => m.vulgar,
  },
  {
    id: "back-turned",
    group: "posture",
    severity: "bad",
    title: "Stojíš chrbtom k publiku",
    tip: "Publikum nevidí tvoju tvár ani gestá. Otoč sa čelom. Na plátno pozri len na chvíľu a hneď sa otoč späť.",
    activateMs: 1200,
    test: (m) => m.facing === "back" && !m.walking,
  },
  {
    id: "mic-away",
    group: "gestures",
    severity: "warn",
    title: "Mikrofón ďaleko od úst",
    tip: "Drž mikrofón pri brade, dva-tri prsty od úst, inak ťa publikum prestane počuť.",
    activateMs: 1500,
    test: (m) => m.micAway,
  },
  {
    id: "hands-hidden",
    group: "gestures",
    severity: "bad",
    title: "Ruky vo vreckách alebo za chrbtom",
    tip: "Skryté ruky pôsobia uzavreto a neisto. Vytiahni ich a ukáž dlane, budujú dôveru.",
    activateMs: 1500,
    test: (m) => m.hidden.left && m.hidden.right,
  },
  {
    id: "one-hidden",
    group: "gestures",
    severity: "warn",
    title: "Jedna ruka vo vrecku",
    tip: "Ruka vo vrecku pôsobí ledabolo, až nezaujato. Vytiahni ju a gestikuluj ňou.",
    activateMs: 3000,
    test: (m) => m.hidden.left !== m.hidden.right,
  },
  {
    id: "hands-on-hips",
    group: "gestures",
    severity: "warn",
    title: "Ruky vbok",
    tip: "Ruky vbok pôsobia arogantne alebo obranne. Spusti ich a gestikuluj v power zóne.",
    activateMs: 2000,
    test: (m) => m.handsOnHips,
  },
  {
    id: "crossed",
    group: "gestures",
    severity: "bad",
    title: "Prekrížené ruky",
    tip: "Prekrížené ruky stavajú bariéru medzi tebou a publikom. Uvoľni ich a otvor sa.",
    activateMs: 1200,
    test: (m) => m.crossed,
  },
  {
    id: "face-touch",
    group: "gestures",
    severity: "bad",
    title: "Dotýkaš sa tváre",
    tip: "Dotýkanie sa tváre, vlasov či krku prezrádza nervozitu. Vráť ruky do power zóny.",
    activateMs: 700,
    test: (m) => m.faceTouch,
  },
  {
    id: "frozen",
    group: "gestures",
    severity: "bad",
    title: "Stojíš ako socha",
    tip: "Nech hovoria aj ruky: ukáž veľkosť, smer, počet. Gesto má ilustrovať, čo hovoríš.",
    activateMs: 2500,
    // a specific pose (hands on hips, clasped…) takes precedence over the generic "statue"
    test: (m) =>
      m.visibleWrists > 0 &&
      m.activity3s < CONFIG.frozenSpeed &&
      !m.walking &&
      !m.handsOnHips &&
      !m.figLeaf &&
      !m.clasped &&
      !m.crossed,
  },
  {
    id: "fig-leaf",
    group: "gestures",
    severity: "warn",
    title: "Figový list",
    tip: "Ruky zopnuté nízko pred telom sú obranná póza. Zdvihni ich do power zóny a otvor sa.",
    activateMs: 2000,
    test: (m) => m.figLeaf,
  },
  {
    id: "finger-gun",
    group: "gestures",
    severity: "warn",
    title: "Pištoľ z prstov",
    tip: "Mieriť prstami na ľudí pôsobí ledabolo až agresívne. Na publikum ukáž otvorenou dlaňou.",
    activateMs: 600,
    test: (m) => m.fingerGun,
  },
  {
    id: "thumb-down",
    group: "gestures",
    severity: "warn",
    title: "Palec dole",
    tip: "Palec dole pôsobí negatívne až posmešne. Nesúhlas povedz slovami a gestikuluj otvorenou dlaňou.",
    activateMs: 700,
    test: (m) => m.thumbDown,
  },
  {
    id: "v-backhand",
    group: "gestures",
    severity: "warn",
    title: "V chrbtom ruky k publiku",
    tip: "Vo Veľkej Británii, Írsku či Austrálii je V s chrbtom ruky urážka. Ak ukazuješ „dva“, otoč dlaň k publiku.",
    activateMs: 600,
    test: (m) => m.vBackhand,
  },
  {
    id: "pointing",
    group: "gestures",
    severity: "warn",
    title: "Ukazuješ prstom",
    tip: "Ukazovák pôsobí obviňujúco. Gestikuluj radšej otvorenou dlaňou: pozvanie, nie výčitka.",
    activateMs: 800,
    test: (m) => m.pointing,
  },
  {
    id: "fists",
    group: "gestures",
    severity: "warn",
    title: "Zovreté päste",
    tip: "Päste prezrádzajú napätie. Uvoľni prsty a gestikuluj otvorenými dlaňami.",
    activateMs: 2000,
    test: (m) => m.fists,
  },
  {
    id: "wringing",
    group: "gestures",
    severity: "warn",
    title: "Žmolíš si ruky",
    tip: "Hranie sa s prstami a šúchanie rúk prezrádza nervozitu. Rozdeľ ich a urob zámerné gesto.",
    activateMs: 1200,
    test: (m) => m.wringing,
  },
  {
    id: "palms-away",
    group: "gestures",
    severity: "warn",
    title: "Ukáž dlane",
    tip: "Publikum vidí len chrbty tvojich rúk. Otoč dlane k nemu, otvorené dlane budujú dôveru.",
    activateMs: 1000,
    test: (m) => m.palmsAway,
  },
  {
    id: "palms-down",
    group: "gestures",
    severity: "warn",
    title: "Dlane dole",
    scoreWeight: 0.5,
    tip: "Dlane otočené dole pôsobia ako príkaz alebo tlmenie. Keď niečo ponúkaš alebo pozývaš, otoč dlane hore alebo k publiku.",
    activateMs: 3000,
    test: (m) => m.palmsDown,
  },
  {
    id: "few-gestures",
    group: "gestures",
    severity: "warn",
    title: "Málo gest",
    tip: "Najsledovanejšie TED prednášky majú okolo 25 gest za minútu. Ilustruj rukami viac z toho, čo hovoríš.",
    activateMs: 0,
    test: (m) => m.gesturesPerMin !== null && m.gesturesPerMin < CONFIG.fewGesturesPerMin,
  },
  {
    id: "pacing",
    group: "stage",
    severity: "bad",
    title: "Chodíš sem a tam",
    tip: "Ako tiger v klietke. Prejdi na nové miesto, zastav a pointu povedz v stoji.",
    activateMs: 0,
    test: (m) => m.pacing,
  },

  // ── Gestures ───────────────────────────────────────────────
  {
    id: "hands-low",
    group: "gestures",
    severity: "warn",
    title: "Ruky visia dole",
    tip: "Zdvihni ruky do power zóny, medzi pás a hrudník. Gestá tam pôsobia sebaisto.",
    activateMs: 2000,
    test: (m) => m.handsLow && !m.walking && !m.figLeaf,
  },
  {
    id: "fidget",
    group: "gestures",
    severity: "warn",
    title: "Nepokojné ruky",
    tip: "Drobné trhavé pohyby rúk prezrádzajú nervozitu. Urob jedno pokojné, zámerné gesto a nechaj ho doznieť.",
    activateMs: 1000,
    test: (m) => m.fidget,
  },
  {
    id: "clasped",
    group: "gestures",
    severity: "warn",
    title: "Zopnuté ruky",
    tip: "Ruky zopnuté pred sebou ťa uzatvárajú. Rozdeľ ich a nechaj ich hovoriť.",
    activateMs: 2500,
    test: (m) => m.clasped,
  },
  {
    id: "closed",
    group: "gestures",
    severity: "warn",
    title: "Uzavreté gestá",
    tip: "Ruky máš príliš blízko seba. Rozšír gestá na šírku ramien a dlane otoč k publiku.",
    activateMs: 3000,
    test: (m) => m.spread !== null && m.spread < CONFIG.closedSpread && m.wristsInZone > 0,
  },
  {
    id: "t-rex",
    group: "gestures",
    severity: "warn",
    title: "Lakte prilepené k telu",
    tip: "Gestá len predlaktím pôsobia stiesnene. Uvoľni lakte a gestikuluj celou rukou.",
    activateMs: 4000,
    test: (m) => m.tRex,
  },
  {
    id: "over-gesture",
    group: "gestures",
    severity: "warn",
    title: "Priveľa pohybu",
    tip: "Menej je viac. Gestami zdôrazni kľúčové myšlienky a medzi nimi nechaj ruky odpočívať v power zóne.",
    activateMs: 2000,
    test: (m) => m.activity5s > CONFIG.overGestureSpeed * (m.micSide ? CONFIG.overGestureOneHandFactor : 1),
  },
  {
    id: "no-hold",
    group: "gestures",
    severity: "warn",
    title: "Podrž gesto",
    tip: "Ruky sa nikdy nezastavia. Keď povieš pointu, nechaj gesto na sekundu stáť.",
    activateMs: 1000,
    test: (m) => m.noHold,
  },
  {
    id: "repetitive",
    group: "gestures",
    severity: "warn",
    title: "Stále to isté gesto",
    tip: "Opakuješ stále jeden pohyb. Striedaj gestá: ukáž veľkosť, smer, počet alebo kontrast.",
    activateMs: 1500,
    test: (m) => m.repetitive,
  },
  {
    id: "one-hand",
    group: "gestures",
    severity: "warn",
    title: "Gestikuluješ jednou rukou",
    tip: "Druhá ruka len visí. Použi aj ju, napríklad keď porovnávaš dve veci.",
    activateMs: 8000,
    test: (m) => m.oneHand,
  },
  {
    id: "hands-high",
    group: "gestures",
    severity: "warn",
    title: "Ruky nad hlavou",
    tip: "Gestá nad hlavou si nechaj na veľký dôraz. Väčšinu času drž ruky medzi pásom a hrudníkom.",
    activateMs: 2500,
    test: (m) => m.handsHigh,
  },

  // ── Head and gaze ──────────────────────────────────────
  {
    id: "head-down",
    group: "head",
    severity: "warn",
    title: "Pozeráš do zeme",
    tip: "Zdvihni bradu a hľadaj očný kontakt s publikom.",
    activateMs: 2000,
    scoreWeight: 1.5,
    test: (m) => m.headDown,
  },
  {
    id: "gaze-darting",
    group: "head",
    severity: "warn",
    title: "Behajúci pohľad",
    tip: "Neskáč očami po miestnosti. Pri jednom človeku zostaň 3 až 5 sekúnd.",
    activateMs: 500,
    test: (m) => m.gazeDarting,
  },
  {
    id: "gaze-stuck",
    group: "head",
    severity: "warn",
    title: "Pozeráš stále na jedno miesto",
    tip: "Publikum sedí aj vľavo a vpravo. Striedaj ľavú stranu, stred a pravú stranu.",
    activateMs: 0,
    test: (m) => m.gazeStuck,
  },
  {
    id: "nodding",
    group: "head",
    severity: "warn",
    title: "Neustále prikyvovanie",
    tip: "Pokojná hlava pôsobí sebaisto. Prikývni, len keď s niečím súhlasíš.",
    activateMs: 1000,
    test: (m) => m.nodding,
  },

  // ── Posture ──────────────────────────────────────────────
  {
    id: "turned",
    group: "posture",
    severity: "warn",
    title: "Stojíš bokom",
    tip: "Natoč ramená k publiku. Telo smeruje tam, kam smeruje tvoja pozornosť.",
    activateMs: 2500,
    test: (m) => m.turned && !m.walking,
  },
  {
    id: "tilt",
    group: "posture",
    severity: "warn",
    title: "Nakláňaš sa",
    tip: "Rozlož váhu rovnomerne na obe nohy a vyrovnaj ramená.",
    activateMs: 3000,
    test: (m) => m.shoulderTilt > CONFIG.shoulderTiltDeg,
  },

  {
    id: "legs-crossed",
    group: "posture",
    severity: "bad",
    title: "Prekrížené nohy",
    tip: "Prekrížené nohy pôsobia neisto a hrozí, že stratíš rovnováhu. Postav sa na obe nohy na šírku bokov.",
    activateMs: 1200,
    test: (m) => m.legsCrossed,
  },
  {
    id: "narrow-stance",
    group: "posture",
    severity: "warn",
    title: "Nohy tesne pri sebe",
    scoreWeight: 0.6,
    tip: "Chodidlá úplne pri sebe pôsobia stiesnene a ľahko sa začneš knísať. Rozkroč sa na šírku bokov.",
    activateMs: 4000,
    test: (m) => m.narrowStance,
  },

  // ── Stage ──────────────────────────────────────────────
  {
    id: "sway",
    group: "stage",
    severity: "warn",
    title: "Prešľapuješ",
    tip: "Prešľapovanie z nohy na nohu rozptyľuje. Postav sa pevne a keď sa chceš pohnúť, urob zámerný krok.",
    activateMs: 1500,
    test: (m) => m.sway,
  },
  {
    id: "rooted",
    group: "stage",
    severity: "warn",
    title: "Využi priestor",
    scoreWeight: 0.4,
    tip: "Pri prechode na novú myšlienku urob pár krokov. Pohyb oddeľuje časti tvojho prejavu.",
    activateMs: 0,
    test: (m) => m.hipsVisible && m.msSinceStep > CONFIG.rootedMs,
  },
];

export const RULE_BY_ID = Object.fromEntries(RULES.map((r) => [r.id, r]));

export const HIGHLIGHTS: Record<Highlight, { title: string; tip: string; label: string }> = {
  wide: {
    label: "Široké gestá",
    title: "Široké gesto!",
    tip: "Široko otvorené ruky pôsobia sebaisto a priateľsky.",
  },
  hold: {
    label: "Podržané gestá",
    title: "Podržané gesto",
    tip: "Gesto, ktoré chvíľu podržíš, podčiarkne myšlienku. Presne tak.",
  },
  planted: {
    label: "Krok a zastavenie",
    title: "Skvelý presun",
    tip: "Presun a zastavenie, presne ako na TED pódiu. Teraz povedz pointu v stoji.",
  },
  palms: {
    label: "Otvorené dlane",
    title: "Otvorené dlane",
    tip: "Dlane k publiku hovoria: nemám čo skrývať. Výborne.",
  },
  count: {
    label: "Počítanie na prstoch",
    title: "Počítanie na prstoch",
    tip: "„Po prvé, po druhé…“ na prstoch pomáha publiku zapamätať si štruktúru.",
  },
  sweep: {
    label: "Pohľad na celé publikum",
    title: "Oslovil si celú miestnosť",
    tip: "Pohľad doľava aj doprava dá každému pocit, že hovoríš práve jemu.",
  },
};

export const PRAISE = [
  { title: "Skvelé!", tip: "Otvorené gestá v power zóne. Takto vyzerá sebaistota." },
  { title: "Pekne plynie", tip: "Gestá podporujú to, čo hovoríš. Pokračuj." },
  { title: "Presne tak", tip: "Pokojný, zámerný pohyb. Publikum je s tebou." },
];
