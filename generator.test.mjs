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

test("world bounds match files Scrambled Seas 7.3.1 wrote in game, including its rounding", () => {
  // scramble_1 (0.5x) and scramble_3 (2x) were exported from the in-game world scale slider.
  assert.deepEqual(valid({ worldScale: 0.5 }).world, { lonMin: -1, lonMax: 21, latMin: 28, latMax: 43 });
  assert.equal(valid({ worldScale: 0.5 }).preset.minArchipelagoSeparation, 15000);
  assert.deepEqual(valid({ worldScale: 2 }).world, { lonMin: -34, lonMax: 54, latMin: 6, latMax: 66 });
  // Half-degree edges are cut towards zero, like the game's (int) cast.
  assert.deepEqual(valid({ worldScale: 1.5 }).world, { lonMin: -23, lonMax: 43, latMin: 13, latMax: 58 });
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

test("archipelago spacing can be set on its own, up to the most that fits", () => {
  const max = Number(G.floorTenth(G.maxArchipelagoScale(44, 30)));
  assert.ok(max > 1);
  assert.equal(valid({ worldScale: 1, archSpacing: max }).preset.minArchipelagoSeparation, Math.floor(30000 * max + 1e-6));
  assert.equal(valid({ worldScale: 8.2, archSpacing: 0.3 }).preset.minArchipelagoSeparation, 9000);
  assert.equal(valid({ worldScale: 1, archSpacing: max + 0.1 }).ok, false);
  assert.equal(valid({ archSpacing: 0.2 }).ok, false);
});

test("island spacing can be set on its own, but never past the spread's own ratio", () => {
  assert.equal(valid({ islandScale: 3, islandSpacing: 1 }).preset.minIslandSeparation, 1500);
  assert.equal(valid({ islandScale: 3, islandSpacing: 3 }).preset.minIslandSeparation, 4500);
  assert.equal(valid({ islandScale: 3, islandSpacing: 3.1 }).ok, false);
  assert.equal(valid({ islandScale: 3, islandSpacing: 0.4 }).ok, false);
  for (let s = 0.5; s <= G.ISLAND_SCALE_MAX + 1e-9; s += 0.1) {
    const r = valid({ islandScale: Math.round(s * 10) / 10 });
    assert.equal(r.ok, true, String(s));
    assert.ok(Math.round(s * 10) / 10 <= Number(G.floorTenth(G.maxIslandSpacing(Math.round(s * 10) / 10))) + 1e-9, String(s));
  }
});

test("shape and centre move the world but keep it inside the limits and at least the 0.5x size", () => {
  const wide = valid({ worldScale: 1, aspect: 18 }).world;
  assert.ok(wide.lonMax - wide.lonMin > 100 && wide.latMax - wide.latMin === 15, JSON.stringify(wide));
  const tall = valid({ worldScale: 1, aspect: 0.3 }).world;
  assert.ok(tall.lonMax - tall.lonMin === 22 && tall.latMax - tall.latMin > 40, JSON.stringify(tall));
  assert.deepEqual(valid({ worldScale: 1, centerLon: -100, centerLat: -20 }).world, { lonMin: -122, lonMax: -78, latMin: -35, latMax: -5 });
  assert.deepEqual(valid({ worldScale: 1, centerLon: 179, centerLat: 70 }).world, { lonMin: 136, lonMax: 180, latMin: 40, latMax: 70 });
  assert.equal(valid({ aspect: 20 }).ok, false);
  assert.equal(valid({ centerLat: 71 }).ok, false);
});

test("every scenario rolls settings that validate", () => {
  let state = 1;
  const rand = () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296;
  const areas = [fullWorld, { lonMin: -12, lonMax: 32, latMin: 26, latMax: 46 }, { lonMin: -100, lonMax: 100, latMin: -30, latMax: 30 }];
  for (const sc of G.SCENARIOS) {
    for (const area of areas) {
      for (let i = 0; i < 60; i++) {
        const limits = { lonMin: area.lonMin, lonMax: area.lonMax, latMin: area.latMin, latMax: area.latMax };
        const r = G.validate({ ...limits, ...G.rollScenario(sc.id, limits, {}, {}, rand), seed: 1 });
        assert.equal(r.ok, true, `${sc.id} ${JSON.stringify(area)}: ${r.errors}`);
      }
    }
  }
});

test("rolled spacing stays inside the scenario's share of the most that fits", () => {
  const limits = { lonMin: -180, lonMax: 180, latMin: -70, latMax: 70 };
  const lows = [0, 0.001, 0.3, 0.5, 0.999];
  for (const low of lows) {
    const rolled = G.rollScenario("sprawling-isles", limits, { islandScale: 0.8 }, { islandScale: true }, () => low);
    const max = Number(G.floorTenth(G.maxIslandSpacing(0.8)));
    assert.ok(rolled.islandSpacing >= 0.7 * max - 1e-9, `${low}: ${rolled.islandSpacing} of ${max}`);
  }
});

test("distances wrap at 180 degrees, like Border Expander", () => {
  // Two archipelagos either side of the 180° line, everything else far away.
  const far = { lon: 0, lat: 0 };
  const placed = { archipelagos: Array(15).fill(far), islands: Array(15).fill(Array(15).fill(far)) };
  placed.archipelagos = placed.archipelagos.map((p, i) => (i === 0 ? { lon: 179, lat: 0 } : i === 1 ? { lon: -179, lat: 0 } : { lon: i * 10 - 80, lat: 50 }));
  assert.ok(Math.abs(G.describeWorld(placed).nearestMinDeg - 2) < 1e-9);
});

test("locked settings survive a roll", () => {
  const limits = { lonMin: -180, lonMax: 180, latMin: -70, latMax: 70 };
  const current = { worldScale: 2.5, aspect: 3, centerLon: 50, centerLat: -10, islandScale: 4, islandSpacing: 2, archSpacing: 1.5 };
  const locks = { worldScale: true, aspect: true, center: true, islandScale: true, islandSpacing: true, archSpacing: true };
  const rolled = G.rollScenario("chaos", limits, current, locks, Math.random);
  assert.deepEqual(rolled, current);
});

test("a roll works around a locked value that only fits some worlds", () => {
  const limits = { lonMin: -180, lonMax: 180, latMin: -70, latMax: 70 };
  let state = 9;
  const rand = () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < 100; i++) {
    const rolled = G.rollScenario("chaos", limits, { archSpacing: 3 }, { archSpacing: true }, rand);
    assert.equal(rolled.archSpacing, 3);
    assert.equal(G.validate({ ...limits, ...rolled, seed: 1 }).ok, true);
  }
});

test("a roll that can't fit around the locks changes nothing", () => {
  // A locked 1x world in vanilla-sized limits can never fit a locked 5x archipelago spacing.
  const limits = { lonMin: -12, lonMax: 32, latMin: 26, latMax: 46 };
  const rolled = G.rollScenario("chaos", limits, { worldScale: 1, archSpacing: 5 }, { worldScale: true, archSpacing: true }, Math.random);
  assert.equal(rolled, null);
});

test("share links round-trip to the same file", () => {
  const input = { ...fullWorld, worldScale: 3.3, aspect: 9.3, centerLon: -50, centerLat: -44, archSpacing: 2.1, islandScale: 1.7, islandSpacing: 1.2, seed: -42 };
  const back = G.fromLink("#" + G.toLink(input, "trade-route-ribbon"));
  assert.equal(back.scenario, "trade-route-ribbon");
  assert.equal(G.toXml(G.validate(back.input).preset), G.toXml(G.validate(input).preset));
  const plain = G.fromLink("#" + G.toLink(fullWorld));
  assert.equal(plain.input.aspect, null);
  assert.equal(G.toXml(G.validate(plain.input).preset), G.toXml(valid({}).preset));
  assert.equal(G.fromLink("#v=2&seed=1"), null);
});

// Values logged by Scrambled Seas 7.3.1 in game.
test("placement matches the game's completion value", () => {
  const preset = { worldScramblerSeed: -758648672, islandSpread: 10000, minArchipelagoSeparation: 15000, minIslandSeparation: 3000,
    worldLonMin: -1, worldLonMax: 21, worldLatMin: 28, worldLatMax: 43 };
  assert.equal(G.placeWorld(preset).completionValue, 313089);
});

test("placement matches island positions the game logged", () => {
  const preset = { worldScramblerSeed: 285517274, islandSpread: 27000, minArchipelagoSeparation: 246000, minIslandSeparation: 8100,
    worldLonMin: -180, worldLonMax: 180, worldLatMin: -70, worldLatMax: 70 };
  const logged = { 1: [-56.82849, 16.43766], 2: [-61.53251, 15.96677], 9: [-151.6746, 61.83257], 15: [171.4123, 25.76805],
    18: [-6.169876, -43.79114], 20: [99.71918, -20.73847], 25: [26.61874, 59.5544], 26: [-90.74457, -56.1531], 30: [-3.30404, -41.44344], 32: [50.46475, 50.15862] };
  const placed = G.placeWorld(preset);
  for (const [a, info] of Object.entries(G.ARCHIPELAGO_ISLANDS)) {
    info.islands.forEach((island, i) => {
      if (!logged[island]) return;
      const p = placed.islands[a][i];
      assert.ok(Math.abs(p.lon - logged[island][0]) < 0.1 && Math.abs(p.lat - logged[island][1]) < 0.1, `island ${island}: ${JSON.stringify(p)}`);
    });
  }
});

test("seed rules keep trying seeds until the world meets them", () => {
  const p = valid({ worldScale: 8.2 }).preset;
  let next = 0;
  const found = G.findSeed(p, { minStartNm: 1200 }, () => ++next, 5000);
  assert.equal(found.met, true);
  assert.ok(G.describeWorld(G.placeWorld({ ...p, worldScramblerSeed: found.seed })).startNearestDeg * 60 >= 1200);
  const impossible = G.findSeed(p, { minStartNm: 100000 }, () => ++next, 50);
  assert.equal(impossible.met, false);
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

test("island spread is capped so islands stay inside the bounds", () => {
  const r = valid({ islandScale: G.ISLAND_SCALE_MAX });
  assert.equal(r.ok, true);
  assert.ok(r.preset.islandSpread <= G.BORDER_INSET_UNITS);
  assert.equal(valid({ islandScale: G.ISLAND_SCALE_MAX + 0.1 }).ok, false);
});

test("rejects slider values out of range", () => {
  for (const s of [0.4, NaN]) assert.equal(valid({ islandScale: s }).ok, false);
  for (const s of [0.4, NaN]) assert.equal(valid({ worldScale: s }).ok, false);
});

test("rejects seed 0, fractional seeds and seeds outside 32 bits", () => {
  for (const seed of [0, 1.5, 2147483648, -2147483649, NaN]) assert.equal(valid({ seed }).ok, false, String(seed));
});

test("file name uses the seed and the scenario", () => {
  assert.equal(G.fileName(-42), "scrambled-seas--42.xml");
  assert.equal(G.fileName(7, "far-north"), "scrambled-seas-far-north-7.xml");
});
