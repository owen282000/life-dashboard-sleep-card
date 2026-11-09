// Sample nights for the harness and the node tests. Segment counts and the share
// of short awake blips follow the shape measured on real iPhone nights; the
// Android shape is an assumption until it has been measured.

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function iso(ms) {
  return new Date(ms).toISOString().replace(".000Z", "+00:00");
}

// A hypnogram shaped like human sleep: cycles of light, deep and REM, deep early and
// REM late, each entry in minutes.
function buildCycles(random, cycles) {
  const items = [];
  const between = (low, high) => low + random() * (high - low);
  for (let cycle = 0; cycle < cycles; cycle += 1) {
    const progress = cycle / Math.max(1, cycles - 1);
    items.push(["light", between(14, 26)]);
    const deep = (1 - progress) * between(32, 48);
    if (deep > 5) items.push(["deep", deep]);
    items.push(["light", between(8, 18)]);
    items.push(["rem", 8 + progress * between(18, 30)]);
    if (random() < 0.5) items.push(["awake", between(1, 3)]);
  }
  return items;
}

// Splits long stretches and adds short awake blips until the night has `target` segments.
function densify(items, random, target) {
  const result = items.map(([stage, minutes]) => [stage, minutes]);
  let guard = 0;
  while (result.length < target && guard < 4000) {
    guard += 1;
    let index = Math.floor(random() * result.length);
    if (result[index][1] < 6 || result[index][0] === "awake") {
      index = result.findIndex(([stage, minutes]) => stage !== "awake" && minutes >= 6);
      if (index === -1) break;
    }
    const [stage, minutes] = result[index];
    const blip = 0.75 + random() * 4;
    const cut = Math.min(minutes - blip - 1, 2 + random() * (minutes - blip - 3));
    if (cut < 1) continue;
    result.splice(index, 1, [stage, cut], ["awake", blip], [stage, minutes - blip - cut]);
  }
  return result;
}

function toStates(startMs, items) {
  let cursor = startMs;
  return items.map(([stage, minutes]) => {
    const start = cursor;
    cursor += Math.round(minutes * 60) * 1000;
    return { stage, start: iso(start), end: iso(cursor) };
  });
}

function sensor(entity_id, stages, night, source, state) {
  return {
    entity_id,
    state,
    attributes: {
      night,
      source,
      start: stages[0]?.start,
      end: stages[stages.length - 1]?.end,
      unit_of_measurement: "h",
      friendly_name: "Last sleep asleep",
      stages,
    },
  };
}

function asleepHours(stages) {
  const ms = stages
    .filter((segment) => ["rem", "light", "deep", "sleeping"].includes(segment.stage))
    .reduce((sum, segment) => sum + Date.parse(segment.end) - Date.parse(segment.start), 0);
  return (ms / 3600000).toFixed(2);
}

function makeNight({ id, seed, cycles, startIso, night, target, source }) {
  const random = mulberry32(seed);
  const items = densify(buildCycles(random, cycles), random, target ?? 0);
  const stages = toStates(Date.parse(startIso), items);
  return { id, state: sensor(`sensor.${id}_last_sleep_asleep`, stages, night, source, asleepHours(stages)) };
}

const HOSTILE = '<img src=x onerror="window.__pwned=1">';

const androidNight = makeNight({
  id: "android",
  seed: 11,
  cycles: 5,
  startIso: "2026-11-07T22:48:00+01:00",
  night: "2026-11-08",
  source: "Phone",
});
const iphoneNight = makeNight({
  id: "iphone",
  seed: 7,
  cycles: 5,
  startIso: "2026-11-08T23:21:00+01:00",
  night: "2026-11-09",
  target: 42,
  source: "Watch",
});
const denseNight = makeNight({
  id: "dense",
  seed: 23,
  cycles: 5,
  startIso: "2026-11-05T23:02:00+01:00",
  night: "2026-11-06",
  target: 61,
  source: "Watch",
});

const onlySleeping = {
  id: "sleeping",
  state: sensor(
    "sensor.sleeping_last_sleep_asleep",
    [
      { stage: "sleeping", start: "2026-11-07T23:30:00+01:00", end: "2026-11-08T03:14:00+01:00" },
      { stage: "sleeping", start: "2026-11-08T03:31:00+01:00", end: "2026-11-08T07:02:00+01:00" },
    ],
    "2026-11-08",
    "Phone",
    "7.25",
  ),
};

// The shape of the official Android companion app, 2026.11.1 or newer: three parallel
// lists, and a state in minutes that must not be read as hours.
function companionNight() {
  const random = mulberry32(31);
  const items = buildCycles(random, 5);
  items.splice(0, 0, ["awake_in_bed", 9]);
  items.push(["out_of_bed", 4], ["awake_in_bed", 6]);
  const stages = toStates(Date.parse("2026-11-07T23:04:00+01:00"), items).map((segment) => ({
    ...segment,
    start: segment.start.replace("+00:00", "Z"),
    end: segment.end.replace("+00:00", "Z"),
  }));
  const asleep = stages
    .filter((s) => ["rem", "light", "deep", "sleeping", "unknown"].includes(s.stage))
    .reduce((sum, s) => sum + Date.parse(s.end) - Date.parse(s.start), 0);
  return {
    entity_id: "sensor.pixel_health_connect_sleep_duration",
    state: String(Math.floor(asleep / 60000)),
    attributes: {
      startTime: stages[0].start,
      endTime: stages[stages.length - 1].end,
      sources: "com.example.watch",
      stageTypes: stages.map((s) => s.stage),
      stageStartTimes: stages.map((s) => s.start),
      stageEndTimes: stages.map((s) => s.end),
      unit_of_measurement: "min",
    },
  };
}

const companion = { id: "companion", state: companionNight() };

const companionNoTimeline = {
  id: "companion-empty",
  state: {
    entity_id: "sensor.other_health_connect_sleep_duration",
    state: "412",
    attributes: { stageTypes: ["light", "deep"], stageStartTimes: ["2026-11-08T01:00:00Z"], stageEndTimes: ["2026-11-08T02:00:00Z"] },
  },
};

const emptyNight = {
  id: "empty",
  state: {
    entity_id: "sensor.empty_last_sleep_asleep",
    state: "unknown",
    attributes: { friendly_name: "Last sleep asleep" },
  },
};

const unavailable = {
  id: "unavailable",
  state: { entity_id: "sensor.unavailable_last_sleep_asleep", state: "unavailable", attributes: {} },
};

// Everything a broken payload could contain, in one night.
const hostileNight = {
  id: "hostile",
  state: {
    entity_id: "sensor.hostile_last_sleep_asleep",
    state: "6.5",
    attributes: {
      night: HOSTILE,
      source: HOSTILE,
      stages: [
        { stage: HOSTILE, start: "2026-11-07T23:00:00+01:00", end: "2026-11-07T23:20:00+01:00" },
        { stage: "light", start: "2026-11-07T23:20:00+01:00", end: "2026-11-08T02:00:00+01:00" },
        { stage: "deep", start: "2026-11-08T02:00:00+01:00", end: "2026-11-08T02:45:00+01:00" },
        { stage: "out_of_bed", start: "2026-11-08T02:45:00+01:00", end: "2026-11-08T03:00:00+01:00" },
        { stage: "rem", start: "2026-11-08T03:00:00+01:00", end: "2026-11-08T05:30:00+01:00" },
        null,
        "nonsense",
        { stage: "rem" },
        { start: "2026-11-08T05:30:00+01:00", end: "2026-11-08T05:40:00+01:00" },
        { stage: "light", start: HOSTILE, end: "2026-11-08T05:40:00+01:00" },
      ],
    },
  },
};

export const nights = {
  android: androidNight,
  iphone: iphoneNight,
  dense: denseNight,
  sleeping: onlySleeping,
  empty: emptyNight,
  unavailable,
  hostile: hostileNight,
  companion,
  companionNoTimeline,
};

export const hostileString = HOSTILE;
