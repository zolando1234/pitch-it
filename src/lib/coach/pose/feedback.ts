import type { Highlight, Metrics } from "./metrics";
import type { Locale } from "@/lib/i18n/locale";
import { highlightCopy, IDLE_COPY, praiseCopy, ruleCopy } from "./copy";
import { PRAISE, RULES, RULE_BY_ID, type Rule } from "./rules";

export type Status = "good" | "warn" | "bad" | "idle";

export type FeedbackState = {
  status: Status;
  title: string;
  tip: string;
  ruleId: string | null;
  activeIds: string[];
  score: number;
  /** dobrý moment, ktorý práve nastal (po debounce), pre štatistiky */
  highlight: Highlight | null;
};

const DEACTIVATE_MS = 700;
const MIN_DISPLAY_MS = 2500;
const PRAISE_ROTATE_MS = 6000;
const SCORE_TAU_MS = 4000;
const HIGHLIGHT_COOLDOWN_MS = 6000;
const HIGHLIGHT_SHOW_MS = 3500;
const HIGHLIGHT_BONUS = 6;
/** vyriešený trend sa znova ozve najskôr po tomto čase, nech tréner neotravuje stále tou istou radou */
const TREND_COOLDOWN_MS = 30000;
/** upozornenie (žlté) svieti v kuse najviac takto dlho, potom sa na chvíľu stiahne (do skóre sa ráta ďalej) */
const MAX_NAG_MS = 7000;
const NAG_SNOOZE_MS = 30000;

type RuleTrack = {
  since: number | null;
  clearSince: number | null;
  active: boolean;
  /** trendy: kedy pravidlo platilo (úseky snímok) za posledné okno */
  hist?: { t: number; dt: number; on: boolean }[];
  onMs?: number;
  cooldownUntil?: number;
};

/**
 * Premieňa surové pravidlá na stabilný feedback: pravidlo sa aktivuje až keď
 * platí dostatočne dlho, a zobrazená hláška sa nemení skôr ako po MIN_DISPLAY_MS
 * (okrem prípadu, keď príde závažnejší problém).
 */
export class FeedbackEngine {
  private tracks = new Map<string, RuleTrack>();
  private shownId: string | null = null;
  private shownAt = 0;
  /** kedy sa ktoré upozornenie môže znova ukázať po stiahnutí */
  private snoozedUntil = new Map<string, number>();
  private praiseIdx = 0;
  private praiseAt = 0;
  private score = 70;
  private lastT = 0;
  private highlightAt = new Map<Highlight, number>();
  private shownHighlight: { id: Highlight; t: number } | null = null;
  private ruleFilter: ((id: string) => boolean) | null = null;
  private locale: Locale = "sk";

  /** Jazyk rád nad hlavou. */
  setLocale(locale: Locale) {
    this.locale = locale;
  }

  /** Obmedzí, ktoré pravidlá sa ozývajú (napr. pri cvičení len tie k téme). */
  setRuleFilter(filter: ((id: string) => boolean) | null) {
    this.ruleFilter = filter;
    this.tracks.clear();
  }

  reset() {
    this.tracks.clear();
    this.snoozedUntil.clear();
    this.highlightAt.clear();
    this.shownHighlight = null;
    this.shownId = null;
    this.score = 70;
    this.lastT = 0;
  }

  idle(): FeedbackState {
    return {
      status: "idle",
      ...IDLE_COPY[this.locale],
      ruleId: null,
      activeIds: [],
      score: Math.round(this.score),
      highlight: null,
    };
  }

  update(m: Metrics, t: number): FeedbackState {
    const frameDt = this.lastT ? Math.min(t - this.lastT, 200) : 0;
    for (const rule of RULES) {
      const tr = this.tracks.get(rule.id) ?? { since: null, clearSince: null, active: false };
      if (this.ruleFilter && !this.ruleFilter(rule.id)) {
        this.tracks.set(rule.id, { since: null, clearSince: null, active: false });
        continue;
      }
      const on = rule.test(m);
      // trend: podiel času, keď pravidlo platilo, za posledné okno
      let trendOk = true;
      if (rule.window) {
        tr.hist ??= [];
        tr.onMs ??= 0;
        tr.hist.push({ t, dt: frameDt, on });
        if (on) tr.onMs += frameDt;
        while (tr.hist.length && t - tr.hist[0].t > rule.window.ms) {
          const old = tr.hist.shift()!;
          if (old.on) tr.onMs -= old.dt;
        }
        trendOk = tr.onMs >= rule.window.share * rule.window.ms && t >= (tr.cooldownUntil ?? 0);
      }
      if (on && trendOk) {
        tr.clearSince = null;
        tr.since ??= t;
        if (!tr.active && t - tr.since >= rule.activateMs) tr.active = true;
      } else {
        if (!on) tr.since = null;
        if (tr.active) {
          tr.clearSince ??= t;
          if (t - tr.clearSince >= DEACTIVATE_MS) {
            tr.active = false;
            if (rule.window) tr.cooldownUntil = t + TREND_COOLDOWN_MS;
          }
        }
      }
      this.tracks.set(rule.id, tr);
    }

    const active = RULES.filter((r) => this.tracks.get(r.id)?.active);
    const top = this.pick(active, t);

    // Skóre: okamžitá hodnota vyhladená exponenciálne
    const dt = frameDt;
    this.lastT = t;
    const bad = active.filter((r) => r.severity === "bad").length;
    const warn = active.length - bad;
    const instant = Math.max(0, 100 - bad * 45 - warn * 18);
    this.score += (instant - this.score) * (1 - Math.exp(-dt / SCORE_TAU_MS));

    // dobré momenty: každý typ najviac raz za HIGHLIGHT_COOLDOWN_MS
    let highlight: Highlight | null = null;
    for (const h of m.highlights) {
      if (t - (this.highlightAt.get(h) ?? -Infinity) < HIGHLIGHT_COOLDOWN_MS) continue;
      this.highlightAt.set(h, t);
      highlight = h;
      this.shownHighlight = { id: h, t };
      this.score = Math.min(100, this.score + HIGHLIGHT_BONUS);
      break;
    }

    if (!top) {
      const sh = this.shownHighlight;
      if (sh && t - sh.t < HIGHLIGHT_SHOW_MS) {
        const { title, tip } = highlightCopy(sh.id, this.locale);
        return { status: "good", title, tip, ruleId: `hl-${sh.id}`, activeIds: [], score: Math.round(this.score), highlight };
      }
      if (t - this.praiseAt > PRAISE_ROTATE_MS) {
        this.praiseIdx = (this.praiseIdx + 1) % PRAISE.length;
        this.praiseAt = t;
      }
      const p = praiseCopy(this.praiseIdx, this.locale);
      return { status: "good", title: p.title, tip: p.tip, ruleId: null, activeIds: [], score: Math.round(this.score), highlight };
    }

    return {
      status: top.severity,
      ...ruleCopy(top.id, this.locale),
      ruleId: top.id,
      activeIds: active.map((r) => r.id),
      score: Math.round(this.score),
      highlight,
    };
  }

  private pick(activeAll: Rule[], t: number): Rule | null {
    // žlté upozornenie, ktoré už dlho svieti, sa stiahne, nech tréner neopakuje stále to isté
    const shownRule = this.shownId ? RULE_BY_ID[this.shownId] : null;
    if (shownRule?.severity === "warn" && t - this.shownAt > MAX_NAG_MS) {
      this.snoozedUntil.set(shownRule.id, t + NAG_SNOOZE_MS);
    }
    const active = activeAll.filter((r) => r.severity === "bad" || t >= (this.snoozedUntil.get(r.id) ?? 0));
    if (!active.length) {
      this.shownId = null;
      return null;
    }
    const best = active.find((r) => r.severity === "bad") ?? active[0];
    const shown = this.shownId ? RULE_BY_ID[this.shownId] : null;
    const shownStillActive = shown && active.includes(shown);
    const escalate = shown && shown.severity === "warn" && best.severity === "bad";
    if (shownStillActive && !escalate && t - this.shownAt < MIN_DISPLAY_MS) return shown;
    if (best.id !== this.shownId) {
      this.shownId = best.id;
      this.shownAt = t;
    }
    return best;
  }
}
