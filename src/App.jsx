import React, { useMemo, useRef, useState, useEffect } from "react";

/**
 * SCMA Morning Dash — Shortest Path Race (v2)
 * -------------------------------------------------------------
 * New in v2 (your requests):
 * 1) Persistent season leaderboard that accumulates points across rounds
 *    - Round points = max(0, 20 - place). Non-submitters get 0.
 * 2) Instructor-set countdown per round; auto-close when timer ends.
 * 3) Instructor can generate a custom network with a chosen node count.
 * 4) Sleeker UI sections for Round vs Season leaderboards + CSV exports.
 *
 * Notes
 * - This is still a frontend-only demo using localStorage for state.
 * - For class-scale real-time, we’ll wire Supabase next (drop-in).
 */

const INSTRUCTOR_PIN = "13741374";

// -----------------------------
// Static Scenarios (you can still use these)
// -----------------------------
const scenarios = [
  {
    id: "urban",
    title: "Urban Delivery Sprint",
    subtitle: "Minimize travel time (mins) across a morning rush map",
    objective: "time", // time | cost | co2
    nodes: [
      { id: "A", x: 80, y: 120, label: "Depot A" },
      { id: "B", x: 260, y: 70, label: "Hub B" },
      { id: "C", x: 420, y: 130, label: "Crossdock C" },
      { id: "D", x: 180, y: 210, label: "Stop D" },
      { id: "E", x: 360, y: 230, label: "Stop E" },
      { id: "Z", x: 520, y: 180, label: "Customer Z" },
    ],
    start: "A",
    end: "Z",
    edges: [
      ["A", "B", 7, "🚚"],
      ["A", "D", 10, "🚚"],
      ["B", "C", 6, "🚚"],
      ["B", "D", 8, "🚚"],
      ["D", "C", 5, "🚚"],
      ["D", "E", 7, "🚚"],
      ["C", "E", 6, "🚚"],
      ["C", "Z", 12, "🚚"],
      ["E", "Z", 6, "🚚"],
      ["A", "C", 30, "🚚"],
      ["B", "E", 30, "🚚"],
    ],
    modifiers: [
      { id: "congestion", label: "Congestion +20%", affect: (e) => 1.2 },
      { id: "priorityLane", label: "Priority lane A→B→C (−30%)", affect: (e) => (e[0] === "A" && e[1] === "B") || (e[0] === "B" && e[1] === "C") ? 0.7 : 1 },
    ],
  },
  {
    id: "prairie",
    title: "Prairie Linehaul",
    subtitle: "Minimize total cost ($) across modes",
    objective: "cost",
    nodes: [
      { id: "YYC", x: 80, y: 160, label: "Calgary (YYC)" },
      { id: "EDM", x: 250, y: 80, label: "Edmonton" },
      { id: "REG", x: 260, y: 240, label: "Regina" },
      { id: "WIN", x: 420, y: 150, label: "Winnipeg" },
      { id: "THU", x: 560, y: 170, label: "Thunder Bay" },
    ],
    start: "YYC",
    end: "THU",
    edges: [
      ["YYC", "EDM", 600, "🚚"],
      ["YYC", "REG", 700, "🚚"],
      ["EDM", "WIN", 1100, "🚂"],
      ["REG", "WIN", 500, "🚚"],
      ["WIN", "THU", 700, "🚚"],
      ["EDM", "REG", 650, "🚚"],
      ["YYC", "WIN", 1400, "✈️"],
      ["REG", "THU", 1600, "✈️"],
    ],
    modifiers: [
      { id: "fuelSpike", label: "Fuel spike: road +25%", affect: (e) => (e[3] === "🚚" ? 1.25 : 1) },
      { id: "railDiscount", label: "Rail promo: rail −15%", affect: (e) => (e[3] === "🚂" ? 0.85 : 1) },
    ],
  },
  {
    id: "port",
    title: "Port → DC Rush",
    subtitle: "Minimize CO₂ (kg) while meeting ETA",
    objective: "co2",
    nodes: [
      { id: "P", x: 80, y: 120, label: "Port" },
      { id: "X", x: 220, y: 70, label: "Rail Yard" },
      { id: "Y", x: 220, y: 210, label: "Airport" },
      { id: "DC", x: 500, y: 150, label: "Distribution Center" },
    ],
    start: "P",
    end: "DC",
    edges: [
      ["P", "X", 120, "🚂"],
      ["P", "Y", 300, "✈️"],
      ["X", "DC", 180, "🚚"],
      ["Y", "DC", 100, "🚚"],
      ["P", "DC", 260, "🚚"],
    ],
    modifiers: [
      { id: "greenDiesel", label: "Green diesel X→DC (−30%)", affect: (e) => (e[0] === "X" && e[1] === "DC" ? 0.7 : 1) },
      { id: "headwinds", label: "Headwinds: ✈️ +20%", affect: (e) => (e[3] === "✈️" ? 1.2 : 1) },
    ],
  },
];

/* === Calgary SP Presets (6) === */
const spCalgaryPresets = [
{
  id: "sp-yyc-downtown",
  title: "YYC → Calgary Tower (Rush Hour)",
  subtitle: "Directed roads: minimize time",
  objective: "time",
  nodes: [
  { id: "YYC", x: 729, y: 160, label: "Calgary Intl (YYC)" },
  { id: "MEM", x: 741, y: 259, label: "Deerfoot × Memorial" },
  { id: "SUN", x: 757, y: 243, label: "Sunridge Mall" },
  { id: "EV",  x: 621, y: 282, label: "East Village" },
  { id: "ING", x: 682, y: 291, label: "Inglewood" },
  { id: "CT",  x: 592, y: 285, label: "Calgary Tower" },
  ],
  start: "YYC",
  end: "CT",
  edges: [
    ["YYC","MEM", {time:18, cost:32, co2:6.0}, "🚚"],
    ["YYC","SUN", {time:15, cost:27, co2:5.0}, "🚚"],
    ["SUN","EV",  {time:10, cost:18, co2:3.2}, "🚚"],
    ["MEM","EV",  {time: 8, cost:14, co2:2.6}, "🚚"],
    ["EV","CT",   {time: 4, cost: 7, co2:1.3}, "🚚"],
    ["MEM","ING", {time: 7, cost:12, co2:2.3}, "🚚"],
    ["ING","CT",  {time: 6, cost:10, co2:2.0}, "🚚"],
  ],
  modifiers: [
    { id: "rush", label: "PM rush: Deerfoot leg +25%", affect: (e)=>(e[0]==="YYC"&&e[1]==="MEM"?1.25:1) },
  ],
  _hasMetrics: true
},
{
  id: "sp-ucalgary-shc",
  title: "UCalgary → South Health Campus",
  subtitle: "NW to deep SE via Glenmore/Deerfoot",
  objective: "time",
  nodes: [
    { id:"UC",  x: 412, y:238, label:"UCalgary" },
    { id:"CG",  x: 412, y:353, label:"Crowchild × Glenmore" },
    { id:"DG",  x: 729, y:365, label:"Deerfoot × Glenmore" },
    { id:"CHI", x: 569, y:352, label:"Chinook Centre" },
    { id:"SET", x: 865, y:532, label:"Seton" },
    { id:"SHC", x: 865, y:519, label:"South Health Campus" },
  ],
  start:"UC", end:"SHC",
  edges: [
    ["UC","CG",   {time: 9, cost:16, co2:3.0}, "🚚"],
    ["CG","DG",   {time:11, cost:19, co2:3.6}, "🚚"],
    ["DG","SET",  {time:20, cost:34, co2:6.5}, "🚚"],
    ["SET","SHC", {time: 3, cost: 5, co2:0.9}, "🚚"],
    ["CG","CHI",  {time: 6, cost:10, co2:1.9}, "🚚"],
    ["CHI","DG",  {time: 7, cost:12, co2:2.2}, "🚚"],
    ["UC","CHI",  {time:14, cost:24, co2:4.6}, "🚚"],
  ],
  modifiers: [
    { id:"glenmoreConstruction", label:"Glenmore work: CG→DG +30%", affect:(e)=>(e[0]==="CG"&&e[1]==="DG"?1.3:1) }
  ],
  _hasMetrics:true
},
{
  id: "sp-ringroad-cim-wh",
  title: "CrossIron → Westhills via Ring",
  subtitle: "Prefer ring or cut through? Minimize cost",
  objective: "cost",
  nodes: [
    { id:"CIM", x:801, y: 60, label:"CrossIron Mills" },
    { id:"SNE", x:855, y:129, label:"Stoney Trail NE" },
    { id:"SSE", x:862, y:428, label:"Stoney Trail SE" },
    { id:"SSW", x:237, y:408, label:"Stoney Trail SW" },
    { id:"WH",  x:325, y:320, label:"Westhills" },
    { id:"DG",  x:729, y:365, label:"Deerfoot × Glenmore" },
  ],
  start:"CIM", end:"WH",
  edges: [
    ["CIM","SNE", {time: 6, cost:11, co2:2.0}, "🚚"],
    ["SNE","SSE", {time:18, cost:31, co2:5.8}, "🚚"],
    ["SSE","SSW", {time:16, cost:28, co2:5.2}, "🚚"],
    ["SSW","WH",  {time: 7, cost:12, co2:2.3}, "🚚"],
    ["SNE","DG",  {time:14, cost:24, co2:4.5}, "🚚"],
    ["DG","WH",   {time:12, cost:21, co2:3.9}, "🚚"],
  ],
  modifiers: [
    { id:"fuelSpike", label:"Fuel spike: ring road legs +15%", affect:(e)=>((["SNE","SSE","SSW"].includes(e[0]))?1.15:1) }
  ],
  _hasMetrics:true
},
{
  id: "sp-fmc-yyc-green",
  title: "Foothills → YYC (Cold Chain)",
  subtitle: "Minimize CO₂ to keep cold chain green",
  objective: "co2",
  nodes: [
    { id:"FMC", x:405, y:248, label:"Foothills Medical Centre" },
    { id:"UC",  x:412, y:238, label:"UCalgary" },
    { id:"MEM", x:700, y:272, label:"Memorial Dr Jct" },
    { id:"YYC", x:729, y:160, label:"Calgary Intl (YYC)" },
    { id:"SUN", x:757, y:243, label:"Sunridge Mall" },
  ],
  start:"FMC", end:"YYC",
  edges: [
    ["FMC","UC",  {time: 3, cost: 5, co2:0.9}, "🚚"],
    ["UC","MEM",  {time: 7, cost:12, co2:2.2}, "🚚"],
    ["MEM","YYC", {time:16, cost:28, co2:5.1}, "🚚"],
    ["UC","SUN",  {time:16, cost:27, co2:5.0}, "🚚"],
    ["SUN","YYC", {time: 6, cost:10, co2:1.8}, "🚚"],
  ],
  modifiers: [
    { id:"priorityLane", label:"Bus lane on Memorial: UC→MEM −20%", affect:(e)=>(e[0]==="UC"&&e[1]==="MEM"?0.8:1) }
  ],
  _hasMetrics:true
},
{
  id: "sp-dt-oneway",
  title: "Downtown One-Way Puzzle",
  subtitle: "Directed grid streets",
  objective: "time",
  nodes: [
    { id:"EV",  x:621, y:282, label:"East Village" },
    { id:"EC",  x:572, y:271, label:"Eau Claire" },
    { id:"ST",  x:577, y:284, label:"Stephen Ave" },
    { id:"KEN", x:533, y:272, label:"Kensington" },
    { id:"CT",  x:592, y:285, label:"Calgary Tower" },
  ],
  start:"EV", end:"CT",
  edges: [
    ["EV","ST",  {time:3, cost:5, co2:1.0}, "🚚"],
    ["ST","EC",  {time:3, cost:5, co2:1.0}, "🚚"],
    ["EC","KEN", {time:4, cost:6, co2:1.2}, "🚚"],
    ["KEN","CT", {time:5, cost:8, co2:1.6}, "🚚"],
    ["EV","KEN", {time:7, cost:11, co2:2.0}, "🚚"],
    ["KEN","EC", {time:3, cost:5, co2:1.0}, "🚚"],
  ],
  modifiers: [],
  _hasMetrics:true
},
{
  id: "sp-sait-ucalgary",
  title: "SAIT → UCalgary",
  subtitle: "Arterials vs collectors",
  objective: "time",
  nodes: [
    { id:"SAIT", x:523, y:256, label:"SAIT" },
    { id:"WB",   x:410, y:290, label:"Westbrook" },
    { id:"ML",   x:466, y:323, label:"Marda Loop" },
    { id:"BRE",  x:420, y:219, label:"Brentwood" },
    { id:"UC",   x:412, y:238, label:"UCalgary" },
  ],
  start:"SAIT", end:"UC",
  edges: [
    ["SAIT","BRE",{time:8, cost:13, co2:2.6}, "🚚"],
    ["BRE","UC",  {time:3, cost: 5, co2:0.9}, "🚚"],
    ["SAIT","WB", {time:7, cost:12, co2:2.3}, "🚚"],
    ["WB","UC",   {time:9, cost:15, co2:3.0}, "🚚"],
    ["SAIT","ML", {time:10,cost:17, co2:3.3}, "🚚"],
    ["ML","UC",   {time:12,cost:21, co2:3.8}, "🚚"],
  ],
  modifiers: [],
  _hasMetrics:true
},
];

/* === Calgary TSP Presets (6) === */
const tspPresets = [
{
  id: "tsp-north-retail",
  title: "North Retail Loop",
  subtitle: "Visit all and return to S",
  nodes: [
    { id:"S", x:757, y:243, label:"Depot (SunridgeMall)" },
    { id:"N1", x:801, y:60,  label:"CrossIronMills" },
    { id:"N2", x:729, y:118, label:"AirdrieSouth" },
    { id:"N3", x:729, y:160, label:"YYC" },
    { id:"N4", x:855, y:129, label:"StoneyNE" },
    { id:"N5", x:741, y:259, label:"DeerfootMemorial" },
  ],
  edges: [], start:"S", end:"S", _hasMetrics:true
},
{
  id: "tsp-dt-loop",
  title: "Downtown & Inner NW",
  subtitle: "Visit all and return to S",
  nodes: [
    { id:"S",  x:572, y:271, label:"Depot (EauClaire)" },
    { id:"N1", x:592, y:285, label:"CalgaryTower" },
    { id:"N2", x:621, y:282, label:"EastVillage" },
    { id:"N3", x:533, y:272, label:"Kensington" },
    { id:"N4", x:410, y:290, label:"Westbrook" },
    { id:"N5", x:682, y:291, label:"Inglewood" },
  ],
  edges: [], start:"S", end:"S", _hasMetrics:true
},
{
  id: "tsp-nw-campus",
  title: "Northwest Campus Tour",
  subtitle: "Visit all and return to S",
  nodes: [
    { id:"S",  x:412, y:238, label:"Depot (UCalgary)" },
    { id:"N1", x:523, y:256, label:"SAIT" },
    { id:"N2", x:420, y:219, label:"Brentwood" },
    { id:"N3", x:343, y:206, label:"Dalhousie" },
    { id:"N4", x:405, y:248, label:"FoothillsMedical" },
    { id:"N5", x:533, y:272, label:"Kensington" },
  ],
  edges: [], start:"S", end:"S", _hasMetrics:true
},
{
  id: "tsp-south-corridor",
  title: "South Corridor",
  subtitle: "Visit all and return to S",
  nodes: [
    { id:"S",  x:569, y:352, label:"Depot (ChinookCentre)" },
    { id:"N1", x:466, y:323, label:"MardaLoop" },
    { id:"N2", x:865, y:532, label:"Seton" },
    { id:"N3", x:865, y:519, label:"SouthHealthCampus" },
    { id:"N4", x:729, y:365, label:"DeerfootGlenmore" },
    { id:"N5", x:325, y:320, label:"Westhills" },
  ],
  edges: [], start:"S", end:"S", _hasMetrics:true
},
{
  id: "tsp-ring-road",
  title: "Ring Road Service",
  subtitle: "Visit all and return to S",
  nodes: [
    { id:"S",  x:862, y:428, label:"Depot (StoneySE)" },
    { id:"N1", x:855, y:129, label:"StoneyNE" },
    { id:"N2", x:237, y:408, label:"StoneySW" },
    { id:"N3", x:729, y:365, label:"DeerfootGlenmore" },
    { id:"N4", x:325, y:320, label:"Westhills" },
    { id:"N5", x:757, y:243, label:"SunridgeMall" },
  ],
  edges: [], start:"S", end:"S", _hasMetrics:true
},
{
  id: "tsp-citywide-5",
  title: "Citywide Five",
  subtitle: "Visit all and return to S",
  nodes: [
    { id:"S",  x:592, y:284, label:"Depot (Downtown)" },
    { id:"N1", x:729, y:160, label:"YYC" },
    { id:"N2", x:325, y:320, label:"Westhills" },
    { id:"N3", x:865, y:532, label:"Seton" },
    { id:"N4", x:412, y:238, label:"UCalgary" },
    { id:"N5", x:757, y:243, label:"SunridgeMall" },
  ],
  edges: [], start:"S", end:"S", _hasMetrics:true
},
];


/** ============================== TRANSPORTATION / TRANSSHIPMENT HELPERS ==============================
 * Provides:
 *  - tpEvaluate(scenario, X) -> { feasible, totalCost, violations[] } for classroom validation
 *  - tpOptimalCost(scenario) -> { cost, flows }  (classic transportation)
 *  - tsOptimalCost(scenario) -> { cost, flows }  (with hubs and allowed arcs)
 */

function buildTpArcs(scn) {
  const edges = [];
  if (scn?.supplies && scn?.demands && scn?.cost) {
    for (const s of scn.supplies) {
      for (const d of scn.demands) {
        const key = `${s.id}>${d.id}`;
        if (scn.cost[key] != null) {
          edges.push({ u: s.id, v: d.id, cost: Number(scn.cost[key]), cap: Infinity });
        }
      }
    }
  }
  return edges;
}

/** General min-cost flow (successive shortest augmenting path with potentials). */
function minCostFlow(nodes, arcs, supplies, demands) {
  const N = [...new Set(nodes)];
  const id2idx = new Map(N.map((id, i) => [id, i]));
  const SS = "__SS__", TT = "__TT__";
  if (!id2idx.has(SS)) { id2idx.set(SS, N.length); N.push(SS); }
  if (!id2idx.has(TT)) { id2idx.set(TT, N.length); N.push(TT); }

  function Edge(to, rev, cap, cost, key) { this.to=to; this.rev=rev; this.cap=cap; this.cost=cost; this.key=key||null; }
  const G = Array.from({length: N.length}, () => []);
  function addEdge(u, v, cap, cost, key) {
    const ui = id2idx.get(u) ?? (id2idx.set(u,N.length), N.push(u), G.push([]), id2idx.get(u));
    const vi = id2idx.get(v) ?? (id2idx.set(v,N.length), N.push(v), G.push([]), id2idx.get(v));
    G[ui].push(new Edge(vi, G[vi].length, cap, cost, key));
    G[vi].push(new Edge(ui, G[ui].length-1, 0, -cost, null));
  }

  // Add network arcs
  for (const a of (arcs||[])) {
    const cap = Number.isFinite(a.cap) ? a.cap : 1e15;
    addEdge(a.u, a.v, cap, a.cost, `${a.u}>${a.v}`);
  }

  // Link supplies and demands to super source/sink
  let totalSupply = 0, totalDemand = 0;
  for (const [id, q] of Object.entries(supplies || {})) { addEdge(SS, id, q, 0, null); totalSupply += q; }
  for (const [id, q] of Object.entries(demands || {})) { addEdge(id, TT, q, 0, null); totalDemand += q; }
  if (Math.round(totalSupply) !== Math.round(totalDemand)) {
    return { feasible: false, cost: Infinity, flows: {}, msg: `Unbalanced: supply=${totalSupply} ≠ demand=${totalDemand}` };
  }

  const n = N.length, INF = 1e18;
  let flow = 0, cost = 0;
  const pot = Array(n).fill(0), parentV = Array(n).fill(-1), parentE = Array(n).fill(-1);
  const resultFlows = {};

  function dijkstra(s, t) {
    const dist = Array(n).fill(INF); dist[s] = 0;
    const used = Array(n).fill(false);
    for (let k=0; k<n; k++) {
      let u = -1, best = INF;
      for (let i=0; i<n; i++) if (!used[i] && dist[i] < best) { best = dist[i]; u = i; }
      if (u === -1) break;
      used[u] = true;
      for (let ei=0; ei<G[u].length; ei++) {
        const e = G[u][ei]; if (e.cap <= 0) continue;
        const w = e.to, rc = e.cost + pot[u] - pot[w], nd = dist[u] + rc;
        if (nd < dist[w]) { dist[w] = nd; parentV[w] = u; parentE[w] = ei; }
      }
    }
    for (let i=0; i<n; i++) if (dist[i] < INF) pot[i] += dist[i];
    return dist[t] < INF;
  }

  const s = id2idx.get(SS), t = id2idx.get(TT);
  while (flow < totalDemand && dijkstra(s, t)) {
    let add = INF;
    for (let v=t; v!==s; v = parentV[v]) add = Math.min(add, G[parentV[v]][parentE[v]].cap);
    for (let v=t; v!==s; v = parentV[v]) {
      const u = parentV[v], ei = parentE[v], e = G[u][ei], r = G[v][e.rev];
      e.cap -= add; r.cap += add;
      if (e.key) { resultFlows[e.key] = (resultFlows[e.key] || 0) + add; cost += add * e.cost; }
    }
    flow += add;
  }
  const feasible = (flow === totalDemand);
  return { feasible, cost: feasible ? cost : Infinity, flows: resultFlows, msg: feasible ? null : "Could not push all demand." };
}

/** Player submission checker for Transportation (matrix X: { "S>D": qty }) */
function tpEvaluate(scn, X) {
  const sup = Object.fromEntries((scn.supplies||[]).map(s => [s.id, Number(s.supply||0)]));
  const dem = Object.fromEntries((scn.demands||[]).map(d => [d.id, Number(d.demand||0)]));
  const row = Object.fromEntries(Object.keys(sup).map(k => [k, 0]));
  const col = Object.fromEntries(Object.keys(dem).map(k => [k, 0]));
  let totalCost = 0, violations = [];
  for (const [key, qRaw] of Object.entries(X||{})) {
    const q = Number(qRaw||0);
    const [s, d] = key.split(">");
    if (!(s in sup) || !(d in dem)) continue;
    row[s] += q; col[d] += q;
    const c = scn.cost?.[key];
    if (c == null) violations.push(`Arc ${key} not allowed.`);
    else totalCost += q * Number(c);
  }
  for (const s of Object.keys(sup)) if (Math.round(row[s]) !== Math.round(sup[s])) violations.push(`Supply ${s}: sent ${row[s]} ≠ ${sup[s]}`);
  for (const d of Object.keys(dem)) if (Math.round(col[d]) !== Math.round(dem[d])) violations.push(`Demand ${d}: recv ${col[d]} ≠ ${dem[d]}`);
  return { feasible: violations.length === 0, totalCost, violations };
}

function tpOptimalCost(scn) {
  const nodes = [...(scn.supplies||[]).map(s=>s.id), ...(scn.demands||[]).map(d=>d.id)];
  const edges = buildTpArcs(scn);
  const supplies = Object.fromEntries((scn.supplies||[]).map(s => [s.id, Number(s.supply||0)]));
  const demands = Object.fromEntries((scn.demands||[]).map(d => [d.id, Number(d.demand||0)]));
  return minCostFlow(nodes, edges, supplies, demands);
}

/** Transshipment optimal (supply -> hubs -> demand; arcs define what's allowed). */
function tsOptimalCost(scn) {
  const nodes = [
    ...(scn.supplies||[]).map(s=>s.id),
    ...(scn.hubs||[]).map(h=>h.id),
    ...(scn.demands||[]).map(d=>d.id),
  ];
  const supplies = Object.fromEntries((scn.supplies||[]).map(s => [s.id, Number(s.supply||0)]));
  const demands = Object.fromEntries((scn.demands||[]).map(d => [d.id, Number(d.demand||0)]));
  const arcs = (scn.arcs||[]).map(a => ({u:a.u, v:a.v, cost:Number(a.cost), cap:Number.isFinite(a.cap)?a.cap:Infinity}));
  // Optional hub caps (throughput): comment out if you don't need.
  for (const h of (scn.hubs||[])) {
    if (Number.isFinite(h.cap)) {
      arcs.push({u:"__SS__", v:h.id, cost:0, cap:h.cap});
      arcs.push({u:h.id, v:"__TT__", cost:0, cap:h.cap});
    }
  }
  return minCostFlow(nodes, arcs, supplies, demands);
}



// ===== TRANSPORTATION (TP) PRESETS — CANADA/CALGARY =====

// 1) Alberta Grocers — plants in Calgary/Edmonton to AB cities
const tpAlbertaGrocers = {
  id: "tp-alberta-grocers",
  title: "AB Grocers — Calgary/Edmonton → Lethbridge/Red Deer/Med Hat/FMM",
  supplies: [
    { id: "CalgaryPlant",  label: "Calgary Plant",  supply: 60 },
    { id: "EdmontonPlant", label: "Edmonton Plant", supply: 40 },
  ],
  demands: [
    { id: "Lethbridge",   label: "Lethbridge",    demand: 20 },
    { id: "RedDeer",      label: "Red Deer",      demand: 20 },
    { id: "MedicineHat",  label: "Medicine Hat",  demand: 25 },
    { id: "FortMcMurray", label: "Fort McMurray", demand: 35 },
  ],
  // Rough per-unit costs (smaller ≈ closer)
  cost: {
    "CalgaryPlant>Lethbridge": 2,
    "CalgaryPlant>RedDeer": 3,
    "CalgaryPlant>MedicineHat": 4,
    "CalgaryPlant>FortMcMurray": 9,

    "EdmontonPlant>Lethbridge": 7,
    "EdmontonPlant>RedDeer": 2,
    "EdmontonPlant>MedicineHat": 8,
    "EdmontonPlant>FortMcMurray": 5,
  },
};

// 2) West Coast Ports → Prairies — Vancouver / Prince Rupert to AB/SK cities
const tpWestPortsPrairies = {
  id: "tp-west-ports-prairies",
  title: "West Ports → Prairies — Vancouver/Prince Rupert → Calgary/Edmonton/Regina/Saskatoon",
  supplies: [
    { id: "PortVancouver",   label: "Port Vancouver",   supply: 70 },
    { id: "PrinceRupertPort",label: "Prince Rupert Port", supply: 30 },
  ],
  demands: [
    { id: "Calgary",   label: "Calgary",   demand: 35 },
    { id: "Edmonton",  label: "Edmonton",  demand: 25 },
    { id: "Regina",    label: "Regina",    demand: 20 },
    { id: "Saskatoon", label: "Saskatoon", demand: 20 },
  ],
  cost: {
    "PortVancouver>Calgary": 6,
    "PortVancouver>Edmonton": 7,
    "PortVancouver>Regina": 9,
    "PortVancouver>Saskatoon": 10,

    "PrinceRupertPort>Calgary": 8,
    "PrinceRupertPort>Edmonton": 6,
    "PrinceRupertPort>Regina": 10,
    "PrinceRupertPort>Saskatoon": 9,
  },
};

// ===== TRANSSHIPMENT (TS) PRESETS — CANADA/CALGARY =====

// 3) Alberta Hubs — Airdrie/Nisku DCs → (Red Deer / Lethbridge) hubs → AB cities
const tsAlbertaHubs = {
  id: "ts-alberta-hubs",
  title: "AB Hubs — Airdrie/Nisku DC → Red Deer & Lethbridge Crossdocks → Cities",
  supplies: [
    { id: "AirdrieDC", label: "Airdrie DC", supply: 55 },
    { id: "NiskuDC",   label: "Nisku DC",   supply: 45 },
  ],
  hubs: [
    { id: "RedDeerXDock",     label: "Red Deer Crossdock" },
    { id: "LethbridgeXDock",  label: "Lethbridge Crossdock" },
  ],
  demands: [
    { id: "Calgary",       label: "Calgary",        demand: 40 },
    { id: "Edmonton",      label: "Edmonton",       demand: 35 },
    { id: "MedicineHat",   label: "Medicine Hat",   demand: 15 },
    { id: "FortMcMurray",  label: "Fort McMurray",  demand: 10 },
  ],
  // Only listed arcs are allowed (this enforces which hub can serve which cities)
  arcs: [
    // Supply → Hubs
    { u: "AirdrieDC", v: "RedDeerXDock",    cost: 2 },
    { u: "AirdrieDC", v: "LethbridgeXDock", cost: 3 },
    { u: "NiskuDC",   v: "RedDeerXDock",    cost: 2 },
    { u: "NiskuDC",   v: "LethbridgeXDock", cost: 5 },

    // Hubs → Demand
    { u: "RedDeerXDock",    v: "Calgary",       cost: 2 },
    { u: "RedDeerXDock",    v: "Edmonton",      cost: 2 },
    { u: "RedDeerXDock",    v: "FortMcMurray",  cost: 7 },

    { u: "LethbridgeXDock", v: "Calgary",       cost: 2 },
    { u: "LethbridgeXDock", v: "MedicineHat",   cost: 1 },
  ],
};

// 4) Western Intermodal — Vancouver / Prince Rupert → (Winnipeg / Regina) hubs → Prairie cities
const tsWesternIntermodal = {
  id: "ts-western-intermodal",
  title: "Western Intermodal — Ports → Winnipeg/Regina Hubs → Calgary/Edmonton/Saskatoon/Regina",
  supplies: [
    { id: "PortVancouver",   label: "Port Vancouver",     supply: 60 },
    { id: "PrinceRupertPort",label: "Prince Rupert Port", supply: 40 },
  ],
  hubs: [
    { id: "WinnipegIC", label: "Winnipeg Intermodal" },
    { id: "ReginaIC",   label: "Regina Intermodal"   },
  ],
  demands: [
    { id: "Calgary",      label: "Calgary",       demand: 40 },
    { id: "Edmonton",     label: "Edmonton",      demand: 30 },
    { id: "Saskatoon",    label: "Saskatoon",     demand: 20 },
    { id: "ReginaCity",   label: "Regina (City)", demand: 10 },
  ],
  arcs: [
    // Supply → Hubs
    { u: "PortVancouver",    v: "WinnipegIC", cost: 5 },
    { u: "PortVancouver",    v: "ReginaIC",   cost: 6 },
    { u: "PrinceRupertPort", v: "ReginaIC",   cost: 5 },
    { u: "PrinceRupertPort", v: "WinnipegIC", cost: 6 },

    // Hubs → Demand
    { u: "WinnipegIC", v: "Calgary",    cost: 3 },
    { u: "WinnipegIC", v: "Edmonton",   cost: 4 },
    { u: "WinnipegIC", v: "Saskatoon",  cost: 3 },

    { u: "ReginaIC",   v: "Calgary",    cost: 4 },
    { u: "ReginaIC",   v: "Saskatoon",  cost: 1 },
    { u: "ReginaIC",   v: "ReginaCity", cost: 1 },
  ],
};

// TP & TS preset lists (for the dropdown)
const tpPresets = [tpAlbertaGrocers, tpWestPortsPrairies];
const tsPresets = [tsAlbertaHubs, tsWesternIntermodal];



/* === Calgary VRP Presets (6) === */
const vrpPresets = [
{
  id: "vrp-north-q",
  title: "North Quadrant Parcels",
  subtitle: "Capacity 8. Deliver to all customers and return to S.",
  nodes: [
    { id:"S",  x:757, y:243, label:"Depot (SunridgeMall)" },
    { id:"C1", x:801, y:60,  label:"CrossIronMills" },
    { id:"C2", x:729, y:118, label:"AirdrieSouth" },
    { id:"C3", x:729, y:160, label:"YYC" },
    { id:"C4", x:855, y:129, label:"StoneyNE" },
    { id:"C5", x:741, y:259, label:"DeerfootMemorial" },
    { id:"C6", x:700, y:272, label:"MemorialDriveJct" },
  ],
  edges: [], start:"S", end:"S", capacity: 8,
  demand: { C1:2, C2:3, C3:2, C4:1, C5:2, C6:3 },
  _hasMetrics:true
},
{
  id: "vrp-dt-retail",
  title: "Downtown Retail",
  subtitle: "Capacity 7. Deliver to all customers and return to S.",
  nodes: [
    { id:"S",  x:592, y:284, label:"Depot (Downtown)" },
    { id:"C1", x:572, y:271, label:"EauClaire" },
    { id:"C2", x:592, y:285, label:"CalgaryTower" },
    { id:"C3", x:621, y:282, label:"EastVillage" },
    { id:"C4", x:533, y:272, label:"Kensington" },
    { id:"C5", x:410, y:290, label:"Westbrook" },
    { id:"C6", x:682, y:291, label:"Inglewood" },
  ],
  edges: [], start:"S", end:"S", capacity: 7,
  demand: { C1:2, C2:1, C3:2, C4:1, C5:2, C6:1 },
  _hasMetrics:true
},
{
  id: "vrp-nw-health",
  title: "NW Health Network",
  subtitle: "Capacity 6. Deliver to all customers and return to S.",
  nodes: [
    { id:"S",  x:405, y:248, label:"Depot (FoothillsMedical)" },
    { id:"C1", x:412, y:238, label:"UCalgary" },
    { id:"C2", x:523, y:256, label:"SAIT" },
    { id:"C3", x:420, y:219, label:"Brentwood" },
    { id:"C4", x:343, y:206, label:"Dalhousie" },
    { id:"C5", x:533, y:272, label:"Kensington" },
  ],
  edges: [], start:"S", end:"S", capacity: 6,
  demand: { C1:1, C2:2, C3:2, C4:3, C5:1 },
  _hasMetrics:true
},
{
  id: "vrp-south-clinics",
  title: "South Clinics",
  subtitle: "Capacity 9. Deliver to all customers and return to S.",
  nodes: [
    { id:"S",  x:865, y:519, label:"Depot (SouthHealthCampus)" },
    { id:"C1", x:865, y:532, label:"Seton" },
    { id:"C2", x:729, y:365, label:"DeerfootGlenmore" },
    { id:"C3", x:569, y:352, label:"ChinookCentre" },
    { id:"C4", x:466, y:323, label:"MardaLoop" },
    { id:"C5", x:325, y:320, label:"Westhills" },
  ],
  edges: [], start:"S", end:"S", capacity: 9,
  demand: { C1:1, C2:3, C3:2, C4:2, C5:3 },
  _hasMetrics:true
},
{
  id: "vrp-ring-replen",
  title: "Ring Replenishment",
  subtitle: "Capacity 10. Deliver to all customers and return to S.",
  nodes: [
    { id:"S",  x:862, y:428, label:"Depot (StoneySE)" },
    { id:"C1", x:855, y:129, label:"StoneyNE" },
    { id:"C2", x:237, y:408, label:"StoneySW" },
    { id:"C3", x:729, y:365, label:"DeerfootGlenmore" },
    { id:"C4", x:325, y:320, label:"Westhills" },
    { id:"C5", x:757, y:243, label:"SunridgeMall" },
  ],
  edges: [], start:"S", end:"S", capacity: 10,
  demand: { C1:2, C2:3, C3:2, C4:2, C5:3 },
  _hasMetrics:true
},
{
  id: "vrp-citywide",
  title: "Citywide Mix",
  subtitle: "Capacity 10. Deliver to all customers and return to S.",
  nodes: [
    { id:"S",  x:569, y:352, label:"Depot (ChinookCentre)" },
    { id:"C1", x:729, y:160, label:"YYC" },
    { id:"C2", x:325, y:320, label:"Westhills" },
    { id:"C3", x:865, y:532, label:"Seton" },
    { id:"C4", x:412, y:238, label:"UCalgary" },
    { id:"C5", x:757, y:243, label:"SunridgeMall" },
    { id:"C6", x:572, y:271, label:"EauClaire" },
  ],
  edges: [], start:"S", end:"S", capacity: 10,
  demand: { C1:3, C2:2, C3:3, C4:2, C5:3, C6:1 },
  _hasMetrics:true
},
];

/* === Scenario helpers/registry === */
function findScenarioById(id) {
  if (!id) return null;
  return (
    ([...scenarios, ...spCalgaryPresets].find(s => s.id === id)) ||
    (tspPresets.find(s => s.id === id)) ||
    (vrpPresets.find(s => s.id === id)) ||
    (tpPresets.find(s => s.id === id)) ||
    (tsPresets.find(s => s.id === id)) ||
    null
  );
}



// -----------------------------
// Dijkstra (non-negative weights)
// -----------------------------
function dijkstra(nodes, edges, start, end) {
  const adj = new Map();
  for (const n of nodes) adj.set(n.id, []);
  for (const [u, v, w, m] of edges) {
    if (!adj.has(u)) adj.set(u, []);
    adj.get(u).push({ v, w, m });
  }
  const dist = new Map(nodes.map((n) => [n.id, Infinity]));
  const prev = new Map();
  dist.set(start, 0);
  const visited = new Set();
  while (visited.size < nodes.length) {
    let u = null;
    let best = Infinity;
    for (const [k, d] of dist) {
      if (!visited.has(k) && d < best) { best = d; u = k; }
    }
    if (u === null) break;
    visited.add(u);
    if (u === end) break;
    for (const { v, w } of adj.get(u) || []) {
      const nd = dist.get(u) + w;
      if (nd < dist.get(v)) { dist.set(v, nd); prev.set(v, u); }
    }
  }
  const path = [];
  let cur = end;
  if (prev.has(cur) || cur === start) {
    while (cur) {
      path.unshift(cur);
      cur = prev.get(cur);
      if (!cur) break;
      if (cur === start) { path.unshift(start); break; }
    }
  }
  return { cost: dist.get(end), path };
}

// -----------------------------
// Local Storage Store (rounds, season, roster)
// -----------------------------
const LS_KEY = "scma-dash-store";
function loadStore() { try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch { return {}; } }
function saveStore(data) { localStorage.setItem(LS_KEY, JSON.stringify(data)); }

// Async load/save now use Supabase. Keep simple local cache for fast UI.
async function loadRoomRound(room) {
  const offline = localStorage.getItem("scma_supa_offline") === "1";
  const key = `scma_round_${room}`;
  const cachedStr = localStorage.getItem(key);
  const cached = cachedStr ? JSON.parse(cachedStr) : null;

  // Only trust cache if the round is OPEN; otherwise we may still keep it
  // temporarily if the instructor revealed the leaderboard.
  if (cached?.isOpen) {
    if (!offline) {
      dbLoadCurrentRound(room).then((fresh) => {
        if (fresh) {
          const cStart = cached?.startedAt ?? 0;
          const fStart = fresh?.startedAt ?? 0;
          if (fStart >= cStart) {
            localStorage.setItem(key, JSON.stringify(fresh));
          }
        } else {
          // DB says no open round -> mark cache as closed so clients stop timer
          const closed = { ...cached, isOpen: false, endsAt: cached?.endsAt || Date.now() };
          localStorage.setItem(key, JSON.stringify(closed));
        }
      }).catch(() => {/* ignore */});
    }
    return cached;
  } else if (cached?.revealBoard) {
    // Closed but leaderboard is being shown: keep cache so players see results
    return cached;
  } else {
    // closed/old cache → remove
    localStorage.removeItem(key);
  }

  // Fetch current open round from DB
  const fresh = await dbLoadCurrentRound(room);
  if (fresh) localStorage.setItem(key, JSON.stringify(fresh));
  return fresh;
}

async function dbLoadCurrentRoundRow(room) {
  const { data, error } = await supabase
    .from("rounds")
    .select("id")
    .eq("room", room)
    .eq("is_open", true)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data; // { id } or null
}


async function saveRoomRound(room, round) {
  const key = `scma_round_${room}`;
  try {
    if (!round) {
      localStorage.removeItem(key);
      await dbSaveRound(room, null);
      return;
    }
    const row = await dbSaveRound(room, round);
    const merged = row?.id ? { ...round, id: row.id } : round;
    localStorage.setItem(key, JSON.stringify(merged));
  } catch (err) {
    // Fallback to local only (useful when DB schema doesn’t accept TP/TS yet)
    if (round) localStorage.setItem(key, JSON.stringify(round));
  }
}


async function loadSeason(room) {
  // returns { totals: {name: points}, history: [] } (adapted for your UI)
  const rows = await dbLoadSeasonTotals(room);
  const totals = {};
  for (const r of rows) totals[r.username] = r.points;
  return { totals, history: [] };
}

function saveSeason(room, season) { const s = loadStore(); s["season:" + room] = season; saveStore(s); }

function addToRoster(room, name) {
  const s = loadStore();
  const key = "roster:" + room;
  const roster = new Set(s[key] || []);
  roster.add(name);
  s[key] = Array.from(roster);
  saveStore(s);
}
function loadRoster(room) { const s = loadStore(); return s["roster:" + room] || []; }

// -----------------------------
// Root App
// -----------------------------
export default function App() {
  const [me, setMe] = useState(null); // {name, room}
  const [role, setRole] = useState("player"); // player | instructor
  const [pinOk, setPinOk] = useState(false);
  const [room, setRoom] = useState("SCMA");

  useEffect(() => {
    const s = loadStore();
    if (s.me) { setMe(s.me); setRoom(s.me.room); }
  }, []);

  const onJoin = (name, roomCode) => {
    const s = loadStore();
    s.me = { name, room: roomCode.toUpperCase() };
    saveStore(s);
    addToRoster(roomCode.toUpperCase(), name);
    setMe(s.me);
  };

  const onLeave = () => {
  const s = loadStore();
  delete s.me; saveStore(s);
  localStorage.removeItem("scma_me"); // also clear PIN login memory
  setMe(null); setRole("player"); setPinOk(false);
};


  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-indigo-950 via-slate-900 to-emerald-900 text-slate-100 px-4 py-6">
      <div className="mx-auto max-w-6xl">
        <Header me={me} role={role} setRole={setRole} pinOk={pinOk} setPinOk={setPinOk} onLeave={onLeave} />
        
        {!me ? (
          <LoginGate
            onLogin={(profile) => {
              // Keep using your existing store shape for compatibility
              const s = loadStore();
              s.me = { name: profile.name, room: profile.room };
              saveStore(s);
              setMe(s.me);
              setRoom(s.me.room);
            }}
          />
        ) : role === "instructor" && pinOk ? (
          <InstructorPanel room={me.room} />
        ) : (
          <PlayerPanel me={me} />
        )}

        <Footer />
      </div>
    </div>
  );
}

function Header({ me, role, setRole, pinOk, setPinOk, onLeave }) {
  const [pin, setPin] = useState("");
  return (
    <div className="flex items-center justify-between gap-4 mb-6">
      <div className="flex items-center gap-3">
        <span className="text-2xl">🗺️</span>
        <div>
          <h1 className="text-2xl font-black tracking-tight">SCMA Morning Dash</h1>
          <p className="text-sm text-slate-300 -mt-1">Shortest Path Race • Live Rounds • Season Leaderboard</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {me && (
          <div className="text-right">
            <div className="text-sm text-slate-300">Room</div>
            <div className="font-semibold">{me.room}</div>
          </div>
        )}
        <div className="h-8 w-px bg-white/10" />
        <div className="flex items-center gap-2">
          <ModePill isOn={role === "instructor"} onClick={() => setRole(role === "instructor" ? "player" : "instructor")}>
            {role === "instructor" ? "Instructor" : "Player"}
          </ModePill>
          {role === "instructor" && (
            <div className="flex items-center gap-2">
              <input
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                type="password"
                placeholder="PIN"
                className="bg-white/10 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-emerald-400 w-28"
              />
              <button
                onClick={() => setPinOk(pin === INSTRUCTOR_PIN)}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${pinOk ? "bg-emerald-600" : "bg-indigo-600 hover:bg-indigo-500"}`}
              >
                {pinOk ? "Verified" : "Verify"}
              </button>
            </div>
          )}
          {me && (
            <button onClick={onLeave} className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-white/10 hover:bg-white/20">
              Leave
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ModePill({ children, isOn, onClick }) {
  return (
    <button onClick={onClick} className={`px-3 py-1.5 rounded-full text-sm font-semibold ${isOn ? "bg-emerald-600" : "bg-white/10 hover:bg-white/20"}`}>{children}</button>
  );
}

function Lobby({ onJoin, defaultRoom }) {
  const [name, setName] = useState("");
  const [room, setRoom] = useState(defaultRoom || "SCMA");
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="rounded-2xl bg-white/5 p-6 ring-1 ring-white/10 shadow-xl">
        <h2 className="text-xl font-bold mb-2">Join Game</h2>
        <p className="text-sm text-slate-300 mb-4">Enter your name and the room code your instructor shows on screen.</p>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-slate-300 mb-1">Display Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Alex" className="w-full bg-white/10 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
          <div>
            <label className="block text-xs text-slate-300 mb-1">Room Code</label>
            <input value={room} onChange={(e) => setRoom(e.target.value.toUpperCase())} placeholder="SCMA" className="w-full bg-white/10 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-400 tracking-widest" />
          </div>
          <button onClick={() => name.trim() && room.trim() && onJoin(name.trim(), room.trim())} className="w-full mt-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl py-2.5 font-semibold">Start</button>
        </div>
      </div>
      <HowToCard />
    </div>
  );
}

function HowToCard() {
  return (
    <div className="rounded-2xl bg-gradient-to-br from-emerald-800/60 to-teal-900/60 p-6 ring-1 ring-white/10 shadow-xl text-emerald-100">
      <h3 className="text-lg font-bold mb-3">How it works</h3>
      <ul className="space-y-2 text-sm">
        <li>• Instructor opens a round and picks a scenario or generates a custom network.</li>
        <li>• Countdown is visible; click nodes to build a valid route and submit before time runs out.</li>
        <li>• Score = <code>1000 × (best ÷ yours) + max(0, 200 − seconds)</code>.</li>
        <li>• Season points = <span className="font-semibold">24 − place</span> (min 0). No submit = 0.</li>
        <li>• Leaderboards: This Round + Season (cumulative).</li>
      </ul>
      <h4 className="text-sm font-semibold mt-4 mb-1">Game goals</h4>
      <ul className="space-y-1 text-sm">
        <li>• <span className="font-semibold">Shortest Path:</span> go from <b>S</b> to <b>T</b> minimizing the chosen metric.</li>
        <li>• <span className="font-semibold">TSP:</span> start at <b>S</b>, visit every node once, and return to <b>S</b>.</li>
        <li>• <span className="font-semibold">VRP:</span> serve all customers without exceeding vehicle capacity; return to depot to reload.</li>
        <li>• <span className="font-semibold">Order Picking:</span> walk the grid to collect all picks and return to the dock.</li>
      </ul>
      <p className="mt-3 text-xs">Goal: build the most efficient route as fast as you can to maximize score.</p>
    </div>
  );
}

// -----------------------------
// Instructor Panel
// -----------------------------
function InstructorPanel({ room }) {
  const [round, setRound] = useRound(room);
  const roster = loadRoster(room);

  // ===== Game mode =====
  const [gameMode, setGameMode] = useState("sp"); // "sp" | "tsp" | "vrp" | "pick"

  // TP/TS chosen preset (for dropdowns)
const [selTpScenario, setSelTpScenario] = useState("tp-alberta-grocers");
const [selTsScenario, setSelTsScenario] = useState("ts-alberta-hubs");

  // ===== Shortest Path (SP) controls =====
  const [selScenario, setSelScenario] = useState(round?.scenarioId || scenarios[0].id);
  const [customNodes, setCustomNodes] = useState(12);
  const [customObjective, setCustomObjective] = useState("time");
  const [customSpread, setCustomSpread] = useState(1.8);
  const [customDensity, setCustomDensity] = useState(2);
  const [customScenario, setCustomScenario] = useState(null);
  const [builderScenario, setBuilderScenario] = useState(null);

  // SP objective: single vs dual
  const [objMode, setObjMode] = useState("single"); // "single" | "dual"
  const [objA, setObjA] = useState("time");
  const [objB, setObjB] = useState("cost");
  const [alphaPct, setAlphaPct] = useState(60);
  const alpha = alphaPct / 100;

  // ===== TSP controls =====
  const [tspNodes, setTspNodes] = useState(10);
  const [selTspScenario, setSelTspScenario] = useState("custom");
  const [selVrpScenario, setSelVrpScenario] = useState("custom");





  // ===== VRP controls =====
  const [vrpCustomers, setVrpCustomers] = useState(12);
  const [vrpCapacity, setVrpCapacity] = useState(8); // capacity per vehicle

  // ===== Order-Picking controls =====
  const [pickCount, setPickCount] = useState(10);
  const [pickRows, setPickRows] = useState(5);
  const [pickCols, setPickCols] = useState(8);

  // ===== Countdown =====
  const [countdownSec, setCountdownSec] = useState(90);

  // Auto-score once a round is closed
  useEffect(() => {
    if (round && !round.isOpen && !round.scored) {
      const r2 = { ...round, scored: true };
      const standings = computeStandings(r2);
      applySeasonPoints(room, r2, standings, roster);
      saveRoomRound(room, r2);
      setRound(r2);
    }
  }, [round?.isOpen]);

  if (round?.revealBoard) {
    return <Leaderboards room={room} round={round} />;
  }

  // Preview scenario (for SP) or generated nodes (for other modes)
  // Preview scenario (for SP) or generated/preset nodes (for other modes)
// Preview scenario (SP uses presets/custom; other modes have their own sources)
const baseScenario =
  gameMode === "sp"
    ? (selScenario === "custom"
        ? (customScenario || makeCustomScenario(customNodes, customObjective, {
            spread: customSpread, density: customDensity, height: 360, minDist: 44
          }))
        : selScenario === "builder"
        ? builderScenario
        : ([...scenarios, ...spCalgaryPresets].find((x) => x.id === (round?.scenarioId || selScenario))))
    : gameMode === "tsp"
    ? (selTspScenario === "custom"
        ? makeTspScenario(tspNodes)
        : (tspPresets.find(x => x.id === (round?.scenarioId || selTspScenario))))
    : gameMode === "vrp"
    ? (selVrpScenario === "custom"
        ? makeVrpScenario(vrpCustomers, vrpCapacity)
        : (vrpPresets.find(x => x.id === (round?.scenarioId || selVrpScenario))))
    : gameMode === "tp"
    ? (tpPresets.find(x => x.id === (round?.scenarioId || selTpScenario)))
    : gameMode === "ts"
    ? (tsPresets.find(x => x.id === (round?.scenarioId || selTsScenario)))


    : makePickingScenario(pickRows, pickCols, pickCount);


  const onOpen = async () => {
  const id = Math.random().toString(36).slice(2, 8).toUpperCase();
  const now = Date.now();
  const endsAt = countdownSec > 0 ? now + countdownSec * 1000 : null;

  let payload;
  if (gameMode === "sp") {
    payload = {
      scenarioId: selScenario,
      customScenario:
        selScenario === "custom"
          ? (customScenario || makeCustomScenario(customNodes, customObjective, {
              spread: customSpread, density: customDensity, height: 360, minDist: 44
            }))
          : (selScenario === "builder" ? builderScenario : null),
      objectiveMode: objMode,
      objA, objB, alpha,
    };
  } else if (gameMode === "tsp") {
  if (selTspScenario === "custom") {
    payload = { scenarioId: "tsp", customScenario: makeTspScenario(tspNodes) };
  } else {
    payload = { scenarioId: selTspScenario }; // preset; no customScenario
  }
} else if (gameMode === "vrp") {
  if (selVrpScenario === "custom") {
    payload = { scenarioId: "vrp", customScenario: makeVrpScenario(vrpCustomers, vrpCapacity) };
  } else {
    payload = { scenarioId: selVrpScenario }; // preset; no customScenario
  }
  } else if (gameMode === "tp") {
  const scn = tpPresets.find(s => s.id === selTpScenario) || tpPresets[0];
  payload = { scenarioId: scn.id, customScenario: scn };
} else if (gameMode === "ts") {
  const scn = tsPresets.find(s => s.id === selTsScenario) || tsPresets[0];
  payload = { scenarioId: scn.id, customScenario: scn };
  } else {
  // existing pick payload…
    payload = { scenarioId: "pick", customScenario: makePickingScenario(pickRows, pickCols, pickCount) };
  }

  const newRound = {
    id, room,
    isOpen: true, revealBoard: false, players: {},
    startedAt: now, endsAt, durationSec: countdownSec, scored: false,
    gameMode,
    ...payload,
  };

  await saveRoomRound(room, newRound);
  setRound(newRound);
};


  const onClose = async () => {
  if (!round) return;
  const now = Date.now();
  const r = { ...round, isOpen: false, endsAt: round?.endsAt ?? now };
  await saveRoomRound(room, r);
  setRound(r);
};


  const onReveal = async () => {
  if (!round) return;
  const now = Date.now();
  const r = { ...round, revealBoard: true, revealUntil: now + 60000, isOpen: false, endsAt: round?.endsAt ?? now };
  await saveRoomRound(room, r);
  setRound(r);
};


  const onReset = async () => {
  await saveRoomRound(room, null);   // now it CLOSES instead of deleting
  setRound(null);                    // ensure UI jumps to Leaderboards
};

  const onSeasonReset = async () => {
    await dbResetSeason(room);
    saveSeason(room, { totals: {}, history: [] });
  };


  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="rounded-2xl bg-white/5 p-6 ring-1 ring-white/10 shadow-xl lg:col-span-2">
        <h2 className="text-xl font-bold mb-1">Instructor Console</h2>
        <p className="text-sm text-slate-300 mb-4">Room <span className="font-semibold">{room}</span> • Roster {roster.length}</p>

        {!round ? (
          <div className="space-y-6">
            {/* Game mode + countdown */}
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-300 mb-1">Game Mode</label>
                <select value={gameMode} onChange={(e)=>setGameMode(e.target.value)} className="bg-white/10 rounded-xl px-4 py-2.5 w-full">
                <option value="tp">Transportation (cost minimization)</option>
                <option value="ts">Transshipment (hubs)</option>
                <option value="sp">Shortest Path</option>
                <option value="tsp">TSP (visit all + return)</option>
                <option value="vrp">VRP (capacity)</option>
                <option value="pick">Warehouse Order Picking</option>
              </select>

              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Countdown (seconds)</label>
                <input type="number" min={10} max={900} value={countdownSec}
                       onChange={(e)=>setCountdownSec(Number(e.target.value))}
                       className="bg-white/10 rounded-xl px-4 py-2.5 w-full" />
                <div className="text-xs text-slate-400 mt-1">Auto-closes at 0s. No submit = 0 points.</div>
              </div>
            </div>

            {/* Mode-specific controls */}
            {gameMode === "sp" && (
              <>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-slate-300 mb-1">Scenario</label>
                    <select value={selScenario} onChange={(e)=>setSelScenario(e.target.value)} className="bg-white/10 rounded-xl px-4 py-2.5 w-full">
                      {[...scenarios, ...spCalgaryPresets].map(s => <option key={s.id} value={s.id}>{s.title}</option>)}

                      <option value="custom">Custom (Generated)</option>
                      <option value="builder">Custom (Manual Builder)</option>
                    </select>
                    {selScenario !== "custom" && <div className="text-xs text-slate-300 mt-2">{(scenarios.find(x=>x.id===selScenario)||{}).subtitle}</div>}
                  </div>
                  <div>
                    <label className="block text-xs text-slate-300 mb-1">Objective Mode</label>
                    <select value={objMode} onChange={(e)=>setObjMode(e.target.value)} className="bg-white/10 rounded-xl px-4 py-2.5 w-full">
                      <option value="single">Single</option>
                      <option value="dual">Dual (weighted)</option>
                    </select>
                  </div>
                </div>

                {objMode === "single" ? (
                  <div>
                    <label className="block text-xs text-slate-300 mb-1">Objective</label>
                    <select value={objA} onChange={(e)=>setObjA(e.target.value)} className="bg-white/10 rounded-xl px-3 py-2 w-full">
                      <option value="time">Time</option><option value="cost">Cost</option><option value="co2">CO₂</option>
                    </select>
                  </div>
                ) : (
                  <div className="grid md:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-slate-300 mb-1">Objective A</label>
                      <select value={objA} onChange={(e)=>setObjA(e.target.value)} className="bg-white/10 rounded-xl px-3 py-2 w-full">
                        <option value="time">Time</option><option value="cost">Cost</option><option value="co2">CO₂</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-300 mb-1">Objective B</label>
                      <select value={objB} onChange={(e)=>setObjB(e.target.value)} className="bg-white/10 rounded-xl px-3 py-2 w-full">
                        <option value="time">Time</option><option value="cost">Cost</option><option value="co2">CO₂</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-300 mb-1">Weight α (A vs B)</label>
                      <input type="range" min={0} max={100} value={alphaPct} onChange={(e)=>setAlphaPct(Number(e.target.value))} className="w-full" />
                      <div className="text-xs text-slate-400 mt-1">Effective = α·A + (1−α)·B (α={alpha.toFixed(2)})</div>
                    </div>
                  </div>
                )}

                {selScenario === "custom" && (
                  <div className="rounded-xl bg-black/20 p-4">
                    <div className="font-semibold mb-2">Custom Network</div>
                    <div className="grid md:grid-cols-4 gap-3">
                      <div><label className="block text-xs text-slate-300 mb-1"># Nodes</label>
                        <input type="number" min={6} max={30} value={customNodes} onChange={(e)=>setCustomNodes(Number(e.target.value))}
                               className="bg-white/10 rounded-xl px-3 py-2 w-full" /></div>
                      <div><label className="block text-xs text-slate-300 mb-1">Base Objective</label>
                        <select value={customObjective} onChange={(e)=>setCustomObjective(e.target.value)}
                                className="bg-white/10 rounded-xl px-3 py-2 w-full">
                          <option value="time">Time</option><option value="cost">Cost</option><option value="co2">CO₂</option>
                        </select></div>
                      <div><label className="block text-xs text-slate-300 mb-1">Spread</label>
                        <input type="number" min={1} max={3} step={0.1} value={customSpread} onChange={(e)=>setCustomSpread(Number(e.target.value))}
                               className="bg-white/10 rounded-xl px-3 py-2 w-full" /></div>
                      <div><label className="block text-xs text-slate-300 mb-1">Edge Density</label>
                        <input type="number" min={1} max={3} value={customDensity} onChange={(e)=>setCustomDensity(Number(e.target.value))}
                               className="bg-white/10 rounded-xl px-3 py-2 w-full" /></div>
                      <div className="md:col-span-4">
                        <button onClick={() => setCustomScenario(makeCustomScenario(customNodes, customObjective, {
                                  spread: customSpread, density: customDensity, height: 360, minDist: 44}))}
                                className="w-full bg-indigo-600 hover:bg-indigo-500 rounded-xl px-3 py-2 font-semibold">
                          Generate Preview
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                {selScenario === "builder" && (
                  <div className="md:col-span-2">
                    <ManualSPBuilder value={builderScenario} onChange={setBuilderScenario} />
                  </div>
                )}

              </>
            )}
            {gameMode === "tp" && (
  <label className="flex items-center gap-2">
    <span className="text-xs text-slate-300">TP Scenario</span>
    <select
      className="bg-white/10 rounded-xl px-4 py-2.5"
      value={selTpScenario}
      onChange={(e) => setSelTpScenario(e.target.value)}
    >
      {tpPresets.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
    </select>
  </label>
              )}

              {gameMode === "ts" && (
                <label className="flex items-center gap-2">
                  <span className="text-xs text-slate-300">TS Scenario</span>
                  <select
                    className="bg-white/10 rounded-xl px-4 py-2.5"
                    value={selTsScenario}
                    onChange={(e) => setSelTsScenario(e.target.value)}
                  >
                    {tsPresets.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
                  </select>
                </label>
              )}




            {gameMode === "tsp" && (
  <div className="grid md:grid-cols-3 gap-4">
    <div>
      <label className="block text-xs text-slate-300 mb-1">Scenario</label>
      <select
        value={selTspScenario}
        onChange={(e)=>setSelTspScenario(e.target.value)}
        className="bg-white/10 rounded-xl px-4 py-2.5 w-full"
      >
        <option value="custom">Custom (Generated)</option>
        {tspPresets.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
      </select>
      {selTspScenario !== "custom" && (
        <div className="text-xs text-slate-400 mt-1">
          {(tspPresets.find(x=>x.id===selTspScenario)||{}).subtitle}
        </div>
      )}
    </div>
    {selTspScenario === "custom" && (
      <div>
        <label className="block text-xs text-slate-300 mb-1"># Nodes (incl. depot)</label>
        <input
          type="number" min={6} max={18} value={tspNodes}
          onChange={(e)=>setTspNodes(Number(e.target.value))}
          className="bg-white/10 rounded-xl px-4 py-2.5 w-full"
        />
        <div className="text-xs text-slate-400 mt-1">Visit all, return to S. Baseline uses NN + 2-opt.</div>
      </div>
    )}
  </div>
)}


            {gameMode === "vrp" && (
  <div className="grid md:grid-cols-3 gap-4">
    <div>
      <label className="block text-xs text-slate-300 mb-1">Scenario</label>
      <select
        value={selVrpScenario}
        onChange={(e)=>setSelVrpScenario(e.target.value)}
        className="bg-white/10 rounded-xl px-4 py-2.5 w-full"
      >
        <option value="custom">Custom (Generated)</option>
        {vrpPresets.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
      </select>
      {selVrpScenario !== "custom" && (
        <div className="text-xs text-slate-400 mt-1">
          {(vrpPresets.find(x=>x.id===selVrpScenario)||{}).subtitle}
        </div>
      )}
    </div>
    {selVrpScenario === "custom" && (
      <>
        <div>
          <label className="block text-xs text-slate-300 mb-1"># Customers</label>
          <input
            type="number" min={6} max={30} value={vrpCustomers}
            onChange={(e)=>setVrpCustomers(Number(e.target.value))}
            className="bg-white/10 rounded-xl px-4 py-2.5 w-full"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-300 mb-1">Vehicle Capacity</label>
          <input
            type="number" min={4} max={20} value={vrpCapacity}
            onChange={(e)=>setVrpCapacity(Number(e.target.value))}
            className="bg-white/10 rounded-xl px-4 py-2.5 w-full"
          />
          <div className="text-xs text-slate-400 mt-1">Demand per customer is 1–4.</div>
        </div>
      </>
    )}
  </div>
)}


            {gameMode === "pick" && (
              <div className="grid md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs text-slate-300 mb-1">Rows</label>
                  <input type="number" min={3} max={12} value={pickRows}
                         onChange={(e)=>setPickRows(Number(e.target.value))}
                         className="bg-white/10 rounded-xl px-4 py-2.5 w-full" />
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">Cols</label>
                  <input type="number" min={4} max={18} value={pickCols}
                         onChange={(e)=>setPickCols(Number(e.target.value))}
                         className="bg-white/10 rounded-xl px-4 py-2.5 w-full" />
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1"># Picks</label>
                  <input type="number" min={5} max={Math.max(5, pickRows*pickCols-1)} value={pickCount}
                         onChange={(e)=>setPickCount(Number(e.target.value))}
                         className="bg-white/10 rounded-xl px-4 py-2.5 w-full" />
                  <div className="text-xs text-slate-400 mt-1">Start/End at Dock (S). Manhattan distance.</div>
                </div>
              </div>
            )}

            <button onClick={onOpen} className="bg-emerald-600 hover:bg-emerald-500 rounded-xl px-4 py-2.5 font-semibold">
              Open Round
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <RoundStatus round={round} />
            <div className="flex flex-wrap gap-2">
              <button onClick={onClose} className="bg-amber-600 hover:bg-amber-500 rounded-xl px-4 py-2.5 font-semibold">Close Round</button>
              <button onClick={onReveal} className="bg-indigo-600 hover:bg-indigo-500 rounded-xl px-4 py-2.5 font-semibold">Reveal Leaderboards</button>
              <button onClick={onReset} className="bg-white/10 hover:bg-white/20 rounded-xl px-4 py-2.5 font-semibold">Reset</button>
            </div>
            <button onClick={onSeasonReset} className="mt-1 text-xs text-slate-500 opacity-40 hover:opacity-100 hover:text-red-400 underline">Reset Season Leaderboard</button>
          </div>
        )}
      </div>

      <div className="rounded-2xl bg-gradient-to-br from-indigo-800/60 to-fuchsia-900/60 p-6 ring-1 ring-white/10 shadow-xl">
        <h3 className="font-bold mb-2">Classroom Instructions</h3>
        <ol className="text-sm space-y-2 text-indigo-100 list-decimal ml-4">
          <li>Show room code: <span className="font-semibold">{room}</span>.</li>
          <li>Open a round (choose mode + settings).</li>
          <li>Students submit before the countdown ends.</li>
          <li>Close or auto-close at 0s.</li>
          <li>Reveal leaderboards: This Round + Season.</li>
        </ol>
        <p className="text-xs text-indigo-200 mt-3">Season points: 1st → 19, 2nd → 18, … 20th → 0.</p>
      </div>

      <div className="lg:col-span-3">
        <LivePreviewCard round={round} baseScenario={baseScenario} />
      </div>
    </div>
  );
}



function RoundStatus({ round }) {
  const s = getScenarioFromRound(round);
  const left = round.endsAt ? Math.max(0, Math.ceil((round.endsAt - Date.now()) / 1000)) : null;
  const mode = round.gameMode || "sp";

  const cap = s?.capacity ?? round.customScenario?.capacity ?? null;

  const lines = (() => {
    if (mode === "sp") {
      const baseA = (round.objA || s?.objective || "time").toUpperCase();
      if (round.objectiveMode === "dual") {
        const baseB = (round.objB || (baseA === "TIME" ? "COST" : "CO2")).toUpperCase();
        return [
          "Start at S and reach T.",
          `Objective: minimize α·${baseA} + (1−α)·${baseB}`,
          "Click nodes along directed edges only.",
          "Submit at T before timer ends.",
        ];
      }
      return [
        "Start at S and reach T.",
        `Objective: minimize ${baseA}`,
        "Click nodes along directed edges only.",
        "Submit at T before timer ends.",
      ];
    }
    if (mode === "tsp") {
      return [
        "TSP: start at S, visit every node exactly once, return to S.",
        "Distances are Euclidean. No revisits (except final S).",
        "See the Leg Distances panel below the map.",
        "Submit only when tour is complete.",
      ];
    }
    if (mode === "vrp") {
      return [
        `VRP: serve all customers. Capacity Q = ${cap}.`,
        "Each customer’s demand is shown as d:x next to the node.",
        "Click customers in sequence; click S anytime to return and reset load.",
        "App auto-splits routes when capacity would overflow.",
        "See current load and leg distances below the map.",
        "Submit after all customers are served and you're back at S.",
      ];
    }
    return [
      "Warehouse Picking: start at S (Dock), visit all picks, return to S.",
      "Distance is Manhattan (grid) — no diagonals.",
      "Use the Leg Distances panel for step-by-step totals.",
      "Submit when all picks are visited and you're back at S.",
    ];
  })();

  return (
    <div className="rounded-xl bg-white/5 p-4 ring-1 ring-white/10">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="text-sm text-slate-300">Round</div>
          <div className="font-mono text-lg">#{round.id}</div>
        </div>
        <div className="min-w-[220px]">
          <div className="text-sm text-slate-300">Scenario</div>
          <div className="font-semibold">{s?.title || "—"}</div>
          <ul className="text-xs text-slate-300 mt-1 list-disc ml-4 space-y-1">
            {lines.map((t, i) => <li key={i}>{t}</li>)}
          </ul>
        </div>
        <div className="text-right">
          <div className="text-sm text-slate-300">Status</div>
          <div className={`font-semibold ${round.isOpen ? "text-emerald-400" : "text-amber-400"}`}>
            {round.isOpen ? "OPEN" : "CLOSED"}
          </div>
          {left !== null && round.isOpen && (
            <div className={`mt-1 font-bold tabular-nums ${
              left <= 10 ? "text-red-400" : left <= 30 ? "text-yellow-300" : "text-slate-200"
            }`}>
              {left}s left
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


// ------------------ Manual Shortest-Path Builder ------------------
function ManualSPBuilder({ value, onChange }) {
  // Local working state
  const [nodeIds, setNodeIds] = React.useState(() =>
    value?.nodes?.map(n => n.id) ?? ["A","B","C","D","E","F","G","H","I"]
  );
  const [start, setStart] = React.useState(value?.start ?? nodeIds[0]);
  const [end, setEnd] = React.useState(value?.end ?? nodeIds[nodeIds.length - 1]);
  const [directed, setDirected] = React.useState(true);
  const [edgeForm, setEdgeForm] = React.useState({
    from: nodeIds[0], to: nodeIds[1] || nodeIds[0], time: 5, cost: 10, co2: 3
  });
  const [edges, setEdges] = React.useState(() => {
    if (value?.edges?.length) {
      return value.edges.map(([u,v,meta]) => ({
        from:u, to:v,
        time: Number(meta?.time ?? 0),
        cost: Number(meta?.cost ?? 0),
        co2:  Number(meta?.co2  ?? 0),
      }));
    }
    return [];
  });

  // Keep selects valid as nodes change
  React.useEffect(() => {
    if (!nodeIds.includes(start)) setStart(nodeIds[0] || "");
    if (!nodeIds.includes(end))   setEnd(nodeIds[1] || nodeIds[0] || "");
    setEdgeForm(f => ({
      ...f,
      from: nodeIds.includes(f.from) ? f.from : (nodeIds[0] || ""),
      to: nodeIds.includes(f.to) ? f.to : (nodeIds[1] || nodeIds[0] || "")
    }));
  }, [nodeIds]); // eslint-disable-line

  function addNodeRaw(id) {
    const clean = (id || "").trim().toUpperCase();
    if (!clean || nodeIds.includes(clean)) return;
    setNodeIds(prev => [...prev, clean]);
  }
  function removeNode(id) {
    setNodeIds(prev => prev.filter(x => x !== id));
    setEdges(prev => prev.filter(e => e.from !== id && e.to !== id));
  }
  function addEdge() {
    const { from, to, time, cost, co2 } = edgeForm;
    if (!from || !to || from === to) return;
    setEdges(prev => [...prev, { from, to, time: Number(time), cost: Number(cost), co2: Number(co2) }]);
  }
  function removeEdge(i) {
    setEdges(prev => prev.filter((_, idx) => idx !== i));
  }

  // Auto-layout nodes on a circle for the map (SvgMap needs x,y)
  function layoutNodes(ids) {
    const W = 1000, H = 560, cx = W/2, cy = H/2, R = Math.min(W,H)*0.35;
    return ids.map((id, k) => {
      const ang = (2*Math.PI * k) / Math.max(1, ids.length);
      return { id, x: Math.round(cx + R*Math.cos(ang)), y: Math.round(cy + R*Math.sin(ang)), label: id };
    });
  }

  // Build scenario object your app already understands
  function buildScenario() {
    const nodes = layoutNodes(nodeIds);
    const quad = edges.map(e => [e.from, e.to, { time: e.time, cost: e.cost, co2: e.co2 }, "🚚"]);
    // If undirected, add reverse edges if missing
    const quadAll = directed ? quad : (() => {
      const set = new Set(quad.map(([u,v]) => u+"→"+v));
      const rev = [];
      for (const [u,v,meta,mode] of quad) {
        const key = v+"→"+u;
        if (!set.has(key)) rev.push([v,u,meta,mode]);
      }
      return quad.concat(rev);
    })();
    return {
      id: "builder",
      title: "Manual Builder",
      subtitle: "Your custom SP graph",
      start, end,
      nodes,
      edges: quadAll,        // [u,v,{time,cost,co2}, mode]
      modifiers: [],
      _hasMetrics: true      // tells edgeMetricsForScenario to use the {time,cost,co2}
    };
  }

  // Push up to parent whenever inputs change
  React.useEffect(() => { onChange?.(buildScenario()); }, [nodeIds, start, end, directed, edges]); // eslint-disable-line

  // UI
  const [newNodeId, setNewNodeId] = React.useState("");

  return (
    <div className="border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="font-semibold">Custom Shortest Path (Manual Builder)</div>
        <label className="text-sm">
          <input type="checkbox" className="mr-2" checked={directed} onChange={e => setDirected(e.target.checked)} />
          Directed edges
        </label>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {/* Nodes */}
        <div className="border rounded-lg p-3">
          <div className="font-medium mb-2">Nodes ({nodeIds.length})</div>
          <div className="flex gap-2 mb-2">
            <input className="border rounded px-2 py-1 w-24"
                   placeholder="e.g., J"
                   value={newNodeId}
                   onChange={e => setNewNodeId(e.target.value.toUpperCase())}
                   onKeyDown={(e)=>{ if(e.key==='Enter'){ addNodeRaw(newNodeId); setNewNodeId(""); }}} />
            <button className="border rounded px-2 py-1" onClick={()=>{ addNodeRaw(newNodeId); setNewNodeId(""); }}>Add</button>
            <button className="border rounded px-2 py-1"
              onClick={()=>{
                const ids = ["A","B","C","D","E","F","G","H","I"];
                setNodeIds(ids); setStart(ids[0]); setEnd(ids[ids.length-1]); setEdges([]);
              }}>
              9-node template
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {nodeIds.map(id => (
              <span key={id} className="inline-flex items-center gap-2 border rounded px-2 py-1">
                {id}
                <button className="text-red-600" onClick={()=>removeNode(id)}>×</button>
              </span>
            ))}
          </div>
        </div>

        {/* Edges */}
        <div className="border rounded-lg p-3">
          <div className="font-medium mb-2">Edges ({edges.length})</div>
          <div className="grid grid-cols-6 gap-2 items-end mb-2">
            <label className="col-span-2 text-sm">
              From
              <select className="w-full border rounded px-2 py-1"
                      value={edgeForm.from}
                      onChange={e => setEdgeForm(f => ({ ...f, from: e.target.value }))}>
                {nodeIds.map(n => <option key={n}>{n}</option>)}
              </select>
            </label>
            <label className="col-span-2 text-sm">
              To
              <select className="w-full border rounded px-2 py-1"
                      value={edgeForm.to}
                      onChange={e => setEdgeForm(f => ({ ...f, to: e.target.value }))}>
                {nodeIds.map(n => <option key={n}>{n}</option>)}
              </select>
            </label>
            <label className="text-sm">
              Time
              <input className="w-full border rounded px-2 py-1" type="number" min="0"
                     value={edgeForm.time}
                     onChange={e => setEdgeForm(f => ({ ...f, time: e.target.value }))} />
            </label>
            <label className="text-sm">
              Cost
              <input className="w-full border rounded px-2 py-1" type="number" min="0"
                     value={edgeForm.cost}
                     onChange={e => setEdgeForm(f => ({ ...f, cost: e.target.value }))} />
            </label>
            <label className="text-sm">
              CO₂
              <input className="w-full border rounded px-2 py-1" type="number" min="0"
                     value={edgeForm.co2}
                     onChange={e => setEdgeForm(f => ({ ...f, co2: e.target.value }))} />
            </label>
            <div>
              <button className="border rounded px-2 py-1" onClick={addEdge}>Add Edge</button>
            </div>
          </div>
          <div className="max-h-40 overflow-auto border rounded">
            <table className="text-sm w-full">
              <thead>
                <tr className="bg-gray-100">
                  <th className="text-left px-2 py-1">From</th>
                  <th className="text-left px-2 py-1">To</th>
                  <th className="text-left px-2 py-1">Time</th>
                  <th className="text-left px-2 py-1">Cost</th>
                  <th className="text-left px-2 py-1">CO₂</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {edges.map((e, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-2 py-1">{e.from}</td>
                    <td className="px-2 py-1">{e.to}</td>
                    <td className="px-2 py-1">{e.time}</td>
                    <td className="px-2 py-1">{e.cost}</td>
                    <td className="px-2 py-1">{e.co2}</td>
                    <td className="px-2 py-1">
                      <button className="text-red-600" onClick={()=>removeEdge(i)}>Delete</button>
                    </td>
                  </tr>
                ))}
                {!edges.length && (
                  <tr><td className="px-2 py-2 text-gray-500" colSpan={6}>No edges yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Start/End */}
        <div className="border rounded-lg p-3">
          <div className="font-medium mb-2">Start / End</div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-sm">
              Start
              <select className="w-full border rounded px-2 py-1" value={start} onChange={e => setStart(e.target.value)}>
                {nodeIds.map(n => <option key={n}>{n}</option>)}
              </select>
            </label>
            <label className="text-sm">
              End
              <select className="w-full border rounded px-2 py-1" value={end} onChange={e => setEnd(e.target.value)}>
                {nodeIds.map(n => <option key={n}>{n}</option>)}
              </select>
            </label>
          </div>
          <div className="text-xs text-slate-500 mt-2">
            Objective (time / cost / CO₂ or dual) is chosen in the console above and applied automatically.
          </div>
        </div>
      </div>
    </div>
  );
}

function LivePreviewCard({ round, baseScenario }) {
  const s = round ? getScenarioFromRound(round) : baseScenario;
  if (!s) return null;
  return (
    <div className="rounded-2xl bg-white/5 p-6 ring-1 ring-white/10 shadow-xl">
      <h3 className="font-bold mb-3">Map Preview</h3>
      <MapPreview scenario={s} />
    </div>
  );
}
// ===== Cost map for Transportation (TP): one S→D heatmap =====
function TpCostHeatmap({ scenario }) {
  const S = scenario?.supplies || [];
  const D = scenario?.demands || [];
  const all = [];
  for (const s of S) for (const d of D) {
    const key = `${s.id}>${d.id}`;
    const c = scenario?.cost?.[key];
    if (c != null) all.push(Number(c));
  }
  const min = all.length ? Math.min(...all) : 0;
  const max = all.length ? Math.max(...all) : 1;
  const shade = (c) => {
    if (c == null) return "rgba(255,255,255,0.03)";
    const t = (Number(c) - min) / (max - min || 1);
    const light = 90 - Math.round(t * 60); // 90 → 30
    return `hsl(200 60% ${light}%)`;
  };

  if (!S.length || !D.length) return null;
  return (
    <div className="rounded-lg border border-white/10 overflow-auto">
      <div className="px-2 py-1 text-xs font-semibold bg-white/5">Per-unit cost (Supply → Demand)</div>
      <table className="min-w-[520px] text-sm">
        <thead>
          <tr>
            <th className="text-left px-2 py-1"></th>
            {D.map(d => <th key={d.id} className="text-left px-2 py-1">{d.label || d.id}</th>)}
          </tr>
        </thead>
        <tbody>
          {S.map(s => (
            <tr key={s.id}>
              <td className="px-2 py-1 font-medium">{s.label || s.id}</td>
              {D.map(d => {
                const key = `${s.id}>${d.id}`;
                const c = scenario?.cost?.[key];
                return (
                  <td key={d.id} className="px-2 py-1 text-center" style={{ background: shade(c) }}>
                    {c != null ? Number(c) : "—"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ===== Cost maps for Transshipment (TS): Supply→Hubs and Hubs→Demand =====
function TsCostTables({ scenario }) {
  const S = scenario?.supplies || [];
  const H = scenario?.hubs || [];
  const D = scenario?.demands || [];
  const arcCost = new Map((scenario?.arcs || []).map(a => [`${a.u}>${a.v}`, Number(a.cost)]));
  const collectCosts = (fromList, toList) => {
    const vals = [];
    for (const u of fromList) for (const v of toList) {
      const c = arcCost.get(`${u.id}>${v.id}`);
      if (c != null) vals.push(c);
    }
    return vals;
  };
  const all = [...collectCosts(S, H), ...collectCosts(H, D)];
  const min = all.length ? Math.min(...all) : 0;
  const max = all.length ? Math.max(...all) : 1;
  const shade = (c) => c == null ? "rgba(255,255,255,0.03)"
                                 : `hsl(260 60% ${90 - Math.round(((c - min) / (max - min || 1)) * 60)}%)`;

  if (!S.length || !H.length || !D.length) return null;

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-white/10 overflow-auto">
        <div className="px-2 py-1 text-xs font-semibold bg-white/5">Per-unit cost (Supply → Hubs)</div>
        <table className="min-w-[520px] text-sm">
          <thead>
            <tr>
              <th className="px-2 py-1"></th>
              {H.map(h => <th key={h.id} className="px-2 py-1 text-left">{h.label || h.id}</th>)}
            </tr>
          </thead>
          <tbody>
            {S.map(s => (
              <tr key={s.id}>
                <td className="px-2 py-1 font-medium">{s.label || s.id}</td>
                {H.map(h => {
                  const c = arcCost.get(`${s.id}>${h.id}`);
                  return <td key={h.id} className="px-2 py-1 text-center" style={{ background: shade(c) }}>{c != null ? c : "—"}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border border-white/10 overflow-auto">
        <div className="px-2 py-1 text-xs font-semibold bg-white/5">Per-unit cost (Hubs → Demand)</div>
        <table className="min-w-[520px] text-sm">
          <thead>
            <tr>
              <th className="px-2 py-1"></th>
              {D.map(d => <th key={d.id} className="px-2 py-1 text-left">{d.label || d.id}</th>)}
            </tr>
          </thead>
          <tbody>
            {H.map(h => (
              <tr key={h.id}>
                <td className="px-2 py-1 font-medium">{h.label || h.id}</td>
                {D.map(d => {
                  const c = arcCost.get(`${h.id}>${d.id}`);
                  return <td key={d.id} className="px-2 py-1 text-center" style={{ background: shade(c) }}>{c != null ? c : "—"}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MapPreview({ scenario }) {
  const hasGraph = Array.isArray(scenario?.nodes) && scenario.nodes.length > 0;
  if (!hasGraph) {
    const isTP = Array.isArray(scenario?.supplies) && Array.isArray(scenario?.demands) && scenario?.cost;
    const isTS = Array.isArray(scenario?.supplies) && Array.isArray(scenario?.hubs) && Array.isArray(scenario?.demands) && Array.isArray(scenario?.arcs);

    return (
      <div className="p-4 text-sm space-y-3">
        <div>
          <div className="font-semibold mb-2">{scenario?.title || "Scenario"}</div>
          {scenario?.supplies && (
            <div className="mb-2">
              <div className="font-medium">Supplies</div>
              <ul className="list-disc ml-5">
                {scenario.supplies.map(s => <li key={s.id}>{(s.label||s.id)}: {s.supply}</li>)}
              </ul>
            </div>
          )}
          {scenario?.hubs?.length > 0 && (
            <div className="mb-2">
              <div className="font-medium">Hubs</div>
              <ul className="list-disc ml-5">
                {scenario.hubs.map(h => <li key={h.id}>{h.label||h.id}</li>)}
              </ul>
            </div>
          )}
          {scenario?.demands && (
            <div className="mb-2">
              <div className="font-medium">Demands</div>
              <ul className="list-disc ml-5">
                {scenario.demands.map(d => <li key={d.id}>{(d.label||d.id)}: {d.demand}</li>)}
              </ul>
            </div>
          )}
        </div>

        {isTP && <TpCostHeatmap scenario={scenario} />}
        {isTS && <TsCostTables scenario={scenario} />}
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl bg-black/20 border border-white/10">
      <SvgMap scenario={scenario} readonly />
    </div>
  );
}



// -----------------------------
// Player Panel
// -----------------------------
function PlayerPanel({ me }) {
  const [round, setRound] = useRound(me.room);

  // ✅ When NO round is active → show Leaderboards
  if (!round) return <Leaderboards room={me.room} round={null} />;

  // If the instructor chose to reveal per-round boards, show them
  if (round.revealBoard) return <Leaderboards room={me.room} round={round} />;

  // If the round is closed but not revealed, also show season Leaderboards
  if (!round.isOpen) return <Leaderboards room={me.room} round={null} />;

  // Otherwise, we're playing
  return <PlayCard me={me} round={round} onRoundUpdate={setRound} />;
}

function WaitingCard({ room }) {
  return (
    <div className="rounded-2xl bg-white/5 p-8 ring-1 ring-white/10 shadow-xl text-center">
      <div className="text-4xl mb-2">⏳</div>
      <h2 className="text-xl font-bold">Waiting for the instructor to open a round</h2>
      <p className="text-slate-300 mt-1">Room <span className="font-semibold">{room}</span></p>
    </div>
  );
}

function ClosedCard() {
  return (
    <div className="rounded-2xl bg-amber-900/40 p-8 ring-1 ring-white/10 shadow-xl text-center">
      <div className="text-4xl mb-2">🔒</div>
      <h2 className="text-xl font-bold">Round closed</h2>
      <p className="text-slate-200 mt-1">Leaderboard will be revealed shortly.</p>
    </div>
  );
}

function Leaderboards({ room, round }) {
  const [season, setSeason] = useState({ totals: {}, history: [] });
  useEffect(() => { (async () => setSeason(await loadSeason(room) || { totals: {}, history: [] }))(); }, [room, round?.id]);

  const hasRound = !!round;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {hasRound && <RoundLeaderboardCard room={room} round={round} />}
      <div className={hasRound ? "" : "lg:col-span-3"}>
        <SeasonLeaderboardCard room={room} season={season} />
      </div>
    </div>
  );

}


function RoundLeaderboardCard({ room, round }) {
  const s = getScenarioFromRound(round);
  const entries = Object.entries(round.players || {}).map(([name, r]) => ({ name, ...r }));
  entries.sort((a, b) => b.score - a.score || a.timeSec - b.timeSec);

  const sNorm = s && Array.isArray(s.nodes) ? s : { ...s, nodes: [], edges: [] };
  const { graphEdges } = useWeightedScenario(sNorm, round);


  const opt = useMemo(() => {
  switch (round.gameMode) {
    case "sp":
      if (!s?.nodes?.length) return { cost: Infinity, path: [] };
      return dijkstra(s.nodes, graphEdges, s.start, s.end);
    case "tsp":
      return tspOptimalCost(s.nodes || []);
    case "vrp":
      return vrpOptimalCost(s);
    case "tp":
      return { path: [], cost: tpOptimalCost(s).cost };
    case "ts":
      return { path: [], cost: tsOptimalCost(s).cost };
    case "pick":
    default:
      return pickOptimalCost(s);
  }
}, [round.gameMode, s, graphEdges]);



  const objLabel = round.objectiveMode === "dual"
  ? `${Math.round(100 * (round.alpha ?? 0.5))}% ${round.objA} + ${Math.round(100 * (1 - (round.alpha ?? 0.5)))}% ${round.objB}`
  : (round.objA || s.objective || "time");


  return (
    <div className="rounded-2xl bg-white/5 p-6 ring-1 ring-white/10 shadow-xl lg:col-span-2">
      <h2 className="text-xl font-bold mb-1">This Round — Room {room}</h2>
      <div className="text-xs text-slate-300">Scenario: {s.title}</div>
      <div className="text-xs text-slate-300 mb-4">
  {round.gameMode === "tp" || round.gameMode === "ts"
    ? <>Optimal cost: {fmt(opt.cost)}</>
    : <>Optimal: {formatPathLabels(s, opt.path, "→")} • {objLabel}: {fmt(opt.cost)}</>
  }
</div>


      <div className="space-y-2">
        {entries.length === 0 && <div className="text-slate-400">No submissions this round.</div>}
        {entries.map((e, i) => (
          <div key={e.name} className={`flex items-center justify-between rounded-xl px-4 py-3 ${i === 0 ? "bg-yellow-500/20" : i === 1 ? "bg-slate-400/20" : i === 2 ? "bg-amber-700/30" : "bg-white/5"}`}>
            <div className="flex items-center gap-3">
              <Medal rank={i + 1} />
              <div>
                <div className="font-semibold">{e.name}</div>
                <div className="text-xs text-slate-300">In-game {e.score} • Cost {fmt(e.cost)} • {e.timeSec}s</div>
              </div>
            </div>
            <div className="text-right text-xs">
              <div>Season points: {Math.max(0, 24 - (i + 1))}</div>
            </div>
          </div>
        ))}
      </div>
      <ExportCsvButtonRound round={round} />
    </div>
  );
}

function SeasonLeaderboardCard({ room, season }) {
  // season totals (existing)
  const totals = Object.entries(season.totals || {}).map(([name, pts]) => ({ name, pts }));

  totals.sort((a, b) => b.pts - a.pts || a.name.localeCompare(b.name));

  const [selectedPlayer, setSelectedPlayer] = React.useState(null);
  const [playerHistory, setPlayerHistory] = React.useState([]);
  useEffect(() => {
    if (!selectedPlayer) return;
    (async () => {
      const rows = await dbListPlayerHistory(room, selectedPlayer, 100);
      setPlayerHistory(rows);
    })();
  }, [room, selectedPlayer]);


  // --- New: Past rounds state ---
  const [histOpen, setHistOpen] = React.useState(false);
  const [histLoading, setHistLoading] = React.useState(false);
  const [hist, setHist] = React.useState([]);            // list of rounds
  const [sel, setSel] = React.useState(null);            // selected round row
  const [subs, setSubs] = React.useState([]);            // submissions for selected round
  const [best, setBest] = React.useState({ path: [], cost: Infinity }); // optimal for selected
  const [selPlayer, setSelPlayer] = React.useState(null);// selected player row

  const [playerHist, setPlayerHist] = React.useState([]);
useEffect(() => {
  let alive = true;
  (async () => {
    if (!selPlayer) { setPlayerHist([]); return; }
    const rows = await dbListPlayerHistory(room, selPlayer.username || selPlayer.name);
    if (!alive) return;
    setPlayerHist(rows);
  })();
  return () => { alive = false; };
}, [selPlayer, room]);


  // Load past rounds when panel is opened
  useEffect(() => {
    if (!histOpen) return;
    let alive = true;
    (async () => {
      setHistLoading(true);
      const rows = await dbListPastRounds(room, 100);
      if (!alive) return;
      setHist(rows);
      setHistLoading(false);
    })();
    return () => { alive = false; };
  }, [histOpen, room]);

function scenarioFromPayload(payload) {
  if (!payload) return null;
  // TP/TS: accept customScenario even without nodes
  if (payload?.customScenario) return payload.customScenario;
  const s = findScenarioById(payload?.scenarioId);
  return s || null;
}



  // Helper: compute optimal for a past round (supports all modes)
// Helper: compute optimal for a past round (supports all modes incl. TP/TS)
function computeOptimalForPayload(scenario, payload) {
  if (!scenario) return { path: [], cost: Infinity };
  const mode = payload?.gameMode || "sp";
  if (mode === "sp") {
    if (!scenario?.nodes?.length) return { path: [], cost: Infinity };
    const edges = buildGraphEdges(scenario, payload);
    return dijkstra(scenario.nodes, edges, scenario.start, scenario.end);
  } else if (mode === "tsp") {
    return tspOptimalCost(scenario.nodes);
  } else if (mode === "vrp") {
    return vrpOptimalCost(scenario);
  } else if (mode === "tp") {
    const { cost } = tpOptimalCost(scenario);
    return { path: [], cost };
  } else if (mode === "ts") {
    const { cost } = tsOptimalCost(scenario);
    return { path: [], cost };
  } else {
    return pickOptimalCost(scenario);
  }
}




  // Helper: recompute a player's path cost for a past round
function costForPayloadPath(scenario, payload, playerPath) {
  if (!Array.isArray(playerPath) || playerPath.length < 2) return null;
  const mode = payload?.gameMode || "sp";
  if (mode === "sp") {
    const edges = buildGraphEdges(scenario, payload);
    return computePathCost(scenario, payload, playerPath, edges);
  } else if (mode === "tsp") {
    return tspTourCost(playerPath, scenario.nodes);
  } else if (mode === "vrp") {
    return vrpRouteCostFromSequence(playerPath, scenario);
  } else { // pick
    return pickTourCost(playerPath, scenario);
  }
}


  async function openHistoryRound(row) {
    setSelPlayer(null);
    setSel(row);
    const payload = row?.payload || {};
    const scenario = scenarioFromPayload(payload);
    const opt = computeOptimalForPayload(scenario, payload);
    setBest(opt);
    const s = await dbListSubmissions(row.id);
    if (s && s.length) {
      setSubs(s);
    } else {
      const players = Object.entries(payload.players || {}).map(([username, r]) => ({
        id: username,
        username,
        score: r.score,
        cost: r.cost,
        time_sec: r.timeSec,
        path: r.path,
      }));
      setSubs(players);
    }
  }

  return (
    <div className="rounded-2xl bg-gradient-to-br from-emerald-800/60 to-teal-900/60 p-6 ring-1 ring-white/10 shadow-xl">
      <h3 className="font-bold mb-2">Season Leaderboard</h3>
      <div className="text-xs text-emerald-200 mb-3">Cumulative points across all rounds (24 − place, min 0).</div>

      <div className="space-y-2">
        {totals.length === 0 && <div className="text-emerald-200/80">No points yet.</div>}
        {totals.map((e, i) => (
          <div key={e.name} className={`flex items-center justify-between rounded-xl px-3 py-2 ${i === 0 ? "bg-yellow-500/20" : i === 1 ? "bg-slate-400/20" : i === 2 ? "bg-amber-700/30" : "bg-white/5"}`}>
            <div className="flex items-center gap-3">
              <Medal rank={i + 1} />
              <button className="font-semibold hover:underline" onClick={() => setSelectedPlayer(e.name)}>{e.name}</button>
            </div>
            <div className="text-right text-sm font-bold">{e.pts} pts</div>
          </div>
        ))}
      </div>

      <ExportCsvButtonSeason room={room} />

        {selectedPlayer && (
  <div className="mt-4 rounded-xl border border-emerald-300/20 p-3">
    <div className="flex items-center justify-between mb-2">
      <div className="font-semibold">History — {selectedPlayer}</div>
      <button className="text-xs bg-emerald-700 hover:bg-emerald-600 rounded px-2 py-1"
              onClick={() => setSelectedPlayer(null)}>Close</button>
    </div>
    {!playerHistory.length && <div className="opacity-70">No past submissions.</div>}
    <ul className="divide-y divide-emerald-300/20">
      {playerHistory.map(h => (
        <li key={`${h.roundId}`} className="py-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs opacity-80 font-mono">{new Date(h.startedAt).toLocaleString()}</div>
              {h.path && (
  <div className="text-[11px] opacity-75 font-mono">
    path: [{formatPathLabels(scenarioFromPayload(h.payload), h.path, " → ")}]
  </div>
)}

            </div>
            <div className="text-right text-sm">
              <div>Score: <span className="font-mono">{h.score ?? "—"}</span></div>
              <div className="text-xs opacity-80">Cost: {h.cost != null ? Number(h.cost).toFixed(2) : "—"} • {h.timeSec ?? "—"}s</div>
            </div>
          </div>
        </li>
      ))}
    </ul>
  </div>
)}

      {/* === Past Rounds === */}
      <div className="mt-6 rounded-xl border border-emerald-300/20 p-3">
        <div className="flex items-center justify-between">
          <div className="font-semibold">Past Rounds</div>
          <button
            className="px-3 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-600"
            onClick={() => setHistOpen(v => !v)}
          >
            {histOpen ? "Hide" : "Show"}
          </button>
        </div>

        {histOpen && (
          <div className="mt-3">
            {histLoading && <div className="opacity-80">Loading…</div>}
            {!histLoading && !hist.length && <div className="opacity-70">No past rounds.</div>}

            <ul className="divide-y divide-emerald-300/20">
              {hist.map(r => (
                <li key={r.id} className="py-2 flex items-center justify-between">
                  <div>
                    <div className="font-mono text-xs">Round: {r.id}</div>
                    <div className="text-xs opacity-80">{new Date(r.started_at || r.created_at).toLocaleString()}</div>
                  </div>
                  <button
                    className="px-3 py-1 rounded-lg bg-teal-700 hover:bg-teal-600"
                    onClick={() => openHistoryRound(r)}
                  >
                    Open
                  </button>
                </li>
              ))}
            </ul>

            {/* Detail panel */}
            {sel && (
              <div className="mt-4 rounded-lg border border-emerald-300/20 p-3">
                {(() => {
                  const payload = sel?.payload || {};
                  const scenario = scenarioFromPayload(payload);
                  if (!scenario?.nodes?.length) return <div className="opacity-70">Scenario unavailable.</div>;
                  
                  const objLabel = payload?.objectiveMode === "dual"
                  ? `${Math.round(100 * (payload?.alpha ?? 0.5))}% ${payload?.objA} + ${Math.round(100 * (1 - (payload?.alpha ?? 0.5)))}% ${payload?.objB}`
                  : (payload?.objA || "time");

                  const optimalScore = Number.isFinite(best.cost) ? best.cost.toFixed(2) : "—";

                  return (
                    <div>
                      <div className="mb-2">
                        <div className="font-semibold">Round {sel.id}</div>
                        <div className="text-xs opacity-80">{new Date(sel.started_at || sel.created_at).toLocaleString()}</div>
                        <div className="text-xs mt-1">Game mode: <span className="font-mono">{payload?.gameMode || "sp"}</span></div>
                        <div className="text-sm mt-1">
                          Optimal ({objLabel}): <span className="font-mono">{optimalScore}</span>
                        </div>

                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                        <div className="lg:col-span-2 rounded-lg overflow-hidden border border-emerald-300/20">
                          <SvgMap scenario={scenario} round={payload} path={selPlayer?.path || []} optPath={best.path} readonly />

                        </div>
                        <div className="rounded-lg border border-emerald-300/20 p[2px] p-2">
                          <div className="font-semibold mb-2">Players</div>
                          {selPlayer && (
                            <div className="mt-3 rounded-lg border border-emerald-300/20 p-2">
                              <div className="font-semibold mb-2">History for {selPlayer.username || selPlayer.name}</div>
                              <ul className="text-xs space-y-1 max-h-48 overflow-auto">
                                {playerHist.map(h => (
                                  <li key={`${h.round_id}-${h.started_at}`} className="flex items-center justify-between">
                                    <span className="font-mono">
                                      {new Date(h.started_at).toLocaleDateString()} • R{h.round_id}
                                    </span>
                                    <span className="font-mono">
                                      {h.cost != null ? Number(h.cost).toFixed(2) : "—"} • {Math.round(h.score ?? 0)}
                                    </span>
                                  </li>
                                ))}
                                {!playerHist.length && <li className="opacity-70">No past submissions.</li>}
                              </ul>
                              {playerHist[0]?.path && (
                                <div className="text-[11px] opacity-75 font-mono mt-2">
                                  last path: [{formatPathLabels(scenarioFromPayload(playerHist[0].payload), playerHist[0].path, " → ")}]

                                </div>
                              )}
                            </div>
                          )}

                          <ul className="space-y-1">
                            {subs.map(row => {
                              const name = row.username || row.user || row.name || "Player";
                              const path = Array.isArray(row.path) ? row.path : null;
                              const cost = row.cost ?? (path ? costForPayloadPath(scenario, payload, path) : null);
                              return (
                                <li key={row.id}>
                                  <button
                                    className={"w-full text-left px-2 py-1 rounded " + (selPlayer?.id === row.id ? "bg-emerald-800" : "hover:bg-emerald-900/50")}
                                    onClick={() => setSelPlayer(row)}
                                  >
                                    <div className="flex items-center justify-between">
                                      <span>{name}</span>
                                      <span className="font-mono">{cost != null ? Number(cost).toFixed(2) : "—"}</span>
                                    </div>
                                    {path && (
                                      <div className="text-[11px] opacity-75 font-mono overflow-hidden text-ellipsis">
                                        path: [{path.join(" → ")}]
                                      </div>
                                    )}
                                  </button>
                                </li>
                              );
                            })}
                            {!subs.length && <li className="opacity-70">No submissions saved.</li>}
                          </ul>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}


function ExportCsvButtonRound({ round }) {
  const onExport = () => {
    const sc = getScenarioFromRound(round);
    const rows = [["name","ingameScore","cost","timeSec","path"]];
    for (const [name, r] of Object.entries(round.players || {})) {
      rows.push([
        name,
        r.score,
        r.cost,
        r.timeSec,
        formatPathLabels(sc, r.path || [], "→")
      ]);
    }
    const csv = rows.map(row => row.map(csvEscape).join(",")).join("\n");
    downloadCsv(csv, `scma_round_${round.id}.csv`);
  };
  return (
    <button onClick={onExport} className="mt-4 bg-emerald-600 hover:bg-emerald-500 rounded-xl px-4 py-2.5 font-semibold w-full">
      Export Round (CSV)
    </button>
  );
}


function ExportCsvButtonSeason({ room }) {
  const onExport = async () => {
    const s = await loadSeason(room);
    const rows = [["name","points"]];
    for (const [name, pts] of Object.entries(s?.totals || {})) {
      rows.push([name, pts]);
    }
    const csv = rows.map(row => row.map(csvEscape).join(",")).join("\n");
    downloadCsv(csv, `scma_season_${room}.csv`);
  };
  return (
    <button onClick={onExport} className="mt-4 bg-teal-600 hover:bg-teal-500 rounded-xl px-4 py-2.5 font-semibold w-full">
      Export Season (CSV)
    </button>
  );
}



function Medal({ rank }) { const m = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : ""; return <div className="text-2xl w-8 text-center">{m}</div>; }

function PlayCard({ me, round, onRoundUpdate }) {
  const [submitted, setSubmitted] = useState(Boolean(round.players?.[me.name]));
  const [elapsed, setElapsed] = useState(0);
  // TP/TS student entry state
  const [shipments, setShipments] = useState({});
  const [liveCost, setLiveCost] = useState(null);
  const [liveFeasible, setLiveFeasible] = useState(true);
  const [violations, setViolations] = useState([]);


  const scenario = getScenarioFromRound(round);

  // timer
  useEffect(() => {
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - (round.startedAt || Date.now())) / 1000)), 300);
    return () => clearInterval(t);
  }, [round.startedAt]);
  const timeLeft = round.endsAt ? Math.max(0, Math.ceil((round.endsAt - Date.now()) / 1000)) : null;

  // graph (SP) — make safe for TP/TS (no nodes)
const sNorm = scenario && Array.isArray(scenario.nodes) ? scenario : { ...scenario, nodes: [], edges: [] };
const { graphEdges, optCost: spOptCost } = useWeightedScenario(sNorm, round);
const spAdj = useMemo(() => new Set(graphEdges.map(([u, v]) => `${u}>${v}`)), [graphEdges]);


  const [path, setPath] = useState([scenario.start || "S"]);
  const currentNode = path[path.length - 1];

  // Precompute cost for SP path separately to keep hooks top-level
 const spPathCost = useMemo(
  () => computePathCost(scenario, round, path, graphEdges),
  [scenario, round, path, graphEdges]
);


  // Precompute leg lists only for active mode (avoids SP crash)
  const legsTsp = useMemo(
    () => (round.gameMode === "tsp" ? computeLegsEuclid(path, scenario.nodes) : []),
    [round.gameMode, path, scenario.nodes]
  );
  const legsPick = useMemo(
    () => (round.gameMode === "pick" ? computeLegsManhattan(path, scenario.nodes) : []),
    [round.gameMode, path, scenario.nodes]
  );
  const legsVrp = useMemo(
    () => (round.gameMode === "vrp" ? computeLegsVrp(path, scenario) : []),
    [round.gameMode, path, scenario]
  );

  // ===== NEW: TSP next-step distance hints =====
  const tspHintLines = useMemo(() => {
    if (round.gameMode !== "tsp") return [];
    const map = Object.fromEntries(scenario.nodes.map(n => [n.id, n]));
    const here = map[currentNode] || map["S"];
    if (!here) return [];
    const unvisited = scenario.nodes.filter(n => n.id !== "S" && !path.includes(n.id));
    const hints = unvisited.map(n => ({
      from: currentNode, to: n.id,
      label: Math.round(Math.hypot(here.x - n.x, here.y - n.y))
    }));
    if (unvisited.length === 0 && currentNode !== "S") {
      const s = map["S"];
      hints.push({ from: currentNode, to: "S", label: Math.round(Math.hypot(here.x - s.x, here.y - s.y)) });
    }
    return hints.sort((a, b) => a.label - b.label);
  }, [round.gameMode, scenario.nodes, currentNode, path]);

  // totals + submit rules per mode
  let totalCost = 0, canSubmit = false, objectiveText = "";

if (round.gameMode === "sp") {
  totalCost = spPathCost;
  objectiveText = round.objectiveMode === "dual"
    ? `minimize α·${round.objA.toUpperCase()} + (1−α)·${round.objB.toUpperCase()}`
    : `minimize ${(round.objA || scenario.objective).toUpperCase()}`;
  canSubmit = currentNode === scenario.end && path.length > 1 &&
              round.isOpen && (!round.endsAt || Date.now() < round.endsAt);
} else if (round.gameMode === "tsp") {
  totalCost = legsTsp.reduce((a, L) => a + L.dist, 0);
  objectiveText = "TSP: visit all nodes, return to S (Euclidean)";
  canSubmit = round.isOpen && (!round.endsAt || Date.now() < round.endsAt) &&
    tspIsComplete(path, scenario.nodes);
} else if (round.gameMode === "vrp") {
  totalCost = legsVrp.reduce((a, L) => a + L.dist, 0);
  objectiveText = `VRP: serve all customers, cap=${scenario.capacity} (Euclidean)`;
  canSubmit = round.isOpen && (!round.endsAt || Date.now() < round.endsAt) &&
    vrpAllCustomersSelected(path, scenario);
} else if (round.gameMode === "tp") {
  const ev = tpEvaluate(scenario, shipments);
  totalCost = ev.totalCost;
  objectiveText = "Transportation: satisfy all supply/demand at minimum cost";
  canSubmit = round.isOpen && (!round.endsAt || Date.now() < round.endsAt) && ev.feasible;
} else if (round.gameMode === "ts") {
  // basic: allow submit; scoring will compare to optimal
  totalCost = Object.entries(shipments || {}).reduce((sum,[k,q]) => {
    const arc = (scenario.arcs||[]).find(a => `${a.u}>${a.v}` === k);
    return sum + (Number(q)||0) * (arc ? Number(arc.cost||0) : 0);
  }, 0);
  objectiveText = "Transshipment: send via allowed hubs to meet demand";
  canSubmit = round.isOpen && (!round.endsAt || Date.now() < round.endsAt);
} else {
  // Order Picking (default)
  totalCost = legsPick.reduce((a, L) => a + L.dist, 0);
  objectiveText = "Order Picking: visit all picks and return to S (Manhattan)";
  canSubmit = round.isOpen && (!round.endsAt || Date.now() < round.endsAt) &&
    pickIsComplete(path, scenario);
}


  // Click rules
  const allowedMove = (u, v) => {
    if (round.gameMode === "sp") return spAdj.has(`${u}>${v}`);
    if (round.gameMode === "tsp") {
      if (v === "S") return path.length >= scenario.nodes.length;
      if (v === u) return false;
      return !path.includes(v);
    }
    if (round.gameMode === "vrp") {
      if (v === "S") return true;
      if (path.includes(v)) return false;
      const demand = scenario.demand || {};
      const cap = scenario.capacity || 8;
      let load = 0;
      for (let i = path.length - 1; i >= 0; i--) {
        const id = path[i];
        if (id === "S") break;
        load += demand[id] ?? 1;
      }
      const dem = demand[v] ?? 1;
      return load + dem <= cap;
    }
    // picking
    if (v === "S") return pickAllVisited(path, scenario);
    return !path.includes(v);
  };

  const onClickNode = (id) => {
    if (submitted) return;
    if (!round.isOpen) return;
    if (!allowedMove(currentNode, id)) return;
    setPath((prev) => [...prev, id]);
  };
  const onUndo = () => { if (!submitted && path.length > 1) setPath(path.slice(0, -1)); };

  // Baselines for scoring
  const optCost =
  round.gameMode === "sp" ? spOptCost :
  round.gameMode === "tsp" ? tspBaselineCost(scenario.nodes).cost :
  round.gameMode === "vrp" ? vrpBaselineCost(scenario).cost :
  round.gameMode === "tp" ? tpOptimalCost(scenario).cost :
  round.gameMode === "ts" ? tsOptimalCost(scenario).cost :
  pickBaselineCost(scenario).cost;

async function onSubmit() {
  if (!round || !me) return;
  const timeSec = Math.max(0, Math.round((Date.now() - (round.startedAt || Date.now())) / 1000));

  let myCost;
  if (round.gameMode === "sp") {
    myCost = Math.round(spPathCost || 0);
  } else if (round.gameMode === "tsp") {
    myCost = Math.round(legsTsp.reduce((a,L)=>a+L.dist,0));
  } else if (round.gameMode === "vrp") {
    myCost = Math.round(legsVrp.reduce((a,L)=>a+L.dist,0));
  } else if (round.gameMode === "tp") {
    const ev = tpEvaluate(scenario, shipments);
    if (!ev.feasible) {
      alert("Please fix feasibility issues before submitting:\n" + ev.violations.join("\n"));
      return;
    }
    myCost = Math.round(ev.totalCost);
  } else if (round.gameMode === "ts") {
    const allowed = new Set((scenario?.arcs||[]).map(a => `${a.u}>${a.v}`));
    let enteredCost = 0;
    for (const [k,q] of Object.entries(shipments||{})) {
      if (!allowed.has(k)) continue;
      const arc = scenario.arcs.find(a => `${a.u}>${a.v}` === k);
      if (!arc) continue;
      enteredCost += Number(q||0) * Number(arc.cost||0);
    }
    myCost = Math.round(enteredCost);
  } else {
    myCost = Math.round(legsPick.reduce((a,L)=>a+L.dist,0));
  }

  // Optimal for scoring
  let optCostVal;
  if (round.gameMode === "tp")       optCostVal = tpOptimalCost(scenario).cost;
  else if (round.gameMode === "ts")  optCostVal = tsOptimalCost(scenario).cost;
  else if (round.gameMode === "sp")  optCostVal = spOptCost;
  else if (round.gameMode === "tsp") optCostVal = tspOptimalCost(scenario.nodes).cost;
  else if (round.gameMode === "vrp") optCostVal = vrpOptimalCost(scenario).cost;
  else                               optCostVal = pickOptimalCost(scenario).cost;

  const score = (Number.isFinite(optCostVal) && optCostVal > 0)
    ? Math.max(0, Math.round(1000 * (optCostVal / Math.max(myCost, optCostVal)) ))
    : 0;

  const r = { ...round, players: { ...(round.players||{}) } };
  if (round.gameMode === "tp" || round.gameMode === "ts") {
    r.players[me.name] = { cost: myCost, timeSec, score, shipments: { ...(shipments||{}) } };
  } else {
    r.players[me.name] = { cost: myCost, timeSec, score, path: [...path] };
  }
  await saveRoomRound(me.room, r);
  onRoundUpdate(r);
}




  // Which leg list to show
  const legList = round.gameMode === "tsp" ? legsTsp
                 : round.gameMode === "vrp" ? legsVrp
                 : round.gameMode === "pick" ? legsPick
                 : [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="rounded-2xl bg-white/5 p-6 ring-1 ring-white/10 shadow-xl lg:col-span-2">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-xl font-bold">{scenario.title}</h2>
            <div className="text-xs text-slate-300">Objective: {objectiveText}</div>
            <div className="text-xs text-slate-300">Score = 1000 × (baseline / your cost) + max(0, 200 − time)</div>
          </div>
          <div className="text-right">
            <div className="text-sm text-slate-300">Time left</div>
            <div className={`text-2xl font-black tabular-nums ${
              timeLeft !== null && timeLeft <= 10 ? "text-red-400"
              : timeLeft !== null && timeLeft <= 30 ? "text-yellow-300" : "text-slate-100"
            }`}>{timeLeft !== null ? `${timeLeft}s` : "—"}</div>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl bg-black/20 border border-white/10">
          {Array.isArray(scenario?.nodes) && scenario.nodes.length > 0 ? (
            <SvgMap
              scenario={scenario}
              round={round}
              path={path}
              onClickNode={onClickNode}
              hintLines={round.gameMode === "tsp" ? tspHintLines : []}
            />
          ) : (
            <MapPreview scenario={scenario} />
          )}
        </div>


        {/* Numbers & legs */}
        <div className="mt-4 grid md:grid-cols-2 gap-3">
          <div className="rounded-xl bg-white/5 p-3">
            <div className="text-sm text-slate-300 flex items-center justify-between">
              <span>Your path:</span>
              <span className="font-mono">{path.join(" → ")}</span>
            </div>
            <div className="mt-2 text-right">
              <div className="text-sm text-slate-300">Total</div>
              <div className="text-xl font-bold">{fmt(totalCost)}</div>
            </div>
          </div>

          {round.gameMode === "vrp" && (
            <div className="rounded-xl bg-white/5 p-3">
              <div className="text-sm text-slate-300">Current Load</div>
              <div className="text-xl font-bold">
                {legList.length ? legList[legList.length - 1].loadAfter : 0} / {scenario.capacity}
              </div>
              <div className="text-xs text-slate-400 mt-1">Click S anytime to return and reset load.</div>
            </div>
          )}
        </div>

        {/* Next-step distances (TSP) */}
        {round.gameMode === "tsp" && (
          <div className="mt-4 rounded-xl bg-white/5 p-3">
            <div className="text-xs font-semibold mb-2">Next-step distances from {currentNode}</div>
            <div className="max-h-48 overflow-auto text-xs font-mono">
              {tspHintLines.map((h, i) => (
                <div key={i} className="flex justify-between py-0.5">
                  <span>{h.from} → {h.to}</span>
                  <span>{h.label}</span>
                </div>
              ))}
              {tspHintLines.length === 0 && <div className="text-slate-400">All visited — close tour by returning to S.</div>}
            </div>
          </div>
        )}

       {round.gameMode === "tp" && (
  <div className="mt-4 space-y-3">
    <TpCostHeatmap scenario={scenario} />
    <TransportMatrix
      scenario={scenario}
      value={shipments}
      onChange={(v)=> {
        setShipments(v);
        const ev = tpEvaluate(scenario, v);
        setLiveCost(ev.totalCost);
        setLiveFeasible(ev.feasible);
        setViolations(ev.violations||[]);
      }}
    />
    <div className="text-sm">
      <div>Total cost: <span className="font-semibold">${Math.round(liveCost||0)}</span></div>
      {!liveFeasible && <div className="text-amber-300 mt-1">Fix: {violations.join(" • ")}</div>}
    </div>
  </div>
)}

{round.gameMode === "ts" && (
  <div className="mt-4 space-y-3">
    <TsCostTables scenario={scenario} />
    <TransshipMatrices
      scenario={scenario}
      value={shipments}
      onChange={(v)=> setShipments(v)}
    />
  </div>
)}


        {/* Leg list for all non-SP modes */}
        {legList.length > 0 && round.gameMode !== "tsp" && (
          <div className="mt-4 rounded-xl bg-white/5 p-3">
            <div className="text-xs font-semibold mb-2">Leg distances</div>
            <div className="max-h-48 overflow-auto text-xs">
              {legList.map((L, i) => (
                <div key={i} className="flex justify-between font-mono py-0.5">
                  <span>{L.from} → {L.to}</span>
                  <span>
                    {Math.round(L.dist)}
                    {typeof L.loadAfter === "number" ? `  | load ${L.loadAfter}/${scenario.capacity}` : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={onUndo} className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl font-semibold">Undo</button>
          <button disabled={!canSubmit || submitted} onClick={onSubmit}
            className={`px-4 py-2 rounded-xl font-semibold ${submitted ? "bg-white/10" : canSubmit ? "bg-emerald-600 hover:bg-emerald-500" : "bg-white/10"}`}>
            {submitted ? "Submitted" : "Submit"}
          </button>
        </div>
      </div>

      <div className="rounded-2xl bg-gradient-to-br from-indigo-800/60 to-fuchsia-900/60 p-6 ring-1 ring-white/10 shadow-xl">
        <h3 className="font-bold mb-2">Round Status</h3>
        <ul className="text-sm text-indigo-100 space-y-2">
          <li>• Start: <span className="font-semibold">{scenario.start || "S"}</span></li>
          <li>• {round.gameMode === "sp" ? "Destination" : "Return"}:
            <span className="font-semibold"> {round.gameMode === "sp" ? scenario.end : "S"}</span>
          </li>
          <li>• Submit before the countdown ends.</li>
        </ul>
      </div>
    </div>
  );
}







function ObjectiveLegend({ objective }) {
  const desc = { time: "Edge labels show minutes.", cost: "Edge labels show $ cost.", co2: "Edge labels show kg CO₂." }[objective];
  return (<div className="text-sm">{desc} Choose the lowest total.</div>);
}

// -----------------------------
// Map (SVG)
// -----------------------------
function SvgMap({ scenario, round = null, path = [], optPath = [], onClickNode, readonly, hintLines = [] }) {

  // Guard: invalid or incomplete scenario
  if (!scenario || !Array.isArray(scenario.nodes)) {
    console.error('SvgMap: scenario or nodes missing:', scenario);
    return null;
  }

  // Sanitize nodes and log any bad entries
  const rawNodes = scenario.nodes || [];
  const nodes = rawNodes.filter(n => n && Number.isFinite(n.x) && Number.isFinite(n.y) && n.id);
  const badNodes = rawNodes.filter(n => !(n && Number.isFinite(n?.x) && Number.isFinite(n?.y) && n?.id));
  if (badNodes.length) console.error('SvgMap: bad node entries:', badNodes, 'in scenario:', scenario);
  if (nodes.length === 0) {
    console.error('SvgMap: no valid nodes in scenario:', scenario);
    return null;
  }

  // Edges for display:
  // - If we have a round (or round-like payload), build weighted edges using the selected objective / α and modifiers.
  // - Otherwise fall back to raw scenario edges (used in simple previews).
  const edges = Array.isArray(scenario.edges) ? (
    round ? buildGraphEdges(scenario, round) : scenario.edges
  ) : [];

  // Auto-fit
  const xs = nodes.map(n => n.x), ys = nodes.map(n => n.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const W = 1200, H = 640, PAD = 50;

  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  const scale = Math.min((W - 2 * PAD) / spanX, (H - 2 * PAD) / spanY);

  const tpos = (n) => ({
    x: Math.round(PAD + (n.x - minX) * scale),
    y: Math.round(PAD + (n.y - minY) * scale),
  });

  const tnodes = nodes.map(n => ({ ...n, ...tpos(n) }));
const vnodes = separateNodes(tnodes, W, H, 36, 24);  // render-only spacing
const nodeById = Object.fromEntries(vnodes.map(n => [n.id, n]));


  // Highlight edges from player's path (SP)
  const selected = new Set();
  for (let i = 0; i < path.length - 1; i++) selected.add(path[i] + ">" + path[i + 1]);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[360px] md:h-[640px]">
      {/* base edges (SP) */}
      {edges.map(([u, v, w, m], idx) => {
        const a = nodeById[u], b = nodeById[v];
        if (!a || !b) return null;
        const sel = selected.has(u + ">" + v);
        // When edges are weighted for the round, w is numeric already (effective weight after α + modifiers).
        // If no round was provided (simple preview), edge meta may be an object → show scenario.objective/time as a fallback.
        const showVal = (typeof w === "number") ? w : (w?.[scenario.objective] ?? w?.time ?? 0);
        return (
          <g key={`e${idx}`}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={sel ? "#34d399" : "#94a3b8"} strokeWidth={sel ? 7 : 4} strokeOpacity={0.9} strokeLinecap="round" />
            <EdgeLabel a={a} b={b} text={`${m || ""} ${showVal}`} />
          </g>
        );
      })}

      {/* Optimal path (draw first, dashed) */}
      {optPath.length > 1 && (
        <polyline
          points={optPath.map(id => {
            const n = nodeById[id];
            return n ? `${n.x},${n.y}` : null;
          }).filter(Boolean).join(" ")}
          fill="none"
          stroke="#16a34a"
          strokeWidth="4"
          strokeOpacity="0.8"
          strokeDasharray="8 8"
        />
      )}

      {/* TSP/Picking/VRP: player's current path */}
      {path.length > 1 && (
        <polyline
          points={path.map(id => {
            const n = nodeById[id];
            return n ? `${n.x},${n.y}` : null;
          }).filter(Boolean).join(" ")}
          fill="none"
          stroke="#60a5fa"
          strokeWidth="5"
          strokeOpacity="0.9"
        />
      )}

      {/* hint lines (e.g., TSP next-step distances) */}
      {Array.isArray(hintLines) && hintLines.map((h, i) => {
        const a = nodeById[h.u], b = nodeById[h.v];
        if (!a || !b) return null;
        return (
          <g key={`hint${i}`}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke="#cbd5e1" strokeOpacity="0.7" strokeWidth="2" strokeDasharray="6 6" />
            <EdgeLabel a={a} b={b} text={String(h.label)} />
          </g>
        );
      })}

      {/* nodes (+ VRP demand badges) */}
{vnodes.map((n, i) => {
  const demand = scenario.demand?.[n.id];
  const isS = n.id === "S";
  const isT = n.id === "T";
  const palette = ["#38bdf8", "#a78bfa", "#f97316", "#f43f5e", "#22d3ee", "#84cc16"];
  const fill = isS ? "#16a34a" : isT ? "#ef4444" : palette[i % palette.length];
  const stroke = isS ? "#22c55e" : isT ? "#fb7185" : "#0ea5e9";
  const emoji = isS ? "🚩" : isT ? "🏁" : "•";

  return (
    <g key={n.id} onClick={() => !readonly && onClickNode?.(n.id)} className="cursor-pointer">
      {/* outer glow ring */}
      <circle cx={n.x} cy={n.y} r={18} fill="none" stroke={fill} strokeOpacity="0.35" strokeWidth="6" />
      {/* main node */}
      <circle cx={n.x} cy={n.y} r={14} fill={fill} stroke={stroke} strokeWidth="2" />
      {/* label + small icon */}
      <text x={n.x} y={n.y - 18} textAnchor="middle" fontSize="14" fill="#cbd5e1">{emoji}</text>
      <text x={n.x} y={n.y + 5} textAnchor="middle" fontWeight="bold" fontSize="14" fill="white">
        {n.label || n.id}
      </text>

      {/* demand badge (VRP) */}
      {Number.isFinite(demand) && (
        <g>
          <rect x={n.x + 14} y={n.y - 20} rx="4" ry="4" width="28" height="16"
                fill="#083344" stroke="#06b6d4" strokeWidth="1" />
          <text x={n.x + 28} y={n.y - 8} textAnchor="middle" fontSize="10" fill="#67e8f9">{demand}</text>
        </g>
      )}
    </g>
  );
})}

    </svg>
  );
}









function EdgeLabel({ a, b, text }) {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;        // normal for offset
  const off = Math.min(24, 10 + len * 0.04);  // larger offset on longer edges
  const ox = mx + nx * off, oy = my + ny * off;

  // dynamic width based on text length (approx char width 7px)
  const w = Math.max(48, text.length * 8 + 12);
  return (
    <g>
      <rect x={ox - w / 2} y={oy - 14} width={w} height={24} rx={8} fill="#111827" opacity={0.85} />
      <text x={ox} y={oy + 4} textAnchor="middle" className="fill-white" style={{ fontSize: 13, fontWeight: 700 }}>
        {text}
      </text>
    </g>
  );
}

// -----------------------------
// Helpers & Hooks
// -----------------------------
function unitForObjective(obj) { return obj === "time" ? "min" : obj === "cost" ? "$" : obj === "co2" ? "kg CO₂" : ""; }
function fmt(x) { if (x >= 1000 && Number.isFinite(x)) return Math.round(x).toLocaleString(); return Math.round(x * 10) / 10; }

function applyModifiers(scenario) {
  if (!scenario.modifiers?.length) return scenario.edges;
  return scenario.edges.map((e) => {
    let factor = 1; for (const mod of scenario.modifiers) factor *= mod.affect(e);
    return [e[0], e[1], Math.max(0.1, Math.round(e[2] * factor * 10) / 10), e[3]];
  });
}

function edgeMetricsForScenario(scenario, edge) {
  // edge: [u, v, wOrMetrics, mode]
  const meta = edge[2];
  if (scenario._hasMetrics && meta && typeof meta === "object") return meta;

  // Static scenarios: derive the missing metrics from the provided weight and mode
  const w = typeof meta === "number" ? meta : (meta?.time ?? meta?.cost ?? meta?.co2 ?? 10);
  const mode = edge[3] || "🚚";

  // Guess conversions so we always have {time,cost,co2}
  let time, cost, co2;
  if (scenario.objective === "time") {
    time = w;
    ({ cost, co2 } = makeMetrics(w, mode));
  } else if (scenario.objective === "cost") {
    cost = w;
    const base = makeMetrics(w / 85, mode); // reverse rough factor
    time = base.time; co2 = base.co2;
  } else {
    co2 = w;
    const base = makeMetrics(w / 1.2, mode);
    time = base.time; cost = base.cost;
  }
  return { time, cost, co2 };
}

function effectiveWeight(scenario, edge, round) {
  const m = edgeMetricsForScenario(scenario, edge);
  if (!round || round.objectiveMode === "single") {
    const obj = round?.objA || scenario.objective || "time";
    return m[obj];
  } else {
    const a = round.objA, b = round.objB, alpha = round.alpha ?? 0.5;
    return alpha * m[a] + (1 - alpha) * m[b];
  }
}

function useWeightedScenario(scenario, round) {
  const graphEdges = useMemo(() => {
    if (!scenario?.edges?.length) return [];
    const withW = scenario.edges.map(([u, v, meta, mode]) => {
      const w = effectiveWeight(scenario, [u, v, meta, mode], round);
      return [u, v, w, mode];
    });
    return applyModifiers({ ...scenario, edges: withW });
  }, [scenario, round?.objectiveMode, round?.objA, round?.objB, round?.alpha]);

  const opt = useMemo(() => {
    if (!scenario?.nodes?.length) return { cost: Infinity, path: [] };
    return dijkstra(scenario.nodes, graphEdges, scenario.start, scenario.end);
  }, [scenario, graphEdges]);

  return { graphEdges, optCost: opt.cost };
}

function buildGraphEdges(scenario, round) {
  if (!scenario?.edges?.length) return [];
  const withW = scenario.edges.map(([u, v, meta, mode]) => {
    const w = effectiveWeight(scenario, [u, v, meta, mode], round);
    return [u, v, w, mode];
  });
  return applyModifiers({ ...scenario, edges: withW });
}




function useRound(room) {
  const [round, setRound] = useState(null);

  useEffect(() => {
    let alive = true;

    const tick = async () => {
      const r = await loadRoomRound(room);
      if (!alive) return;
      if (!r) { setRound(null); return; }

      // Hide leaderboards after reveal timeout
      if (r.revealBoard && r.revealUntil && Date.now() > r.revealUntil) {
        const closed = { ...r, revealBoard: false };
        await saveRoomRound(room, closed);
        setRound(null);
        return;
      }

      // Auto-close if timer expired
      if (r.isOpen && r.endsAt && Date.now() > r.endsAt) {
        const closed = { ...r, isOpen: false };
        await saveRoomRound(room, closed); // persist closed state
        setRound(r.revealBoard ? closed : null);
        return;
      }

      // If round is closed and not revealing, clear
      if (!r.isOpen && !r.revealBoard) { setRound(null); return; }

      setRound(r);
    };

    // initial fetch + polling
    tick();
    const iv = setInterval(tick, 800);
    return () => { alive = false; clearInterval(iv); };
  }, [room]);

  return [round, setRound];
}


function getScenarioFromRound(round) {
  if (!round) return null;
  // TP/TS have no nodes — accept any customScenario object
  if (round.customScenario) return round.customScenario;
  const s = findScenarioById(round.scenarioId);
  return s ?? null;
}





function csvEscape(x) { return `"${String(x).replaceAll('"','""')}"`; }
// === path/label helpers (display only) ===
function nodeLabelFor(scenario, id) {
  if (!scenario?.nodes) return String(id ?? "");
  const hit = scenario.nodes.find(n => n?.id === id);
  return hit?.label || String(id ?? "");
}
function formatPathLabels(scenario, path, sep = " → ") {
  if (!scenario || !Array.isArray(path)) return "";
  const map = new Map((scenario.nodes || []).map(n => [n.id, n.label || n.id]));
  return path.map(id => map.get(id) ?? id).join(sep);
}

// === small geometry helper (render-only spacing; does not change scenario data) ===
function separateNodes(nodes, W, H, min = 36, iters = 20) {
  const clamped = v => Math.max(10, Math.min(v, (v === v ? v : 10))); // guard NaN
  const out = nodes.map(n => ({ ...n })); // copy
  for (let t = 0; t < iters; t++) {
    let moved = false;
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i], b = out[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        if (!d) { d = 0.001; }
        if (d < min) {
          const push = (min - d) / 2;
          const ux = dx / d, uy = dy / d;
          // move both points away a little; clamp to viewbox
          a.x = clamped(a.x - ux * push); a.y = clamped(a.y - uy * push);
          b.x = clamped(b.x + ux * push); b.y = clamped(b.y + uy * push);
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
  // final clamp inside svg (fallback bounds if not in scope)
  const w = Number.isFinite(W) ? W : 1200, h = Number.isFinite(H) ? H : 640;
  for (const p of out) { p.x = Math.max(10, Math.min(p.x, w - 10)); p.y = Math.max(10, Math.min(p.y, h - 10)); }
  return out;
}


function downloadCsv(csv, filename) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob); const a = document.createElement("a");
  a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}

// Season scoring
function computeStandings(round) {
  const entries = Object.entries(round.players || {}).map(([name, r]) => ({ name, ...r }));
  entries.sort((a, b) => b.score - a.score || a.timeSec - b.timeSec);
  const standings = entries.map((e, i) => ({ ...e, rank: i + 1, points: Math.max(0, 24 - (i + 1)) }));
  return standings;
}

async function applySeasonPoints(room, round, standings /* array */) {
  await dbApplySeasonPoints(room, standings);
}



// -----------------------------
// Custom Network Generator
// -----------------------------

// -----------------------------
// -----------------------------
// Custom Network Generator (spaced & readable)
// -----------------------------
// -----------------------------
// Custom Network Generator (wide, non-colinear)
// -----------------------------
function makeCustomScenario(n = 12, objective = "time", opts = {}) {
  // Layout box only for generation; SvgMap will auto-scale it.
  const BOX_W = 1200, BOX_H = 640, PAD = 60;
  const X0 = PAD, X1 = BOX_W - PAD, Y0 = PAD, Y1 = BOX_H - PAD;

  const minDist = Math.max(40, Math.min(110, Number(opts.minDist || 76))); // spacing between nodes
  const density = Math.max(1, Math.min(3, Number(opts.density || 2)));     // edges per node

  n = Math.max(6, Math.min(30, Math.floor(n)));

  // --- 1) Place nodes (Poisson-ish): S and T fixed, others random with min distance
  const nodes = [];
  const S = { id: "S", x: X0, y: Y0 + 80, label: "Start" };
  const T = { id: "T", x: X1, y: Y1 - 80, label: "Target" };
  nodes.push(S);
  nodes.push(T);

  const pts = [];
  let attempts = 0, maxAttempts = 6000;
  while (pts.length < n - 2 && attempts < maxAttempts) {
    attempts++;
    const x = X0 + Math.random() * (X1 - X0);
    const y = Y0 + Math.random() * (Y1 - Y0);

    // keep away from S/T and other points
    if (Math.hypot(x - S.x, y - S.y) < minDist) continue;
    if (Math.hypot(x - T.x, y - T.y) < minDist) continue;

    let ok = true;
    for (const p of pts) {
      if (Math.hypot(x - p.x, y - p.y) < minDist) { ok = false; break; }
    }
    if (!ok) continue;

    pts.push({ x, y });
  }
  // if we didn't hit target count, relax spacing at the end
  while (pts.length < n - 2) {
    const x = X0 + Math.random() * (X1 - X0);
    const y = Y0 + Math.random() * (Y1 - Y0);
    pts.push({ x, y });
  }

  // Sort by x so edges naturally go left→right, then assign ids/labels
  pts.sort((a, b) => a.x - b.x);
  for (let i = 0; i < pts.length; i++) {
    const id = `N${i + 1}`;
    nodes.splice(nodes.length - 1, 0, { id, x: Math.round(pts[i].x), y: Math.round(pts[i].y), label: id });
  }

  // --- 2) Build edges forward with distance-based metrics
  const modes = ["🚚", "🚂", "✈️"];
  const edges = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    // each node connects to a few ahead nodes (controls density and “width”)
    const tries = density + 1; // 2..4 targets
    for (let t = 0; t < tries; t++) {
      const jumpMax = 2 + density; // connect 1..(2+density) steps ahead
      const j = Math.min(nodes.length - 1, i + 1 + randInt(0, jumpMax));
      if (j <= i) continue;
      if (edges.some(e => e[0] === nodes[i].id && e[1] === nodes[j].id)) continue;

      const dx = nodes[j].x - nodes[i].x, dy = nodes[j].y - nodes[i].y;
      const dist = Math.hypot(dx, dy) / 10;
      const mode = modes[randInt(0, modes.length - 1)];
      const metrics = makeMetrics(dist, mode); // {time,cost,co2}
      edges.push([nodes[i].id, nodes[j].id, metrics, mode]);
    }
  }

  // Ensure S has at least one outgoing and T has at least one incoming
  if (!edges.some(e => e[0] === "S")) {
    const j = 1; // first intermediate
    const dist = Math.hypot(nodes[j].x - S.x, nodes[j].y - S.y) / 10;
    edges.push(["S", nodes[j].id, makeMetrics(dist, "🚚"), "🚚"]);
  }
  if (!edges.some(e => e[1] === "T")) {
    const i = nodes.length - 2; // last intermediate
    const dist = Math.hypot(T.x - nodes[i].x, T.y - nodes[i].y) / 10;
    edges.push([nodes[i].id, "T", makeMetrics(dist, "🚚"), "🚚"]);
  }

  return {
    id: "custom",
    title: `Custom Network (${n} nodes)`,
    subtitle: "Generated by instructor",
    objective,
    nodes,
    edges,             // [u, v, {time,cost,co2}, mode]
    start: "S",
    end: "T",
    modifiers: [],
    _hasMetrics: true,
  };
}


// ===== TSP scenario (Euclidean complete graph; we don't draw all edges)
function makeTspScenario(n = 10) {
  n = Math.max(6, Math.min(18, Math.floor(n)));
  const BOX_W=1200, BOX_H=640, PAD=60;
  const nodes = [];
  const S = { id: "S", x: PAD, y: PAD+60, label: "S" };
  nodes.push(S);
  // Poisson-ish sampling
  const pts=[]; const minDist=70;
  let tries=0;
  while(pts.length < n-1 && tries<5000){
    tries++;
    const x = PAD + Math.random()*(BOX_W-2*PAD);
    const y = PAD + Math.random()*(BOX_H-2*PAD);
    if (Math.hypot(x-S.x,y-S.y)<minDist) continue;
    if (pts.every(p=>Math.hypot(x-p.x,y-p.y)>=minDist)) pts.push({x,y});
  }
  while(pts.length < n-1){
    const x = PAD + Math.random()*(BOX_W-2*PAD);
    const y = PAD + Math.random()*(BOX_H-2*PAD);
    pts.push({x,y});
  }
  pts.sort((a,b)=>a.x-b.x);
  for (let i=0;i<pts.length;i++){
    const id = `N${i+1}`;
    nodes.push({ id, x: Math.round(pts[i].x), y: Math.round(pts[i].y), label:id });
  }
  return { id:"tsp", title:`TSP (${n} nodes)`, subtitle:"Visit all, return to S", nodes, edges:[], start:"S", end:"S", _hasMetrics:true };
}

// ===== VRP scenario (Euclidean, capacity)
function makeVrpScenario(customers = 12, capacity = 8) {
  customers = Math.max(6, Math.min(30, Math.floor(customers)));
  const BOX_W=1200, BOX_H=640, PAD=60, minDist=60;
  const nodes = [];
  const S = { id:"S", x: PAD, y: PAD+60, label:"Depot" };
  nodes.push(S);
  const pts=[];
  let tries=0;
  while(pts.length < customers && tries<6000){
    tries++;
    const x = PAD + Math.random()*(BOX_W-2*PAD);
    const y = PAD + Math.random()*(BOX_H-2*PAD);
    if (Math.hypot(x-S.x,y-S.y)<minDist) continue;
    if (pts.every(p=>Math.hypot(x-p.x,y-p.y)>=minDist)) pts.push({x,y});
  }
  while(pts.length < customers){
    const x = PAD + Math.random()*(BOX_W-2*PAD);
    const y = PAD + Math.random()*(BOX_H-2*PAD);
    pts.push({x,y});
  }
  pts.sort((a,b)=>a.x-b.x);
  const demand = {};
  for (let i=0;i<pts.length;i++){
    const id = `C${i+1}`;
    nodes.push({ id, x: Math.round(pts[i].x), y: Math.round(pts[i].y), label:id });
    demand[id] = randInt(1,4);
  }
  return { id:"vrp", title:`VRP (${customers} customers)`, subtitle:`Capacity ${capacity}`, nodes, edges:[], start:"S", end:"S", capacity, demand, _hasMetrics:true };
}

// ===== Order-picking scenario (grid + picks; Manhattan)
function makePickingScenario(rows=5, cols=8, picks=10){
  rows=Math.max(3,Math.min(12,Math.floor(rows)));
  cols=Math.max(4,Math.min(18,Math.floor(cols)));
  const cell=50, PAD=80;
  const nodes=[{id:"S", x:PAD, y:PAD, label:"Dock"}];
  const cells=[];
  for(let r=0;r<rows;r++){
    for(let c=0;c<cols;c++){
      const x=PAD + c*cell + (Math.random()-0.5)*6;
      const y=PAD + r*cell + (Math.random()-0.5)*6;
      cells.push({x,y});
    }
  }
  // choose unique pick cells
  const used=new Set(); const chosen=[];
  while(chosen.length<Math.min(picks, cells.length)){
    const k = randInt(0, cells.length-1);
    const key = k;
    if (used.has(key)) continue;
    used.add(key); chosen.push(cells[k]);
  }
  for (let i=0;i<chosen.length;i++){
    const id = `P${i+1}`;
    nodes.push({ id, x:Math.round(chosen[i].x), y:Math.round(chosen[i].y), label:id });
  }
  return { id:"pick", title:`Warehouse Picking (${chosen.length} picks)`, subtitle:`Grid ${rows}×${cols}`, nodes, edges:[], start:"S", end:"S", metric:"manhattan", _hasMetrics:true };
}


function makeMetrics(dist, mode) {
  // Simple classroom-friendly factors by mode
  const f = {
    "🚚": { t: 1.00, c: 85,   e: 1.2 },
    "🚂": { t: 0.85, c: 60,   e: 0.7 },
    "✈️": { t: 0.40, c: 140,  e: 2.1 },
  }[mode] || { t: 1, c: 90, e: 1 };
  const time = Math.max(2, Math.round(dist * f.t));
  const cost = Math.max(50, Math.round(dist * f.c));
  const co2  = Math.max(5, Math.round(dist * f.e));
  return { time, cost, co2 };
}

function idFromIndex(i) { const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"; return A[i % 26] + (i >= 26 ? Math.floor(i / 26) : ""); }
function randInt(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }


// function makeMetrics(dist, mode) {
//   // Baselines per mode (rough classroom-friendly factors)
//   const modeF = {
//     "🚚": { t: 1.00, c: 85,   e: 1.2 },
//     "🚂": { t: 0.85, c: 60,   e: 0.7 },
//     "✈️": { t: 0.40, c: 140,  e: 2.1 },
//   }[mode] || { t: 1, c: 90, e: 1 };
//   const time = Math.max(2, Math.round(dist * modeF.t));
//   const cost = Math.max(50, Math.round(dist * modeF.c));
//   const co2  = Math.max(5, Math.round(dist * modeF.e));
//   return { time, cost, co2 };
// }

// function idFromIndex(i) { const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"; return A[i % 26] + (i >= 26 ? Math.floor(i / 26) : ""); }
// function randInt(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
function weightForObjective(obj) {
  if (obj === "time") return randInt(4, 15);
  if (obj === "cost") return randInt(200, 1400);
  return randInt(60, 320); // co2
}

function Footer() { return (<div className="mt-8 text-center text-xs text-slate-400">© {new Date().getFullYear()} SCMA 455 • Morning Dash Game</div>); }



// ===== Distance helpers

function euclid(a, b) {
  if (
    !a || !b ||
    !Number.isFinite(a.x) || !Number.isFinite(a.y) ||
    !Number.isFinite(b.x) || !Number.isFinite(b.y)
  ) {
    console.error("euclid: invalid inputs", { a, b });
    return Infinity;
  }
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function manhattan(a, b) {
  if (
    !a || !b ||
    !Number.isFinite(a.x) || !Number.isFinite(a.y) ||
    !Number.isFinite(b.x) || !Number.isFinite(b.y)
  ) {
    console.error("manhattan: invalid inputs", { a, b });
    return Infinity;
  }
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}


// ====== TSP helpers (Euclidean)
function tspIsComplete(path, nodes){
  if (path.length < 2) return false;
  if (path[0] !== "S" || path[path.length-1] !== "S") return false;
  const ids = new Set(nodes.filter(n=>n.id!=="S").map(n=>n.id));
  for (const id of ids) if (!path.includes(id)) return false;
  return true;
}
function tspTourCost(path, nodes, allowPartial=false){
  const map = nodeByIdMap(nodes);
  let cost = 0;
  for (let i=0;i<path.length-1;i++){
    const a = map[path[i]], b = map[path[i+1]];
    if (!a || !b) return Infinity;
    cost += euclid(a,b);
  }
  if (!allowPartial && path.length>1 && path[path.length-1]==="S" && path[0]==="S"){
    return cost;
  }
  return cost;
}
// Baseline: NN + 2-opt
function tspBaselineCost(nodes) {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    console.error("tspBaselineCost: invalid nodes argument", nodes);
    return { cost: Infinity, path: [] };
  }

  const bad = nodes.filter(n => !(n && typeof n.id === "string" && Number.isFinite(n.x) && Number.isFinite(n.y)));
  if (bad.length) console.error("tspBaselineCost: malformed node entries:", bad);

  const clean = nodes.filter(n => n && typeof n.id === "string" && Number.isFinite(n.x) && Number.isFinite(n.y));
  const map = nodeByIdMap(clean);

  if (!map["S"]) {
    console.error("tspBaselineCost: missing depot node 'S' in nodes:", clean);
    return { cost: Infinity, path: [] };
  }

  // Nearest-neighbour from S
  let un = new Set(clean.filter(n => n.id !== "S").map(n => n.id));
  let tour = ["S"], cur = "S";
  while (un.size) {
    let bestId = null, bestd = Infinity;
    for (const id of un) {
      const d = euclid(map[cur], map[id]);
      if (d < bestd) { bestd = d; bestId = id; }
    }
    if (!bestId) break;
    tour.push(bestId);
    un.delete(bestId);
    cur = bestId;
  }
  tour.push("S");

  // 2-opt improvement
  const ids = tour.slice();
  const coord = id => map[id];
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 1; i < ids.length - 2; i++) {
      for (let k = i + 1; k < ids.length - 1; k++) {
        const A = ids[i - 1], B = ids[i], C = ids[k], D = ids[k + 1];
        const delta = (euclid(coord(A), coord(C)) + euclid(coord(B), coord(D)))
                    - (euclid(coord(A), coord(B)) + euclid(coord(C), coord(D)));
        if (delta < -1e-6) {
          ids.splice(i, k - i + 1, ...ids.slice(i, k + 1).reverse());
          improved = true;
        }
      }
    }
  }

  return { cost: tspTourCost(ids, clean), path: ids };
}



// ====== VRP helpers (Euclidean, auto-split by capacity)
function vrpAllCustomersSelected(path, scenario){
  const cust = new Set(scenario.nodes.filter(n=>n.id!=="S").map(n=>n.id));
  for (const id of cust) if (!path.includes(id)) return false;
  return true;
}
function vrpRouteCostFromSequence(seq, scenario){
  const map = nodeByIdMap(scenario.nodes);
  if (seq.length===0) return 0;
  let cost=0, load=0, cap=scenario.capacity||8;
  let cur="S";
  const demand = scenario.demand || {};
  for (let i=1;i<seq.length;i++){
    const next = seq[i];
    if (next==="S"){ cost += euclid(map[cur], map["S"]); cur="S"; load=0; continue; }
    const dem = demand[next] || 1;
    if (load + dem > cap){
      // return to depot, then go to next
      cost += euclid(map[cur], map["S"]);
      cur="S"; load=0;
    }
    cost += euclid(map[cur], map[next]); cur=next; load += dem;
  }
  // return to depot at the end if not already there
  if (cur!=="S") cost += euclid(map[cur], map["S"]);
  return cost;
}
// vrpBaselineCost - robust version (greedy heuristic)
function vrpBaselineCost(scenario) {
  if (!scenario || !Array.isArray(scenario.nodes)) {
    console.error("vrpBaselineCost: invalid scenario", scenario);
    return { cost: Infinity, path: [] };
  }

  const nodes = scenario.nodes.filter(n => n && typeof n.id === "string" && Number.isFinite(n.x) && Number.isFinite(n.y));
  const depot = nodes.find(n => n.id === "S");
  if (!depot) {
    console.error("vrpBaselineCost: missing depot node 'S' in nodes:", nodes);
    return { cost: Infinity, path: [] };
  }

  const cust = nodes
    .filter(n => n.id !== "S")
    .map(n => ({ id: n.id, ang: Math.atan2(n.y - depot.y, n.x - depot.x) }))
    .sort((a, b) => a.ang - b.ang);

  const seq = ["S", ...cust.map(c => c.id), "S"];
  const cost = vrpRouteCostFromSequence(seq, { ...scenario, nodes });
  return { cost, path: seq };
}



// ====== Picking helpers (Manhattan TSP on selected picks)
function pickAllVisited(path, scenario){
  const picks = new Set(scenario.nodes.filter(n=>n.id!=="S").map(n=>n.id));
  for (const id of picks) if (!path.includes(id)) return false;
  return true;
}
function pickIsComplete(path, scenario){
  if (path[0]!=="S" || path[path.length-1]!=="S") return false;
  return pickAllVisited(path, scenario);
}
function pickTourCost(path, scenario, allowPartial=false){
  const map = nodeByIdMap(scenario.nodes);
  let cost=0;
  for (let i=0;i<path.length-1;i++){
    cost += manhattan(map[path[i]], map[path[i+1]]);
  }
  return cost;
}
function pickBaselineCost(scenario) {
  if (!scenario || !Array.isArray(scenario.nodes)) {
    console.error("pickBaselineCost: invalid scenario", scenario);
    return { cost: Infinity, path: [] };
  }

  const nodes = scenario.nodes.filter(n => n && typeof n.id === "string" && Number.isFinite(n.x) && Number.isFinite(n.y));
  const map = nodeByIdMap(nodes);
  if (!map["S"]) {
    console.error("pickBaselineCost: missing depot node 'S' in nodes:", nodes);
    return { cost: Infinity, path: [] };
  }

  // NN
  const n = nodes.filter(nd => nd.id !== "S");
  let un = new Set(n.map(x => x.id));
  let tour = ["S"], cur = "S";
  while (un.size) {
    let best = null, bd = Infinity;
    for (const id of un) {
      const d = manhattan(map[cur], map[id]);
      if (d < bd) { bd = d; best = id; }
    }
    if (!best) break;
    tour.push(best);
    un.delete(best);
    cur = best;
  }
  tour.push("S");

  // 2-opt (Manhattan)
  const ids = tour.slice();
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 1; i < ids.length - 2; i++) {
      for (let k = i + 1; k < ids.length - 1; k++) {
        const A = ids[i - 1], B = ids[i], C = ids[k], D = ids[k + 1];
        const delta = (manhattan(map[A], map[C]) + manhattan(map[B], map[D]))
                    - (manhattan(map[A], map[B]) + manhattan(map[C], map[D]));
        if (delta < -1e-6) {
          ids.splice(i, k - i + 1, ...ids.slice(i, k + 1).reverse());
          improved = true;
        }
      }
    }
  }

  return { cost: pickTourCost(ids, { nodes }), path: ids };
}


function computeLegsEuclid(path, nodes){
  const map = Object.fromEntries(nodes.map(n=>[n.id,n]));
  const out=[]; for(let i=0;i<path.length-1;i++){
    const a=map[path[i]], b=map[path[i+1]]; if(!a||!b) continue;
    out.push({from:path[i], to:path[i+1], dist: Math.hypot(a.x-b.x, a.y-b.y)});
  } return out;
}
function computeLegsManhattan(path, nodes){
  const map = Object.fromEntries(nodes.map(n=>[n.id,n]));
  const out=[]; for(let i=0;i<path.length-1;i++){
    const a=map[path[i]], b=map[path[i+1]]; if(!a||!b) continue;
    out.push({from:path[i], to:path[i+1], dist: Math.abs(a.x-b.x)+Math.abs(a.y-b.y)});
  } return out;
}
function computeLegsVrp(path, scenario){
  const map = Object.fromEntries(scenario.nodes.map(n=>[n.id,n]));
  const demand = scenario.demand || {};
  const cap = scenario.capacity || 8;
  const out=[]; let load=0; let cur="S";
  for(let i=1;i<path.length;i++){
    const next = path[i];
    if(!map[cur] || !map[next]) continue;
    const dist = Math.hypot(map[cur].x - map[next].x, map[cur].y - map[next].y);
    if(next === "S"){
      out.push({from:cur, to:"S", dist, loadAfter:0});
      cur = "S"; load = 0; continue;
    }
    const d = demand[next] ?? 1;
    if(load + d > cap){
      const toDepot = Math.hypot(map[cur].x - map["S"].x, map[cur].y - map["S"].y);
      out.push({from:cur, to:"S", dist: toDepot, loadAfter: 0});
      cur = "S"; load = 0;
    }
    const go = Math.hypot(map[cur].x - map[next].x, map[cur].y - map[next].y);
    load += d; out.push({from:cur, to:next, dist: go, loadAfter: load});
    cur = next;
  }
  return out;
}
import { supabase } from "./lib/supabase";

// --- Auth (roster) ---
async function verifyStudent(room, username, pin) {
  const { data, error } = await supabase
    .from("roster")
    .select("display_name,pin")
    .eq("room", room)
    .eq("username", username)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { ok: false, reason: "Not found in roster" };
  if (String(data.pin) !== String(pin)) return { ok: false, reason: "Wrong PIN" };
  return { ok: true, displayName: data.display_name || username };
}

// --- Persistence: round (get/set), submissions, season ---
async function dbLoadCurrentRound(room) {
  const { data, error } = await supabase
    .from("rounds")
    .select("*")
    .eq("room", room)
    .eq("is_open", true)                    // only the open round
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  // IMPORTANT: keep the row id, don’t drop it
  return data ? { ...data.payload, id: data.id } : null;
}




async function dbListPastRounds(room, limit = 100) {   // ✅ default 100
  try {
    const { data, error } = await supabase
      .from("rounds")
      .select("id, room, payload, started_at, ended_at, created_at")
      .eq("room", room)
      .eq("is_open", false)                           // ✅ only CLOSED
      .order("started_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.error("dbListPastRounds error", e);
    return [];
  }
}




async function dbSaveRound(room, round) {
  try {
    if (!round) {
  const nowIso = new Date().toISOString();
  await supabase
    .from("rounds")
    .update({ is_open: false, ended_at: nowIso, reveal_board: false })
    .eq("room", room)
    .eq("is_open", true);
  localStorage.removeItem("scma_supa_offline");
  return null;
}

    const { data, error } = await supabase
      .from("rounds")
      .upsert({
        id: round.id,                      // may be undefined on first save
        room,
        game_mode: round.gameMode,
        payload: round,
        started_at: new Date(round.startedAt).toISOString(),
        ends_at: round.endsAt ? new Date(round.endsAt).toISOString() : null,
        is_open: !!round.isOpen,
        reveal_board: !!round.revealBoard,
        scored: !!round.scored,
      })
      .select()
      .single();                           // ⬅️ get the row back (with id)
    if (error) throw error;

    localStorage.removeItem("scma_supa_offline");
    return data;                           // return the row (id + payload + columns)
  } catch (e) {
    console.warn("Supabase write failed; using local-only cache.", e);
    localStorage.setItem("scma_supa_offline", "1");
    return null;
  }
}





async function dbUpsertSubmission(roundId, username, rec) {
  const { error } = await supabase
    .from("submissions")
    .upsert(
      {
        round_id: roundId,
        username,
        cost: rec.cost,
        time_sec: rec.timeSec,
        score: rec.score,
        path: rec.path, // array is fine if column is JSONB
      },
      { onConflict: "round_id,username", ignoreDuplicates: false }
    );
  if (error) {
    console.error("dbUpsertSubmission error", error);
  }
}




async function dbListSubmissions(roundId) {
  try {
    const { data, error } = await supabase
      .from("submissions")
      .select("id, round_id, username, score, cost, time_sec, path")
      .eq("round_id", roundId)
      .order("score", { ascending: false });
    if (error) { console.error("dbListSubmissions error", error); return []; }
    return data || [];
  } catch (e) {
    console.error("dbListSubmissions exception", e);
    return [];
  }
}


async function dbListPlayerHistory(room, username, limit = 50) {
  try {
    const { data, error } = await supabase
      .from("submissions")
      .select(`
        id,
        round_id,
        username,
        score,
        cost,
        time_sec,
        path,
        rounds!inner(id, room, started_at, payload)
      `)
      .eq("rounds.room", room)
      .eq("username", username)
      .order("rounds.started_at", { ascending: false })
      .limit(limit);

    if (error) { throw error; }
    return (data || []).map(r => ({
      round_id: r.round_id,
      started_at: r.rounds.started_at,
      payload: r.rounds.payload,
      score: r.score,
      cost: r.cost,
      time_sec: r.time_sec,
      path: r.path,
    }));
  } catch (e) {
    console.error("dbListPlayerHistory error", e);
    return [];
  }
}




async function dbApplySeasonPoints(room, standings) {
  // standings = array of { name, rank } sorted by score
  const rows = standings.map((s) => ({
    room,
    username: s.name,
    points: Math.max(0, 24- s.rank),
  }));
  // Upsert by incrementing points
  for (const r of rows) {
    const { data } = await supabase
      .from("season_totals")
      .select("points")
      .eq("room", r.room)
      .eq("username", r.username)
      .maybeSingle();
    const newPts = (data?.points || 0) + r.points;
    await supabase.from("season_totals").upsert({
      room: r.room,
      username: r.username,
      points: newPts,
    });
  }
}

async function dbLoadSeasonTotals(room) {
  const { data } = await supabase
    .from("season_totals")
    .select("*")
    .eq("room", room)
    .order("points", { ascending: false });
  return data || [];
}

async function dbResetSeason(room) {
  await supabase.from("season_totals").delete().eq("room", room);
}
function LoginGate({ onLogin }) {
  const [room, setRoom] = useState("SCMA");
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    try {
      const res = await verifyStudent(room.trim(), username.trim(), pin.trim());
      if (!res.ok) { setErr(res.reason || "Login failed"); return; }
      const me = { room: room.trim(), name: username.trim(), display: res.displayName, role: "student", verified: true };
      localStorage.setItem("scma_me", JSON.stringify(me));
      onLogin(me);
    } catch (e2) {
      setErr(e2.message || "Login error");
    }
  };

  return (
    <div className="max-w-md mx-auto mt-16 p-6 rounded-2xl bg-white/5 ring-1 ring-white/10">
      <h2 className="text-xl font-bold mb-4">Join Game</h2>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="block text-xs text-slate-300 mb-1">Room</label>
          <input className="bg-white/10 rounded-xl px-3 py-2 w-full" value={room} onChange={e=>setRoom(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-slate-300 mb-1">Username</label>
          <input className="bg-white/10 rounded-xl px-3 py-2 w-full" value={username} onChange={e=>setUsername(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-slate-300 mb-1">PIN</label>
          <input type="password" className="bg-white/10 rounded-xl px-3 py-2 w-full" value={pin} onChange={e=>setPin(e.target.value)} />
        </div>
        {err && <div className="text-rose-400 text-sm">{err}</div>}
        <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500 rounded-xl px-4 py-2.5 font-semibold">
          Enter
        </button>
        <div className="text-xs text-slate-400 mt-2">
          Instructor keeps the same dashboard + PIN as before. Students must appear in the roster.
        </div>
      </form>
    </div>
  );
}
function nodeByIdMap(nodes) {
  return Object.fromEntries((nodes || []).map(n => [n.id, n]));
}

function computeOptimalForRound(scenario, round, graphEdges) {
  if (!scenario?.nodes?.length) return { path: [], cost: Infinity };
  switch (round?.gameMode) {
    case "sp":
      return dijkstra(scenario.nodes, graphEdges, scenario.start, scenario.end);
    case "tsp":
      return tspBaselineCost(scenario.nodes);
    case "vrp":
      return vrpBaselineCost(scenario);
    case "pick":
    default:
      return pickBaselineCost(scenario);
  }
}

// scenario: { nodes, start, end, ... }, round: payload with gameMode/objectives, path: [ids], graphEdges?: weighted edges for SP
function computePathCost(scenario, round, path, graphEdges = null) {
  if (!scenario?.nodes?.length || !Array.isArray(path) || path.length < 2) return Infinity;
  const map = Object.fromEntries(scenario.nodes.map(n => [n.id, n]));

  // SP: if weighted edges are provided, use them; else fall back to euclid
  if (round?.gameMode === "sp" && Array.isArray(graphEdges) && graphEdges.length) {
    // Build quick edge weight lookup
    const w = new Map();
    for (const [u, v, wt] of graphEdges) w.set(u + ">" + v, Number(wt));
    let c = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const key = path[i] + ">" + path[i + 1];
      const wt = w.get(key);
      if (Number.isFinite(wt)) c += wt; else c += euclid(map[path[i]], map[path[i + 1]]);
    }
    return c;
  }

  // PICK uses Manhattan; others default to Euclid
  const dist = (round?.gameMode === "pick") ? manhattan : euclid;
  let cost = 0;
  for (let i = 0; i < path.length - 1; i++) cost += dist(map[path[i]], map[path[i + 1]]);
  return cost;
}

// ===== EXACT solvers for small instances + smart fallback =====

// --- Held–Karp core on an explicit node id list ("S" must be first) ---
function heldKarpOnIds(ids, nodeMap, distFn) {
  const n = ids.length;
  const INF = 1e18;
  const dp = Array(1 << n).fill(null).map(() => Array(n).fill(INF));
  const par = Array(1 << n).fill(null).map(() => Array(n).fill(-1));
  const d = (i, j) => distFn(nodeMap[ids[i]], nodeMap[ids[j]]);

  dp[1 << 0][0] = 0;
  for (let mask = 0; mask < (1 << n); mask++) {
    for (let i = 0; i < n; i++) {
      const cur = dp[mask][i];
      if (cur >= INF) continue;
      for (let j = 0; j < n; j++) {
        if (mask & (1 << j)) continue;
        const nm = mask | (1 << j);
        const val = cur + d(i, j);
        if (val < dp[nm][j]) { dp[nm][j] = val; par[nm][j] = i; }
      }
    }
  }

  const full = (1 << n) - 1;
  let best = INF, end = -1;
  for (let i = 0; i < n; i++) {
    const val = dp[full][i] + d(i, 0);
    if (val < best) { best = val; end = i; }
  }

  // Reconstruct
  const order = [];
  let mask = full, i = end;
  while (i !== -1) {
    order.push(i);
    const p = par[mask][i];
    mask ^= (1 << i);
    i = p;
  }
  order.reverse();
  const path = order.map(k => ids[k]);
  if (path[0] !== "S") path.unshift("S");
  if (path[path.length - 1] !== "S") path.push("S");
  return { cost: best, path };
}

// --- TSP exact (Euclid) with fallback ---
function tspExactHK(nodes) {
  const map = nodeByIdMap(nodes);
  if (!map["S"]) return { cost: Infinity, path: [] };
  const ids = ["S", ...nodes.filter(n => n.id !== "S").map(n => n.id)];
  return heldKarpOnIds(ids, map, euclid);
}
function tspOptimalCost(nodes) {
  // Exact up to 12 nodes (incl. S), else your NN+2opt baseline
  return nodes.length <= 12 ? tspExactHK(nodes) : tspBaselineCost(nodes);
}

// --- Picking exact (Manhattan) with fallback ---
function pickExactHK(nodes) {
  const map = nodeByIdMap(nodes);
  if (!map["S"]) return { cost: Infinity, path: [] };
  const ids = ["S", ...nodes.filter(n => n.id !== "S").map(n => n.id)];
  return heldKarpOnIds(ids, map, manhattan);
}
function pickOptimalCost(scenario) {
  return scenario.nodes.length <= 12
    ? pickExactHK(scenario.nodes)
    : pickBaselineCost(scenario);
}

// --- CVRP exact (capacity) for small k, with heuristic fallback ---
// Uses set-partition DP: for each feasible subset (<= capacity), run TSP exact, then
// cover all customers with min total cost. Returns flattened "S … S … S" path.
function vrpOptimalCost(scenario) {
  const nodes = scenario.nodes;
  const map = nodeByIdMap(nodes);
  const cap = scenario.capacity || 8;
  const demand = scenario.demand || {};
  const customers = nodes.filter(n => n.id !== "S").map(n => n.id);
  const k = customers.length;

  // Fallback to your sweep heuristic on larger cases
  const MAX_EXACT = 10;
  if (k > MAX_EXACT) return vrpBaselineCost(scenario);

  const totalMasks = 1 << k;
  const feasible = new Array(totalMasks).fill(false);
  for (let m = 1; m < totalMasks; m++) {
    let load = 0;
    for (let i = 0; i < k; i++) if (m & (1 << i)) load += (demand[customers[i]] || 1);
    feasible[m] = load <= cap;
  }

  // TSP exact for each feasible subset (S + subset + S)
  const tspCost = new Array(totalMasks).fill(Infinity);
  const tspPath = new Array(totalMasks).fill(null);
  for (let m = 1; m < totalMasks; m++) {
    if (!feasible[m]) continue;
    const ids = ["S"];
    for (let i = 0; i < k; i++) if (m & (1 << i)) ids.push(customers[i]);
    const res = heldKarpOnIds(ids, map, euclid);
    tspCost[m] = res.cost;
    tspPath[m] = res.path;
  }

  // DP to cover all customers with min #routes cost
  const INF = 1e18;
  const dp = new Array(totalMasks).fill(INF);
  const choice = new Array(totalMasks).fill(0);
  dp[0] = 0;
  for (let mask = 0; mask < totalMasks; mask++) {
    if (dp[mask] >= INF) continue;
    for (let m = 1; m < totalMasks; m++) {
      if (!feasible[m] || (mask & m)) continue;
      const nm = mask | m;
      const val = dp[mask] + tspCost[m];
      if (val < dp[nm]) { dp[nm] = val; choice[nm] = m; }
    }
  }

  // Reconstruct routes and flatten
  const full = totalMasks - 1;
  const routes = [];
  let cur = full;
  while (cur) { const m = choice[cur]; routes.push(tspPath[m] || []); cur &= ~m; }
  routes.reverse();
  const flat = [];
  for (const r of routes) {
    if (!r || !r.length) continue;
    // avoid duplicate S between consecutive routes
    if (flat.length && flat[flat.length - 1] === "S" && r[0] === "S") flat.push(...r.slice(1));
    else flat.push(...r);
  }
  return { cost: dp[full], path: flat };
}
// ========== Simple matrix input for Transportation ==========
function TransportMatrix({ scenario, value, onChange }) {
  const S = scenario?.supplies||[], D = scenario?.demands||[];
  const get = (s,d) => value?.[`${s.id}>${d.id}`] ?? "";
  const set = (s,d,q) => onChange({ ...(value||{}), [`${s.id}>${d.id}`]: q });

  return (
    <div className="overflow-auto">
      <table className="min-w-[520px] text-sm">
        <thead>
          <tr><th></th>{D.map(d=> <th key={d.id}>{d.label||d.id}<div className="text-xs opacity-70">demand={d.demand}</div></th>)}</tr>
        </thead>
        <tbody>
          {S.map(s=>(
            <tr key={s.id}>
              <td className="pr-2 font-medium">{s.label||s.id}<div className="text-xs opacity-70">supply={s.supply}</div></td>
              {D.map(d=>(
                <td key={d.id} className="p-1">
                  <input
                    type="number" min="0"
                    className="w-24 bg-white/10 rounded px-2 py-1"
                    value={get(s,d)}
                    onChange={e=> set(s,d, Number(e.target.value||0))}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ========== Simple 2-matrix input for Transshipment ==========
function TransshipMatrices({ scenario, value, onChange }) {
  const S = scenario?.supplies||[], H = scenario?.hubs||[], D = scenario?.demands||[];
  const allowed = new Set((scenario?.arcs||[]).map(a => `${a.u}>${a.v}`));
  const get = (u,v) => value?.[`${u}>${v}`] ?? "";
  const set = (u,v,q) => onChange({ ...(value||{}), [`${u}>${v}`]: q });

  return (
    <div className="space-y-6">
      <div>
        <div className="font-semibold mb-1">Supply → Hubs</div>
        <table className="min-w-[520px] text-sm">
          <thead><tr><th></th>{H.map(h=> <th key={h.id}>{h.label||h.id}</th>)}</tr></thead>
          <tbody>
            {S.map(s=>(
              <tr key={s.id}>
                <td className="pr-2 font-medium">{s.label||s.id}<div className="text-xs opacity-70">supply={s.supply}</div></td>
                {H.map(h=>(
                  <td key={h.id} className="p-1">
                    {allowed.has(`${s.id}>${h.id}`) ? (
                      <input type="number" min="0" className="w-24 bg-white/10 rounded px-2 py-1"
                        value={get(s.id,h.id)} onChange={e=> set(s.id,h.id, Number(e.target.value||0))}/>
                    ) : <div className="opacity-30">—</div>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <div className="font-semibold mb-1">Hubs → Demand</div>
        <table className="min-w-[520px] text-sm">
          <thead><tr><th></th>{D.map(d=> <th key={d.id}>{d.label||d.id}<div className="text-xs opacity-70">demand={d.demand}</div></th>)}</tr></thead>
          <tbody>
            {H.map(h=>(
              <tr key={h.id}>
                <td className="pr-2 font-medium">{h.label||h.id}</td>
                {D.map(d=>(
                  <td key={d.id} className="p-1">
                    {allowed.has(`${h.id}>${d.id}`) ? (
                      <input type="number" min="0" className="w-24 bg-white/10 rounded px-2 py-1"
                        value={get(h.id,d.id)} onChange={e=> set(h.id,d.id, Number(e.target.value||0))}/>
                    ) : <div className="opacity-30">—</div>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
