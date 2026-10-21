// Všetky prahy na jednom mieste, aby sa dali ľahko doladiť.
// Vzdialenosti sú v jednotkách "šírka ramien" (sw), rýchlosti v sw/s,
// takže hodnotenie nezávisí od toho, ako ďaleko stojíš od kamery.

export const CONFIG = {

  minVisibility: 0.5,

  // Vzdialenosť od kamery (šírka ramien ako podiel šírky obrazu)
  tooCloseShoulderRatio: 0.42,
  tooFarShoulderRatio: 0.07,

  // ── Gestá ────────────────────────────────────────────────
  frozenSpeed: 0.18, // priemer za 3 s pod touto hodnotou = "socha"
  overGestureSpeed: 2.8, // priemer za 5 s nad touto hodnotou = príliš veľa
  // s mikrofónom gestikuluje len jedna ruka: priemer jednej ruky je prirodzene vyšší
  // (pri dvoch rukách sa priemeruje aj s tou pokojnejšou), preto je prah vyšší
  overGestureOneHandFactor: 1.8,

  // Power zóna: od mierne nad ramenami po pás
  zoneTopOffset: -0.25,
  zoneBottomOffset: 0.15,
  estimatedTorsoLength: 1.45, // keď boky nevidno
  zoneHalfWidth: 1.7,

  closedSpread: 0.55, // zápästia bližšie ako 0.55 sw = zatvorené gesto
  claspedSpread: 0.28, // zápästia takmer pri sebe = zopnuté ruky
  wideSpread: 1.5, // široké otvorené gesto (pochvala)
  faceTouchDistance: 0.55, // zápästie pri nose = dotýkanie sa tváre
  tRexElbowSpread: 0.95, // lakte bližšie ako 0.95 sw = prilepené k telu

  // Nervózne pohyby: veľa pohybu na malom priestore
  fidgetWindowMs: 1500,
  fidgetPath: 1.1,
  fidgetRange: 0.3,

  // Opakované gesto: dlhší pohyb stále v tom istom malom priestore
  repetitiveWindowMs: 8000,
  repetitivePath: 3.5,
  repetitiveRange: 0.55,

  // Podržanie gesta
  stillWristSpeed: 0.3,
  noHoldWindowMs: 8000,
  noHoldMinStillShare: 0.08,
  noHoldMinActivity: 1.0,
  holdMs: 800, // ako dlho musí gesto stáť, aby sme pochválili

  // Skryté ruky (vrecká / za chrbtom) a ruky v bok
  pocketHipDistance: 0.45,
  pocketElbowAngle: 155, // lakeť ohnutý viac ako toto = ruka nie je voľne spustená
  handsOnHipsElbowSpread: 1.6,
  pocketMinFrames: 15, // ~0.5 s pri 30 fps
  pocketFingerVisibility: 0.5, // prsty z modelu pózy menej viditeľné = ruka je zakrytá (vrecko)
  behindBackDepth: 0.1, // zápästie o 10 cm za bokmi = za chrbtom
  frontVisibility: 0.75,

  // Mikrofón v ruke
  micSwitchMargin: 0.4, // o koľko sw musí byť druhá ruka bližšie k ústam, aby sme ju prehodili
  micHoldDistance: 0.9, // ruka bližšie ako 0.9 sw k nosu = drží mikrofón
  micMaxDistance: 1.25, // zápästie s mikrofónom ďalej ako 1.25 sw od nosa = mikrofón ďaleko od úst

  // Dlane
  palmsWindowMs: 6000,
  palmsAwayShare: 0.15, // menej ako 15 % času dlaňou k publiku
  countHoldMs: 600,
  wringingGap: 0.5,
  wringingMotion: 1.5, // pohyb prstov v "veľkostiach ruky" za sekundu

  // Počet gest za minútu (TOP TED prejavy majú okolo 25 / min)
  gestureOnsetSpeed: 1.1,
  gestureCalmSpeed: 0.4,
  gestureRateMinMs: 45000, // tempo gest hodnotíme až z dlhšieho úseku, nie z prvých sekúnd
  fewGesturesPerMin: 8,
  idealGesturesPerMin: 20,

  // Jedna ruka
  oneHandActive: 0.5,
  oneHandIdle: 0.08,

  // ── Hlava a pohľad ───────────────────────────────────────
  headDownRatio: 0.22, // záložná kontrola: nos takmer na úrovni ramien
  calibrationMs: 3000, // prvé 3 s si zapamätáme neutrálnu polohu hlavy
  defaultPitch: 0.05,
  headDownDelta: 0.09, // nos o 0.09 sw nižšie oproti kalibrácii = pozeráš dole
  gazeSideYaw: 0.16, // |yaw| nad týmto = pohľad do strany
  gazeWindowMs: 20000,
  gazeStuckShare: 0.9, // jedna strana viac ako 90 % času = pozeráš stále na to isté miesto
  gazeDartingWindowMs: 5000,
  gazeDartingChanges: 6,
  sweepWindowMs: 8000,
  noddingWindowMs: 3000,
  noddingReversals: 6,
  noddingMinStep: 0.03,

  // ── Postoj ───────────────────────────────────────────────
  shoulderTiltDeg: 9,
  turnedRatio: 0.75, // |dz| / |dx| ramien vo svetových súradniciach
  backFaceVisibility: 0.35, // nos ani oči nevidno, ramená áno = chrbtom ku kamere
  backNoseDepth: 0.05, // nos 5 cm za rovinou ramien = hlava otočená od kamery
  /** členky (kolená) prekrížené aspoň o toľko šírok ramien = prekrížené nohy */
  legsCrossedMargin: 0.08,
  /** členky bližšie ako toľko šírok ramien = nohy pri sebe (nestabilný postoj) */
  narrowStance: 0.22,

  // ── Pohyb po pódiu ───────────────────────────────────────
  swayWindowMs: 4000,
  swayReversals: 4,
  swayRange: 0.12,
  stepDistance: 0.6, // posun tela o 0.6 sw = krok
  walkingSpeed: 0.6, // sw/s
  plantedSpeed: 0.2, // pod touto rýchlosťou stojíš
  plantedMs: 1000, // po kroku zastav aspoň na 1 s
  rootedMs: 40000,
  pacingWindowMs: 10000,
  pacingPath: 5, // za 10 s prejdeš viac ako 5 sw
  pacingMaxStillShare: 0.3, // a takmer vôbec nezastavíš
  pacingMinRange: 1.5, // a naozaj prejdeš kus pódia (aspoň 1,5 šírky ramien)
  pacingJitter: 0.02, // posun pod 0,02 sw za 100 ms je chvenie odhadu, nie krok
  edgeMargin: 0.12, // 12 % od okraja záberu
  // stred pódia = ±12 % šírky záberu od stredu; pri webkamere je už krok do strany mimo stredu
  stageCenterHalfWidth: 0.12,
} as const;
