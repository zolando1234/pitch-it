import type { FeedbackState, Status } from "./feedback";
import type { Highlight, Metrics, Side } from "./metrics";
import { RULE_BY_ID } from "./rules";

export type Sample = { t: number; status: Status; score: number };

/** Jedna zaznamenaná chyba: kedy začala, kedy skončila a fotka z toho momentu. */
export type Mistake = { id: string; start: number; end: number; snapshot: string | null };
type Share = Record<Side, number>;

export type SessionSummary = {
  durationMs: number;
  /** čas, keď bol rečník v zábere (z neho sa počítajú podiely chýb) */
  personMs: number;
  avgScore: number;
  statusShare: Record<"good" | "warn" | "bad", number>;
  /** podiel času bez chyby (drobné rady ako "Use the stage" sa nepočítajú ako chyba) */
  cleanShare: number;
  zoneShare: number;
  gesturesPerMin: number | null;
  stageShare: Share;
  gazeShare: Share;
  highlights: Partial<Record<Highlight, number>>;
  issues: { id: string; ms: number; count: number }[];
  mistakes: Mistake[];
  timeline: Sample[];
};

/** chyba, ktorá sa vráti do 2 s, sa zlúči s predchádzajúcou */
const MERGE_MS = 2000;
/** fotky zaberajú pamäť, ukladáme najviac toľkoto */
const MAX_SNAPSHOTS = 60;

const SAMPLE_MS = 250;
const emptyShare = (): Share => ({ left: 0, center: 0, right: 0 });

/** Zbiera priebeh tréningu pre záverečný súhrn. */
export class SessionRecorder {
  private start = 0;
  private lastSample = 0;
  private lastT = 0;
  private samples: Sample[] = [];
  private statusMs = { good: 0, warn: 0, bad: 0 };
  private zoneMs = 0;
  private rateSum = 0;
  private rateN = 0;
  private trackedMs = 0;
  private personMs = 0;
  private cleanMs = 0;
  private stageMs = emptyShare();
  private gazeMs = emptyShare();
  private highlights: Partial<Record<Highlight, number>> = {};
  private issueMs = new Map<string, number>();
  private issueCount = new Map<string, number>();
  private prevActive = new Set<string>();
  private mistakes: Mistake[] = [];
  private openMistakes = new Map<string, Mistake>();
  private snapshots = 0;

  begin(t: number) {
    this.start = this.lastSample = this.lastT = t;
  }

  private pausedAt = 0;

  /** Pauza: čas pauzy sa nezapočíta, aby časy chýb sedeli s pozastaveným videom. */
  pause(t: number) {
    this.pausedAt = t;
  }

  resume(t: number) {
    if (!this.pausedAt) return;
    const gap = t - this.pausedAt;
    this.start += gap;
    this.lastSample += gap;
    this.lastT = t;
    this.pausedAt = 0;
  }

  record(t: number, fb: FeedbackState, m: Metrics | null, snapshot?: () => string | null) {
    const dt = Math.min(t - this.lastT, 250);
    this.lastT = t;

    if (fb.status !== "idle") {
      this.statusMs[fb.status] += dt;
      this.trackedMs += dt;
      if (fb.activeIds.every((id) => (RULE_BY_ID[id]?.scoreWeight ?? 1) < 1)) this.cleanMs += dt;
    }
    if (m) {
      this.personMs += dt;
      if (m.visibleWrists > 0) this.zoneMs += (dt * m.wristsInZone) / m.visibleWrists;
      this.stageMs[m.stage] += dt;
      if (m.gesturesPerMin !== null) {
        this.rateSum += m.gesturesPerMin * dt;
        this.rateN += dt;
      }
      this.gazeMs[m.gaze] += dt;
    }
    if (fb.highlight) this.highlights[fb.highlight] = (this.highlights[fb.highlight] ?? 0) + 1;

    const active = new Set(fb.activeIds);
    const rel = t - this.start;
    for (const id of active) {
      this.issueMs.set(id, (this.issueMs.get(id) ?? 0) + dt);
      if (!this.prevActive.has(id)) {
        this.issueCount.set(id, (this.issueCount.get(id) ?? 0) + 1);
        // hláška sa ukáže až po activateMs, ale chyba trvala už odvtedy: ten čas tiež započítame
        // pri trendoch sa okno nepočíta: chybou je až to, čo trvá po prekročení tolerancie
        const lead = RULE_BY_ID[id]?.window ? 0 : Math.min(RULE_BY_ID[id]?.activateMs ?? 0, rel);
        this.issueMs.set(id, (this.issueMs.get(id) ?? 0) + lead);
        this.openMistake(id, rel, lead, snapshot);
      }
      const open = this.openMistakes.get(id);
      if (open) open.end = rel;
    }
    for (const id of this.prevActive) if (!active.has(id)) this.openMistakes.delete(id);
    this.prevActive = active;

    if (t - this.lastSample >= SAMPLE_MS) {
      this.samples.push({ t: t - this.start, status: fb.status, score: fb.score });
      this.lastSample = t;
    }
  }

  private openMistake(id: string, rel: number, lead: number, snapshot?: () => string | null) {
    // chyby pri nastavovaní kamery (príliš blízko / ďaleko) do záznamu nepatria
    if (RULE_BY_ID[id]?.group === "setup") return;
    const last = [...this.mistakes].reverse().find((x) => x.id === id);
    if (last && rel - lead - last.end < MERGE_MS) {
      this.openMistakes.set(id, last);
      return;
    }
    let shot: string | null = null;
    if (snapshot && this.snapshots < MAX_SNAPSHOTS) {
      try {
        shot = snapshot();
        if (shot) this.snapshots++;
      } catch {
        shot = null;
      }
    }
    const mk: Mistake = { id, start: rel - lead, end: rel, snapshot: shot };
    this.mistakes.push(mk);
    this.openMistakes.set(id, mk);
  }

  summary(): SessionSummary {
    const total = this.trackedMs || 1;
    const scored = this.samples.filter((s) => s.status !== "idle");
    const norm = (s: Share): Share => ({ left: s.left / total, center: s.center / total, right: s.right / total });
    return {
      durationMs: this.lastT - this.start,
      personMs: this.personMs,
      avgScore: scored.length
        ? Math.round(scored.reduce((a, s) => a + s.score, 0) / scored.length)
        : 0,
      statusShare: {
        good: this.statusMs.good / total,
        warn: this.statusMs.warn / total,
        bad: this.statusMs.bad / total,
      },
      cleanShare: this.cleanMs / total,
      zoneShare: this.zoneMs / total,
      gesturesPerMin: this.rateN ? Math.round(this.rateSum / this.rateN) : null,
      stageShare: norm(this.stageMs),
      gazeShare: norm(this.gazeMs),
      highlights: this.highlights,
      issues: [...this.issueMs.entries()]
        .map(([id, ms]) => ({ id, ms, count: this.issueCount.get(id) ?? 0 }))
        .sort((a, b) => b.ms - a.ms),
      mistakes: [...this.mistakes].sort((a, b) => a.start - b.start),
      timeline: this.samples,
    };
  }
}
