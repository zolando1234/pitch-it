import type {
  Currency,
  EndReason,
  ExerciseCategory,
  ExerciseKind,
  FactCategory,
  FactSource,
  FactStatus,
  IssueKind,
  SessionStatus,
  Stage,
  TrainingMode,
} from "@/lib/domain/labels";

/*
  Typy riadkov podľa db/migrations. Udržiavané ručne, kým nie je k dispozícii
  `db gen types` nad reálnym projektom (pozri README → Tech debt).
*/

export type ProfileRow = {
  id: string;
  display_name: string | null;
  locale: "sk" | "en";
  onboarding_completed_at: string | null;
  /** Odpovede z úvodného kvízu, tvar `OnboardingAnswers` (src/lib/onboarding/plan.ts). */
  onboarding_answers: Record<string, unknown> | null;
  account_type: "participant" | "organizer";
  pitch_notes: string | null;
  created_at: string;
};

export type UserSettingsRow = {
  user_id: string;
  default_mode: TrainingMode;
  coach_focus: string[];
  data_retention_days: 30 | 90 | 365 | null;
};

export type ProjectRow = {
  id: string;
  owner_id: string;
  name: string;
  one_liner: string | null;
  industry: string | null;
  problem: string | null;
  solution: string | null;
  target_segment: string | null;
  business_model: string | null;
  competition: string | null;
  differentiation: string | null;
  traction: string | null;
  financials: string | null;
  team: string | null;
  stage: Stage;
  raise_amount: number | string | null;
  raise_currency: Currency;
  use_of_funds: string | null;
  meeting_goal: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type DocumentRow = {
  id: string;
  project_id: string;
  uploaded_by: string;
  storage_path: string;
  file_name: string;
  file_type: "pdf" | "pptx";
  size_bytes: number;
  sha256: string;
  status: "uploaded" | "extracting" | "analyzing" | "ready" | "failed";
  slide_count: number | null;
  error_code: string | null;
  analysis_summary: string | null;
  analysis_model: string | null;
  analyzed_at: string | null;
  created_at: string;
};

export type ExtractionRow = {
  id: string;
  document_id: string;
  project_id: string;
  slide_number: number;
  title: string | null;
  body: string;
  notes: string | null;
  method: "pdf_text" | "pptx_xml";
};

export type FactRow = {
  id: string;
  project_id: string;
  category: FactCategory;
  label: string;
  value_text: string;
  value_number: number | string | null;
  unit: string | null;
  period: string | null;
  source_type: FactSource;
  status: FactStatus;
  confidence: "low" | "medium" | "high" | null;
  document_id: string | null;
  slide_number: number | null;
  source_quote: string | null;
  note: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type IssueRow = {
  id: string;
  project_id: string;
  kind: IssueKind;
  category: FactCategory | null;
  description: string;
  document_id: string | null;
  slide_number: number | null;
  status: "open" | "resolved" | "dismissed";
  resolved_at: string | null;
  created_at: string;
};

export type SessionRow = {
  id: string;
  user_id: string;
  project_id: string;
  mode: TrainingMode;
  investor_key: string;
  scenario_key: string;
  exercise_id: string | null;
  previous_session_id: string | null;
  language: "sk" | "en";
  transport: "realtime" | "text";
  status: SessionStatus;
  camera_enabled: boolean;
  coach_focus: string[];
  target_duration_seconds: number;
  realtime_provider: string | null;
  realtime_model: string | null;
  config_snapshot: Record<string, unknown>;
  provider_usage: Record<string, unknown>;
  connection_count: number;
  started_at: string | null;
  last_heartbeat_at: string | null;
  ended_at: string | null;
  billed_seconds: number;
  end_reason: EndReason | null;
  created_at: string;
};

export type TurnRow = {
  id: string;
  session_id: string;
  seq: number;
  speaker: "investor" | "founder";
  text: string;
  started_ms: number | null;
  ended_ms: number | null;
  interrupted: boolean;
  source: "realtime" | "text";
  provider_item_id: string | null;
  created_at: string;
};

export type AudioMetricsRow = {
  session_id: string;
  turn_seq: number;
  speech_ms: number;
  word_count: number;
  words_per_minute: number | string | null;
  response_latency_ms: number | null;
  pause_count: number;
  pause_total_ms: number;
  longest_pause_ms: number;
  filler_count: number;
  fillers: Record<string, number>;
  volume_variability: number | string | null;
  pitch_variability_semitones: number | string | null;
  pitch_reliable: boolean;
  transcript_confidence: number | string | null;
};

export type VisualAnalyticsRow = {
  session_id: string;
  frames_analyzed: number;
  sample_rate_hz: number | string | null;
  face_visible_ratio: number | string | null;
  face_centered_ratio: number | string | null;
  facing_camera_ratio: number | string | null;
  gaze_toward_camera_ratio: number | string | null;
  head_movement_index: number | string | null;
  upper_body_visible_ratio: number | string | null;
  posture_stability_index: number | string | null;
  hands_visible_ratio: number | string | null;
  gesture_activity_index: number | string | null;
  framing_issues: string[];
  per_turn: unknown;
};

export type ReportStatus = "pending" | "generating" | "ready" | "failed" | "insufficient_data" | "not_configured";

export type ReportRow = {
  session_id: string;
  user_id: string;
  status: ReportStatus;
  measured: Record<string, unknown>;
  assessment: unknown;
  model: string | null;
  prompt_version: string | null;
  error_code: string | null;
  attempts: number;
  created_at: string;
  completed_at: string | null;
};

export type ExerciseRow = {
  id: string;
  user_id: string;
  project_id: string | null;
  source_session_id: string | null;
  category: ExerciseCategory;
  kind: ExerciseKind;
  title: string;
  prompt: string;
  rationale: string | null;
  original_excerpt: string | null;
  success_criteria: string[];
  time_limit_seconds: number | null;
  origin: "report" | "library";
  status: "open" | "completed" | "dismissed";
  completed_at: string | null;
  created_at: string;
};

export type ExerciseAttemptRow = {
  id: string;
  exercise_id: string;
  answer_text: string;
  input_method: "voice" | "text";
  duration_ms: number | null;
  word_count: number | null;
  words_per_minute: number | string | null;
  filler_count: number | null;
  evaluation: unknown;
  evaluation_status: "pending" | "ready" | "failed" | "not_configured";
  model: string | null;
  created_at: string;
};

export type SubscriptionRow = {
  user_id: string;
  plan: "free" | "pro";
  status: "active" | "trialing" | "past_due" | "canceled" | "incomplete";
  provider: "stripe" | null;
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};

/** Postgres numeric prichádza z PostgREST ako string alebo číslo. */
export function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export type PitchEventRow = {
  id: string;
  organizer_id: string;
  name: string;
  code: string;
  created_at: string;
};

export type PitchAttemptRow = {
  id: string;
  user_id: string;
  audience: "investor" | "jury" | "customer" | "team";
  target_seconds: 30 | 60 | 180;
  focus: "tempo" | "fillery" | "obsah";
  with_camera: boolean;
  duration_ms: number | null;
  status: "analyzing" | "ready" | "failed";
  transcript: string | null;
  /** Tvar `PitchMetrics` (src/lib/pitch/metrics.ts). */
  metrics: Record<string, unknown> | null;
  /** Tvar `ContentScore` (src/lib/pitch/content.ts). */
  content: Record<string, unknown> | null;
  content_score: number | null;
  /** Tvar `BodySummary` (src/lib/pitch/body.ts). */
  body: Record<string, unknown> | null;
  /** Tvar `OutlineResult` (src/lib/pitch/outline.ts): téma, osnova a zhoda s pitchom. */
  outline: Record<string, unknown> | null;
  model: string | null;
  event_id: string | null;
  share_name: string | null;
  share_team: string | null;
  share_email: string | null;
  shared_at: string | null;
  created_at: string;
};
