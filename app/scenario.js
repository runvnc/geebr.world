/* geebr.world scenarios: shareable little games built on the sandbox.
 * Format, map description language, deterministic layout engine, goal
 * checker, #s= link encoding, banner/end screen and the 🎯 Scenario pane.
 * Design notes: docs/SCENARIOS.md. Needs the scenario hooks in
 * window.geebrWorld (app.js installWorldAPI). */
(() => {
  'use strict';
  const W = () => window.geebrWorld;
  const $ = id => document.getElementById(id);
  const SANDBOX_KEY = 'geebrWorldState', SCENARIO_KEY = 'geebrScenarioState';

  // ---------- small utils ----------
  function mulberry32(a) {
    return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function hashStr(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  const key = (x, z) => x + ',' + z;
  const cheb = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- link encoding: #s=<base64url(deflate-raw(json))> ----------
  async function encodeScenario(obj) {
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    const buf = new Uint8Array(await new Response(stream).arrayBuffer());
    let bin = ''; for (const b of buf) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  async function decodeScenario(code) {
    const b64 = String(code).replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
    const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return JSON.parse(await new Response(stream).text());
  }
  function linkFor(code) { const u = new URL(location.href); u.hash = 's=' + code; return u.toString(); }

  // ---------- map description language ----------
  const THINGS = ['crate', 'barrel', 'mushroom', 'lamp', 'wall', 'note', 'counter'];
  const ALIASES = { box: 'crate', boxes: 'crate', chest: 'crate', keg: 'barrel', lantern: 'lamp', light: 'lamp', torch: 'lamp',
    sign: 'note', letter: 'note', paper: 'note', scroll: 'note', block: 'wall', stone: 'wall', rock: 'wall',
    shroom: 'mushroom', toadstool: 'mushroom', table: 'counter', desk: 'counter', stall: 'counter', bar: 'counter',
    fire: 'campfire', fireplace: 'campfire', home: 'house', cottage: 'house', hut: 'house', building: 'house' };
  const AREA_DIRS = { north: [0, -1], south: [0, 1], east: [-1, 0], west: [1, 0],
    northeast: [-1, -1], northwest: [1, -1], southeast: [-1, 1], southwest: [1, 1] };
  const AREAS = new Set([...Object.keys(AREA_DIRS), 'center', 'random']);
  const NUMWORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, a: 1, an: 1, some: 3, several: 4, few: 3, pair: 2 };
  const ARRANGE = { row: 'row', line: 'row', rows: 'row', cluster: 'cluster', group: 'cluster', pile: 'cluster', stack: 'cluster', heap: 'cluster', scattered: 'scattered', scatter: 'scattered', around: 'around', ring: 'around', circle: 'around' };
  const RELWORDS = { beside: 'beside', by: 'beside', next: 'beside', alongside: 'beside', near: 'near', close: 'near', behind: 'behind', front: 'in_front_of', in_front_of: 'in_front_of', around: 'around', surrounding: 'around' };

  function singular(w) {
    if (ALIASES[w]) return ALIASES[w];
    if (THINGS.includes(w)) return w;
    for (const cut of ['es', 's']) if (w.endsWith(cut) && THINGS.includes(w.slice(0, -cut.length))) return w.slice(0, -cut.length);
    if (w.endsWith('es') && ALIASES[w.slice(0, -2)]) return ALIASES[w.slice(0, -2)];
    if (w.endsWith('s') && ALIASES[w.slice(0, -1)]) return ALIASES[w.slice(0, -1)];
    return w;
  }
  function normArea(w) { if (w === 'centre' || w === 'middle' || w === 'centrally') return 'center'; if (w === 'anywhere' || w === 'somewhere') return 'random'; return w; }

  // One line -> {kind:'place'|'path', ...} or null. Lenient on purpose: small
  // models add bullets, numbering, "the", plurals and prose.
  function parseMapLine(raw, agentIds = []) {
    let line = String(raw || '').trim();
    if (!line || /^(#|\/\/)/.test(line)) return null;
    // Note text in "double", “curly” or 'single' quotes (single only at word
    // boundaries, so apostrophes like "don't" survive).
    const QUOTED = /"([^"]{1,120})"|“([^”]{1,120})”|(?:^|\s)'([^']{1,120})'(?=\s|$)/;
    const qm = line.match(QUOTED);
    const text = qm ? (qm[1] ?? qm[2] ?? qm[3]).trim() : null;
    if (qm) line = line.replace(QUOTED, ' ');
    let s = line.toLowerCase().replace(/^\s*(\d+[.)]|[-*•])\s*/, '')
      .replace(/in front of/g, 'in_front_of').replace(/next to/g, 'beside').replace(/close to/g, 'near')
      .replace(/north[ -]east/g, 'northeast').replace(/north[ -]west/g, 'northwest').replace(/south[ -]east/g, 'southeast').replace(/south[ -]west/g, 'southwest')
      .replace(/(north|south|east|west)_(wall|edge)/g, '$1 wall');
    const ids = agentIds.map(a => a.toLowerCase());
    const words = s.replace(/[^a-z0-9_ ]/g, ' ').split(/\s+/).filter(w => w && !['the', 'of', 'and', 'with', 'to_the'].includes(w));
    const known = w => ids.includes(w) || THINGS.includes(singular(w)) || ['house', 'campfire'].includes(singular(w));
    const resolveRef = w => ids.includes(w) ? agentIds[ids.indexOf(w)] : singular(w);

    if (words[0] === 'path' || words[0] === 'road' || words[0] === 'trail') {
      const fi = words.indexOf('from'), ti = words.lastIndexOf('to');
      const end = arr => { for (const w of arr) { const a = normArea(w); if (AREAS.has(a)) return { area: a }; if (known(w)) return { ref: resolveRef(w) }; } return null; };
      const from = end(words.slice(fi + 1, ti > fi ? ti : undefined)), to = end(words.slice(ti + 1));
      return from && to ? { kind: 'path', from, to, raw } : { kind: 'bad', raw, why: 'path needs "from X to Y"' };
    }
    let i = 0;
    while (['place', 'put', 'add', 'spawn', 'set', 'there', 'is', 'are'].includes(words[i])) i++;
    let count = 1, thing = null, isAgent = false, arrangement = null, rel = null, ref = null, area = null, edge = null, unknownNoun = null;
    const ROLE = /^(shop)?keeper$|^(shopkeeper|guard|merchant|vendor|seller|trader|npc|character|geebr|person|he|she|they|him|her|them|owner|innkeeper|wizard|guardian)$/;
    for (; i < words.length; i++) {
      const w = words[i];
      // A relation before any known thing: the subject was a word we don't
      // know. With one character, a role word ("shopkeeper") means them.
      if (!thing && (RELWORDS[w] || w === 'against' || w === 'along' || w === 'at')) {
        if (unknownNoun && agentIds.length === 1 && ROLE.test(unknownNoun)) { thing = agentIds[0]; isAgent = true; }
        else return { kind: 'bad', raw, why: `unknown thing "${unknownNoun || '?'}"` };
      }
      if (!thing) {
        const m = w.match(/^x?(\d+)x?$/); if (m) { count = Math.max(1, Math.min(12, +m[1])); continue; }
        if (NUMWORDS[w]) { count = NUMWORDS[w]; continue; }
        if (ARRANGE[w] && ARRANGE[w] !== 'around') { arrangement = ARRANGE[w]; continue; }
        if (ids.includes(w)) { thing = agentIds[ids.indexOf(w)]; isAgent = true; continue; }
        const t = singular(w); if (THINGS.includes(t)) { thing = t; continue; }
        if (!['in', 'a', 'an', 'some'].includes(w)) unknownNoun = unknownNoun || w;
        continue;
      }
      const m = w.match(/^x(\d+)$/); if (m) { count = Math.max(1, Math.min(12, +m[1])); continue; }
      const dir = normArea(w);
      if ((w === 'wall' || w === 'edge' || w === 'side' || w === 'shore') && edge === null) {
        const prev = normArea(words[i - 1] || '');
        if (AREA_DIRS[prev]) { rel = 'against'; edge = prev; area = null; }
        continue;
      }
      if (w === 'against' || w === 'along') { if (w === 'along' && !arrangement) arrangement = 'row'; rel = rel || 'against'; continue; }
      if (ARRANGE[w] === 'around' || RELWORDS[w] === 'around') { rel = 'around'; continue; }
      if (ARRANGE[w]) { arrangement = ARRANGE[w]; continue; }
      if (RELWORDS[w]) { rel = RELWORDS[w]; continue; }
      if (AREAS.has(dir)) {
        if (rel === 'against' && AREA_DIRS[dir] && dir.length <= 5) { edge = dir; continue; }
        if (!edge) { area = dir; if (!rel || rel === 'at') rel = 'at'; }
        continue;
      }
      if ((rel && rel !== 'at' && rel !== 'against') && !ref && known(w)) { ref = resolveRef(w); continue; }
      if (!ref && known(w) && !rel) { rel = 'near'; ref = resolveRef(w); continue; }
    }
    if (!thing) return { kind: 'bad', raw, why: 'no known thing (' + THINGS.join(', ') + (agentIds.length ? ', ' + agentIds.join(', ') : '') + ')' };
    if (thing === 'note' && !text) { /* blank note is fine */ }
    if (rel === 'against' && !edge) { rel = area ? 'at' : null; }
    if (rel && !['at', 'against'].includes(rel) && !ref) { rel = area ? 'at' : null; }
    if (isAgent) count = 1;
    return { kind: 'place', thing, isAgent, count, text, rel, ref, area, edge, arrangement, raw };
  }

  // ---------- layout engine ----------
  // spec: {map:[lines], objects:[explicit], agents:[{id, at}], seed}
  // -> {objects:[{type,x,z,text}], agents:{id:{x,z,facing}}, warnings:[]}
  function layout(spec) {
    const w = W(), WORLD = w.WORLD;
    const seed = Number.isFinite(+spec.seed) ? +spec.seed : 1;
    const rng = mulberry32(hashStr((spec.map || []).join('\n')) ^ (seed * 2654435761));
    const warnings = [];
    const agentIds = (spec.agents || []).map(a => a.id);

    // 1. grid of solid, unblocked cells
    const solid = new Set(), blocked = new Set(), cells = [];
    for (let z = -WORLD.halfH - 2; z <= WORLD.halfH + 2; z++) for (let x = -WORLD.halfW - 3; x <= WORLD.halfW + 3; x++) {
      const ok = w.hasGroundAt(x, z) && [[.35, 0], [-.35, 0], [0, .35], [0, -.35]].every(([ox, oz]) => w.hasGroundAt(x + ox, z + oz));
      if (!ok) continue;
      solid.add(key(x, z));
      if (w.sceneryAt(x, z)) blocked.add(key(x, z)); else cells.push([x, z]);
    }
    if (!cells.length) return { objects: [], agents: {}, warnings: ['no free island cells found (terrain still loading?)'] };
    let cx = 0, cz = 0; for (const c of cells) { cx += c[0]; cz += c[1]; } cx /= cells.length; cz /= cells.length;
    let hx = 1, hz = 1; for (const c of cells) { hx = Math.max(hx, Math.abs(c[0] - cx)); hz = Math.max(hz, Math.abs(c[1] - cz)); }
    const centre = [cx, cz];
    const occupied = new Map();   // key -> entity
    const reserved = new Set();   // path cells
    const isFree = c => solid.has(key(c[0], c[1])) && !blocked.has(key(c[0], c[1])) && !occupied.has(key(c[0], c[1])) && !reserved.has(key(c[0], c[1]));
    const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]], N8 = [...N4, [1, 1], [1, -1], [-1, 1], [-1, -1]];
    const freeNeighbours = c => N4.filter(([dx, dz]) => isFree([c[0] + dx, c[1] + dz])).length;

    // entity registry for refs: name -> {cells, centre}
    const registry = new Map();
    const anchors = w.sceneryAnchors();
    for (const [name, p] of Object.entries(anchors)) {
      const ac = [p.x, p.z];
      // footprint: blocked cells clustered around the anchor
      let fc = [...blocked].map(k => k.split(',').map(Number)).filter(c => dist(c, ac) <= 2.2);
      if (!fc.length) fc = [[Math.round(p.x), Math.round(p.z)]];
      registry.set(name, { cells: fc, centre: ac, scenery: true });
    }
    const out = { objects: [], agents: {}, warnings };
    const interactive = [];  // cells that must keep a free neighbour

    function occupy(c, ent, isInteractive) { occupied.set(key(c[0], c[1]), ent); if (isInteractive) interactive.push(c); }
    // Placing at c must not seal the last free neighbour of an object.
    function wouldTrap(c) {
      const k = key(c[0], c[1]);
      return interactive.some(o => cheb(o, c) === 1 && Math.abs(o[0] - c[0]) + Math.abs(o[1] - c[1]) === 1
        && N4.every(([dx, dz]) => { const n = [o[0] + dx, o[1] + dz]; return key(n[0], n[1]) === k || !isFree(n); }));
    }
    function register(name, ent) { if (!registry.has(name)) registry.set(name, ent); }

    // area helpers (normalised position relative to the island)
    const unit = c => [(c[0] - cx) / hx, (c[1] - cz) / hz];
    function areaDir(a) { const d = AREA_DIRS[a]; if (!d) return null; const l = Math.hypot(d[0], d[1]); return [d[0] / l, d[1] / l]; }
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
    function areaTarget(a) {
      const d = areaDir(a); if (!d) return centre;
      return [cx + d[0] * hx * .8, cz + d[1] * hz * .8];
    }
    // How far from the island middle "front" faces: towards the middle.
    function frontDir(ent) {
      let v = [cx - ent.centre[0], cz - ent.centre[1]]; const l = Math.hypot(v[0], v[1]);
      return l < .5 ? [0, 1] : [v[0] / l, v[1] / l];
    }
    function minDistTo(c, ent) { let m = 1e9, mc = 1e9; for (const e of ent.cells) { m = Math.min(m, dist(c, e)); mc = Math.min(mc, cheb(c, e)); } return { d: m, c: mc }; }

    // Hard filter + soft score for one cell. level loosens the filter.
    function evaluate(p, c, ent, level) {
      const u = unit(c);
      let score = 0;
      // Something will stand behind this: keep the cell beyond it (away from
      // the middle) free, e.g. a counter against the wall leaves room for its keeper.
      if (p.keepBehindFree && level <= 1) {
        const v = [c[0] - cx, c[1] - cz], l = Math.hypot(v[0], v[1]) || 1;
        const step = Math.abs(v[0]) > Math.abs(v[1]) ? [Math.sign(v[0]), 0] : [0, Math.sign(v[1])];
        const b = [c[0] + step[0], c[1] + step[1]];
        if (!isFree(b)) return null;
      }
      switch (p.rel) {
        case 'beside': case 'behind': case 'in_front_of': case 'near': case 'around': {
          const md = minDistTo(c, ent);
          const lim = p.rel === 'near' ? 2.6 : p.rel === 'around' ? 2 : 1;
          const relax = [lim, 2, 4, 99][level];
          if (md.c > Math.max(lim, relax) || md.c < 1) return null;
          score -= md.d * (p.rel === 'near' ? 1 : .6);
          if (p.rel === 'beside' && ent.cells.some(e => Math.abs(e[0] - c[0]) + Math.abs(e[1] - c[1]) === 1)) score += 1;
          if (p.rel === 'behind' || p.rel === 'in_front_of') {
            const v = [c[0] - ent.centre[0], c[1] - ent.centre[1]], l = Math.hypot(v[0], v[1]) || 1;
            const side = dot([v[0] / l, v[1] / l], frontDir(ent)) * (p.rel === 'in_front_of' ? 1 : -1);
            if (side < (level ? -1 : .2)) return null;
            score += side * 3;
          }
          break;
        }
        case 'against': {
          const d = areaDir(p.edge); const t = dot(u, d);
          const th = [.55, .35, 0, -9][level];
          if (t < th) return null;
          const step = [Math.round(d[0]), Math.round(d[1])];
          const outer = [c[0] + step[0], c[1] + step[1]];
          if (level === 0 && solid.has(key(outer[0], outer[1])) && !blocked.has(key(outer[0], outer[1]))) score -= 1.5;
          score += t * 2;
          break;
        }
        case 'at': {
          if (p.area === 'random') { score += rng() * 3; break; }
          if (p.area === 'center') { const r = Math.hypot(u[0], u[1]); if (r > [.45, .65, 1, 9][level]) return null; score -= r * 2; break; }
          const d = areaDir(p.area); const t = dot(u, d);
          if (t < [.35, .15, -.2, -9][level]) return null;
          score -= dist(c, areaTarget(p.area)) * .3;
          break;
        }
        default: score -= dist(c, centre) * .15;
      }
      // keep some breathing room from unrelated objects
      for (const [dx, dz] of N8) { const e = occupied.get(key(c[0] + dx, c[1] + dz)); if (e && e !== ent) score -= .25; }
      return score + rng() * .35;
    }
    function candidates(p, ent, level, extraFilter) {
      const list = [];
      for (const c of cells) {
        // never box anything in: the cell itself needs a free side too
        if (!isFree(c) || wouldTrap(c) || freeNeighbours(c) === 0 || (extraFilter && !extraFilter(c))) continue;
        const s = evaluate(p, c, ent, level);
        if (s !== null) list.push({ c, s });
      }
      return list.sort((a, b) => b.s - a.s);
    }
    function bestCell(p, ent, filter) {
      for (let level = 0; level < 4; level++) {
        const list = candidates(p, ent, level, filter);
        if (list.length) { if (level) warnings.push(`"${p.raw.trim()}": relaxed placement (level ${level})`); return list[0].c; }
      }
      return null;
    }

    // Arrangements for N cells.
    function placeGroup(p, ent, n) {
      const placed = [];
      const arrangement = p.arrangement || (n === 1 ? null
        : p.rel === 'against' ? 'row' : (p.rel === 'around' || (p.rel === 'at' && p.area === 'random') || !p.rel) ? 'scattered' : 'cluster');
      if (arrangement === 'row' && n > 1) {
        // axis: along the edge, else perpendicular to the direction from ref/centre
        let axis = [1, 0];
        if (p.rel === 'against') { const d = AREA_DIRS[p.edge]; axis = Math.abs(d[0]) > Math.abs(d[1]) ? [0, 1] : [1, 0]; }
        else if (ent) { const f = frontDir(ent); axis = Math.abs(f[0]) > Math.abs(f[1]) ? [0, 1] : [1, 0]; }
        let best = null;
        for (let level = 0; level < 3 && !best; level++) {
          for (const { c, s } of candidates(p, ent, level)) {
            for (const off of [0, -Math.floor(n / 2)]) {
              const run = []; let ok = true, sum = 0;
              for (let k = 0; k < n; k++) {
                const rc = [c[0] + axis[0] * (k + off), c[1] + axis[1] * (k + off)];
                if (!isFree(rc) || wouldTrap(rc)) { ok = false; break; }
                // the row's cells shield each other, so only require a free side overall
                if (k === n - 1 && run.concat([rc]).every(q => N4.every(([dx, dz]) => { const nb = [q[0] + dx, q[1] + dz]; return !isFree(nb) || run.concat([rc]).some(r => r[0] === nb[0] && r[1] === nb[1]); }))) { ok = false; break; }
                const rs = evaluate(p, rc, ent, Math.min(3, level + 1)); if (rs === null) { ok = false; break; }
                run.push(rc); sum += rs;
              }
              if (ok && (!best || sum > best.sum)) best = { run, sum };
            }
          }
        }
        if (best) return best.run;
        warnings.push(`"${p.raw.trim()}": no room for a row of ${n}, clustering instead`);
      }
      const first = bestCell(p, ent);
      if (!first) return placed;
      placed.push(first);
      while (placed.length < n) {
        let next = null;
        if (arrangement === 'cluster' || arrangement === 'row') {
          const mid = [placed.reduce((a, c) => a + c[0], 0) / placed.length, placed.reduce((a, c) => a + c[1], 0) / placed.length];
          let bestS = -1e9;
          for (const pc of placed) for (const [dx, dz] of N8) {
            const c = [pc[0] + dx, pc[1] + dz];
            if (!isFree(c) || wouldTrap(c) || freeNeighbours(c) === 0 || placed.some(q => q[0] === c[0] && q[1] === c[1])) continue;
            const s = -dist(c, mid) + rng() * .4 + ((p.rel && ent) ? (evaluate(p, c, ent, 2) ?? -3) * .3 : 0);
            if (s > bestS) { bestS = s; next = c; }
          }
        } else {
          // scattered / around: farthest-point sampling among valid cells
          let bestS = -1e9;
          for (let level = 0; level < 4 && !next; level++) {
            for (const { c, s } of candidates(p, ent, level)) {
              if (placed.some(q => q[0] === c[0] && q[1] === c[1])) continue;
              const gap = Math.min(4, ...placed.map(q => dist(q, c)));
              if (level < 2 && gap < 2) continue;
              const sc = gap * 1.2 + s * .3;
              if (sc > bestS) { bestS = sc; next = c; }
            }
          }
        }
        if (!next) { warnings.push(`"${p.raw.trim()}": only room for ${placed.length} of ${n}`); break; }
        placed.push(next);
        // occupy as we go so later picks see them
        occupied.set(key(next[0], next[1]), '__pending');
      }
      for (const c of placed) if (occupied.get(key(c[0], c[1])) === '__pending') occupied.delete(key(c[0], c[1]));
      return placed;
    }

    function facingFrom(c, toward) {
      const dx = toward[0] - c[0], dz = toward[1] - c[1];
      if (Math.abs(dx) < .01 && Math.abs(dz) < .01) return 's';
      return Math.abs(dz) >= Math.abs(dx) ? (dz < 0 ? 'n' : 's') : (dx < 0 ? 'e' : 'w');
    }

    function placeLine(p, ignoreRef = false) {
      const ref = (!ignoreRef && p.ref) ? registry.get(p.ref) : null;
      const q = ref ? p : { ...p, rel: p.rel && !['at', 'against'].includes(p.rel) ? (p.area ? 'at' : null) : p.rel };
      const thing = p.thing;
      const groups = thing === 'counter' ? Array.from({ length: p.count }, () => ({ ...q, count: 3, arrangement: 'row' })) : [{ ...q }];
      for (const g of groups) {
        const n = g.count;
        const placedCells = placeGroup(g, ref, n);
        if (!placedCells.length) { warnings.push(`"${p.raw.trim()}": no free cell, skipped`); continue; }
        const ent = { cells: placedCells, centre: [placedCells.reduce((a, c) => a + c[0], 0) / placedCells.length, placedCells.reduce((a, c) => a + c[1], 0) / placedCells.length] };
        for (const c of placedCells) occupy(c, ent, !(thing === 'wall' || thing === 'counter') && !p.isAgent);
        if (p.isAgent) {
          const look = ref ? ref.centre : centre;
          out.agents[thing] = { x: placedCells[0][0], z: placedCells[0][1], facing: facingFrom(placedCells[0], look) };
        } else {
          const type = thing === 'counter' ? 'wall' : thing;
          for (const c of placedCells) out.objects.push({ type, x: c[0], z: c[1], ...(p.text ? { text: p.text } : {}) });
        }
        register(thing, ent);
      }
    }

    function astar(a, b) {
      const open = [[a, 0]], came = new Map([[key(a[0], a[1]), null]]), g = new Map([[key(a[0], a[1]), 0]]);
      const passable = c => solid.has(key(c[0], c[1])) && !blocked.has(key(c[0], c[1])) && !occupied.has(key(c[0], c[1]));
      while (open.length) {
        open.sort((x, y) => x[1] - y[1]);
        const [cur] = open.shift();
        if (cur[0] === b[0] && cur[1] === b[1]) {
          const path = []; let k = key(cur[0], cur[1]);
          while (k) { path.push(k.split(',').map(Number)); k = came.get(k); }
          return path.reverse();
        }
        for (const [dx, dz] of N4) {
          const n = [cur[0] + dx, cur[1] + dz], nk = key(n[0], n[1]);
          if (!passable(n)) continue;
          const ng = g.get(key(cur[0], cur[1])) + 1;
          if (ng < (g.get(nk) ?? 1e9)) { g.set(nk, ng); came.set(nk, key(cur[0], cur[1])); open.push([n, ng + dist(n, b)]); }
        }
      }
      return null;
    }
    function endpointCell(e) {
      if (e.area) { const t = areaTarget(e.area); return cells.filter(isFree).sort((x, y) => dist(x, t) - dist(y, t))[0]; }
      const ent = registry.get(e.ref); if (!ent) return null;
      return cells.filter(c => isFree(c) && minDistTo(c, ent).c === 1).sort((x, y) => dist(x, ent.centre) - dist(y, ent.centre))[0] || null;
    }
    function placePath(p) {
      const a = endpointCell(p.from), b = endpointCell(p.to);
      const path = a && b ? astar(a, b) : null;
      if (!path) { warnings.push(`"${p.raw.trim()}": no route found`); return; }
      for (const c of path) reserved.add(key(c[0], c[1]));
    }

    // 2. explicit objects and fixed-position agents first
    for (const o of spec.objects || []) {
      const c = [Math.round(o.x), Math.round(o.z)];
      const ent = { cells: [c], centre: c };
      occupy(c, ent, o.type !== 'wall');
      register(o.type, ent);
    }
    for (const a of spec.agents || []) if (Array.isArray(a.at)) {
      const c = [Math.round(a.at[0]), Math.round(a.at[1])];
      const ent = { cells: [c], centre: c }; occupy(c, ent, false); register(a.id, ent);
    }

    // 3. parse, then place in dependency order
    const parsed = [];
    for (const l of spec.map || []) {
      const p = parseMapLine(l, agentIds);
      if (!p) continue;
      if (p.kind === 'bad') { warnings.push(`ignored "${String(l).trim()}": ${p.why}`); continue; }
      if (p.kind === 'place' && p.isAgent && (spec.agents || []).find(a => a.id === p.thing && Array.isArray(a.at))) continue;
      parsed.push(p);
    }
    for (const p of parsed) if (p.kind === 'place' && parsed.some(q => q.kind === 'place' && q.rel === 'behind' && q.ref === p.thing)) p.keepBehindFree = true;
    const late = parsed.filter(p => p.kind === 'place' && (p.arrangement === 'scattered' || p.area === 'random'));
    let pending = parsed.filter(p => !late.includes(p));
    const ready = p => p.kind === 'path'
      ? [p.from, p.to].every(e => e.area || registry.has(e.ref))
      : !p.ref || registry.has(p.ref);
    for (let progress = true; progress && pending.length;) {
      progress = false;
      for (const p of [...pending]) {
        if (!ready(p)) continue;
        if (p.kind === 'path') placePath(p); else placeLine(p);
        pending = pending.filter(x => x !== p); progress = true;
      }
    }
    for (const p of pending) {
      if (p.kind === 'path') { warnings.push(`"${p.raw.trim()}": unknown endpoint, skipped`); continue; }
      warnings.push(`"${p.raw.trim()}": "${p.ref}" isn't on the map, placed without it`);
      placeLine(p, true);
    }
    for (const p of late) placeLine(p, !registry.has(p.ref));

    // 4. agents nobody placed: near the middle, facing it
    for (const a of spec.agents || []) {
      if (Array.isArray(a.at) || out.agents[a.id]) continue;
      const c = bestCell({ rel: 'at', area: 'center', raw: a.id }, null);
      if (c) { occupy(c, { cells: [c], centre: c }, false); out.agents[a.id] = { x: c[0], z: c[1], facing: facingFrom(c, centre) }; }
    }
    return out;
  }

  // ---------- goals ----------
  function cmp(op, a, b) {
    switch (op) { case '>=': return a >= b; case '<=': return a <= b; case '>': return a > b; case '<': return a < b; case '==': case '=': return a === b; case '!=': return a !== b; default: return false; }
  }
  function goalContext() {
    const w = W();
    const agents = new Map(w.getAgents().map(g => [g.id.toLowerCase(), g]));
    return { w, agents, objects: w.getObjects(), anchors: w.sceneryAnchors(), player: w.getPlayer(), speech: active?.speech || [], turns: active?.turns || 0 };
  }
  function itemCount(items, name) { const i = W().findItem((items || []).filter(i => (i.qty ?? 1) > 0), name); return i ? (i.qty ?? 1) : 0; }
  function positionsOf(target, ctx) {
    if (Array.isArray(target)) return [[+target[0], +target[1]]];
    const t = String(target).toLowerCase();
    const g = ctx.agents.get(t); if (g) return [[g.root.position.x, g.root.position.z]];
    const a = ctx.anchors[singular(t)]; if (a) return [[a.x, a.z]];
    return ctx.objects.filter(o => o.type === singular(t)).map(o => [o.x, o.z]);
  }
  function evalCond(c, ctx) {
    if (!c || typeof c !== 'object') return false;
    if (Array.isArray(c)) return c.every(x => evalCond(x, ctx));
    const [k, v] = Object.entries(c)[0] || [];
    switch (k) {
      case 'all': return (v || []).every(x => evalCond(x, ctx));
      case 'any': return (v || []).some(x => evalCond(x, ctx));
      case 'not': return !evalCond(v, ctx);
      case 'player_has': { const [name, n = 1] = Array.isArray(v) ? v : [v]; return itemCount(ctx.player.items, name) >= n; }
      case 'player_gold': return cmp(v[0], ctx.player.gold || 0, +v[1]);
      case 'agent_has': { const cfg = ctx.w.getBrainConfig(v[0]); return itemCount(cfg.inventory?.items, v[1]) >= (v[2] ?? 1); }
      case 'agent_gold': { const cfg = ctx.w.getBrainConfig(v[0]); return cmp(v[1], cfg.inventory?.gold || 0, +v[2]); }
      case 'agent_near': case 'object_near': {
        const a = k === 'agent_near' ? positionsOf(v[0], ctx).slice(0, 1) : positionsOf(v[0], ctx);
        const b = positionsOf(v[1], ctx), r = +(v[2] ?? 1.5);
        return a.some(p => b.some(q => dist(p, q) <= r + .01));
      }
      case 'object_count': return cmp(v[1], ctx.objects.filter(o => o.type === singular(String(v[0]).toLowerCase())).length, +v[2]);
      case 'prop_state': return ctx.objects.some(o => o.type === singular(String(v[0]).toLowerCase()) && o.state === v[1]);
      case 'said': {
        const who = String(v[0]).toLowerCase(), needle = String(v[1] || '').toLowerCase();
        return ctx.speech.some(s => (who === 'any' || s.agentId.toLowerCase() === who) && s.text.toLowerCase().includes(needle));
      }
      case 'turns_over': return ctx.turns >= +v;
      default: return false;
    }
  }
  function scoreFor(goal, ctx, won) {
    const s = goal?.score; if (!s) return null;
    const max = goal.maxTurns || null;
    if (s === 'player_gold') return { label: 'gold left', value: ctx.player.gold || 0 };
    if (s === 'turns') return { label: 'turns', value: ctx.turns };
    if (s === 'turns_left' && max) return { label: 'turns to spare', value: Math.max(0, max - ctx.turns) };
    const m = String(s).match(/^agent_gold:(.+)$/); if (m) return { label: m[1] + "'s gold", value: ctx.w.getBrainConfig(m[1]).inventory?.gold || 0 };
    return null;
  }

  // ---------- runtime ----------
  let active = null;   // {scn, code, startTurn, speech, ended, timer}
  window.addEventListener('geebr-say', e => { if (active && !active.ended) active.speech.push({ agentId: e.detail.agentId, text: e.detail.text }); });
  // A turn is one character reply (one brain decision), however many commands it ran.
  window.addEventListener('geebr-agent-turn', () => { if (active && !active.ended) active.turns++; });

  function normalizeScenario(s) {
    if (!s || typeof s !== 'object') throw new Error('scenario must be a JSON object');
    if (s.v && s.v !== 1) throw new Error('unsupported scenario version ' + s.v);
    const out = { v: 1, title: String(s.title || 'Untitled scenario'), intro: s.intro ? String(s.intro) : '', seed: Number.isFinite(+s.seed) ? +s.seed : 1,
      player: s.player || { name: 'Traveller', gold: 0, items: [] }, allowed: Array.isArray(s.allowed) ? s.allowed : ['say', 'walk', 'face'],
      agents: (Array.isArray(s.agents) ? s.agents : []).filter(a => a && a.id).map(a => ({ ...a, id: String(a.id).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24) || 'geebr' })),
      objects: Array.isArray(s.objects) ? s.objects.filter(o => o && Number.isFinite(+o.x) && Number.isFinite(+o.z)) : [],
      map: Array.isArray(s.map) ? s.map.map(String) : (typeof s.map === 'string' ? s.map.split('\n') : []),
      goal: s.goal && typeof s.goal === 'object' ? s.goal : null };
    if (!out.agents.length) out.agents = [{ id: 'geebr1', personality: 'helpful and friendly' }];
    // Normalising twice (restart) must not wrap the turn limit again.
    if (out.goal?.maxTurns && !JSON.stringify(out.goal.lose || {}).includes('turns_over')) {
      const t = { turns_over: +out.goal.maxTurns };
      out.goal.lose = out.goal.lose ? { any: [out.goal.lose, t] } : t;
    }
    return out;
  }

  async function playScenario(input, opts = {}) {
    const w = W(); if (!w?.ready) throw new Error('world not ready');
    const scn = normalizeScenario(input);
    stopChecker();
    w.state.saveKey = SCENARIO_KEY;
    w.clearWorld();
    w.state.globalHistory = [];
    w.setAllowed(scn.allowed);
    w.setPlayer(scn.player);
    const plan = layout(scn);
    for (const o of scn.objects) w.makeObject(o.type, +o.x, +o.z, o);
    for (const o of plan.objects) w.makeObject(o.type, o.x, o.z, o);
    let first = null;
    for (const a of scn.agents) {
      const pos = Array.isArray(a.at) ? { x: +a.at[0], z: +a.at[1], facing: a.facing || 's' } : (plan.agents[a.id] || { x: 0, z: 0, facing: 's' });
      const g = await w.spawnAgent(a.id, pos.x, pos.z, a.facing || pos.facing);
      first = first || g;
      w.setBrainConfig(a.id, {
        enabled: true, style: a.style || 'helpful geebr', personality: [a.personality, a.prompt].filter(Boolean).join(' ') || 'helpful and friendly',
        quest: a.quest || '', goal: '', messages: [], recent: [], thinking: !!a.thinking, showThoughts: a.showThoughts !== false,
        ...(a.ttsVoiceId ? { ttsVoiceId: a.ttsVoiceId } : {}), ...(a.ttsEnabled === false ? { ttsEnabled: false } : {}),
        fireballTemptation: a.fireballTemptation ?? 10, chaos: a.chaos ?? 1,
        inventory: { gold: Math.max(0, +(a.inventory?.gold) || 0), items: (a.inventory?.items || []).map(i => typeof i === 'string' ? { name: i, qty: 1 } : { name: String(i.name), qty: i.qty ?? 1 }) },
      });
    }
    if (first) w.selectGeebr(first);
    w.inventoryChanged();
    w.saveWorldState();
    const code = opts.code || await encodeScenario(scn);
    active = { scn, code, turns: 0, speech: [], ended: false, warnings: plan.warnings };
    try { history.replaceState(null, '', '#s=' + code); } catch {}
    renderBanner(); hideEnd();
    if (plan.warnings.length) console.warn('[scenario] layout notes:\n' + plan.warnings.join('\n'));
    showWarnings(plan.warnings);
    if (scn.intro || scn.goal?.text) showIntro(scn);
    startChecker();
    return { scenario: scn, plan };
  }

  async function exitScenario() {
    const w = W();
    stopChecker(); active = null; renderBanner(); hideEnd();
    w.state.saveKey = SANDBOX_KEY;
    try { history.replaceState(null, '', location.pathname + location.search); } catch {}
    const raw = localStorage.getItem(SANDBOX_KEY);
    if (raw) { try { await w.restoreWorldState(JSON.parse(raw)); return; } catch (e) { console.warn('sandbox restore failed', e); } }
    w.clearWorld();
    const g = await w.spawnAgent('geebr1', 0, 0, 's');
    w.setBrainConfig('geebr1', { style: 'helpful geebr', personality: 'helpful and friendly' });
    w.selectGeebr(g); w.saveWorldState();
  }

  function startChecker() { stopChecker(); if (active) active.timer = setInterval(checkGoal, 400); }
  function stopChecker() { if (active?.timer) clearInterval(active.timer); }
  function checkGoal() {
    if (!active || active.ended || !active.scn.goal) { renderBanner(); return; }
    const ctx = goalContext(), g = active.scn.goal;
    let result = null;
    if (g.win && evalCond(g.win, ctx)) result = true;
    else if (g.lose && evalCond(g.lose, ctx)) result = false;
    renderBanner(ctx);
    if (result === null) return;
    active.ended = true; stopChecker();
    // Let the last bubble land before covering the scene.
    setTimeout(() => showEnd(result, ctx), 1200);
  }

  // ---------- UI: banner, intro, end screen ----------
  function renderBanner(ctx) {
    const el = $('scenarioBanner'); if (!el) return;
    if (!active) { el.hidden = true; return; }
    const g = active.scn.goal, turns = ctx ? ctx.turns : 0, max = g?.maxTurns;
    el.hidden = false;
    el.innerHTML = `<div class="scn-title">🎯 ${esc(active.scn.title)}</div>`
      + (g?.text ? `<div class="scn-goal">${esc(g.text)}</div>` : '')
      + `<div class="scn-meta">turn ${turns}${max ? ' / ' + max : ''} · you have ${W().getPlayer().gold || 0} gold</div>`
      + `<div class="scn-actions"><button type="button" data-scn="restart">restart</button><button type="button" data-scn="share">share link</button><button type="button" data-scn="exit">exit</button></div>`;
  }
  function showIntro(scn) {
    const el = $('scenarioEnd'); if (!el) return;
    el.hidden = false; el.className = 'scn-overlay intro';
    el.innerHTML = `<div class="scn-card"><h2>${esc(scn.title)}</h2>${scn.intro ? `<p>${esc(scn.intro)}</p>` : ''}`
      + (scn.goal?.text ? `<p class="scn-goal-big">${esc(scn.goal.text)}</p>` : '')
      + `<p class="scn-hint">Talk to them in the chat box at the bottom. The brain runs in your browser.</p>`
      + `<div class="scn-actions"><button type="button" data-scn="close">start</button></div></div>`;
  }
  function shareText(won, ctx) {
    const score = scoreFor(active.scn.goal, ctx, won);
    return `${active.scn.title}: ${won ? 'won' : 'lost'} in ${ctx.turns} turn${ctx.turns === 1 ? '' : 's'}${score ? ` (${score.label}: ${score.value})` : ''}. Play it: ${linkFor(active.code)}`;
  }
  function showEnd(won, ctx) {
    const el = $('scenarioEnd'); if (!el || !active) return;
    const g = active.scn.goal, score = scoreFor(g, ctx, won);
    el.hidden = false; el.className = 'scn-overlay ' + (won ? 'won' : 'lost');
    el.innerHTML = `<div class="scn-card"><h2>${won ? 'You did it!' : 'Not this time'}</h2>`
      + `<p>${esc((won ? g.winText : g.loseText) || (won ? 'Goal reached.' : 'The goal slipped away.'))}</p>`
      + (score ? `<p class="scn-score">${esc(score.label)}: <b>${esc(score.value)}</b></p>` : '')
      + `<p class="scn-hint">${ctx.turns} turn${ctx.turns === 1 ? '' : 's'}</p>`
      + `<div class="scn-actions"><button type="button" data-scn="copyresult">copy result</button><button type="button" data-scn="restart">play again</button><button type="button" data-scn="close">look around</button><button type="button" data-scn="exit">exit</button></div></div>`;
    el.dataset.share = shareText(won, ctx);
  }
  function hideEnd() { const el = $('scenarioEnd'); if (el) el.hidden = true; }
  async function copy(text, what) {
    try { await navigator.clipboard.writeText(text); window.geebrToast?.(what + ' copied', { type: 'ok' }); }
    catch { prompt('Copy this:', text); }
  }
  document.addEventListener('click', async e => {
    const b = e.target.closest?.('[data-scn]'); if (!b) return;
    const act = b.dataset.scn;
    if (act === 'close') hideEnd();
    if (act === 'exit') exitScenario();
    if (act === 'restart' && active) playScenario(active.scn, { code: active.code });
    if (act === 'share' && active) copy(linkFor(active.code), 'scenario link');
    if (act === 'copyresult') copy($('scenarioEnd')?.dataset.share || '', 'result');
  });

  // ---------- export current world ----------
  function exportCurrentWorld(base = {}) {
    const w = W(), st = w.state;
    const dirName = d => Math.abs(d.z) >= Math.abs(d.x) ? (d.z < 0 ? 'n' : 's') : (d.x < 0 ? 'e' : 'w');
    return {
      v: 1, title: base.title || 'My scenario', intro: base.intro || '', seed: base.seed ?? 1,
      player: { name: document.getElementById('chatName')?.value || 'Traveller', gold: st.player.gold || 0, items: st.player.items || [] },
      allowed: [...st.allowed],
      agents: w.getAgents().map(g => {
        const c = w.getBrainConfig(g.id);
        return { id: g.id, at: [Math.round(g.root.position.x), Math.round(g.root.position.z)], facing: dirName(g.dir),
          personality: c.personality || '', ...(c.quest ? { quest: c.quest } : {}), ...(c.thinking ? { thinking: true } : {}),
          ...(c.showThoughts === false ? { showThoughts: false } : {}), ...(c.ttsVoiceId ? { ttsVoiceId: c.ttsVoiceId } : {}),
          ...(c.inventory && (c.inventory.gold || c.inventory.items?.length) ? { inventory: c.inventory } : {}) };
      }),
      objects: w.getObjects().map(o => ({ type: o.type, x: Math.round(o.x), z: Math.round(o.z), ...(o.type === 'note' && o.noteText ? { text: o.noteText } : {}) })),
      map: [],
      goal: base.goal || { text: 'Describe the goal here.', win: { player_has: 'something' }, maxTurns: 12, score: 'turns_left' },
    };
  }

  // ---------- model-written maps ----------
  function mapSystemPrompt(agentIds) {
    return [
      'You design small maps for a 3D island game by writing placement lines.',
      'Write 3 to 8 lines, one instruction per line, and nothing else.',
      'Line forms:',
      '  place <thing> [xN] <placement>',
      '  path from <thing|area> to <thing|area>',
      `Things: crate, barrel, mushroom, lamp, wall, counter, note "<short text>"${agentIds.length ? ', characters: ' + agentIds.join(', ') : ''}.`,
      'Placements: at center|north|south|east|west|northeast|northwest|southeast|southwest|random, against north_wall (or south_wall, east_wall, west_wall), beside X, near X, behind X, in_front_of X, around X. Optional: row, cluster, scattered.',
      'X can be any thing placed earlier, a character, house or campfire.',
      '',
      'Example - a tiny shop:',
      'place counter against north_wall',
      'place shopkeeper behind counter',
      'place barrel x3 cluster beside counter',
      'place note "Open today" in_front_of counter',
      '',
      'Example - a camp in the woods:',
      'place crate x2 near campfire',
      'place lamp x2 scattered at south',
      'place mushroom x5 scattered',
    ].join('\n');
  }
  async function generateMapLines(description, agentIds) {
    if (typeof window.llm !== 'function') throw new Error('model console not ready yet');
    const reply = await window.llm(description, { system: mapSystemPrompt(agentIds), raw: true, silent: true, maxTokens: 320, temperature: 0.4 });
    const lines = String(reply || '').split('\n').map(l => l.trim()).filter(Boolean)
      .filter(l => { const p = parseMapLine(l, agentIds); return p && p.kind !== 'bad'; })
      .map(l => l.replace(/^\s*(\d+[.)]|[-*•])\s*/, '').replace(/^`+|`+$/g, ''));
    return lines;
  }

  // ---------- examples ----------
  const EXAMPLES = {
    shop: {
      v: 1, title: 'The Stubborn Shopkeeper', seed: 3,
      intro: 'Mog runs the only shop on the island and has never knowingly given a discount.',
      player: { name: 'Traveller', gold: 20, items: [] },
      allowed: ['say', 'sell', 'inventory', 'emote'],
      agents: [{ id: 'mog', personality: 'a grumpy, proud shopkeeper. You sell a magic sword for 50 gold and a healing potion for 8 gold. You may haggle a little but you hate going below 40 for the sword. When a price is agreed, use sell() to complete the sale.', inventory: { gold: 5, items: [{ name: 'magic sword', qty: 1 }, { name: 'healing potion', qty: 3 }] } }],
      map: ['place counter against north_wall', 'place mog behind counter', 'place barrel x3 cluster beside counter', 'place note "No refunds" in_front_of counter', 'place lamp near counter'],
      goal: { text: 'Get the magic sword. You only have 20 gold.', win: { player_has: 'magic sword' }, maxTurns: 14, winText: 'Mog grumbles and slides the sword across the counter.', loseText: 'Mog closes the shop for the day.', score: 'player_gold' },
    },
    guard: {
      v: 1, title: 'You Shall Not Pass (Probably)', seed: 5,
      intro: 'Brik guards the way to the campfire. Nobody gets past Brik.',
      player: { name: 'Traveller', gold: 0, items: [] },
      allowed: ['say', 'emote', 'face'],
      agents: [{ id: 'brik', personality: 'a very serious but secretly lonely guard. Your orders: nobody passes to the campfire. Only if someone truly convinces you, say exactly "you may pass".' }],
      map: ['place brik in_front_of campfire', 'place wall x2 row beside brik', 'place lamp x2 near campfire'],
      goal: { text: 'Get Brik to say "you may pass".', win: { said: ['brik', 'you may pass'] }, maxTurns: 10, winText: 'Brik steps aside, looking slightly relieved.', loseText: 'Brik is unmoved. Brik is always unmoved.', score: 'turns_left' },
    },
    lure: {
      v: 1, title: 'Campfire Stories', seed: 2,
      intro: 'Pip is shy and stays by the crates. You want company at the campfire.',
      player: { name: 'Traveller', gold: 0, items: [] },
      allowed: ['say', 'walk', 'face', 'emote'],
      agents: [{ id: 'pip', personality: 'a shy little geebr who loves stories but is nervous around fire. You can walk to coordinates with walk("x,z").' }],
      map: ['place crate x3 cluster at southwest', 'place pip beside crate', 'place mushroom x4 scattered'],
      goal: { text: 'Talk Pip into walking to the campfire.', win: { agent_near: ['pip', 'campfire', 2] }, maxTurns: 12, winText: 'Pip sits down by the fire, warming tiny hands.', score: 'turns_left' },
    },
  };

  // ---------- pane wiring ----------
  function setStatus(t, err) { const el = $('scnStatus'); if (el) { el.textContent = t; el.style.color = err ? '#ff9a8a' : ''; } }
  function showWarnings(list) { const el = $('scnWarnings'); if (el) el.textContent = list?.length ? 'layout notes:\n' + list.join('\n') : ''; }
  function readJson() { try { return JSON.parse($('scnJson').value || '{}'); } catch (e) { throw new Error('scenario JSON: ' + e.message); } }
  function writeJson(obj) { $('scnJson').value = JSON.stringify(obj, null, 2); const m = $('scnMap'); if (m) m.value = (obj.map || []).join('\n'); const sd = $('scnSeed'); if (sd) sd.value = obj.seed ?? 1; }
  function syncMapIntoJson() { const o = readJson(); o.map = ($('scnMap').value || '').split('\n').map(l => l.trim()).filter(Boolean); o.seed = +($('scnSeed')?.value || 1); writeJson(o); return o; }

  function initPane() {
    if (!$('pane-scenario')) return;
    const ex = $('scnExamples');
    if (ex) for (const [k, v] of Object.entries(EXAMPLES)) { const o = document.createElement('option'); o.value = k; o.textContent = v.title; ex.appendChild(o); }
    writeJson(EXAMPLES.shop);
    $('scnLoadExample')?.addEventListener('click', () => { writeJson(EXAMPLES[ex.value] || EXAMPLES.shop); setStatus('example loaded; press play'); });
    $('scnPlay')?.addEventListener('click', async () => {
      try { const o = syncMapIntoJson(); setStatus('building…'); const r = await playScenario(o); setStatus(`playing "${r.scenario.title}"`); }
      catch (e) { console.error(e); setStatus(e.message, true); }
    });
    $('scnReroll')?.addEventListener('click', async () => {
      try { $('scnSeed').value = (+$('scnSeed').value || 1) + 1; const o = syncMapIntoJson(); const r = await playScenario(o); setStatus(`seed ${o.seed}: "${r.scenario.title}"`); }
      catch (e) { console.error(e); setStatus(e.message, true); }
    });
    $('scnFromWorld')?.addEventListener('click', () => {
      let base = {}; try { base = readJson(); } catch {}
      writeJson(exportCurrentWorld(base)); setStatus('exported the current world (explicit positions); edit the goal, then copy the link');
    });
    $('scnCopyLink')?.addEventListener('click', async () => {
      try { const o = normalizeScenario(syncMapIntoJson()); const code = await encodeScenario(o); copy(linkFor(code), 'scenario link'); setStatus(`link is ${linkFor(code).length} characters`); }
      catch (e) { setStatus(e.message, true); }
    });
    $('scnGenerate')?.addEventListener('click', async () => {
      const d = ($('scnDescribe')?.value || '').trim(); if (!d) { setStatus('describe the place first', true); return; }
      try {
        setStatus('asking the model… (loads it if needed)');
        let ids = []; try { ids = (readJson().agents || []).map(a => a.id).filter(Boolean); } catch {}
        const lines = await generateMapLines(d, ids);
        if (!lines.length) { setStatus('the model produced no usable lines; try again or rephrase', true); return; }
        $('scnMap').value = lines.join('\n'); syncMapIntoJson(); setStatus(`${lines.length} lines; press play to lay it out`);
      } catch (e) { console.error(e); setStatus(e.message, true); }
    });
    $('scnMap')?.addEventListener('change', () => { try { syncMapIntoJson(); } catch (e) { setStatus(e.message, true); } });
  }

  // ---------- startup: open a scenario link ----------
  async function openFromUrl() {
    const h = location.hash.replace(/^#/, ''), q = new URLSearchParams(location.search);
    let scn = null, code = null;
    try {
      const m = h.match(/(?:^|&)s(?:cenario)?=([A-Za-z0-9_-]+)/);
      if (m) { code = m[1]; scn = await decodeScenario(code); }
      else if (q.get('scenario')) { const r = await fetch(q.get('scenario')); if (!r.ok) throw new Error('HTTP ' + r.status); scn = await r.json(); }
    } catch (e) { console.error('[scenario] could not open link', e); window.geebrToast?.('could not open scenario link: ' + e.message, { type: 'error' }); return; }
    if (!scn) return;
    try { await playScenario(scn, code ? { code } : {}); writeJson(normalizeScenario(scn)); }
    catch (e) { console.error(e); window.geebrToast?.('scenario failed: ' + e.message, { type: 'error' }); }
  }
  window.addEventListener('hashchange', () => { if (/^#s(cenario)?=/.test(location.hash) && location.hash.slice(3) !== active?.code) openFromUrl(); });
  function onReady() { initPane(); openFromUrl(); }
  if (window.GEEBR_SCENE_READY) onReady(); else window.addEventListener('geebr-scene-ready', onReady, { once: true });

  window.geebrScenario = { parseMapLine, layout, evalCond, encodeScenario, decodeScenario, playScenario, exitScenario, exportCurrentWorld, generateMapLines, EXAMPLES, get active() { return active; } };
})();
