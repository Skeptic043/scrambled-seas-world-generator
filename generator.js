// Builds Scrambled Seas world preset XML files. Works as a classic browser script and in Node.
(function (root) {
  "use strict";

  // Scrambled Seas save format number (WorldScrambler.version). Update when Scrambled Seas changes it.
  const FORMAT_VERSION = 60;

  // Scrambled Seas 1x defaults (Main.cs).
  const DEFAULT_ARCHIPELAGO_SEPARATION = 30000;
  const DEFAULT_ISLAND_SPREAD = 5000;
  const DEFAULT_ISLAND_SEPARATION = 1500;

  // Scrambled Seas' 1x world without Border Expander is 44 by 20 degrees; nothing smaller is accepted.
  const MIN_LON_SPAN = 44;
  const MIN_LAT_SPAN = 20;

  // Border Expander's Free Sailing limits: 70°S to 70°N, wrapping east/west at 180°.
  const LIMITS = {
    lonMin: [-180, 180], lonMax: [-180, 180],
    latMin: [-70, 70], latMax: [-70, 70],
  };
  const SCALE_MIN = 0.5;

  // WorldScrambler.Scramble() geometry: 9000 units per degree, and archipelago centres are kept
  // 27000 units inside the bounds on every side.
  const UNITS_PER_DEGREE = 9000;
  const BORDER_INSET_UNITS = 27000;
  const ARCHIPELAGOS = 15;

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

  // Scrambled Seas places all 15 archipelagos at random and retries forever until every pair is at
  // least minArchipelagoSeparation apart, so a crowded world freezes the game. crowding() estimates
  // how hard one placement try is to pass (log of the chance it passes; lower is harder).
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

  function crowding(lonSpan, latSpan, separation) {
    const w = lonSpan * UNITS_PER_DEGREE - 2 * BORDER_INSET_UNITS;
    const h = latSpan * UNITS_PER_DEGREE - 2 * BORDER_INSET_UNITS;
    const q = pairCloseChance(w, h, separation);
    let log = 0;
    for (let k = 1; k < ARCHIPELAGOS; k++) {
      if (k * q >= 1) return -Infinity;
      log += Math.log(1 - k * q);
    }
    return log;
  }

  // Scrambled Seas' own 1x world is the reference: spacing is allowed up to the point where placement
  // is as hard as it is there.
  const REFERENCE_CROWDING = crowding(MIN_LON_SPAN, MIN_LAT_SPAN, DEFAULT_ARCHIPELAGO_SEPARATION);

  function spacingFits(lonSpan, latSpan, scale) {
    return crowding(lonSpan, latSpan, DEFAULT_ARCHIPELAGO_SEPARATION * scale) >= REFERENCE_CROWDING - 1e-9;
  }

  // Scrambled Seas places 15 archipelago positions but only these hold islands (WorldScrambler.GenerateDefs):
  // Al'ankh 9, Emerald 9, Aestrin 10, Oasis 3, Happy Bay 2, Chronos 1, Fire Fish Lagoon 5, Hideout 1.
  const OCCUPIED_ARCHIPELAGOS = [0, 1, 2, 3, 4, 5, 6, 8];
  const LARGEST_ARCHIPELAGO_ISLANDS = 10;

  // Typical layout, for the preview only: runs the game's placement steps with a fixed internal generator
  // (not the player's seed) and averages, over the archipelagos that hold islands, the distance from each
  // to its nearest such neighbour. Returns game units.
  function typicalSpacing(lonSpan, latSpan, separation, samples) {
    const w = lonSpan * UNITS_PER_DEGREE - 2 * BORDER_INSET_UNITS;
    const h = latSpan * UNITS_PER_DEGREE - 2 * BORDER_INSET_UNITS;
    let state = 20261111;
    const rand = () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296;
    const xs = new Float64Array(ARCHIPELAGOS), ys = new Float64Array(ARCHIPELAGOS);
    const sep2 = separation * separation;
    let sum = 0, count = 0;
    for (let s = 0; s < (samples || 24); s++) {
      for (let tries = 0; ; tries++) {
        if (tries > 200000) return NaN;
        for (let i = 0; i < ARCHIPELAGOS; i++) { xs[i] = rand() * w; ys[i] = rand() * h; }
        let ok = true;
        for (let i = 0; ok && i < ARCHIPELAGOS; i++) {
          for (let j = i + 1; j < ARCHIPELAGOS; j++) {
            const dx = xs[i] - xs[j], dy = ys[i] - ys[j];
            if (dx * dx + dy * dy < sep2) { ok = false; break; }
          }
        }
        if (ok) break;
      }
      for (const i of OCCUPIED_ARCHIPELAGOS) {
        let best = Infinity;
        for (const j of OCCUPIED_ARCHIPELAGOS) {
          if (i !== j) best = Math.min(best, Math.hypot(xs[i] - xs[j], ys[i] - ys[j]));
        }
        sum += best;
        count++;
      }
    }
    return sum / count;
  }

  function maxArchipelagoScale(lonSpan, latSpan) {
    let lo = 0, hi = 100;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (spacingFits(lonSpan, latSpan, mid)) lo = mid; else hi = mid;
    }
    return lo;
  }

  function isInt(v) { return typeof v === "number" && Number.isInteger(v); }

  // Like Scrambled Seas' world scale with Border Expander (ScrambleMenu.SetWorldScale): the 1x world is
  // 44 by 30 degrees centred on 10°E 36°N, and both its size and the minimum archipelago spacing grow with the
  // scale. Here the world also stays inside the player's limits: each side stops growing at a limit and the
  // world shifts to fit.
  const WORLD_BASE = { lon: 44, lat: 30 };
  const VANILLA_CENTER = { lon: 10, lat: 36 };

  function maxWorldScale(lonSpan, latSpan) {
    return Math.max(lonSpan / WORLD_BASE.lon, latSpan / WORLD_BASE.lat);
  }

  function worldRect(limits, scale) {
    const fit = (size, center, min, max) => {
      const span = Math.min(Math.round(size), max - min);
      const start = Math.min(Math.max(Math.round(center - span / 2), min), max - span);
      return [start, start + span];
    };
    const [lonMin, lonMax] = fit(WORLD_BASE.lon * scale, VANILLA_CENTER.lon, limits.lonMin, limits.lonMax);
    const [latMin, latMax] = fit(WORLD_BASE.lat * scale, VANILLA_CENTER.lat, limits.latMin, limits.latMax);
    return { lonMin, lonMax, latMin, latMax };
  }

  // Returns { ok: true, preset, world, spacingScale, spacingLimited } or { ok: false, errors: [...] }.
  // input: lonMin, lonMax, latMin, latMax (the limits), worldScale, islandScale, even, seed.
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

    const isScale = (v) => typeof v === "number" && Number.isFinite(v);
    if (!isScale(input.islandScale) || input.islandScale < SCALE_MIN || input.islandScale > ISLAND_SCALE_MAX + 1e-9) {
      errors.push(`Island spread must be between ${SCALE_MIN}x and ${ISLAND_SCALE_MAX}x.`);
    }
    if (!isScale(input.worldScale) || input.worldScale < 1) {
      errors.push("World scale must be at least 1x.");
    } else if (errors.length === 0 && input.worldScale > ceilTenth(maxWorldScale(lonSpan, latSpan)) + 1e-9) {
      errors.push(`World scale can be at most ${ceilTenth(maxWorldScale(lonSpan, latSpan)).toFixed(1)}x for these limits.`);
    }

    if (!isInt(input.seed) || input.seed < INT32_MIN || input.seed > INT32_MAX) errors.push(`Seed must be a whole number between ${INT32_MIN} and ${INT32_MAX}.`);
    else if (input.seed === 0) errors.push("Seed cannot be 0.");

    if (errors.length) return { ok: false, errors };

    const world = worldRect(input, input.worldScale);
    // Spacing follows the world scale, but never so far that the archipelagos can't fit (that would freeze
    // the game). "Even" uses the most that fits.
    const fits = maxArchipelagoScale(world.lonMax - world.lonMin, world.latMax - world.latMin);
    const spacingScale = input.even ? fits : Math.min(input.worldScale, fits);
    return {
      ok: true,
      world,
      spacingScale,
      spacingLimited: !input.even && spacingScale < input.worldScale,
      preset: {
        version: FORMAT_VERSION,
        worldScramblerSeed: input.seed,
        // Rounded so tenth-step scales give exact values (30000 * 2.3 is 68999.999... in floating point).
        islandSpread: Math.round(DEFAULT_ISLAND_SPREAD * input.islandScale),
        minArchipelagoSeparation: Math.floor(DEFAULT_ARCHIPELAGO_SEPARATION * spacingScale + 1e-6),
        minIslandSeparation: Math.round(DEFAULT_ISLAND_SEPARATION * input.islandScale),
        worldLonMin: world.lonMin,
        worldLonMax: world.lonMax,
        worldLatMin: world.latMin,
        worldLatMax: world.latMax,
        borderExpander: 1,
      },
    };
  }

  function ceilTenth(v) { return Math.ceil(v * 10 - 1e-6) / 10; }
  function floorTenth(v) { return (Math.floor(v * 10 + 1e-6) / 10).toFixed(1); }

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

  function fileName(seed) { return `scrambled-seas-${seed}.xml`; }

  const api = {
    FORMAT_VERSION, DEFAULT_ARCHIPELAGO_SEPARATION, DEFAULT_ISLAND_SPREAD, DEFAULT_ISLAND_SEPARATION,
    MIN_LON_SPAN, MIN_LAT_SPAN, WORLD_BASE, VANILLA_CENTER, LIMITS, SCALE_MIN, ISLAND_SCALE_MAX, UNITS_PER_DEGREE, BORDER_INSET_UNITS, ARCHIPELAGOS,
    OCCUPIED_ARCHIPELAGOS, LARGEST_ARCHIPELAGO_ISLANDS,
    randomSeed, maxArchipelagoScale, maxWorldScale, worldRect, typicalSpacing, floorTenth, ceilTenth, validate, toXml, fileName,
  };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ScrambledSeasPreset = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
