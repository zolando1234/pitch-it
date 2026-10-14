"use client";

import { Resampler, SAMPLE_RATE, Segmenter, segmentAll, type AudioSegment } from "@/lib/pitch/segmenter";

/*
  Zvuk prejavu v prehliadači: z mikrofónu (alebo zvuku videa) po blokoch do Segmentera,
  ktorý vydáva ~30-sekundové úseky WAV na priebežný prepis. Z nahratého súboru sa zvuk
  dekóduje celý naraz.
*/

const WORKLET = `
class PitchCapture extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Float32Array(4096); this.n = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      for (let i = 0; i < ch.length; i++) {
        this.buf[this.n++] = ch[i];
        if (this.n === this.buf.length) { this.port.postMessage(this.buf.slice(0)); this.n = 0; }
      }
    }
    return true;
  }
}
registerProcessor("pitch-capture", PitchCapture);
`;

export type SpeechCapture = {
  pause(): void;
  resume(): void;
  /** Beží zvukový kanál? (bez kliknutia ho prehliadač môže nechať uspaný) */
  running(): boolean;
  /** Prebudí zvukový kanál; volať priamo z kliknutia. */
  wake(): Promise<void>;
  /** Ukončí zachytávanie; vráti dĺžku zvuku (ms) a vydá posledný úsek. */
  stop(): Promise<number>;
};

/*
  Jeden zvukový kanál (AudioContext) pre celú reláciu. Prehliadač (hlavne Safari) ho povolí
  spustiť len z kliknutia: `primeAudio()` sa volá pri kliknutí na štart a nahrávanie prejavu
  aj odpovedí v Q&A potom používa ten istý, už bežiaci kanál.
*/
let shared: AudioContext | null = null;
const withWorklet = new WeakSet<AudioContext>();

export function sharedContext(): AudioContext {
  if (!shared || shared.state === "closed") shared = new AudioContext();
  return shared;
}

/** Odomkne zvuk; volať priamo v obsluhe kliknutia. */
export function primeAudio(): void {
  try {
    void sharedContext().resume().catch(() => {});
  } catch {
    // bez Web Audio sa nahrávanie aj tak nespustí, rozhodne o tom startCapture
  }
}

/** Zachytáva zvuk zo streamu a každý hotový úsek pošle do `onSegment`; `onLevel` dostáva hlasitosť 0–1. */
export async function startCapture(
  stream: MediaStream,
  onSegment: (segment: AudioSegment) => void,
  onLevel?: (level: number) => void,
): Promise<SpeechCapture> {
  const ctx = sharedContext();
  const source = ctx.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
  const resampler = new Resampler(ctx.sampleRate);
  const segmenter = new Segmenter();
  let paused = false;
  let stopped = false;
  const feed = (block: Float32Array) => {
    if (stopped) return;
    if (onLevel) {
      let sum = 0;
      for (let i = 0; i < block.length; i++) sum += block[i] * block[i];
      onLevel(Math.min(1, Math.sqrt(sum / Math.max(1, block.length)) * 4));
    }
    if (paused) return;
    for (const segment of segmenter.push(resampler.push(block))) onSegment(segment);
  };

  let node: AudioNode;
  try {
    if (!withWorklet.has(ctx)) {
      const url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
      await ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      withWorklet.add(ctx);
    }
    const worklet = new AudioWorkletNode(ctx, "pitch-capture");
    worklet.port.onmessage = (event: MessageEvent<Float32Array>) => feed(event.data);
    node = worklet;
  } catch {
    // starší prehliadač bez AudioWorklet
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = (event) => feed(new Float32Array(event.inputBuffer.getChannelData(0)));
    node = processor;
  }
  // výstup do tichého zisku: niektoré prehliadače inak uzol nespúšťajú
  const mute = ctx.createGain();
  mute.gain.value = 0;
  source.connect(node);
  node.connect(mute);
  mute.connect(ctx.destination);
  // bez kliknutia môže resume() visieť donekonečna: nečakáme naň dlhšie ako chvíľu
  await Promise.race([ctx.resume().catch(() => {}), new Promise((resolve) => setTimeout(resolve, 500))]);

  return {
    pause: () => {
      paused = true;
    },
    resume: () => {
      paused = false;
    },
    running: () => ctx.state === "running",
    wake: () => ctx.resume().catch(() => {}),
    stop: async () => {
      if (stopped) return segmenter.totalMs;
      // posledný blok z workletu ešte môže prísť
      await new Promise((resolve) => setTimeout(resolve, 150));
      stopped = true;
      source.disconnect();
      node.disconnect();
      mute.disconnect();
      const last = segmenter.finish();
      if (last) onSegment(last);
      return Math.round(segmenter.totalMs);
    },
  };
}

/** Zvuk nahratého videa: dekóduje sa celý, prevzorkuje na 16 kHz a rozdelí na úseky. */
export async function segmentsFromFile(file: File, maxSeconds: number): Promise<{ segments: AudioSegment[]; durationMs: number }> {
  const bytes = await file.arrayBuffer();
  const ctx = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(bytes);
  } finally {
    void ctx.close().catch(() => {});
  }
  const seconds = Math.min(decoded.duration, maxSeconds);
  const offline = new OfflineAudioContext(1, Math.ceil(seconds * SAMPLE_RATE), SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start(0, 0, seconds);
  const rendered = await offline.startRendering();
  const samples = rendered.getChannelData(0);
  return { segments: segmentAll(samples), durationMs: Math.round(seconds * 1000) };
}

/** Odošle úseky na priebežný prepis (najviac 2 naraz, chybu skúsi znova). */
export class SegmentUploader {
  private queue: AudioSegment[] = [];
  private active = 0;
  private sent = new Set<number>();
  private failed = new Map<number, AudioSegment>();
  private waiters: Array<() => void> = [];
  count = 0;

  constructor(
    readonly draftId: string,
    private readonly language: string,
    private readonly attemptId: string | null = null,
    /** skutočné stretnutie: rozlíšiť rečníkov */
    private readonly diarize = false,
  ) {}

  add(segment: AudioSegment) {
    this.count = Math.max(this.count, segment.index + 1);
    this.queue.push(segment);
    this.pump();
  }

  private pump() {
    while (this.active < 2 && this.queue.length) {
      const segment = this.queue.shift()!;
      this.active++;
      void this.upload(segment).finally(() => {
        this.active--;
        this.pump();
        if (!this.active && !this.queue.length) this.waiters.splice(0).forEach((resolve) => resolve());
      });
    }
  }

  private async upload(segment: AudioSegment) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const form = new FormData();
      form.set("audio", new Blob([segment.wav as BlobPart], { type: "audio/wav" }), `segment-${segment.index}.wav`);
      form.set("draftId", this.draftId);
      form.set("index", String(segment.index));
      form.set("offsetMs", String(segment.offsetMs));
      form.set("language", this.language);
      if (this.attemptId) form.set("attemptId", this.attemptId);
      if (this.diarize) form.set("diarize", "1");
      try {
        const response = await fetch("/api/pitch/segment", { method: "POST", body: form });
        if (response.ok) {
          this.sent.add(segment.index);
          this.failed.delete(segment.index);
          return;
        }
        // bez kreditu či neplatný úsek: ďalší pokus nepomôže
        if (response.status < 500 && response.status !== 429) break;
      } catch {
        // výpadok siete: skúsime znova
      }
      await new Promise((resolve) => setTimeout(resolve, 1200 * (attempt + 1)));
    }
    this.failed.set(segment.index, segment);
  }

  /** Počká na všetky odoslania; zlyhané skúsi ešte raz. Vráti, či prešli všetky úseky. */
  async finish(): Promise<boolean> {
    if (this.active || this.queue.length) await new Promise<void>((resolve) => this.waiters.push(resolve));
    if (this.failed.size) {
      const retry = [...this.failed.values()];
      this.failed.clear();
      retry.forEach((segment) => this.add(segment));
      if (this.active || this.queue.length) await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    return this.sent.size >= this.count && this.failed.size === 0;
  }
}
