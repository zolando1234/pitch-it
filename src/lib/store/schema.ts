/*
  Popis tabuliek pre úložisko v Redise: primárne a unikátne kľúče, predvolené hodnoty,
  väzby (mazanie kaskádou) a pravidlá prístupu pre klienta používateľa (náhrada RLS).
  Zodpovedá pôvodným migráciám v db/migrations (história v gite).
*/

export type Row = Record<string, unknown>;

export type Ref = { column: string; table: string; onDelete: "cascade" | "set null" };

export type AccessContext = {
  uid: string;
  /** Rola používateľa v projekte: owner, editor, viewer alebo null. */
  projectRole(projectId: unknown): Promise<string | null>;
  /** Organizátor akcie? */
  ownsEvent(eventId: unknown): Promise<boolean>;
  /** Je relácia používateľa práve živá? */
  liveSession(sessionId: unknown): Promise<boolean>;
};

type Check = (row: Row, ctx: AccessContext) => boolean | Promise<boolean>;

export type TableSpec = {
  pk: string[];
  unique?: string[][];
  /** Stĺpce s indexom pre rýchle vyhľadanie podľa rovnosti. */
  index?: string[];
  defaults?: () => Row;
  updatedAt?: boolean;
  refs?: Ref[];
  /** Pravidlá pre klienta používateľa. Chýbajúce pravidlo = zakázané. */
  read?: Check;
  insert?: Check;
  update?: Check;
  remove?: Check;
};

const uuid = () => ({ id: crypto.randomUUID() });
const own = (column: string): Check => (row, ctx) => row[column] === ctx.uid;
const canRead: Check = async (row, ctx) => (await ctx.projectRole(row.project_id)) !== null;
const canEdit: Check = async (row, ctx) => ["owner", "editor"].includes((await ctx.projectRole(row.project_id)) ?? "");
const user = (column = "user_id"): Ref => ({ column, table: "auth_users", onDelete: "cascade" });

export const TABLES: Record<string, TableSpec> = {
  auth_users: {
    pk: ["id"],
    unique: [["email"]],
    defaults: () => ({ ...uuid(), meta: {} }),
  },
  early_access_signups: {
    pk: ["id"],
    unique: [["email"]],
    index: ["ip_hash"],
    defaults: () => ({ ...uuid(), consent_at: new Date().toISOString() }),
  },
  profiles: {
    pk: ["id"],
    defaults: () => ({ locale: "sk", account_type: "participant", display_name: null, onboarding_completed_at: null, onboarding_answers: null, pitch_notes: null }),
    updatedAt: true,
    refs: [user("id")],
    read: own("id"),
    update: own("id"),
  },
  pitch_wallets: {
    pk: ["user_id"],
    defaults: () => ({ free_used: 0, credits: 0 }),
    updatedAt: true,
    refs: [user()],
    read: own("user_id"),
  },
  user_settings: {
    pk: ["user_id"],
    defaults: () => ({ default_mode: "coach", coach_focus: ["pace", "answer_length"], data_retention_days: null }),
    updatedAt: true,
    refs: [user()],
    read: own("user_id"),
    update: own("user_id"),
  },
  consents: {
    pk: ["id"],
    index: ["user_id"],
    defaults: uuid,
    refs: [user()],
    read: own("user_id"),
    insert: own("user_id"),
  },
  projects: {
    pk: ["id"],
    index: ["owner_id"],
    defaults: () => ({ ...uuid(), stage: "pre_seed", raise_currency: "EUR", archived_at: null }),
    updatedAt: true,
    refs: [user("owner_id")],
    read: async (row, ctx) => row.owner_id === ctx.uid || (await ctx.projectRole(row.id)) !== null,
    insert: own("owner_id"),
    update: async (row, ctx) => ["owner", "editor"].includes((await ctx.projectRole(row.id)) ?? ""),
    remove: own("owner_id"),
  },
  project_members: {
    pk: ["project_id", "user_id"],
    index: ["project_id", "user_id"],
    refs: [{ column: "project_id", table: "projects", onDelete: "cascade" }, user()],
    read: canRead,
    insert: async (row, ctx) => (await ctx.projectRole(row.project_id)) === "owner" && row.user_id !== ctx.uid,
    update: async (row, ctx) => (await ctx.projectRole(row.project_id)) === "owner" && row.user_id !== ctx.uid,
    remove: async (row, ctx) => (await ctx.projectRole(row.project_id)) === "owner",
  },
  documents: {
    pk: ["id"],
    unique: [["storage_path"], ["project_id", "sha256"]],
    index: ["project_id", "uploaded_by"],
    defaults: () => ({ ...uuid(), status: "uploaded", slide_count: null, error_code: null, analysis_summary: null, analysis_model: null, analyzed_at: null }),
    updatedAt: true,
    refs: [{ column: "project_id", table: "projects", onDelete: "cascade" }, user("uploaded_by")],
    read: canRead,
    insert: async (row, ctx) => (await canEdit(row, ctx)) && row.uploaded_by === ctx.uid && row.status === "uploaded",
    remove: canEdit,
  },
  document_extractions: {
    pk: ["id"],
    unique: [["document_id", "slide_number"]],
    index: ["document_id", "project_id"],
    defaults: () => ({ ...uuid(), body: "", title: null, notes: null }),
    refs: [
      { column: "document_id", table: "documents", onDelete: "cascade" },
      { column: "project_id", table: "projects", onDelete: "cascade" },
    ],
    read: canRead,
  },
  startup_facts: {
    pk: ["id"],
    index: ["project_id", "document_id"],
    defaults: uuid,
    updatedAt: true,
    refs: [
      { column: "project_id", table: "projects", onDelete: "cascade" },
      { column: "document_id", table: "documents", onDelete: "set null" },
    ],
    read: canRead,
    insert: canEdit,
    update: canEdit,
    remove: canEdit,
  },
  project_issues: {
    pk: ["id"],
    index: ["project_id", "document_id"],
    defaults: () => ({ ...uuid(), status: "open", resolved_at: null }),
    refs: [
      { column: "project_id", table: "projects", onDelete: "cascade" },
      { column: "document_id", table: "documents", onDelete: "cascade" },
    ],
    read: canRead,
    insert: canEdit,
    update: canEdit,
    remove: canEdit,
  },
  exercises: {
    pk: ["id"],
    index: ["user_id", "project_id", "source_session_id"],
    defaults: () => ({ ...uuid(), success_criteria: [], status: "open", completed_at: null }),
    updatedAt: true,
    refs: [user(), { column: "project_id", table: "projects", onDelete: "cascade" }],
    read: own("user_id"),
    update: own("user_id"),
    remove: own("user_id"),
  },
  training_sessions: {
    pk: ["id"],
    index: ["user_id", "project_id", "exercise_id"],
    defaults: () => ({
      ...uuid(),
      language: "sk",
      transport: "realtime",
      status: "ready",
      camera_enabled: false,
      coach_focus: [],
      config_snapshot: {},
      provider_usage: {},
      connection_count: 0,
      billed_seconds: 0,
      started_at: null,
      last_heartbeat_at: null,
      ended_at: null,
      end_reason: null,
      exercise_id: null,
      previous_session_id: null,
    }),
    updatedAt: true,
    refs: [
      user(),
      { column: "project_id", table: "projects", onDelete: "cascade" },
      { column: "exercise_id", table: "exercises", onDelete: "set null" },
      { column: "previous_session_id", table: "training_sessions", onDelete: "set null" },
    ],
    read: own("user_id"),
    remove: (row, ctx) => row.user_id === ctx.uid && row.status !== "live",
  },
  conversation_turns: {
    pk: ["id"],
    unique: [["session_id", "seq"]],
    index: ["session_id", "user_id"],
    defaults: () => ({ ...uuid(), interrupted: false }),
    refs: [{ column: "session_id", table: "training_sessions", onDelete: "cascade" }, user()],
    read: own("user_id"),
    insert: async (row, ctx) => row.user_id === ctx.uid && (await ctx.liveSession(row.session_id)),
  },
  audio_delivery_metrics: {
    pk: ["id"],
    unique: [["session_id", "turn_seq"]],
    index: ["session_id", "user_id"],
    defaults: () => ({ ...uuid(), pause_count: 0, pause_total_ms: 0, longest_pause_ms: 0, filler_count: 0, fillers: {}, pitch_reliable: false }),
    refs: [{ column: "session_id", table: "training_sessions", onDelete: "cascade" }, user()],
    read: own("user_id"),
  },
  visual_analytics: {
    pk: ["session_id"],
    index: ["user_id"],
    defaults: () => ({ framing_issues: [], per_turn: [] }),
    refs: [{ column: "session_id", table: "training_sessions", onDelete: "cascade" }, user()],
    read: own("user_id"),
  },
  feedback_reports: {
    pk: ["session_id"],
    index: ["user_id"],
    defaults: () => ({ status: "pending", measured: {}, attempts: 0, assessment: null, model: null, prompt_version: null, error_code: null, completed_at: null }),
    updatedAt: true,
    refs: [{ column: "session_id", table: "training_sessions", onDelete: "cascade" }, user()],
    read: own("user_id"),
  },
  exercise_attempts: {
    pk: ["id"],
    index: ["exercise_id", "user_id"],
    defaults: () => ({ ...uuid(), evaluation_status: "pending", evaluation: null, model: null }),
    refs: [{ column: "exercise_id", table: "exercises", onDelete: "cascade" }, user()],
    read: own("user_id"),
    remove: own("user_id"),
  },
  subscriptions: {
    pk: ["user_id"],
    unique: [["provider_customer_id"], ["provider_subscription_id"]],
    defaults: () => ({
      plan: "free",
      status: "active",
      cancel_at_period_end: false,
      provider: null,
      provider_customer_id: null,
      provider_subscription_id: null,
      current_period_end: null,
    }),
    updatedAt: true,
    refs: [user()],
    read: own("user_id"),
  },
  usage_events: {
    pk: ["id"],
    index: ["user_id", "session_id"],
    defaults: uuid,
    refs: [user(), { column: "session_id", table: "training_sessions", onDelete: "set null" }],
    read: own("user_id"),
  },
  product_events: {
    pk: ["id"],
    index: ["user_id", "name"],
    defaults: () => ({ ...uuid(), properties: {} }),
    refs: [{ column: "user_id", table: "auth_users", onDelete: "set null" }],
  },
  pitch_events: {
    pk: ["id"],
    unique: [["code"]],
    index: ["organizer_id"],
    defaults: uuid,
    refs: [user("organizer_id")],
    read: own("organizer_id"),
  },
  pitch_attempts: {
    pk: ["id"],
    index: ["user_id", "event_id"],
    defaults: () => ({
      ...uuid(),
      focus: "tempo",
      with_camera: false,
      status: "analyzing",
      duration_ms: null,
      transcript: null,
      metrics: null,
      content: null,
      content_score: null,
      body: null,
      outline: null,
      language: "sk",
      stt_model: null,
      model: null,
      event_id: null,
      share_name: null,
      share_team: null,
      share_email: null,
      shared_at: null,
    }),
    refs: [user(), { column: "event_id", table: "pitch_events", onDelete: "set null" }],
    read: async (row, ctx) => row.user_id === ctx.uid || (row.shared_at !== null && (await ctx.ownsEvent(row.event_id))),
    remove: own("user_id"),
  },
};

/**
 * Vnorené tabuľky v `select("*, projects(name)")`: ako nájsť riadok väzby.
 * `local` je stĺpec v aktuálnom riadku, `remote` stĺpec vo vnorenej tabuľke.
 */
export const RELATIONS: Record<string, { local: string; remote: string }> = {
  projects: { local: "project_id", remote: "id" },
  documents: { local: "document_id", remote: "id" },
  feedback_reports: { local: "id", remote: "session_id" },
  training_sessions: { local: "session_id", remote: "id" },
};
