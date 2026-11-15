// Builds Scrambled Seas world preset XML files. Works as a classic browser script and in Node.
(function (root) {
  "use strict";

  // Scrambled Seas save format number (WorldScrambler.version). Update when Scrambled Seas changes it.
  const FORMAT_VERSION = 60;

  // Scrambled Seas 1x defaults (Main.cs).
  const DEFAULT_ARCHIPELAGO_SEPARATION = 30000;
  const DEFAULT_ISLAND_SPREAD = 5000;
  const DEFAULT_ISLAND_SEPARATION = 1500;

  // Scrambled Seas' 1x world without Border Expander is 44 by 20 degrees; nothing smaller is accepted,
  // for the area limits or for the world itself.
  const MIN_LON_SPAN = 44;
  const MIN_LAT_SPAN = 20;

  // Border Expander's Free Sailing limits: 70°S to 70°N, wrapping east/west at 180°.
  const LIMITS = {
    lonMin: [-180, 180], lonMax: [-180, 180],
    latMin: [-70, 70], latMax: [-70, 70],
  };
  const SCALE_MIN = 0.5;
  const ARCH_SPACING_MIN = 0.3;
  const ISLAND_SPACING_MIN = 0.5;
  // World shape is width:height in degrees. The default is the 1x world's 44:30.
  const ASPECT_MIN = 0.3;
  const ASPECT_MAX = 18;

  // WorldScrambler.Scramble() geometry: 9000 units per degree, archipelago centres are kept 27000 units
  // inside the bounds on every side, and z is measured from 36°N.
  const UNITS_PER_DEGREE = 9000;
  const BORDER_INSET_UNITS = 27000;
  const LAT_ORIGIN = 36;
  const ARCHIPELAGOS = 15;
  const ISLANDS_PER_ARCHIPELAGO = 15;
  const NM_PER_DEGREE = 60;

  // Islands sit up to islandSpread from their archipelago's centre, so a spread no larger than the
  // inset keeps every island inside the bounds.
  const ISLAND_SCALE_MAX = BORDER_INSET_UNITS / DEFAULT_ISLAND_SPREAD;

  const INT32_MIN = -2147483648;
  const INT32_MAX = 2147483647;

  function randomSeed(getRandomValues) {
    const fill = getRandomValues || ((a) => root.crypto.getRandomValues(a));
    const value = new Int32Array(1);
    do { fill(value); } while (value[0] === 0);
    return value[0];
  }

  // Scrambled Seas places points at random and retries forever until every pair is far enough apart, so a
  // crowded setting freezes the game. It does this once for the 15 archipelagos, then once per archipelago
  // for its 15 islands. crowding() estimates how hard one try is to pass (log of the chance it passes;
  // lower is harder).
  function pairCloseChance(w, h, d) {
    // Chance two random points in a w by h box are closer than d (Simpson's rule over x distance).
    const yPart = (t) => { const m = Math.min(t, h); return (m * h - m * m / 2) / (h * h); };
    const top = Math.min(d, w), n = 200;
    let sum = 0;
    for (let i = 0; i <= n; i++) {
      const u = (top * i) / n;
      const weight = i === 0 || i === n ? 1 : i % 2 ? 4 : 2;
      sum += weight * ((w - u) / (w * w)) * yPart(Math.sqrt(Math.max(0, d * d - u * u)));
    }
    return (4 * sum * top) / (3 * n);
  }

  function crowding(w, h, separation, count) {
    const q = pairCloseChance(w, h, separation);
    let log = 0;
    for (let k = 1; k < count; k++) {
      if (k * q >= 1) return -Infinity;
      log += Math.log(1 - k * q);
    }
    return log;
  }

  function archCrowding(lonSpan, latSpan, separation) {
    const w = lonSpan * UNITS_PER_DEGREE - 2 * BORDER_INSET_UNITS;
    const h = latSpan * UNITS_PER_DEGREE - 2 * BORDER_INSET_UNITS;
    return crowding(w, h, separation, ARCHIPELAGOS);
  }

  function islandCrowding(spread, separation) {
    return crowding(2 * spread, 2 * spread, separation, ISLANDS_PER_ARCHIPELAGO);
  }

  // Scrambled Seas' own 1x settings are the reference: spacing is allowed up to the point where placement
  // is as hard as it is there.
  const REFERENCE_CROWDING = archCrowding(MIN_LON_SPAN, MIN_LAT_SPAN, DEFAULT_ARCHIPELAGO_SEPARATION);
  const ISLAND_REFERENCE_CROWDING = islandCrowding(DEFAULT_ISLAND_SPREAD, DEFAULT_ISLAND_SEPARATION);

  function largestFitting(fits) {
    let lo = 0, hi = 100;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) lo = mid; else hi = mid;
    }
    return lo;
  }

  function maxArchipelagoScale(lonSpan, latSpan) {
    return largestFitting((s) => archCrowding(lonSpan, latSpan, DEFAULT_ARCHIPELAGO_SEPARATION * s) >= REFERENCE_CROWDING - 1e-9);
  }

  // Island crowding only depends on spacing relative to spread, so the limit is one ratio. At the 1x
  // ratio it is exactly the reference, so spacing that follows the spread always fits.
  const ISLAND_SPACING_RATIO_MAX = largestFitting((r) =>
    islandCrowding(DEFAULT_ISLAND_SPREAD, DEFAULT_ISLAND_SEPARATION * r) >= ISLAND_REFERENCE_CROWDING - 1e-9);

  function maxIslandSpacing(islandScale) {
    return Math.max(islandScale, islandScale * ISLAND_SPACING_RATIO_MAX);
  }

  // Scrambled Seas places 15 archipelago positions but only these hold islands, listed in the order
  // their islands take positions (WorldScrambler.GenerateDefs, written to regions.json on first run).
  const ARCHIPELAGO_ISLANDS = {
    0: { name: "Al'ankh", islands: [1, 2, 3, 4, 5, 6, 7, 8, 40] },
    1: { name: "Emerald", islands: [9, 10, 11, 12, 13, 22, 37, 38, 39] },
    2: { name: "Aestrin", islands: [15, 16, 17, 19, 21, 23, 33, 34, 35, 36] },
    3: { name: "Oasis", islands: [20, 41, 42] },
    4: { name: "Happy Bay", islands: [18, 30] },
    5: { name: "Chronos", islands: [25] },
    6: { name: "Fire Fish Lagoon", islands: [26, 27, 28, 29, 31] },
    8: { name: "Hideout", islands: [32] },
  };
  const OCCUPIED_ARCHIPELAGOS = Object.keys(ARCHIPELAGO_ISLANDS).map(Number);
  // The new-game screen starts you at Al'ankh, Emerald or Aestrin.
  const START_ARCHIPELAGOS = [0, 1, 2];
  const LARGEST_ARCHIPELAGO = 2;

  // UnityEngine.Random as Scrambled Seas uses it: xorshift128 seeded by InitState, Range(float, float)
  // as t * min + (1 - t) * max in single precision, and Range(int, int) as min + next % (max - min).
  // Checked against the game: it reproduces logged completion values and island positions.
  const f32 = Math.fround;
  function unityRandom(seed) {
    let x = seed >>> 0;
    let y = (Math.imul(x, 1812433253) + 1) >>> 0;
    let z = (Math.imul(y, 1812433253) + 1) >>> 0;
    let w = (Math.imul(z, 1812433253) + 1) >>> 0;
    const next = () => {
      const t = (x ^ (x << 11)) >>> 0;
      x = y; y = z; z = w;
      w = (w ^ (w >>> 19) ^ t ^ (t >>> 8)) >>> 0;
      return w;
    };
    return {
      range(min, max) {
        const t = f32((next() & 0x7fffff) / 8388607);
        return f32(f32(t * min) + f32(f32(1 - t) * max));
      },
      rangeInt(min, max) { return min + (next() % (max - min)); },
    };
  }

  // CheckScramble: every pair at least minDist apart (Vector3.Distance in single precision).
  function allApart(xs, zs, minDist) {
    for (let i = 0; i < xs.length; i++) {
      for (let j = i + 1; j < xs.length; j++) {
        const dx = f32(xs[i] - xs[j]), dz = f32(zs[i] - zs[j]);
        if (f32(Math.sqrt(f32(f32(dx * dx) + f32(dz * dz)))) < minDist) return false;
      }
    }
    return true;
  }

  // WorldScrambler.Scramble's placement for a preset. Returns archipelago and island positions in degrees
  // ({ lon, lat }), the completion value Scrambled Seas logs, or null when it would take more than maxTries
  // tries in total (the game would still get there; this only bounds the page).
  function placeWorld(p, maxTries) {
    const budget = maxTries || 2000000;
    const rand = unityRandom(p.worldScramblerSeed);
    const xMin = f32(p.worldLonMin * UNITS_PER_DEGREE + BORDER_INSET_UNITS), xMax = f32(p.worldLonMax * UNITS_PER_DEGREE - BORDER_INSET_UNITS);
    const zMin = f32((p.worldLatMin - LAT_ORIGIN) * UNITS_PER_DEGREE + BORDER_INSET_UNITS);
    const zMax = f32((p.worldLatMax - LAT_ORIGIN) * UNITS_PER_DEGREE - BORDER_INSET_UNITS);
    const ax = new Float64Array(ARCHIPELAGOS), az = new Float64Array(ARCHIPELAGOS);
    let tries = 0;
    for (;;) {
      if (++tries > budget) return null;
      for (let i = 0; i < ARCHIPELAGOS; i++) { ax[i] = rand.range(xMin, xMax); az[i] = rand.range(zMin, zMax); }
      if (allApart(ax, az, p.minArchipelagoSeparation)) break;
    }
    const spread = p.islandSpread;
    const ix = new Float64Array(ISLANDS_PER_ARCHIPELAGO), iz = new Float64Array(ISLANDS_PER_ARCHIPELAGO);
    const islands = [];
    for (let a = 0; a < ARCHIPELAGOS;) {
      if (++tries > budget) return null;
      for (let j = 0; j < ISLANDS_PER_ARCHIPELAGO; j++) {
        ix[j] = f32(rand.range(-spread, spread) + ax[a]);
        iz[j] = f32(rand.range(-spread, spread) + az[a]);
      }
      if (allApart(ix, iz, p.minIslandSeparation)) {
        islands.push(Array.from(ix, (x, j) => toDegrees(x, iz[j])));
        a++;
      }
    }
    return {
      archipelagos: Array.from(ax, (x, i) => toDegrees(x, az[i])),
      islands,
      completionValue: rand.rangeInt(0, 1000000),
    };
  }

  function toDegrees(x, z) { return { lon: x / UNITS_PER_DEGREE, lat: z / UNITS_PER_DEGREE + LAT_ORIGIN }; }

  // Border Expander wraps east/west at 180°, so the short way round counts.
  function distanceDeg(a, b) {
    const dLon = Math.abs(a.lon - b.lon);
    return Math.hypot(Math.min(dLon, 360 - dLon), a.lat - b.lat);
  }

  // Facts about a placed world: nearest-neighbour distances between archipelagos that hold islands, how far
  // each starting archipelago is from its nearest neighbour, and the closest pair of islands from different
  // archipelagos (only islands that exist).
  function describeWorld(placed) {
    const nearest = (i) => Math.min(...OCCUPIED_ARCHIPELAGOS.filter((j) => j !== i).map((j) => distanceDeg(placed.archipelagos[i], placed.archipelagos[j])));
    const gaps = OCCUPIED_ARCHIPELAGOS.map(nearest);
    let closestIslandsDeg = Infinity;
    for (const a of OCCUPIED_ARCHIPELAGOS) {
      for (const b of OCCUPIED_ARCHIPELAGOS) {
        if (b <= a) continue;
        for (let i = 0; i < ARCHIPELAGO_ISLANDS[a].islands.length; i++) {
          for (let j = 0; j < ARCHIPELAGO_ISLANDS[b].islands.length; j++) {
            closestIslandsDeg = Math.min(closestIslandsDeg, distanceDeg(placed.islands[a][i], placed.islands[b][j]));
          }
        }
      }
    }
    return {
      nearestAverageDeg: gaps.reduce((s, g) => s + g, 0) / gaps.length,
      nearestMinDeg: Math.min(...gaps),
      startNearestDeg: Math.min(...START_ARCHIPELAGOS.map(nearest)),
      closestIslandsDeg,
    };
  }

  function isInt(v) { return typeof v === "number" && Number.isInteger(v); }
  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }
  const given = (v) => v !== undefined && v !== null;

  // Scrambled Seas' world scale with Border Expander (ScrambleMenu.SetWorldScale, v7.3.1): the 1x world is
  // 44 by 30 degrees centred on 10°E 36°N, and both its size and the minimum archipelago spacing grow with the
  // scale, from 0.5x. Here the shape and centre can change too, and the world stays inside the player's limits:
  // each side stops growing at a limit and the world shifts to fit.
  const WORLD_BASE = { lon: 44, lat: 30 };
  const VANILLA_CENTER = { lon: 10, lat: 36 };
  const WORLD_SCALE_MIN = 0.5;
  // The game's 0.5x world. A custom shape never makes either side smaller than this.
  const MIN_WORLD = { lon: 22, lat: 15 };

  // Size of the world at 1x for a shape. The default shape is exactly the base, so old settings don't move.
  function baseSize(aspect) {
    if (!given(aspect)) return WORLD_BASE;
    const area = WORLD_BASE.lon * WORLD_BASE.lat;
    return { lon: Math.sqrt(area * aspect), lat: Math.sqrt(area / aspect) };
  }

  function maxWorldScale(lonSpan, latSpan, aspect) {
    const base = baseSize(aspect);
    return Math.max(WORLD_SCALE_MIN, Math.max(lonSpan / base.lon, latSpan / base.lat));
  }

  // The world before the player's limits, as SetWorldScale builds it in single precision: a Rect of the scaled
  // size centred on the centre, moved down when its top passes 70°N, each edge cast to int (towards zero).
  function gameRect(scale, aspect, center) {
    const base = baseSize(aspect);
    const c = { lon: given(center && center.lon) ? center.lon : VANILLA_CENTER.lon, lat: given(center && center.lat) ? center.lat : VANILLA_CENTER.lat };
    const s = f32(scale);
    const w = Math.max(f32(base.lon * s), MIN_WORLD.lon), h = Math.max(f32(base.lat * s), MIN_WORLD.lat);
    const x = f32(c.lon - f32(w * 0.5));
    let y = f32(c.lat - f32(h * 0.5));
    if (f32(y + h) > 70) y = f32(y - f32(f32(y + h) - 70));
    return { lonMin: Math.trunc(x), lonMax: Math.trunc(f32(x + w)), latMin: Math.trunc(y), latMax: Math.trunc(f32(y + h)) };
  }

  function worldRect(limits, scale, aspect, center) {
    const r = gameRect(scale, aspect, center);
    const fit = (lo, hi, min, max) => {
      const span = Math.min(hi - lo, max - min);
      const start = Math.min(Math.max(lo, min), max - span);
      return [start, start + span];
    };
    const [lonMin, lonMax] = fit(r.lonMin, r.lonMax, limits.lonMin, limits.lonMax);
    const [latMin, latMax] = fit(r.latMin, r.latMax, limits.latMin, limits.latMax);
    return { lonMin, lonMax, latMin, latMax };
  }

  // Returns { ok: true, preset, world, trimmed, archSpacing, archSpacingMax, spacingLimited, islandSpacing,
  // islandSpacingMax } or { ok: false, errors: [...] }.
  // input: lonMin, lonMax, latMin, latMax (the limits), worldScale, aspect, centerLon, centerLat,
  // archSpacing, islandScale, islandSpacing, seed. aspect, centre and both spacings are optional; leaving
  // them out gives the 1.0.0 behaviour (spacing follows world scale and island spread).
  function validate(input) {
    const errors = [];
    const names = { lonMin: "Minimum longitude", lonMax: "Maximum longitude", latMin: "Minimum latitude", latMax: "Maximum latitude" };
    for (const key of Object.keys(LIMITS)) {
      const [lo, hi] = LIMITS[key];
      const v = input[key];
      if (!isInt(v)) errors.push(`${names[key]} must be a whole number.`);
      else if (v < lo || v > hi) errors.push(`${names[key]} must be between ${lo} and ${hi}.`);
    }
    const lonSpan = input.lonMax - input.lonMin, latSpan = input.latMax - input.latMin;
    if (errors.length === 0) {
      if (lonSpan < MIN_LON_SPAN) errors.push(`Longitude limits must span at least ${MIN_LON_SPAN} degrees.`);
      if (latSpan < MIN_LAT_SPAN) errors.push(`Latitude limits must span at least ${MIN_LAT_SPAN} degrees.`);
    }

    if (given(input.aspect) && (!isNum(input.aspect) || input.aspect < ASPECT_MIN - 1e-9 || input.aspect > ASPECT_MAX + 1e-9)) {
      errors.push(`World shape must be between ${ASPECT_MIN}:1 and ${ASPECT_MAX}:1.`);
    }
    if (given(input.centerLon) && (!isNum(input.centerLon) || input.centerLon < -180 || input.centerLon > 180)) {
      errors.push("World centre longitude must be between -180 and 180.");
    }
    if (given(input.centerLat) && (!isNum(input.centerLat) || input.centerLat < -70 || input.centerLat > 70)) {
      errors.push("World centre latitude must be between -70 and 70.");
    }

    const islandOk = isNum(input.islandScale) && input.islandScale >= SCALE_MIN && input.islandScale <= ISLAND_SCALE_MAX + 1e-9;
    if (!islandOk) errors.push(`Island spread must be between ${SCALE_MIN}x and ${ISLAND_SCALE_MAX}x.`);
    const islandSpacingMax = islandOk ? floorTenthNum(maxIslandSpacing(input.islandScale)) : NaN;
    if (given(input.islandSpacing) && islandOk) {
      if (!isNum(input.islandSpacing) || input.islandSpacing < ISLAND_SPACING_MIN - 1e-9) {
        errors.push(`Island spacing must be at least ${ISLAND_SPACING_MIN}x.`);
      } else if (input.islandSpacing > islandSpacingMax + 1e-9) {
        errors.push(`Island spacing can be at most ${islandSpacingMax.toFixed(1)}x for this island spread.`);
      }
    }

    if (!isNum(input.worldScale) || input.worldScale < WORLD_SCALE_MIN - 1e-9) {
      errors.push(`World scale must be at least ${WORLD_SCALE_MIN}x.`);
    } else if (errors.length === 0 && input.worldScale > ceilTenth(maxWorldScale(lonSpan, latSpan, input.aspect)) + 1e-9) {
      errors.push(`World scale can be at most ${ceilTenth(maxWorldScale(lonSpan, latSpan, input.aspect)).toFixed(1)}x for these limits and shape.`);
    }

    if (!isInt(input.seed) || input.seed < INT32_MIN || input.seed > INT32_MAX) errors.push(`Seed must be a whole number between ${INT32_MIN} and ${INT32_MAX}.`);
    else if (input.seed === 0) errors.push("Seed cannot be 0.");

    if (errors.length) return { ok: false, errors };

    const world = worldRect(input, input.worldScale, input.aspect, { lon: input.centerLon, lat: input.centerLat });
    const worldLon = world.lonMax - world.lonMin, worldLat = world.latMax - world.latMin;
    const untrimmed = gameRect(input.worldScale, input.aspect, { lon: input.centerLon, lat: input.centerLat });
    const trimmed = worldLon < untrimmed.lonMax - untrimmed.lonMin || worldLat < untrimmed.latMax - untrimmed.latMin;

    // Spacing never goes so far that the archipelagos can't fit (that would freeze the game). Auto follows the
    // world scale up to that point.
    const fits = maxArchipelagoScale(worldLon, worldLat);
    const archSpacingMax = Math.max(ARCH_SPACING_MIN, floorTenthNum(fits));
    let archSpacing;
    if (given(input.archSpacing)) {
      if (!isNum(input.archSpacing) || input.archSpacing < ARCH_SPACING_MIN - 1e-9) {
        return { ok: false, errors: [`Archipelago spacing must be at least ${ARCH_SPACING_MIN}x.`] };
      }
      if (input.archSpacing > archSpacingMax + 1e-9) {
        return { ok: false, errors: [`Archipelago spacing can be at most ${archSpacingMax.toFixed(1)}x for this world.`] };
      }
      archSpacing = Math.min(input.archSpacing, fits);
    } else {
      archSpacing = Math.min(input.worldScale, fits);
    }
    const islandSpacing = given(input.islandSpacing) ? input.islandSpacing : input.islandScale;

    return {
      ok: true,
      world,
      trimmed,
      archSpacing,
      archSpacingMax,
      spacingLimited: !given(input.archSpacing) && archSpacing < input.worldScale,
      islandSpacing,
      islandSpacingMax,
      preset: {
        version: FORMAT_VERSION,
        worldScramblerSeed: input.seed,
        // Rounded so tenth-step scales give exact values (30000 * 2.3 is 68999.999... in floating point).
        islandSpread: Math.round(DEFAULT_ISLAND_SPREAD * input.islandScale),
        minArchipelagoSeparation: Math.floor(DEFAULT_ARCHIPELAGO_SEPARATION * archSpacing + 1e-6),
        minIslandSeparation: Math.round(DEFAULT_ISLAND_SEPARATION * islandSpacing),
        worldLonMin: world.lonMin,
        worldLonMax: world.lonMax,
        worldLatMin: world.latMin,
        worldLatMax: world.latMax,
        borderExpander: 1,
      },
    };
  }

  function ceilTenth(v) { return Math.ceil(v * 10 - 1e-6) / 10; }
  function floorTenthNum(v) { return Math.floor(v * 10 + 1e-6) / 10; }
  function floorTenth(v) { return floorTenthNum(v).toFixed(1); }

  // Scenarios: ranges that Roll picks from. Each lever is optional; a missing one goes back to its default
  // (vanilla centre and shape, spacing that follows scale and spread). Ranges may depend on the limits:
  // ctx has lonMin..latMax, lonSpan, latSpan and maxScale(aspect). archSpacing and islandSpacing are
  // fractions of the most that fits; aspect is picked on a log scale.
  const ANY_LON = (ctx) => [ctx.lonMin, ctx.lonMax];
  const SCENARIOS = [
    { id: "sprawling-isles", name: "Sprawling Isles", description: "A small world where every archipelago spreads its islands as far as it can.",
      worldScale: [0.7, 1.6], islandScale: [3.5, ISLAND_SCALE_MAX], archSpacing: [0.9, 1], islandSpacing: [0.7, 1] },
    { id: "lonely-specks", name: "Lonely Specks", description: "A huge world with tight little archipelagos far apart.",
      worldScale: (ctx) => [Math.min(5, ctx.maxScale()), ctx.maxScale()], islandScale: [0.5, 0.8], archSpacing: [0.85, 1], islandSpacing: [0.6, 1] },
    { id: "crowded-harbours", name: "Crowded Harbours", description: "Islands packed close together inside each archipelago, in a small to medium world.",
      worldScale: [0.5, 3], islandScale: [0.5, 1], islandSpacing: [0.5, 0.7] },
    { id: "trade-route-ribbon", name: "Trade Route Ribbon", description: "A long, thin band of sea stretched around the globe at a random latitude.",
      aspect: [9, 16], worldScale: (ctx, aspect) => { const s = Math.min(ctx.maxScale(aspect), ceilTenth(ctx.lonSpan / baseSize(aspect).lon)); return [s, s]; },
      centerLat: [-50, 55], centerLon: ANY_LON },
    { id: "chaos", name: "Chaos", description: "Fully random generation.",
      aspect: [ASPECT_MIN, ASPECT_MAX], worldScale: (ctx, aspect) => [WORLD_SCALE_MIN, ctx.maxScale(aspect)], centerLat: [-70, 70], centerLon: ANY_LON,
      archSpacing: [0.1, 1], islandScale: [SCALE_MIN, ISLAND_SCALE_MAX], islandSpacing: [0.5, 1] },
  ];

  // Rolls a scenario. limits: lonMin..latMax. current: the current settings (used for locked levers).
  // locks: { worldScale, aspect, center, archSpacing, islandScale, islandSpacing } booleans.
  // rand: () => [0, 1). Returns settings in validate()'s shape, without the seed, already within range.
  // Locked settings are kept as they are: the unlocked ones are rolled again until they fit around them.
  // Returns null when 60 tries found nothing that fits, so the caller can leave everything as it is.
  const LOCK_KEYS = { worldScale: ["worldScale"], aspect: ["aspect"], center: ["centerLon", "centerLat"], archSpacing: ["archSpacing"],
    islandScale: ["islandScale"], islandSpacing: ["islandSpacing"] };
  function rollScenario(id, limits, current, locks, rand) {
    const lk = locks || {}, cur = current || {};
    const kept = (out) => Object.keys(LOCK_KEYS).every((k) => !lk[k] || LOCK_KEYS[k].every((key) => (out[key] ?? null) === (cur[key] ?? null)));
    for (let i = 0; i < 60; i++) {
      const out = rollOnce(id, limits, cur, lk, rand);
      if (kept(out)) return out;
    }
    return null;
  }

  function rollOnce(id, limits, cur, lk, rand) {
    const sc = SCENARIOS.find((s) => s.id === id);
    if (!sc) throw new Error(`Unknown scenario ${id}`);
    const ctx = { ...limits, lonSpan: limits.lonMax - limits.lonMin, latSpan: limits.latMax - limits.latMin };
    ctx.maxScale = (aspect) => floorTenthNum(maxWorldScale(ctx.lonSpan, ctx.latSpan, aspect));
    const range = (r, ...args) => (typeof r === "function" ? r(ctx, ...args) : r);
    const pick = ([lo, hi]) => lo + (hi - lo) * rand();
    const tenth = (v) => Math.round(v * 10) / 10;
    const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
    // A tenth-step value within a fraction range of max, never below floor.
    const pickFraction = ([a, b], max, floor) => {
      const lo = Math.max(floor, Math.ceil(a * max * 10 - 1e-9) / 10), hi = Math.floor(b * max * 10 + 1e-9) / 10;
      return hi <= lo ? Math.min(Math.max(lo, floor), max) : tenth(pick([lo, hi]));
    };

    const out = {};
    if (lk.aspect) out.aspect = cur.aspect;
    else if (sc.aspect) { const [lo, hi] = range(sc.aspect); out.aspect = tenth(Math.exp(pick([Math.log(lo), Math.log(hi)]))); }
    else out.aspect = null;

    const maxScale = Math.max(1, ctx.maxScale(out.aspect));
    if (lk.worldScale) out.worldScale = cur.worldScale;
    else out.worldScale = sc.worldScale ? clamp(tenth(pick(range(sc.worldScale, out.aspect))), WORLD_SCALE_MIN, maxScale) : 1;
    if (lk.worldScale && out.worldScale > maxScale) out.worldScale = maxScale;

    if (lk.center) { out.centerLon = cur.centerLon; out.centerLat = cur.centerLat; }
    else {
      out.centerLon = sc.centerLon ? Math.round(pick(range(sc.centerLon))) : null;
      out.centerLat = sc.centerLat ? Math.round(pick(range(sc.centerLat))) : null;
    }

    if (lk.islandScale) out.islandScale = cur.islandScale;
    else out.islandScale = sc.islandScale ? clamp(tenth(pick(range(sc.islandScale))), SCALE_MIN, ISLAND_SCALE_MAX) : 1;

    if (lk.islandSpacing) out.islandSpacing = given(cur.islandSpacing) ? Math.min(cur.islandSpacing, floorTenthNum(maxIslandSpacing(out.islandScale))) : null;
    else if (sc.islandSpacing) {
      const max = floorTenthNum(maxIslandSpacing(out.islandScale));
      out.islandSpacing = pickFraction(range(sc.islandSpacing), max, Math.min(ISLAND_SPACING_MIN, max));
    } else out.islandSpacing = null;

    const world = worldRect(limits, out.worldScale, out.aspect, { lon: out.centerLon, lat: out.centerLat });
    const archMax = Math.max(ARCH_SPACING_MIN, floorTenthNum(maxArchipelagoScale(world.lonMax - world.lonMin, world.latMax - world.latMin)));
    if (lk.archSpacing) out.archSpacing = given(cur.archSpacing) ? Math.min(cur.archSpacing, archMax) : null;
    else if (sc.archSpacing) out.archSpacing = pickFraction(range(sc.archSpacing), archMax, ARCH_SPACING_MIN);
    else out.archSpacing = null;
    return out;
  }

  // Seed rules for New seed and Roll. Tries seeds until the world meets them or the time runs out.
  // rules: { keepApart: islands from different archipelagos at least the island spacing apart,
  // minStartNm: each starting archipelago at least this far from its nearest neighbour }.
  // Returns { seed, met, tries }.
  function findSeed(preset, rules, nextSeed, timeLimitMs, now) {
    const clock = now || (() => Date.now());
    const end = clock() + (timeLimitMs || 1500);
    const wanted = (p) => {
      if (!rules || (!rules.keepApart && !rules.minStartNm)) return true;
      const placed = placeWorld(p, 200000);
      if (!placed) return false;
      const d = describeWorld(placed);
      if (rules.keepApart && d.closestIslandsDeg * UNITS_PER_DEGREE < p.minIslandSeparation) return false;
      if (rules.minStartNm && d.startNearestDeg * NM_PER_DEGREE < rules.minStartNm) return false;
      return true;
    };
    let seed, tries = 0;
    do {
      seed = nextSeed();
      tries++;
      if (wanted({ ...preset, worldScramblerSeed: seed })) return { seed, met: true, tries };
    } while (clock() < end);
    return { seed, met: false, tries };
  }

  // Share links: the settings that define the file, plus the scenario name, in the URL hash.
  const LINK_KEYS = [
    ["lonMin", "lo1"], ["lonMax", "lo2"], ["latMin", "la1"], ["latMax", "la2"], ["worldScale", "ws"], ["aspect", "sh"],
    ["centerLon", "cx"], ["centerLat", "cy"], ["archSpacing", "as"], ["islandScale", "is"], ["islandSpacing", "isp"], ["seed", "seed"],
  ];
  function toLink(input, scenario) {
    const parts = ["v=1"];
    for (const [key, short] of LINK_KEYS) if (given(input[key])) parts.push(`${short}=${input[key]}`);
    if (scenario) parts.push(`sc=${encodeURIComponent(scenario)}`);
    return parts.join("&");
  }
  function fromLink(hash) {
    const params = new URLSearchParams(String(hash || "").replace(/^#/, ""));
    if (params.get("v") !== "1") return null;
    const input = {};
    for (const [key, short] of LINK_KEYS) {
      const v = params.has(short) ? Number(params.get(short)) : null;
      input[key] = Number.isFinite(v) ? v : null;
    }
    return { input, scenario: params.get("sc") || null };
  }

  // Same element order and layout .NET's XmlSerializer writes for ScrambledSeasSaveContainer.
  // Every value is an integer, so nothing needs escaping. Empty offset arrays make Scrambled Seas
  // regenerate the world from the seed when a new game starts.
  function toXml(p) {
    const lines = [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<ScrambledSeasSaveContainer xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">',
    ];
    for (const key of ["version", "worldScramblerSeed", "islandSpread", "minArchipelagoSeparation", "minIslandSeparation",
      "worldLonMin", "worldLonMax", "worldLatMin", "worldLatMax", "borderExpander"]) {
      lines.push(`  <${key}>${String(p[key])}</${key}>`);
    }
    lines.push("  <archOffsets />", "  <islandOffsets />", "</ScrambledSeasSaveContainer>");
    return lines.join("\r\n");
  }

  function fileName(seed, scenario) { return scenario ? `scrambled-seas-${scenario}-${seed}.xml` : `scrambled-seas-${seed}.xml`; }

  const api = {
    FORMAT_VERSION, DEFAULT_ARCHIPELAGO_SEPARATION, DEFAULT_ISLAND_SPREAD, DEFAULT_ISLAND_SEPARATION,
    MIN_LON_SPAN, MIN_LAT_SPAN, WORLD_BASE, VANILLA_CENTER, WORLD_SCALE_MIN, LIMITS, SCALE_MIN, ISLAND_SCALE_MAX, ARCH_SPACING_MIN, ISLAND_SPACING_MIN,
    ASPECT_MIN, ASPECT_MAX, UNITS_PER_DEGREE, BORDER_INSET_UNITS, ARCHIPELAGOS, NM_PER_DEGREE,
    ARCHIPELAGO_ISLANDS, OCCUPIED_ARCHIPELAGOS, START_ARCHIPELAGOS, LARGEST_ARCHIPELAGO, SCENARIOS,
    randomSeed, maxArchipelagoScale, maxIslandSpacing, maxWorldScale, baseSize, worldRect, floorTenth, ceilTenth, validate,
    unityRandom, placeWorld, describeWorld, rollScenario, findSeed, toLink, fromLink, toXml, fileName,
  };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ScrambledSeasPreset = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
