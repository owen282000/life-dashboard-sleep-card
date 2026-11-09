// One night of sleep stages as a hypnogram, for Home Assistant dashboards.
// A single ES module with no dependencies and no build step. The pure data
// functions are exported so test/data.test.mjs can run them under Node.

export const VERSION = "1.0.0";

const CARD_TAG = "life-dashboard-sleep-card";
const EDITOR_TAG = "life-dashboard-sleep-card-editor";

const MINUTE = 60000;
const QUARTER_HOUR = 15 * MINUTE;
const MAX_SEGMENT = 24 * 60 * MINUTE;
const ISO_LIKE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;

const STAGES = new Set([
  "awake",
  "light",
  "deep",
  "rem",
  "sleeping",
  "out_of_bed",
  "unknown",
]);
// The official Android companion app sends awake_in_bed as its own stage.
const STAGE_ALIASES = new Map([["awake_in_bed", "awake"]]);
const ASLEEP = ["rem", "light", "deep", "sleeping"];
const BREAKDOWN = ["rem", "light", "deep"];
const NEUTRAL = ["sleeping", "unknown"];

const LANE_HEIGHT = 28;
const BAR_HEIGHT = 14;
const AXIS_HEIGHT = 24;
const PLOT_INSET = 4;
const MIN_BAR_WIDTH = 2;
const CONNECT_GAP = MINUTE;

// Lane and hit-layer tuning: a pointer within this distance of a mark in its
// own lane selects that mark, so a one-minute blip is reachable on a phone.
const LANE_SNAP_PX = 14;

const STRINGS = {
  en: {
    awake: "Awake",
    rem: "REM",
    light: "Light",
    deep: "Deep",
    sleeping: "Asleep",
    out_of_bed: "Out of bed",
    unknown: "Other",
    asleep: "asleep",
    to: "to",
    stage: "Stage",
    start: "Start",
    end: "End",
    duration: "Duration",
    share: "Share",
    sleepStages: "Sleep stages",
    plotHint: "Use the left and right arrow keys to step through the stages",
    summaryLabel: "Sleep on {date}, {range}. {duration} asleep. {stages}",
    segmentOf: "{stage}, {range}, {duration}. Segment {n} of {total}",
    noDetail: "This source reports sleep without stages",
    pickTitle: "Choose a sleep sensor",
    pickBody: "Pick a sensor with sleep stages in the card settings.",
    missingTitle: "Sensor not found",
    missingBody: "{entity} does not exist. Check the entity in the card settings.",
    unavailableTitle: "Sleep data unavailable",
    unavailableBody: "{entity} is unavailable right now.",
    noStagesTitle: "No sleep stages yet",
    noStagesBody: "{entity} has not reported any sleep stages.",
    editorEntity: "Sleep sensor",
    editorTitle: "Title (optional)",
  },
  nl: {
    awake: "Wakker",
    rem: "REM",
    light: "Licht",
    deep: "Diep",
    sleeping: "Slaap",
    out_of_bed: "Uit bed",
    unknown: "Overig",
    asleep: "geslapen",
    to: "tot",
    stage: "Fase",
    start: "Begin",
    end: "Einde",
    duration: "Duur",
    share: "Aandeel",
    sleepStages: "Slaapfasen",
    plotHint: "Gebruik de pijltjestoetsen links en rechts om door de fasen te gaan",
    summaryLabel: "Slaap op {date}, {range}. {duration} geslapen. {stages}",
    segmentOf: "{stage}, {range}, {duration}. Fase {n} van {total}",
    noDetail: "Deze bron meet slaap zonder fasen",
    pickTitle: "Kies een slaapsensor",
    pickBody: "Kies in de kaartinstellingen een sensor met slaapfasen.",
    missingTitle: "Sensor niet gevonden",
    missingBody: "{entity} bestaat niet. Controleer de entiteit in de kaartinstellingen.",
    unavailableTitle: "Slaapgegevens niet beschikbaar",
    unavailableBody: "{entity} is nu niet beschikbaar.",
    noStagesTitle: "Nog geen slaapfasen",
    noStagesBody: "{entity} heeft nog geen slaapfasen doorgegeven.",
    editorEntity: "Slaapsensor",
    editorTitle: "Titel (optioneel)",
  },
  de: {
    awake: "Wach",
    rem: "REM",
    light: "Leicht",
    deep: "Tief",
    sleeping: "Schlaf",
    out_of_bed: "Nicht im Bett",
    unknown: "Sonstige",
    asleep: "geschlafen",
    to: "bis",
    stage: "Phase",
    start: "Beginn",
    end: "Ende",
    duration: "Dauer",
    share: "Anteil",
    sleepStages: "Schlafphasen",
    plotHint: "Mit den Pfeiltasten links und rechts durch die Phasen gehen",
    summaryLabel: "Schlaf am {date}, {range}. {duration} geschlafen. {stages}",
    segmentOf: "{stage}, {range}, {duration}. Abschnitt {n} von {total}",
    noDetail: "Diese Quelle misst Schlaf ohne Phasen",
    pickTitle: "Schlafsensor auswählen",
    pickBody: "Wähle in den Karteneinstellungen einen Sensor mit Schlafphasen.",
    missingTitle: "Sensor nicht gefunden",
    missingBody: "{entity} gibt es nicht. Prüfe die Entität in den Karteneinstellungen.",
    unavailableTitle: "Schlafdaten nicht verfügbar",
    unavailableBody: "{entity} ist gerade nicht verfügbar.",
    noStagesTitle: "Noch keine Schlafphasen",
    noStagesBody: "{entity} hat noch keine Schlafphasen gemeldet.",
    editorEntity: "Schlafsensor",
    editorTitle: "Titel (optional)",
  },
};

export function translate(language, key, values = {}) {
  const base = String(language || "en").split("-")[0].toLowerCase();
  const template = STRINGS[base]?.[key] ?? STRINGS.en[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ""));
}

function parseInstant(value) {
  if (typeof value !== "string" || !ISO_LIKE.test(value)) return NaN;
  return Date.parse(value.replace(" ", "T"));
}

function normalizeStage(value) {
  if (typeof value !== "string") return null;
  const raw = value.trim().toLowerCase();
  if (!raw) return null;
  const stage = STAGE_ALIASES.get(raw) ?? raw;
  return STAGES.has(stage) ? stage : "unknown";
}

/** Turns the raw `stages` attribute into sorted, non-overlapping segments. */
export function cleanSegments(raw) {
  if (!Array.isArray(raw)) return [];
  const parsed = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const stage = normalizeStage(entry.stage);
    const start = parseInstant(entry.start);
    const end = parseInstant(entry.end);
    if (!stage || !Number.isFinite(start) || !Number.isFinite(end)) continue;
    if (end <= start || end - start > MAX_SEGMENT) continue;
    parsed.push({ stage, start, end });
  }
  parsed.sort((a, b) => a.start - b.start || a.end - b.end);

  const segments = [];
  for (const item of parsed) {
    const previous = segments[segments.length - 1];
    const start = previous && item.start < previous.end ? previous.end : item.start;
    if (item.end <= start) continue;
    if (previous && previous.stage === item.stage && start === previous.end) {
      previous.end = item.end;
    } else {
      segments.push({ stage: item.stage, start, end: item.end });
    }
  }
  return segments;
}

/**
 * Reads either sensor shape into segments: Life Dashboard's `stages` list, or the
 * parallel `stageTypes`, `stageStartTimes` and `stageEndTimes` lists of the official
 * Android companion app (2026.11.1 or newer). That sensor's state is minutes, not
 * hours, so `stateInHours` tells the caller whether the state can be trusted as time
 * asleep. Lists of unequal length cannot be paired up, so they yield no segments.
 */
export function readNight(attributes) {
  const { stages, stageTypes, stageStartTimes, stageEndTimes } = attributes ?? {};
  if (Array.isArray(stages) && stages.length > 0) {
    return { segments: cleanSegments(stages), stateInHours: true };
  }
  if (!Array.isArray(stageTypes)) return { segments: [], stateInHours: true };
  if (
    !Array.isArray(stageStartTimes) ||
    !Array.isArray(stageEndTimes) ||
    stageTypes.length !== stageStartTimes.length ||
    stageTypes.length !== stageEndTimes.length
  ) {
    return { segments: [], stateInHours: false };
  }
  const entries = stageTypes.map((stage, index) => ({
    stage,
    start: stageStartTimes[index],
    end: stageEndTimes[index],
  }));
  return { segments: cleanSegments(entries), stateInHours: false };
}

/** The sensors that carry a night in either shape. */
export function stageEntities(hass) {
  return Object.values(hass?.states ?? {}).filter((state) => {
    const attributes = state?.attributes;
    return (
      state?.entity_id?.startsWith("sensor.") &&
      (Array.isArray(attributes?.stages) || Array.isArray(attributes?.stageTypes))
    );
  });
}

/** The lane a stage is drawn in: out of bed is time awake, sleeping and unknown share a neutral lane. */
export function laneOf(stage) {
  if (stage === "out_of_bed") return "awake";
  return NEUTRAL.includes(stage) ? "neutral" : stage;
}

/**
 * Lanes from top to bottom. A night with a breakdown has awake, REM, light and deep
 * and a neutral lane below them for what has no depth; anything else is awake and
 * neutral. The same rule as the chart the integration draws.
 */
export function chooseLanes(segments) {
  const stages = new Set(segments.map((segment) => segment.stage));
  if (BREAKDOWN.some((stage) => stages.has(stage))) {
    const lanes = ["awake", ...BREAKDOWN];
    return NEUTRAL.some((stage) => stages.has(stage)) ? [...lanes, "neutral"] : lanes;
  }
  return ["awake", "neutral"];
}

function laneLabel(language, lane, segments) {
  if (lane !== "neutral") return translate(language, lane);
  const onlySleeping =
    !segments.some((segment) => BREAKDOWN.includes(segment.stage)) &&
    segments.some((segment) => segment.stage === "sleeping");
  return translate(language, onlySleeping ? "sleeping" : "unknown");
}

/** Whole percentages that add up to exactly 100 (largest remainder). */
export function wholePercentages(values) {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!(total > 0)) return values.map(() => 0);
  const exact = values.map((value) => (value / total) * 100);
  const result = exact.map(Math.floor);
  let missing = 100 - result.reduce((sum, value) => sum + value, 0);
  const order = exact
    .map((value, index) => ({ index, rest: value - Math.floor(value) }))
    .sort((a, b) => b.rest - a.rest);
  for (const { index } of order) {
    if (missing <= 0) break;
    if (values[index] > 0) {
      result[index] += 1;
      missing -= 1;
    }
  }
  return result;
}

/** Per-lane minutes and shares of the tracked night, computed from the segments. */
export function summarize(segments) {
  const minutes = new Map();
  const byLane = new Map();
  for (const segment of segments) {
    const length = (segment.end - segment.start) / MINUTE;
    minutes.set(segment.stage, (minutes.get(segment.stage) ?? 0) + length);
    const lane = laneOf(segment.stage);
    byLane.set(lane, (byLane.get(lane) ?? 0) + length);
  }
  const lanes = chooseLanes(segments);
  const values = lanes.map((lane) => byLane.get(lane) ?? 0);
  const percents = wholePercentages(values);
  return {
    rows: lanes.map((stage, index) => ({
      stage,
      minutes: values[index],
      percent: percents[index],
    })),
    asleepMinutes: ASLEEP.reduce((sum, stage) => sum + (minutes.get(stage) ?? 0), 0),
    totalMinutes: values.reduce((sum, value) => sum + value, 0),
    start: segments.length ? segments[0].start : null,
    end: segments.length ? segments[segments.length - 1].end : null,
  };
}

/** Time asleep in minutes: the entity state in hours where that is what it means, or the sum of the sleep stages. */
export function asleepMinutes(state, summary, stateInHours = true) {
  if (!stateInHours) return summary.asleepMinutes;
  const hours = typeof state === "string" && state.trim() !== "" ? Number(state) : NaN;
  return Number.isFinite(hours) && hours >= 0 ? hours * 60 : summary.asleepMinutes;
}

const unitFormats = new Map();
function unitFormat(language, unit) {
  const key = `${language}|${unit}`;
  if (!unitFormats.has(key)) {
    unitFormats.set(
      key,
      new Intl.NumberFormat(language, { style: "unit", unit, unitDisplay: "narrow" }),
    );
  }
  return unitFormats.get(key);
}

/** "7h 32m" in the user's language; under a minute it shows seconds. */
export function formatDuration(minutes, language = "en") {
  if (!(minutes >= 0) || !Number.isFinite(minutes)) return "";
  if (minutes > 0 && minutes < 1) {
    return unitFormat(language, "second").format(Math.max(1, Math.round(minutes * 60)));
  }
  const total = Math.round(minutes);
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours && rest) {
    return `${unitFormat(language, "hour").format(hours)} ${unitFormat(language, "minute").format(rest)}`;
  }
  return hours
    ? unitFormat(language, "hour").format(hours)
    : unitFormat(language, "minute").format(rest);
}

const partFormats = new Map();
function minuteOfDay(instant, timeZone) {
  const key = timeZone ?? "";
  if (!partFormats.has(key)) {
    partFormats.set(
      key,
      new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "numeric",
        hourCycle: "h23",
        timeZone,
      }),
    );
  }
  const parts = partFormats.get(key).formatToParts(new Date(instant));
  const read = (type) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return read("hour") * 60 + read("minute");
}

const TICK_STEPS = [15, 30, 60, 120, 180, 240, 360, 720];

/**
 * Hour ticks in the display time zone, thinned to fit `widthPx`. Spans of three
 * hours or more never tick finer than an hour; a short nap can go to 15 minutes.
 */
export function makeTicks(startMs, endMs, { widthPx, labelPx = 40, timeZone } = {}) {
  if (!(endMs > startMs) || !(widthPx > 0)) return { stepMinutes: 0, ticks: [] };
  const span = (endMs - startMs) / MINUTE;
  const pxPerMinute = widthPx / span;
  const finest = span >= 180 ? 60 : 15;
  const stepMinutes =
    TICK_STEPS.find((step) => step >= finest && step * pxPerMinute >= labelPx + 10) ?? 720;
  const ticks = [];
  for (
    let instant = Math.ceil(startMs / QUARTER_HOUR) * QUARTER_HOUR;
    instant <= endMs;
    instant += QUARTER_HOUR
  ) {
    if (minuteOfDay(instant, timeZone) % stepMinutes === 0) ticks.push(instant);
  }
  return { stepMinutes, ticks };
}

/** Index of the segment a pointer at instant `t` selects, preferring its own lane. */
export function pickSegment(segments, t, lane = null, snapMs = 0) {
  let overall = -1;
  let overallDistance = Infinity;
  let inLane = -1;
  let inLaneDistance = Infinity;
  segments.forEach((segment, index) => {
    const distance = t < segment.start ? segment.start - t : t > segment.end ? t - segment.end : 0;
    if (distance < overallDistance) {
      overall = index;
      overallDistance = distance;
    }
    if (lane && laneOf(segment.stage) === lane && distance < inLaneDistance) {
      inLane = index;
      inLaneDistance = distance;
    }
  });
  return inLane !== -1 && inLaneDistance <= snapMs ? inLane : overall;
}

/** Resolves the Home Assistant locale into language, time zone and hour cycle. */
export function localeSettings(hass) {
  const locale = hass?.locale ?? {};
  const language = locale.language || hass?.language || "en";
  const timeZone = locale.time_zone === "server" ? hass?.config?.time_zone || undefined : undefined;
  let hour12;
  if (locale.time_format === "am_pm") hour12 = true;
  else if (locale.time_format === "24") hour12 = false;
  else {
    const source = locale.time_format === "system" ? undefined : language;
    hour12 = new Intl.DateTimeFormat(source, { hour: "numeric" }).resolvedOptions().hour12 === true;
  }
  return { language, timeZone, hour12 };
}

function timeFormatters({ language, timeZone, hour12 }) {
  const cycle = hour12 ? { hour12: true } : { hourCycle: "h23" };
  const clock = new Intl.DateTimeFormat(language, {
    hour: hour12 ? "numeric" : "2-digit",
    minute: "2-digit",
    timeZone,
    ...cycle,
  });
  const hourOnly = hour12
    ? new Intl.DateTimeFormat(language, { hour: "numeric", timeZone, ...cycle })
    : clock;
  return {
    time: (instant) => clock.format(new Date(instant)),
    tick: (instant, stepMinutes) =>
      (stepMinutes % 60 === 0 ? hourOnly : clock).format(new Date(instant)),
  };
}

// Isolated so a right-to-left page cannot reorder the two times around the word.
function timeRange(language, formats, start, end) {
  return `\u2066${formats.time(start)} ${translate(language, "to")} ${formats.time(end)}\u2069`;
}

function formatNight(night, fallbackInstant, { language, timeZone }) {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})/.exec(typeof night === "string" ? night : "");
  const options = { weekday: "short", day: "numeric", month: "short" };
  if (dateOnly) {
    const utc = Date.UTC(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
    if (Number.isFinite(utc)) {
      return new Intl.DateTimeFormat(language, { ...options, timeZone: "UTC" }).format(utc);
    }
  }
  return new Intl.DateTimeFormat(language, { ...options, timeZone }).format(fallbackInstant);
}

// DOM is only ever built through these two helpers: values reach the page as
// text nodes and attribute values, never as markup.
function el(tag, attributes = {}, ...children) {
  return applyTo(document.createElement(tag), attributes, children);
}

function svg(tag, attributes = {}, ...children) {
  return applyTo(document.createElementNS("http://www.w3.org/2000/svg", tag), attributes, children);
}

function applyTo(node, attributes, children) {
  for (const [name, value] of Object.entries(attributes)) {
    if (value !== undefined && value !== null) node.setAttribute(name, String(value));
  }
  for (const child of children) {
    if (child === null || child === undefined) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

const STYLE = `
  :host {
    --_awake: var(--life-dashboard-sleep-awake, #bd8316);
    --_rem: var(--life-dashboard-sleep-rem, #df566f);
    --_light: var(--life-dashboard-sleep-light, #3d97e8);
    --_deep: var(--life-dashboard-sleep-deep, #5157cf);
    --_neutral: var(--life-dashboard-sleep-neutral, #8b94a8);
    --_ink: var(--primary-text-color, #1c1c1c);
    --_muted: var(--secondary-text-color, #5f6368);
    --_hairline: var(--divider-color, rgba(127, 127, 127, 0.25));
    display: block;
    height: 100%;
  }
  ha-card { height: 100%; box-sizing: border-box; }
  .root { container-type: inline-size; padding: 16px; color: var(--_ink); }

  .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
  .lead { min-width: 0; }
  .title { font-size: 14px; color: var(--_muted); margin: 0 0 2px; font-weight: 500; }
  .hero { display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap; }
  .figure { font-size: 30px; line-height: 1.15; font-weight: 500; letter-spacing: -0.01em; }
  .unit { font-size: 14px; color: var(--_muted); }
  .when { text-align: end; font-size: 12.5px; line-height: 1.45; color: var(--_muted);
    font-variant-numeric: tabular-nums; flex: none; }
  .when b { display: block; font-weight: 500; color: var(--_ink); font-size: 13px; }

  .chart { display: grid; column-gap: 10px; margin-top: 14px; align-items: stretch;
    grid-template-columns: max-content minmax(0, 1fr) max-content; }
  .lane-name { grid-column: 1; display: flex; align-items: center; font-size: 12px;
    line-height: 1; color: var(--_muted); }
  .lane-total { grid-column: 3; display: flex; align-items: center; justify-content: flex-end;
    gap: 10px; font-size: 12.5px; line-height: 1; font-variant-numeric: tabular-nums;
    white-space: nowrap; }
  .lane-total .pct { color: var(--_muted); min-width: 3.1ch; text-align: end; }

  .plot { grid-column: 2; position: relative; direction: ltr; outline: none; border-radius: 6px;
    touch-action: pan-y; cursor: default; -webkit-tap-highlight-color: transparent; }
  .plot:focus-visible { outline: 2px solid var(--primary-color, currentColor); outline-offset: 3px; }
  .plot svg { display: block; overflow: visible; }

  .track { fill: var(--_hairline); opacity: 0.55; }
  .gridline { stroke: var(--_hairline); stroke-width: 1; shape-rendering: crispEdges; }
  .connector { fill: none; stroke: var(--_muted); stroke-width: 1; opacity: 0.32; shape-rendering: crispEdges; }
  .tick-label { fill: var(--_muted); font-size: 11px; font-variant-numeric: tabular-nums; }
  .seg { fill: var(--seg); }
  .s-awake { --seg: var(--_awake); } .s-rem { --seg: var(--_rem); }
  .s-light { --seg: var(--_light); } .s-deep { --seg: var(--_deep); }
  .s-neutral { --seg: var(--_neutral); }
  .band { fill: var(--_ink); opacity: 0; transition: opacity 90ms linear; }
  .band.on { opacity: 0.07; }
  .ring { fill: none; stroke: var(--_ink); stroke-width: 1.5; opacity: 0; transition: opacity 90ms linear; }
  .ring.on { opacity: 0.9; }

  .tip { position: absolute; top: 0; left: 0; z-index: 1; pointer-events: none; opacity: 0;
    transition: opacity 90ms linear; padding: 7px 10px; border-radius: 8px; white-space: nowrap;
    background: var(--card-background-color, #fff); color: var(--_ink);
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.22), 0 0 0 1px var(--_hairline); font-size: 12px; }
  .tip.on { opacity: 1; }
  .tip-value { display: block; font-size: 14px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .tip-line { display: flex; align-items: center; gap: 6px; color: var(--_muted); margin-top: 2px; }
  .tip-key { width: 12px; height: 3px; border-radius: 2px; background: var(--seg); flex: none; }

  .totals { display: none; margin: 12px 0 0; padding: 0; list-style: none; gap: 6px 10px;
    grid-template-columns: repeat(auto-fit, minmax(64px, 1fr)); }
  .cell { min-width: 0; font-size: 12px; line-height: 1.3; }
  .cell-head { display: flex; align-items: center; gap: 5px; color: var(--_muted); white-space: nowrap; }
  .cell-key { width: 8px; height: 8px; border-radius: 2px; background: var(--seg); flex: none; }
  .cell-value { display: block; font-size: 13px; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .cell-value .pct { color: var(--_muted); }

  .note { margin: 10px 0 0; font-size: 12.5px; color: var(--_muted); }
  .empty-body { margin: 2px 0 0; font-size: 13px; line-height: 1.4; color: var(--_muted); overflow-wrap: anywhere; }
  .empty-figure { font-size: 19px; line-height: 1.25; font-weight: 500; }

  .visually-hidden { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0;
    overflow: hidden; clip-path: inset(50%); border: 0; white-space: nowrap; }

  @container (max-width: 460px) {
    .chart { grid-template-columns: max-content minmax(0, 1fr); }
    .lane-total { display: none; }
    .totals { display: grid; }
  }
  @container (max-width: 300px) {
    .figure { font-size: 25px; }
    .when { font-size: 12px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .band, .ring, .tip { transition: none; }
  }
  @media (forced-colors: active) {
    .seg { fill: CanvasText; }
    .track { fill: none; }
    .ring { stroke: Highlight; }
    .cell-key, .tip-key { background: CanvasText; forced-color-adjust: none; }
  }
`;

const Base = globalThis.HTMLElement ?? class {};

class LifeDashboardSleepCard extends Base {
  static getConfigElement() {
    return document.createElement(EDITOR_TAG);
  }

  static getStubConfig(hass, entities = []) {
    const candidates = stageEntities(hass);
    const found =
      candidates.find((state) => readNight(state.attributes).segments.length > 0) ?? candidates[0];
    return {
      entity:
        found?.entity_id ??
        entities.find(
          (id) =>
            typeof id === "string" &&
            (id.endsWith("_last_sleep_asleep") || id.endsWith("_health_connect_sleep_duration")),
        ) ??
        "",
    };
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.append(el("style", {}, STYLE));
    this._card = el("ha-card");
    this._root = el("div", { class: "root" });
    this._card.append(this._root);
    this.shadowRoot.append(this._card);
    this._renders = 0;
    this._model = null;
    this._active = -1;
    this._plotWidth = 0;
    this._resize = new ResizeObserver(() => this._measure());
  }

  connectedCallback() {
    if (this._plot) this._resize.observe(this._plot);
  }

  disconnectedCallback() {
    this._resize.disconnect();
    clearTimeout(this._tipTimer);
  }

  setConfig(config) {
    if (!config || typeof config.entity !== "string") {
      throw new Error("Set `entity` to a sensor with a `stages` attribute");
    }
    this._config = { ...config };
    this._seen = undefined;
    if (this._hass) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._config) return;
    if (this._hasChanged(hass)) this._render();
  }

  get hass() {
    return this._hass;
  }

  getCardSize() {
    return 5;
  }

  getGridOptions() {
    return { columns: 12, rows: "auto", min_columns: 6 };
  }

  _hasChanged(hass) {
    const stateObj = hass?.states?.[this._config.entity];
    const locale = hass?.locale;
    const previous = this._seen;
    if (previous && previous.stateObj === stateObj && previous.locale === locale) return false;
    const fingerprint = JSON.stringify([
      stateObj?.state,
      stateObj?.attributes,
      locale?.language,
      locale?.time_format,
      locale?.time_zone,
      hass?.config?.time_zone,
    ]);
    const changed = !previous || previous.fingerprint !== fingerprint;
    this._seen = { stateObj, locale, fingerprint };
    return changed;
  }

  _render() {
    this._renders += 1;
    this._active = -1;
    clearTimeout(this._tipTimer);
    this._resize.disconnect();
    this._plot = null;

    const hass = this._hass;
    const locale = localeSettings(hass);
    const entity = this._config.entity;
    const stateObj = hass?.states?.[entity];
    const direction = this.isConnected ? getComputedStyle(this).direction : "ltr";

    this._model = null;
    let empty = null;
    if (!entity) empty = { titleKey: "pickTitle", bodyKey: "pickBody" };
    else if (!stateObj) empty = { titleKey: "missingTitle", bodyKey: "missingBody" };
    else if (stateObj.state === "unavailable") {
      empty = { titleKey: "unavailableTitle", bodyKey: "unavailableBody" };
    }

    const night = empty ? { segments: [], stateInHours: true } : readNight(stateObj.attributes);
    const segments = night.segments;
    if (!empty && !segments.length) empty = { titleKey: "noStagesTitle", bodyKey: "noStagesBody" };

    this._root.replaceChildren();
    if (empty) {
      this._renderEmpty(empty, locale, entity);
      return;
    }

    const summary = summarize(segments);
    const asleep = asleepMinutes(stateObj.state, summary, night.stateInHours);
    const formats = timeFormatters(locale);
    this._model = { segments, summary, asleep, locale, formats, direction };
    this._renderNight(stateObj, locale);
    this._measure();
    if (this._plot) this._resize.observe(this._plot);
  }

  _renderEmpty({ titleKey, bodyKey }, locale, entity) {
    const { language } = locale;
    const lanes = ["awake", "rem", "light", "deep"];
    const head = el(
      "div",
      { class: "head" },
      el(
        "div",
        { class: "lead" },
        this._config.title ? el("div", { class: "title" }, this._config.title) : null,
        el("div", { class: "empty-figure" }, translate(language, titleKey)),
        el("p", { class: "empty-body" }, translate(language, bodyKey, { entity })),
      ),
    );

    const chart = el("div", { class: "chart", "aria-hidden": "true" });
    lanes.forEach((stage, index) => {
      chart.append(
        this._laneName(translate(language, stage), index),
        el("span", { class: "lane-total", style: `grid-row:${index + 1};height:${LANE_HEIGHT}px` }),
      );
    });
    const width = 300;
    const tracks = svg("svg", {
      width: "100%",
      height: lanes.length * LANE_HEIGHT,
      preserveAspectRatio: "none",
      viewBox: `0 0 ${width} ${lanes.length * LANE_HEIGHT}`,
    });
    lanes.forEach((_, index) => {
      tracks.append(
        svg("rect", {
          class: "track",
          x: 0,
          y: index * LANE_HEIGHT + (LANE_HEIGHT - BAR_HEIGHT) / 2,
          width,
          height: BAR_HEIGHT,
          rx: 3,
        }),
      );
    });
    chart.append(el("div", { class: "plot", style: `grid-row:1 / span ${lanes.length}` }, tracks));
    this._root.append(head, chart);
  }

  _laneName(label, index) {
    return el(
      "span",
      { class: "lane-name", style: `grid-row:${index + 1};height:${LANE_HEIGHT}px` },
      label,
    );
  }

  _renderNight(stateObj, locale) {
    const { language } = locale;
    const { summary, asleep, formats, segments } = this._model;
    const rows = summary.rows;
    const noDetail = !segments.some((segment) => BREAKDOWN.includes(segment.stage));
    // Without a breakdown awake was not measured, so 0m would claim something untrue.
    const hasFigure = (row) => !noDetail || row.minutes > 0;
    const range = timeRange(language, formats, summary.start, summary.end);
    const nightLabel = formatNight(stateObj.attributes?.night, summary.end, locale);

    const head = el(
      "div",
      { class: "head" },
      el(
        "div",
        { class: "lead" },
        this._config.title ? el("div", { class: "title" }, this._config.title) : null,
        el(
          "div",
          { class: "hero" },
          el("span", { class: "figure" }, formatDuration(asleep, language)),
          el("span", { class: "unit" }, translate(language, "asleep")),
        ),
      ),
      el("div", { class: "when" }, el("b", {}, nightLabel), range),
    );

    const chart = el("div", { class: "chart" });
    chart.style.gridTemplateRows = `repeat(${rows.length}, ${LANE_HEIGHT}px) ${AXIS_HEIGHT}px`;
    rows.forEach((row, index) => {
      const name = this._laneName(laneLabel(language, row.stage, segments), index);
      name.setAttribute("aria-hidden", "true");
      chart.append(
        name,
        el(
          "span",
          {
            class: "lane-total",
            style: `grid-row:${index + 1};height:${LANE_HEIGHT}px`,
            "aria-hidden": "true",
          },
          hasFigure(row) ? el("span", {}, formatDuration(row.minutes, language)) : null,
          hasFigure(row) ? el("span", { class: "pct" }, `${row.percent}%`) : null,
        ),
      );
    });

    const plot = el("div", {
      class: "plot",
      style: `grid-row:1 / span ${rows.length + 1}`,
      tabindex: "0",
      role: "slider",
      "aria-label": `${translate(language, "sleepStages")}. ${translate(language, "plotHint")}`,
      "aria-valuemin": "1",
      "aria-valuemax": segments.length,
      "aria-valuenow": "1",
    });
    this._tip = el("div", { class: "tip", dir: this._model.direction, "aria-hidden": "true" });
    plot.append(this._tip);
    this._plot = plot;
    this._plotWidth = 0;
    this._attachInteraction(plot);
    chart.append(plot);

    const totals = el("ul", { class: "totals", "aria-hidden": "true" });
    for (const row of rows.filter(hasFigure)) {
      totals.append(
        el(
          "li",
          { class: `cell s-${row.stage}` },
          el(
            "span",
            { class: "cell-head" },
            el("span", { class: "cell-key" }),
            laneLabel(language, row.stage, segments),
          ),
          el(
            "span",
            { class: "cell-value" },
            `${formatDuration(row.minutes, language)} `,
            el("span", { class: "pct" }, `${row.percent}%`),
          ),
        ),
      );
    }

    const stagesText = rows
      .filter(hasFigure)
      .map(
        (row) =>
          `${laneLabel(language, row.stage, segments)} ${formatDuration(row.minutes, language)}, ${row.percent}%`,
      )
      .join(". ");
    const region = el("div", {
      role: "group",
      "aria-label": translate(language, "summaryLabel", {
        date: nightLabel,
        range,
        duration: formatDuration(asleep, language),
        stages: stagesText,
      }),
    });
    region.append(head, chart, totals);
    if (noDetail) region.append(el("p", { class: "note" }, translate(language, "noDetail")));
    region.append(this._textAlternative(language, range));
    this._root.append(region);
  }

  _textAlternative(language, range) {
    const { segments, formats } = this._model;
    const head = el(
      "tr",
      {},
      el("th", {}, translate(language, "stage")),
      el("th", {}, translate(language, "start")),
      el("th", {}, translate(language, "end")),
      el("th", {}, translate(language, "duration")),
    );
    const body = segments.map((segment) =>
      el(
        "tr",
        {},
        el("td", {}, translate(language, segment.stage)),
        el("td", {}, formats.time(segment.start)),
        el("td", {}, formats.time(segment.end)),
        el("td", {}, formatDuration((segment.end - segment.start) / MINUTE, language)),
      ),
    );
    return el(
      "table",
      { class: "visually-hidden" },
      el("caption", {}, `${translate(language, "sleepStages")}, ${range}`),
      head,
      ...body,
    );
  }

  _measure() {
    if (!this._plot || !this._model) return;
    const width = Math.round(this._plot.getBoundingClientRect().width);
    if (width > 0 && width !== this._plotWidth) {
      this._plotWidth = width;
      this._drawPlot(width);
    }
  }

  _drawPlot(width) {
    const { segments, summary, locale, formats } = this._model;
    const rows = summary.rows;
    const laneIndex = new Map(rows.map((row, index) => [row.stage, index]));
    const plotBottom = rows.length * LANE_HEIGHT;
    const height = plotBottom + AXIS_HEIGHT;
    const inner = Math.max(1, width - PLOT_INSET * 2);
    const startMs = summary.start;
    const endMs = summary.end;
    const span = endMs - startMs;
    const x = (t) => PLOT_INSET + ((t - startMs) / span) * inner;
    this._invert = (px) => startMs + ((px - PLOT_INSET) / inner) * span;
    this._msPerPx = span / inner;

    const root = svg("svg", { width, height, "aria-hidden": "true" });
    const barTop = (lane) => laneIndex.get(lane) * LANE_HEIGHT + (LANE_HEIGHT - BAR_HEIGHT) / 2;

    for (const [, index] of laneIndex) {
      root.append(
        svg("rect", {
          class: "track",
          x: PLOT_INSET,
          y: index * LANE_HEIGHT + (LANE_HEIGHT - BAR_HEIGHT) / 2,
          width: inner,
          height: BAR_HEIGHT,
          rx: 3,
        }),
      );
    }

    const sample = formats.tick(startMs, 60);
    const labelPx = sample.length * 6.4 + 4;
    const { ticks, stepMinutes } = makeTicks(startMs, endMs, {
      widthPx: inner,
      labelPx,
      timeZone: locale.timeZone,
    });
    for (const tick of ticks) {
      const px = Math.round(x(tick)) + 0.5;
      root.append(svg("line", { class: "gridline", x1: px, x2: px, y1: 0, y2: plotBottom }));
      const label = formats.tick(tick, stepMinutes);
      const half = (label.length * 6.4) / 2;
      root.append(
        svg(
          "text",
          {
            class: "tick-label",
            x: Math.min(width - half, Math.max(half, px)),
            y: plotBottom + 15,
            "text-anchor": "middle",
          },
          label,
        ),
      );
    }

    this._band = svg("rect", { class: "band", y: 0, height: plotBottom, rx: 2 });
    root.append(this._band);

    // A sub-4px blip that returns to the lane it left gets no connectors: a dense
    // night has dozens of them and the lines would comb over the whole plot.
    const isBlip = (index) => {
      const segment = segments[index];
      const before = segments[index - 1];
      const after = segments[index + 1];
      return (
        segment && before && after &&
        x(segment.end) - x(segment.start) < 4 &&
        laneOf(before.stage) === laneOf(after.stage)
      );
    };

    let path = "";
    const center = (lane) => barTop(lane) + BAR_HEIGHT / 2;
    for (let index = 1; index < segments.length; index += 1) {
      const previous = segments[index - 1];
      const current = segments[index];
      if (current.start - previous.end > CONNECT_GAP) continue;
      if (isBlip(index) || isBlip(index - 1)) continue;
      const fromLane = laneOf(previous.stage);
      const toLane = laneOf(current.stage);
      if (fromLane === toLane) continue;
      const px = Math.round(x(current.start)) + 0.5;
      path += `M${px} ${center(fromLane)}V${center(toLane)}`;
    }
    if (path) root.append(svg("path", { class: "connector", d: path }));

    this._marks = segments.map((segment) => {
      const start = x(segment.start);
      const end = x(segment.end);
      const barWidth = Math.max(MIN_BAR_WIDTH, end - start);
      const barX = start - (barWidth - (end - start)) / 2;
      const y = barTop(laneOf(segment.stage));
      root.append(
        svg("rect", {
          class: `seg s-${laneOf(segment.stage)}`,
          x: barX,
          y,
          width: barWidth,
          height: BAR_HEIGHT,
          rx: Math.min(3, barWidth / 2),
        }),
      );
      return { x: barX, y, width: barWidth, cx: barX + barWidth / 2 };
    });

    this._ring = svg("rect", { class: "ring", rx: 4 });
    root.append(this._ring);

    this._plot.querySelector("svg")?.remove();
    this._plot.prepend(root);
    if (this._active >= 0) this._showActive();
  }

  _attachInteraction(plot) {
    plot.addEventListener("pointermove", (event) => this._onPointer(event));
    plot.addEventListener("pointerdown", (event) => this._onPointer(event));
    plot.addEventListener("pointerleave", (event) => {
      clearTimeout(this._tipTimer);
      if (event.pointerType === "touch") {
        this._tipTimer = setTimeout(() => this._clearActive(), 3500);
      } else if (this.shadowRoot.activeElement !== plot) {
        this._clearActive();
      }
    });
    plot.addEventListener("focus", () => {
      if (this._active < 0 && plot.matches(":focus-visible")) this._setActive(0);
    });
    plot.addEventListener("blur", () => this._clearActive());
    plot.addEventListener("keydown", (event) => this._onKey(event));
  }

  _onPointer(event) {
    if (!this._invert || !this._model) return;
    clearTimeout(this._tipTimer);
    const box = this._plot.getBoundingClientRect();
    const t = this._invert(event.clientX - box.left);
    const row = this._model.summary.rows[Math.floor((event.clientY - box.top) / LANE_HEIGHT)];
    this._setActive(
      pickSegment(this._model.segments, t, row?.stage ?? null, LANE_SNAP_PX * this._msPerPx),
    );
  }

  _onKey(event) {
    if (!this._model) return;
    const last = this._model.segments.length - 1;
    const current = Math.max(0, this._active);
    const targets = {
      ArrowRight: current + 1,
      ArrowUp: current + 1,
      ArrowLeft: current - 1,
      ArrowDown: current - 1,
      PageDown: current + 5,
      PageUp: current - 5,
      Home: 0,
      End: last,
    };
    if (event.key === "Escape") {
      this._clearActive();
      return;
    }
    const target = targets[event.key];
    if (target === undefined) return;
    event.preventDefault();
    this._setActive(Math.min(last, Math.max(0, target)));
  }

  _setActive(index) {
    if (index === this._active || index < 0) return;
    this._active = index;
    this._showActive();
  }

  _clearActive() {
    this._active = -1;
    this._band?.classList.remove("on");
    this._ring?.classList.remove("on");
    this._tip?.classList.remove("on");
  }

  _showActive() {
    const index = this._active;
    const { segments, formats, locale } = this._model;
    const mark = this._marks?.[index];
    const segment = segments[index];
    if (!mark || !segment) return;
    const language = locale.language;

    const duration = formatDuration((segment.end - segment.start) / MINUTE, language);
    const range = timeRange(language, formats, segment.start, segment.end);
    const stageLabel = translate(language, segment.stage);

    const ringWidth = Math.max(mark.width + 4, 7);
    this._band.setAttribute("x", mark.cx - Math.max(mark.width, 1) / 2);
    this._band.setAttribute("width", Math.max(mark.width, 1));
    this._band.classList.add("on");
    this._ring.setAttribute("x", mark.cx - ringWidth / 2);
    this._ring.setAttribute("y", mark.y - 2);
    this._ring.setAttribute("width", ringWidth);
    this._ring.setAttribute("height", BAR_HEIGHT + 4);
    this._ring.classList.add("on");

    this._tip.replaceChildren(
      el("span", { class: "tip-value" }, duration),
      el(
        "span",
        { class: `tip-line s-${laneOf(segment.stage)}` },
        el("span", { class: "tip-key" }),
        `${stageLabel}, ${range}`,
      ),
    );
    this._tip.classList.add("on");
    const tipWidth = this._tip.offsetWidth;
    const tipHeight = this._tip.offsetHeight;
    const left = Math.min(
      Math.max(0, mark.cx - tipWidth / 2),
      Math.max(0, this._plotWidth - tipWidth),
    );
    // Above the plot, so the tooltip never covers the lanes it describes.
    this._tip.style.left = `${Math.round(left)}px`;
    this._tip.style.top = `${-tipHeight - 6}px`;

    this._plot.setAttribute("aria-valuenow", index + 1);
    this._plot.setAttribute(
      "aria-valuetext",
      translate(language, "segmentOf", {
        stage: stageLabel,
        range,
        duration,
        n: index + 1,
        total: segments.length,
      }),
    );
  }
}

class LifeDashboardSleepCardEditor extends Base {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
  }

  setConfig(config) {
    this._config = { ...config };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  connectedCallback() {
    this._render();
  }

  _schema() {
    const ids = stageEntities(this._hass).map((state) => state.entity_id);
    const current = this._config.entity;
    if (current && !ids.includes(current)) ids.push(current);
    return [
      {
        name: "entity",
        required: true,
        selector: { entity: ids.length ? { include_entities: ids } : { domain: "sensor" } },
      },
      { name: "title", selector: { text: {} } },
    ];
  }

  _label(name) {
    const language = this._hass?.locale?.language || this._hass?.language;
    return translate(language, name === "entity" ? "editorEntity" : "editorTitle");
  }

  _emit(config) {
    this._config = config;
    this.dispatchEvent(
      new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true }),
    );
  }

  _render() {
    if (!this.shadowRoot || !this.isConnected) return;
    if (customElements.get("ha-form")) {
      if (!this._form) {
        this._form = document.createElement("ha-form");
        this._form.computeLabel = (item) => this._label(item.name);
        this._form.addEventListener("value-changed", (event) => {
          event.stopPropagation();
          this._emit({ ...this._config, ...event.detail.value });
        });
        this.shadowRoot.replaceChildren(this._form);
      }
      this._form.hass = this._hass;
      const schema = this._schema();
      const schemaKey = JSON.stringify(schema);
      if (schemaKey !== this._schemaKey) {
        this._schemaKey = schemaKey;
        this._form.schema = schema;
      }
      this._form.data = this._config;
      return;
    }
    if (this._waiting) return;
    this._waiting = true;
    customElements.whenDefined("ha-form").then(() => this._render());
    const field = (name) => {
      const input = el("input", { type: "text", "aria-label": this._label(name) });
      input.value = this._config[name] ?? "";
      input.addEventListener("change", () => this._emit({ ...this._config, [name]: input.value }));
      return el(
        "label",
        { style: "display:block;margin:8px 0;font:inherit" },
        this._label(name),
        el("br"),
        input,
      );
    };
    this.shadowRoot.replaceChildren(field("entity"), field("title"));
  }
}

if (typeof customElements !== "undefined") {
  if (!customElements.get(CARD_TAG)) customElements.define(CARD_TAG, LifeDashboardSleepCard);
  if (!customElements.get(EDITOR_TAG)) customElements.define(EDITOR_TAG, LifeDashboardSleepCardEditor);
}

if (typeof window !== "undefined") {
  window.customCards = window.customCards || [];
  if (!window.customCards.some((card) => card.type === CARD_TAG)) {
    window.customCards.push({
      type: CARD_TAG,
      name: "Life Dashboard Sleep",
      description: "One night of sleep stages as a hypnogram, with time asleep and each stage's share.",
      preview: true,
      documentationURL: "https://github.com/owen282000/life-dashboard-sleep-card",
    });
  }
}
