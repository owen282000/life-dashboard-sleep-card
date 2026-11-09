import assert from "node:assert/strict";
import { test } from "node:test";
import {
  asleepMinutes,
  chooseLanes,
  cleanSegments,
  formatDuration,
  laneOf,
  localeSettings,
  makeTicks,
  pickSegment,
  readNight,
  stageEntities,
  summarize,
  translate,
  wholePercentages,
} from "../dist/life-dashboard-sleep-card.js";
import { hostileString, nights } from "./fixtures.mjs";

const seg = (stage, start, end) => ({ stage, start, end });
const at = (hhmm, day = "2026-11-08") => `${day}T${hhmm}:00+00:00`;
const minutes = (value) => value * 60000;

test("cleanSegments skips everything malformed", () => {
  assert.deepEqual(cleanSegments(undefined), []);
  assert.deepEqual(cleanSegments("stages"), []);
  assert.deepEqual(cleanSegments({ length: 2 }), []);
  const result = cleanSegments([
    null,
    42,
    "x",
    {},
    { stage: "rem" },
    { start: at("01:00"), end: at("02:00") },
    { stage: 3, start: at("01:00"), end: at("02:00") },
    { stage: "", start: at("01:00"), end: at("02:00") },
    { stage: "rem", start: "yesterday", end: at("02:00") },
    { stage: "rem", start: "1", end: "2" },
    { stage: "rem", start: at("02:00"), end: at("01:00") },
    { stage: "rem", start: at("02:00"), end: at("02:00") },
    { stage: "deep", start: at("03:00"), end: "2026-11-10T03:00:00+00:00" },
    seg("light", at("04:00"), at("05:00")),
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].stage, "light");
});

test("cleanSegments sorts, keeps gaps, merges and clips overlaps", () => {
  const result = cleanSegments([
    seg("deep", at("02:00"), at("03:00")),
    seg("light", at("01:00"), at("02:00")),
    seg("light", at("00:30"), at("01:00")),
    seg("rem", at("02:30"), at("03:30")),
    seg("awake", at("04:00"), at("04:10")),
  ]);
  assert.deepEqual(
    result.map((s) => s.stage),
    ["light", "deep", "rem", "awake"],
  );
  assert.equal(result[0].start, Date.parse(at("00:30")));
  assert.equal(result[0].end, Date.parse(at("02:00")));
  assert.equal(result[2].start, Date.parse(at("03:00")));
  assert.equal(result[3].start - result[2].end, minutes(30));
});

test("unknown stage strings become neutral and never carry the raw value", () => {
  const result = cleanSegments([seg("banana", at("01:00"), at("02:00")), seg(hostileString, at("02:00"), at("03:00"))]);
  assert.deepEqual(result.map((s) => s.stage), ["unknown"]);
  assert.equal(result[0].end, Date.parse(at("03:00")));
  assert.equal(result.flatMap(Object.values).filter((v) => typeof v === "string").join("").includes("<"), false);
});

test("the seven stage values are recognised", () => {
  for (const stage of ["awake", "light", "deep", "rem", "sleeping", "out_of_bed", "unknown"]) {
    assert.equal(cleanSegments([seg(stage, at("01:00"), at("02:00"))])[0].stage, stage);
  }
  assert.equal(cleanSegments([seg(" REM ", at("01:00"), at("02:00"))])[0].stage, "rem");
});

test("chooseLanes follows the integration chart's lanes", () => {
  assert.deepEqual(chooseLanes(cleanSegments([seg("light", at("01:00"), at("02:00"))])), ["awake", "rem", "light", "deep"]);
  assert.deepEqual(chooseLanes(cleanSegments([seg("sleeping", at("01:00"), at("02:00"))])), ["awake", "neutral"]);
  assert.deepEqual(chooseLanes(cleanSegments([seg("awake", at("01:00"), at("02:00"))])), ["awake", "neutral"]);
  assert.deepEqual(
    chooseLanes(
      cleanSegments([seg("rem", at("01:00"), at("02:00")), seg("banana", at("02:00"), at("03:00"))]),
    ),
    ["awake", "rem", "light", "deep", "neutral"],
  );
  assert.equal(laneOf("out_of_bed"), "awake");
  assert.equal(laneOf("sleeping"), "neutral");
  assert.equal(laneOf("unknown"), "neutral");
  assert.equal(laneOf("awake"), "awake");
});

test("summarize totals per lane, percent adds up to 100, asleep counts only sleep stages", () => {
  const segments = cleanSegments([
    seg("light", at("00:00"), at("04:00")),
    seg("deep", at("04:00"), at("05:30")),
    seg("rem", at("05:30"), at("07:00")),
    seg("awake", at("07:00"), at("07:10")),
    seg("out_of_bed", at("07:10"), at("07:15")),
  ]);
  const summary = summarize(segments);
  const row = Object.fromEntries(summary.rows.map((r) => [r.stage, r]));
  assert.equal(row.light.minutes, 240);
  assert.equal(row.awake.minutes, 15);
  assert.equal(row.neutral, undefined);
  assert.equal(summary.asleepMinutes, 420);
  assert.equal(summary.rows.reduce((sum, r) => sum + r.percent, 0), 100);
  assert.equal(summary.start, Date.parse(at("00:00")));
  assert.equal(summary.end, Date.parse(at("07:15")));
});

test("wholePercentages uses the largest remainder and leaves empty lanes at zero", () => {
  assert.deepEqual(wholePercentages([1, 1, 1]), [34, 33, 33]);
  assert.deepEqual(wholePercentages([0, 0]), [0, 0]);
  assert.deepEqual(wholePercentages([0, 3, 1]), [0, 75, 25]);
  const big = wholePercentages([125.3, 88.7, 251.4, 91.6, 12.1]);
  assert.equal(big.reduce((a, b) => a + b, 0), 100);
});

test("asleepMinutes trusts the state, falls back to the stages", () => {
  const summary = { asleepMinutes: 400 };
  assert.equal(asleepMinutes("356", summary, false), 400);
  assert.equal(asleepMinutes("7.5", summary), 450);
  assert.equal(asleepMinutes("unknown", summary), 400);
  assert.equal(asleepMinutes("", summary), 400);
  assert.equal(asleepMinutes(undefined, summary), 400);
  assert.equal(asleepMinutes("-1", summary), 400);
});

test("formatDuration is localized and shows seconds under a minute", () => {
  assert.equal(formatDuration(452, "en"), "7h 32m");
  assert.equal(formatDuration(240, "en"), "4h");
  assert.equal(formatDuration(7, "en"), "7m");
  assert.equal(formatDuration(0.75, "en"), "45s");
  assert.equal(formatDuration(0, "en"), "0m");
  assert.equal(formatDuration(452, "nl"), "7 u 32 m");
  assert.equal(formatDuration(NaN, "en"), "");
});

test("makeTicks lands on hour boundaries in the display time zone", () => {
  const start = Date.parse("2026-11-08T22:17:00+00:00");
  const end = Date.parse("2026-11-09T06:41:00+00:00");
  const utc = makeTicks(start, end, { widthPx: 800, labelPx: 34, timeZone: "UTC" });
  assert.equal(utc.stepMinutes, 60);
  assert.equal(utc.ticks.length, 8);
  assert.ok(utc.ticks.every((t) => new Date(t).getUTCMinutes() === 0));
  const india = makeTicks(start, end, { widthPx: 800, labelPx: 34, timeZone: "Asia/Kolkata" });
  assert.ok(india.ticks.every((t) => new Date(t).getUTCMinutes() === 30));
});

test("makeTicks thins out at phone width and survives a DST change", () => {
  const start = Date.parse("2026-11-08T22:17:00+00:00");
  const end = Date.parse("2026-11-09T06:41:00+00:00");
  const narrow = makeTicks(start, end, { widthPx: 230, labelPx: 34, timeZone: "UTC" });
  assert.equal(narrow.stepMinutes, 120);
  assert.ok(narrow.ticks.length >= 2);
  const fall = makeTicks(Date.parse("2026-10-24T22:00:00Z"), Date.parse("2026-10-25T05:00:00Z"), {
    widthPx: 800,
    labelPx: 34,
    timeZone: "Europe/Amsterdam",
  });
  assert.equal(fall.ticks.length, 8);
});

test("makeTicks handles a nap and bad input", () => {
  const start = Date.parse("2026-11-08T13:04:00+00:00");
  const nap = makeTicks(start, start + minutes(40), { widthPx: 300, labelPx: 34, timeZone: "UTC" });
  assert.ok(nap.ticks.length >= 1);
  assert.deepEqual(makeTicks(10, 5, { widthPx: 300 }).ticks, []);
  assert.deepEqual(makeTicks(5, 10, { widthPx: 0 }).ticks, []);
});

test("pickSegment prefers a short blip in the pointer's own lane", () => {
  const segments = cleanSegments([
    seg("light", at("01:00"), at("02:00")),
    seg("awake", at("02:00"), at("02:01")),
    seg("light", at("02:01"), at("03:00")),
  ]);
  const near = Date.parse(at("02:05"));
  assert.equal(pickSegment(segments, near, "awake", minutes(10)), 1);
  assert.equal(pickSegment(segments, near, "light", minutes(10)), 2);
  assert.equal(pickSegment(segments, near, "awake", minutes(1)), 2);
  assert.equal(pickSegment(segments, near, null, 0), 2);
  assert.equal(pickSegment([], near), -1);
});

test("localeSettings follows the Home Assistant time format and zone", () => {
  assert.equal(localeSettings({ locale: { language: "nl", time_format: "am_pm" } }).hour12, true);
  assert.equal(localeSettings({ locale: { language: "en", time_format: "24" } }).hour12, false);
  assert.equal(localeSettings({ locale: { language: "en", time_format: "language" } }).hour12, true);
  assert.equal(localeSettings({ locale: { language: "nl", time_format: "language" } }).hour12, false);
  const server = localeSettings({
    locale: { language: "en", time_zone: "server" },
    config: { time_zone: "Asia/Tokyo" },
  });
  assert.equal(server.timeZone, "Asia/Tokyo");
  assert.equal(localeSettings({ locale: { language: "en", time_zone: "local" } }).timeZone, undefined);
  assert.equal(localeSettings(undefined).language, "en");
});

test("translate falls back to English", () => {
  assert.equal(translate("fr", "deep"), "Deep");
  assert.equal(translate("nl-BE", "deep"), "Diep");
  assert.equal(translate("en", "missingBody", { entity: "sensor.x" }).startsWith("sensor.x"), true);
});

test("the companion app's stage strings map to the card's stages", () => {
  const types = ["unknown", "awake", "sleeping", "out_of_bed", "light", "deep", "rem", "awake_in_bed"];
  const expected = ["unknown", "awake", "sleeping", "out_of_bed", "light", "deep", "rem", "awake"];
  const hour = (h) => `2026-11-08T${String(h).padStart(2, "0")}:00:00Z`;
  const { segments, stateInHours } = readNight({
    stageTypes: types,
    stageStartTimes: types.map((_, i) => hour(i)),
    stageEndTimes: types.map((_, i) => hour(i + 1)),
  });
  assert.deepEqual(segments.map((s) => s.stage), expected);
  assert.equal(stateInHours, false);
});

test("readNight reads fractional Instant strings and merges awake_in_bed into awake", () => {
  const { segments } = readNight({
    stageTypes: ["awake", "awake_in_bed", "light"],
    stageStartTimes: ["2026-11-08T01:00:00Z", "2026-11-08T01:10:00.250Z", "2026-11-08T01:20:00Z"],
    stageEndTimes: ["2026-11-08T01:10:00.250Z", "2026-11-08T01:20:00Z", "2026-11-08T02:00:00Z"],
  });
  assert.deepEqual(segments.map((s) => s.stage), ["awake", "light"]);
  assert.equal(segments[0].end, Date.parse("2026-11-08T01:20:00Z"));
});

test("readNight rejects lists it cannot pair up, and skips malformed entries", () => {
  const hour = "2026-11-08T01:00:00Z";
  const end = "2026-11-08T02:00:00Z";
  assert.deepEqual(readNight({ stageTypes: ["light", "deep"], stageStartTimes: [hour], stageEndTimes: [end] }).segments, []);
  assert.deepEqual(readNight({ stageTypes: ["light"], stageStartTimes: [hour, hour], stageEndTimes: [end] }).segments, []);
  assert.deepEqual(readNight({ stageTypes: ["light"], stageStartTimes: "x", stageEndTimes: [end] }).segments, []);
  assert.deepEqual(readNight({ stageTypes: "light" }).segments, []);
  assert.deepEqual(readNight({}).segments, []);
  assert.deepEqual(readNight(null).segments, []);
  const partial = readNight({
    stageTypes: ["light", null, 3, "deep"],
    stageStartTimes: [hour, hour, hour, "bad"],
    stageEndTimes: [end, end, end, end],
  });
  assert.deepEqual(partial.segments.map((s) => s.stage), ["light"]);
});

test("readNight prefers stages and falls back to the lists when stages is empty", () => {
  const hour = "2026-11-08T01:00:00Z";
  const end = "2026-11-08T02:00:00Z";
  const both = readNight({
    stages: [seg("deep", hour, end)],
    stageTypes: ["rem"],
    stageStartTimes: [hour],
    stageEndTimes: [end],
  });
  assert.deepEqual(both.segments.map((s) => s.stage), ["deep"]);
  assert.equal(both.stateInHours, true);
  const empty = readNight({ stages: [], stageTypes: ["rem"], stageStartTimes: [hour], stageEndTimes: [end] });
  assert.deepEqual(empty.segments.map((s) => s.stage), ["rem"]);
});

test("the companion sample night has a state that is not hours", () => {
  const { segments, stateInHours } = readNight(nights.companion.state.attributes);
  assert.equal(stateInHours, false);
  assert.ok(segments.length >= 15, `${segments.length} segments`);
  assert.equal(segments.some((s) => s.stage === "awake_in_bed"), false);
  const summary = summarize(segments);
  assert.ok(asleepMinutes(nights.companion.state.state, summary, false) < 12 * 60);
  assert.deepEqual(readNight(nights.companionNoTimeline.state.attributes).segments, []);
});

test("stageEntities finds either shape and only sensors", () => {
  const hass = {
    states: {
      "sensor.a": { entity_id: "sensor.a", attributes: { stages: [] } },
      "sensor.b": { entity_id: "sensor.b", attributes: { stageTypes: [] } },
      "sensor.c": { entity_id: "sensor.c", attributes: {} },
      "binary_sensor.d": { entity_id: "binary_sensor.d", attributes: { stages: [] } },
    },
  };
  assert.deepEqual(stageEntities(hass).map((s) => s.entity_id), ["sensor.a", "sensor.b"]);
  assert.deepEqual(stageEntities(undefined), []);
});

test("the sample nights have the measured shape", () => {
  const dense = cleanSegments(nights.dense.state.attributes.stages);
  assert.equal(dense.length, 61);
  const short = dense.filter((s) => s.end - s.start < minutes(5));
  assert.ok(short.length >= 20, `${short.length} short segments`);
  const iphone = cleanSegments(nights.iphone.state.attributes.stages);
  assert.ok(iphone.length >= 31 && iphone.length <= 61, `${iphone.length} iphone segments`);
  const hostile = cleanSegments(nights.hostile.state.attributes.stages);
  assert.equal(hostile.length, 5);
  assert.equal(summarize(hostile).rows.reduce((sum, r) => sum + r.percent, 0), 100);
});
