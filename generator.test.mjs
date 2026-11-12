import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const G = createRequire(import.meta.url)("./generator.js");

const fullWorld = { lonMin: -180, lonMax: 180, latMin: -70, latMax: 70, seed: 123456789, worldScale: 8.2, islandScale: 1, even: false };
const valid = (over) => G.validate({ ...fullWorld, ...over });

test("whole world at maximum scale matches the golden fixture", () => {
  const r = valid({});
  assert.equal(r.ok, true);
  const golden = readFileSync(new URL("./fixtures/full-world-max.xml", import.meta.url), "utf8");
  assert.equal(G.toXml(r.preset), golden);
});

test("bounds and seed are written unchanged, including negatives", () => {
  const r = valid({ lonMin: -100, lonMax: -20, latMin: -45, latMax: -5, seed: -2147483648, worldScale: 1.9 });
  assert.equal(r.ok, true);
  const xml = G.toXml(r.preset);
  for (const s of ["<worldScramblerSeed>-2147483648</worldScramblerSeed>", "<worldLonMin>-100</worldLonMin>",
    "<worldLonMax>-20</worldLonMax>", "<worldLatMin>-45</worldLatMin>", "<worldLatMax>-5</worldLatMax>"]) {
    assert.ok(xml.includes(s), s);
  }
});

test("island spread scales to exact whole numbers", () => {
  const r = valid({ islandScale: 0.7 });
  assert.equal(r.ok, true);
  assert.equal(r.preset.islandSpread, 3500);
  assert.equal(r.preset.minIslandSeparation, 1050);
});

test("1x and 4x match Scrambled Seas' own world scale with Border Expander", () => {
  const one = valid({ worldScale: 1 });
  assert.deepEqual(one.world, { lonMin: -12, lonMax: 32, latMin: 21, latMax: 51 });
  assert.equal(one.preset.minArchipelagoSeparation, 30000);
  const four = valid({ worldScale: 4 });
  assert.deepEqual(four.world, { lonMin: -78, lonMax: 98, latMin: -50, latMax: 70 });
  assert.equal(four.preset.minArchipelagoSeparation, 120000);
});

test("the world stays inside the area limits and fills them at maximum scale", () => {
  const band = { lonMin: -180, lonMax: 180, latMin: -30, latMax: 30 };
  for (const worldScale of [1, 2.5, 5]) {
    const { world } = valid({ ...band, worldScale });
    assert.ok(world.lonMin >= -180 && world.lonMax <= 180 && world.latMin >= -30 && world.latMax <= 30, JSON.stringify(world));
  }
  assert.deepEqual(valid({ ...band, worldScale: G.ceilTenth(G.maxWorldScale(360, 60)) }).world, band);
  assert.equal(valid({ ...band, worldScale: 8.3 }).ok, false);
});

test("spacing follows the world scale but is held where the archipelagos would not fit", () => {
  const band = { lonMin: -180, lonMax: 180, latMin: -30, latMax: 30, worldScale: 8.2 };
  const r = valid(band);
  assert.equal(r.spacingLimited, true);
  assert.ok(r.preset.minArchipelagoSeparation < 30000 * 8.2);
  assert.equal(r.preset.minArchipelagoSeparation, Math.floor(30000 * G.maxArchipelagoScale(360, 60) + 1e-6));
});

test("even spacing uses the largest spacing that fits", () => {
  const r = valid({ worldScale: 1, even: true });
  assert.equal(r.preset.minArchipelagoSeparation, Math.floor(30000 * G.maxArchipelagoScale(44, 30) + 1e-6));
  assert.ok(r.preset.minArchipelagoSeparation > 30000);
});

test("generated seeds are nonzero signed 32-bit integers", () => {
  const values = [0, 0, -5];
  const fake = (a) => { a[0] = values.shift(); return a; };
  assert.equal(G.randomSeed(fake), -5);
  for (let i = 0; i < 200; i++) {
    const s = G.randomSeed((a) => { for (let j = 0; j < a.length; j++) a[j] = (Math.random() * 2 ** 32) | 0; return a; });
    assert.ok(Number.isInteger(s) && s !== 0 && s >= -(2 ** 31) && s < 2 ** 31);
  }
});

test("rejects missing, fractional, out-of-range and reversed bounds", () => {
  for (const over of [{ lonMin: NaN }, { latMax: 12.5 }, { lonMin: -181 }, { latMax: 71 }, { lonMin: 100, lonMax: 0 }]) {
    assert.equal(valid(over).ok, false, JSON.stringify(over));
  }
});

test("rejects area limits smaller than the vanilla-sized world", () => {
  assert.equal(valid({ lonMin: -12, lonMax: 32, latMin: 26, latMax: 46, worldScale: 1 }).ok, true);
  assert.equal(valid({ lonMin: -12, lonMax: 31, latMin: 26, latMax: 46, worldScale: 1 }).ok, false);
  assert.equal(valid({ lonMin: -12, lonMax: 32, latMin: 26, latMax: 45, worldScale: 1 }).ok, false);
});

// The game's archipelago placement loop: place all 15 at random inside the inset box and retry until
// every pair is far enough apart. Returns the average number of tries, using a fixed-seed generator.
function placementTries(lonSpan, latSpan, separation, runs) {
  const w = lonSpan * 9000 - 54000, h = latSpan * 9000 - 54000;
  let state = 42;
  const rand = () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296;
  let total = 0;
  for (let r = 0; r < runs; r++) {
    for (;;) {
      total++;
      const pts = Array.from({ length: 15 }, () => [rand() * w, rand() * h]);
      if (pts.every((p, i) => pts.slice(i + 1).every((o) => Math.hypot(p[0] - o[0], p[1] - o[1]) >= separation))) break;
    }
  }
  return total / runs;
}

test("vanilla-sized world allows exactly the mod's 1x spacing", () => {
  assert.equal(G.floorTenth(G.maxArchipelagoScale(44, 20)), "1.0");
});

test("long narrow bands allow wide spacing along the band", () => {
  assert.ok(G.maxArchipelagoScale(360, 44) > 5);
  assert.ok(G.maxArchipelagoScale(360, 20) > 3.5);
  assert.ok(G.maxArchipelagoScale(360, 140) > 9);
});

test("spacing at the limit places about as easily as the vanilla world does in-game", () => {
  const vanilla = placementTries(44, 20, 30000, 30);
  for (const [lon, lat] of [[360, 140], [360, 20], [44, 140]]) {
    const tries = placementTries(lon, lat, 30000 * G.maxArchipelagoScale(lon, lat), 30);
    assert.ok(tries < vanilla * 4, `${lon}x${lat}: ${tries} tries vs vanilla ${vanilla}`);
  }
});

test("typical spacing is never below the minimum and grows with spacing", () => {
  const at1 = G.typicalSpacing(360, 140, 30000);
  const atMax = G.typicalSpacing(360, 140, 30000 * G.maxArchipelagoScale(360, 140));
  assert.ok(at1 >= 30000);
  assert.ok(atMax >= 30000 * G.maxArchipelagoScale(360, 140));
  assert.ok(atMax > at1);
  assert.equal(G.typicalSpacing(360, 140, 30000), at1, "same inputs give the same estimate");
});

test("island spread is capped so islands stay inside the bounds", () => {
  const r = valid({ islandScale: G.ISLAND_SCALE_MAX });
  assert.equal(r.ok, true);
  assert.ok(r.preset.islandSpread <= G.BORDER_INSET_UNITS);
  assert.equal(valid({ islandScale: G.ISLAND_SCALE_MAX + 0.1 }).ok, false);
});

test("rejects slider values out of range", () => {
  for (const s of [0.4, NaN]) assert.equal(valid({ islandScale: s }).ok, false);
  for (const s of [0.9, NaN]) assert.equal(valid({ worldScale: s }).ok, false);
});

test("rejects seed 0, fractional seeds and seeds outside 32 bits", () => {
  for (const seed of [0, 1.5, 2147483648, -2147483649, NaN]) assert.equal(valid({ seed }).ok, false, String(seed));
});

test("file name uses the seed", () => {
  assert.equal(G.fileName(-42), "scrambled-seas--42.xml");
});
