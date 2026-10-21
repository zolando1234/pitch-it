/*
  Náklady na AI pre administrátora: z denníka volaní (Claude tokeny, prepis reči v sekundách)
  súčty za obdobia, cena jedného pitchu a rozpis podľa účelu. Čisté funkcie, testované.
*/

export type AiUsageRow = {
  created_at: string;
  kind: "llm" | "stt";
  purpose: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  seconds: number;
  cost_usd: number;
};

export type AiCostLine = { key: string; calls: number; inputTokens: number; outputTokens: number; seconds: number; costUsd: number };

export type AiCostSummary = {
  total: { calls: number; inputTokens: number; outputTokens: number; seconds: number; costUsd: number };
  today: number;
  last7: number;
  last30: number;
  /** priemerná cena jedného vyhodnoteného pitchu za 30 dní (null = žiadny pitch) */
  perPitch30: number | null;
  /** posledných 14 dní (najstarší prvý) v USD */
  daily: Array<{ date: string; costUsd: number }>;
  /** Claude a ElevenLabs osobitne: dnes, 7 a 30 dní, spolu a tokeny/sekundy spolu */
  providers: { claude: ProviderCost; elevenlabs: ProviderCost };
  byPurpose: AiCostLine[];
  byModel: AiCostLine[];
};

export type ProviderCost = { today: number; last7: number; last30: number; total: number; calls: number; inputTokens: number; outputTokens: number; seconds: number };

const DAY = 86_400_000;
const round = (n: number, digits = 4) => Math.round(n * 10 ** digits) / 10 ** digits;

function lines(rows: AiUsageRow[], keyOf: (r: AiUsageRow) => string): AiCostLine[] {
  const map = new Map<string, AiCostLine>();
  for (const r of rows) {
    const key = keyOf(r);
    const line = map.get(key) ?? { key, calls: 0, inputTokens: 0, outputTokens: 0, seconds: 0, costUsd: 0 };
    line.calls += 1;
    line.inputTokens += r.input_tokens;
    line.outputTokens += r.output_tokens;
    line.seconds += r.seconds;
    line.costUsd += r.cost_usd;
    map.set(key, line);
  }
  return [...map.values()].map((l) => ({ ...l, costUsd: round(l.costUsd) })).sort((a, b) => b.costUsd - a.costUsd);
}

function providerCost(rows: AiUsageRow[], now: Date): ProviderCost {
  const t = now.getTime();
  const todayKey = now.toISOString().slice(0, 10);
  const sum = (list: AiUsageRow[]) => round(list.reduce((s, r) => s + r.cost_usd, 0));
  const within = (days: number) => rows.filter((r) => t - Date.parse(r.created_at) <= days * DAY);
  return {
    today: sum(rows.filter((r) => r.created_at.slice(0, 10) === todayKey)),
    last7: sum(within(7)),
    last30: sum(within(30)),
    total: sum(rows),
    calls: rows.length,
    inputTokens: rows.reduce((s, r) => s + r.input_tokens, 0),
    outputTokens: rows.reduce((s, r) => s + r.output_tokens, 0),
    seconds: rows.reduce((s, r) => s + r.seconds, 0),
  };
}

export function summarizeAiUsage(rows: AiUsageRow[], pitchesLast30: number, now = new Date()): AiCostSummary {
  const t = now.getTime();
  const sum = (list: AiUsageRow[]) => list.reduce((s, r) => s + r.cost_usd, 0);
  const within = (days: number) => rows.filter((r) => t - Date.parse(r.created_at) <= days * DAY);
  const last30 = sum(within(30));
  const todayKey = now.toISOString().slice(0, 10);
  const daily: AiCostSummary["daily"] = [];
  for (let i = 13; i >= 0; i--) {
    const date = new Date(t - i * DAY).toISOString().slice(0, 10);
    daily.push({ date, costUsd: round(sum(rows.filter((r) => r.created_at.slice(0, 10) === date))) });
  }
  return {
    total: {
      calls: rows.length,
      inputTokens: rows.reduce((s, r) => s + r.input_tokens, 0),
      outputTokens: rows.reduce((s, r) => s + r.output_tokens, 0),
      seconds: rows.reduce((s, r) => s + r.seconds, 0),
      costUsd: round(sum(rows)),
    },
    today: round(sum(rows.filter((r) => r.created_at.slice(0, 10) === todayKey))),
    last7: round(sum(within(7))),
    last30: round(last30),
    perPitch30: pitchesLast30 > 0 ? round(last30 / pitchesLast30) : null,
    daily,
    providers: { claude: providerCost(rows.filter((r) => r.kind === "llm"), now), elevenlabs: providerCost(rows.filter((r) => r.kind === "stt"), now) },
    byPurpose: lines(rows, (r) => (r.kind === "stt" ? "stt" : r.purpose)),
    byModel: lines(rows, (r) => r.model),
  };
}
