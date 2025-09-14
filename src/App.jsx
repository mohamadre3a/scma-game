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
  const cached = localStorage.getItem(`scma_round_${room}`);
  if (cached) {
    // refresh in background
    dbLoadCurrentRound(room).then((fresh) => {
      if (fresh) localStorage.setItem(`scma_round_${room}`, JSON.stringify(fresh));
    });
    return JSON.parse(cached);
  }
  const fresh = await dbLoadCurrentRound(room);
  if (fresh) localStorage.setItem(`scma_round_${room}`, JSON.stringify(fresh));
  return fresh;
}

async function saveRoomRound(room, round) {
  if (!round) localStorage.removeItem(`scma_round_${room}`);
  else localStorage.setItem(`scma_round_${room}`, JSON.stringify(round));
  await dbSaveRound(room, round);
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
        <li>• Season points = <span className="font-semibold">20 − place</span> (min 0). No submit = 0.</li>
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

  // ===== Shortest Path (SP) controls =====
  const [selScenario, setSelScenario] = useState(round?.scenarioId || scenarios[0].id);
  const [customNodes, setCustomNodes] = useState(12);
  const [customObjective, setCustomObjective] = useState("time");
  const [customSpread, setCustomSpread] = useState(1.8);
  const [customDensity, setCustomDensity] = useState(2);
  const [customScenario, setCustomScenario] = useState(null);

  // SP objective: single vs dual
  const [objMode, setObjMode] = useState("single"); // "single" | "dual"
  const [objA, setObjA] = useState("time");
  const [objB, setObjB] = useState("cost");
  const [alphaPct, setAlphaPct] = useState(60);
  const alpha = alphaPct / 100;

  // ===== TSP controls =====
  const [tspNodes, setTspNodes] = useState(10);

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

  // Preview scenario (for SP) or generated nodes (for other modes)
  const baseScenario =
    gameMode === "sp"
      ? (selScenario === "custom"
          ? (customScenario || makeCustomScenario(customNodes, customObjective, {
              spread: customSpread, density: customDensity, height: 360, minDist: 44
            }))
          : scenarios.find((x) => x.id === (round?.scenarioId || selScenario)))
      : gameMode === "tsp"
      ? makeTspScenario(tspNodes)
      : gameMode === "vrp"
      ? makeVrpScenario(vrpCustomers, vrpCapacity)
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
          : null,
      objectiveMode: objMode,
      objA, objB, alpha,
    };
  } else if (gameMode === "tsp") {
    payload = { scenarioId: "tsp", customScenario: makeTspScenario(tspNodes) };
  } else if (gameMode === "vrp") {
    payload = { scenarioId: "vrp", customScenario: makeVrpScenario(vrpCustomers, vrpCapacity) };
  } else {
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
  const r = { ...round, isOpen: false };
  await saveRoomRound(room, r);
  setRound(r);
};

  const onReveal = async () => {
  if (!round) return;
  const r = { ...round, revealBoard: true };
  await saveRoomRound(room, r);
  setRound(r);
};

  const onReset = async () => {
  await saveRoomRound(room, null);
  setRound(null);
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
                      {scenarios.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
                      <option value="custom">Custom (Generated)</option>
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
              </>
            )}

            {gameMode === "tsp" && (
              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-slate-300 mb-1"># Nodes (incl. depot)</label>
                  <input type="number" min={6} max={18} value={tspNodes}
                         onChange={(e)=>setTspNodes(Number(e.target.value))}
                         className="bg-white/10 rounded-xl px-4 py-2.5 w-full" />
                  <div className="text-xs text-slate-400 mt-1">Visit all, return to S. Baseline uses NN + 2-opt.</div>
                </div>
              </div>
            )}

            {gameMode === "vrp" && (
              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-slate-300 mb-1"># Customers</label>
                  <input type="number" min={6} max={30} value={vrpCustomers}
                         onChange={(e)=>setVrpCustomers(Number(e.target.value))}
                         className="bg-white/10 rounded-xl px-4 py-2.5 w-full" />
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">Vehicle Capacity</label>
                  <input type="number" min={4} max={20} value={vrpCapacity}
                         onChange={(e)=>setVrpCapacity(Number(e.target.value))}
                         className="bg-white/10 rounded-xl px-4 py-2.5 w-full" />
                  <div className="text-xs text-slate-400 mt-1">Demand per customer is 1–4.</div>
                </div>
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

function MapPreview({ scenario }) { return (
  <div className="overflow-hidden rounded-xl bg-black/20 border border-white/10">
    <SvgMap scenario={scenario} readonly />
  </div>
); }

// -----------------------------
// Player Panel
// -----------------------------
function PlayerPanel({ me }) {
  const [round, setRound] = useRound(me.room);
  if (!round) return <WaitingCard room={me.room} />;
  if (round.revealBoard) return <Leaderboards room={me.room} round={round} />;
  if (!round.isOpen) return <ClosedCard />;
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

  useEffect(() => {
    (async () => {
      const s = await loadSeason(room);
      setSeason(s || { totals: {}, history: [] });
    })();
  }, [room, round?.id]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <RoundLeaderboardCard room={room} round={round} />
      <SeasonLeaderboardCard room={room} season={season} />
    </div>
  );
}


function RoundLeaderboardCard({ room, round }) {
  const s = getScenarioFromRound(round);
  const entries = Object.entries(round.players || {}).map(([name, r]) => ({ name, ...r }));
  entries.sort((a, b) => b.score - a.score || a.timeSec - b.timeSec);

    const { graphEdges } = useWeightedScenario(s, round);

  const opt = useMemo(() => {
    if (!s?.nodes?.length) return { cost: Infinity, path: [] };
    switch (round.gameMode) {
      case "sp":
        return dijkstra(s.nodes, graphEdges, s.start, s.end);
      case "tsp":
        return tspBaselineCost(s.nodes);
      case "vrp":
        return vrpBaselineCost(s);
      case "pick":
      default:
        return pickBaselineCost(s);
    }
  }, [round.gameMode, s, graphEdges]);


  const optScore = Math.round(1000 * (opt.cost / opt.cost)) + 200;

  return (
    <div className="rounded-2xl bg-white/5 p-6 ring-1 ring-white/10 shadow-xl lg:col-span-2">
      <h2 className="text-xl font-bold mb-1">This Round — Room {room}</h2>
      <div className="text-xs text-slate-300">Scenario: {s.title}</div>
      <div className="text-xs text-slate-300 mb-4">Optimal: {opt.path.join("\u2192")} • Cost {fmt(opt.cost)} • Score {optScore}</div>
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
              <div>Season points: {Math.max(0, 20 - (i + 1))}</div>
            </div>
          </div>
        ))}
      </div>
      <ExportCsvButtonRound round={round} />
    </div>
  );
}

function SeasonLeaderboardCard({ room, season }) {
  const totals = Object.entries(season.totals || {}).map(([name, pts]) => ({ name, pts }));
  totals.sort((a, b) => b.pts - a.pts || a.name.localeCompare(b.name));
  return (
    <div className="rounded-2xl bg-gradient-to-br from-emerald-800/60 to-teal-900/60 p-6 ring-1 ring-white/10 shadow-xl">
      <h3 className="font-bold mb-2">Season Leaderboard</h3>
      <div className="text-xs text-emerald-200 mb-3">Cumulative points across all rounds (20 − place, min 0).</div>
      <div className="space-y-2">
        {totals.length === 0 && <div className="text-emerald-200/80">No points yet.</div>}
        {totals.map((e, i) => (
          <div key={e.name} className={`flex items-center justify-between rounded-xl px-4 py-3 ${i === 0 ? "bg-yellow-500/20" : i === 1 ? "bg-slate-400/20" : i === 2 ? "bg-amber-700/30" : "bg-white/5"}`}>
            <div className="flex items-center gap-3">
              <Medal rank={i + 1} />
              <div className="font-semibold">{e.name}</div>
            </div>
            <div className="text-right text-sm font-bold">{e.pts} pts</div>
          </div>
        ))}
      </div>
      <ExportCsvButtonSeason room={room} />
    </div>
  );
}

function ExportCsvButtonRound({ round }) {
  const onExport = () => {
    const rows = [["name","ingameScore","cost","timeSec","path"]];
    for (const [name, r] of Object.entries(round.players || {})) {
      rows.push([name, r.score, r.cost, r.timeSec, (r.path || []).join("→")]);
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

  const scenario = getScenarioFromRound(round);

  // timer
  useEffect(() => {
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - (round.startedAt || Date.now())) / 1000)), 300);
    return () => clearInterval(t);
  }, [round.startedAt]);
  const timeLeft = round.endsAt ? Math.max(0, Math.ceil((round.endsAt - Date.now()) / 1000)) : null;

  // graph (SP) — hooks top-level only
  const { graphEdges, optCost: spOptCost } = useWeightedScenario(scenario, round);
  const spAdj = useMemo(() => new Set(graphEdges.map(([u, v]) => `${u}>${v}`)), [graphEdges]);

  const [path, setPath] = useState([scenario.start || "S"]);
  const currentNode = path[path.length - 1];

  // Precompute cost for SP path separately to keep hooks top-level
  const spPathCost = useMemo(() => computePathCost(path, graphEdges), [path, graphEdges]);

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
  } else {
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
    pickBaselineCost(scenario).cost;

  const onSubmit = async () => {
  if (!canSubmit || submitted) return;
  const timeSec = elapsed;
  const base = Math.max(1, Math.round(1000 * (optCost / Math.max(1, totalCost))));
  const timeBonus = Math.max(0, 200 - timeSec);
  const score = base + timeBonus;

  const r = (await loadRoomRound(round.room || "SCMA")) || round;
  r.players = r.players || {};
  r.players[me.name] = { cost: Math.round(totalCost), timeSec, score, path };

  if (typeof dbUpsertSubmission === "function") {
    await dbUpsertSubmission(round.id, me.name, { cost: Math.round(totalCost), timeSec, score, path });
  }
  await saveRoomRound(me.room, r);
  onRoundUpdate(r);
  setSubmitted(true);
};


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
          <SvgMap
            scenario={scenario}
            path={path}
            onClickNode={onClickNode}
            hintLines={round.gameMode === "tsp" ? tspHintLines : []}
          />
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
function SvgMap({ scenario, path = [], onClickNode, readonly, hintLines = [] }) {
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

  // Sanitize edges
  const edges = Array.isArray(scenario.edges) ? scenario.edges : [];

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
  const nodeById = Object.fromEntries(tnodes.map(n => [n.id, n]));

  // Highlight edges from player's path (SP)
  const selected = new Set();
  for (let i = 0; i < path.length - 1; i++) selected.add(path[i] + ">" + path[i + 1]);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[640px]">
      {/* base edges if present (SP) */}
      {edges.map(([u, v, w, m], idx) => {
        const a = nodeById[u], b = nodeById[v];
        if (!a || !b) return null;
        const sel = selected.has(u + ">" + v);
        const showVal = typeof w === "number" ? w : (w?.[scenario.objective] ?? w?.time ?? 0);
        return (
          <g key={`e${idx}`}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={sel ? "#34d399" : "#94a3b8"} strokeWidth={sel ? 6 : 3} strokeOpacity={0.9} />
            <EdgeLabel a={a} b={b} text={`${m || ""} ${showVal}`} />
          </g>
        );
      })}

      {/* TSP/Picking/VRP: player's current path */}
      {path.length > 1 && (
        <polyline
          points={path.map(id => {
            const n = nodeById[id];
            return n ? `${n.x},${n.y}` : null;
          }).filter(Boolean).join(" ")}
          fill="none" stroke="#34d399" strokeWidth="6" strokeOpacity="0.7"
        />
      )}

      {/* TSP hint lines */}
      {hintLines.map((h, i) => {
        const a = nodeById[h.from], b = nodeById[h.to];
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
      {tnodes.map((n, i) => {
        const demand = scenario.demand?.[n.id];
        return (
          <g key={n.id} onClick={() => !readonly && onClickNode?.(n.id)} className={readonly ? "" : "cursor-pointer"}>
            <circle cx={n.x} cy={n.y} r={15} fill="#0ea5e9" stroke="#bae6fd" strokeWidth={3} />
            <text x={n.x} y={n.y + (i % 2 ? 34 : 30)} textAnchor="middle" className="fill-white"
                  style={{ fontSize: 12, fontWeight: 700 }}>{n.id}</text>
            <text x={n.x} y={n.y - (i % 2 ? 24 : 20)} textAnchor="middle" className="fill-slate-200"
                  style={{ fontSize: 11 }}>{n.label}</text>

            {typeof demand === "number" && n.id !== "S" && (
              <g>
                <rect x={n.x + 16} y={n.y - 28} rx={8} ry={8} width={38} height={20} fill="#0b1221" opacity="0.9" />
                <text x={n.x + 35} y={n.y - 14} textAnchor="middle" className="fill-white"
                      style={{ fontSize: 11, fontWeight: 700 }}>d:{demand}</text>
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
  const w = Math.max(44, text.length * 7 + 10);
  return (
    <g>
      <rect x={ox - w / 2} y={oy - 12} width={w} height={20} rx={8} fill="#111827" opacity={0.85} />
      <text x={ox} y={oy + 3} textAnchor="middle" className="fill-white" style={{ fontSize: 11, fontWeight: 700 }}>
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



function computePathCost(path, edges) {
  const map = new Map();
  for (const [u, v, w] of edges) map.set(u + ">" + v, w);
  let sum = 0; for (let i = 0; i < path.length - 1; i++) { const w = map.get(path[i] + ">" + path[i + 1]); if (w == null) return Infinity; sum += w; }
  return sum;
}

function useRound(room) {
  const [round, setRound] = useState(null);

  useEffect(() => {
    let alive = true;

    const tick = async () => {
      const r = await loadRoomRound(room);
      if (!alive) return;

      if (r && r.isOpen && r.endsAt && Date.now() > r.endsAt) {
        const closed = { ...r, isOpen: false };
        await saveRoomRound(room, closed); // persist closed state
        if (alive) setRound(closed);
      } else {
        setRound(r);
      }
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
  if (round.customScenario?.nodes?.length) return round.customScenario;
  const s = scenarios.find((x) => x.id === round.scenarioId);
  return s ?? null;
}


function csvEscape(x) { return `"${String(x).replaceAll('"','""')}"`; }

function downloadCsv(csv, filename) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob); const a = document.createElement("a");
  a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}

// Season scoring
function computeStandings(round) {
  const entries = Object.entries(round.players || {}).map(([name, r]) => ({ name, ...r }));
  entries.sort((a, b) => b.score - a.score || a.timeSec - b.timeSec);
  const standings = entries.map((e, i) => ({ ...e, rank: i + 1, points: Math.max(0, 20 - (i + 1)) }));
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
    nodes.splice(nodes.length - 1, 0, { id: idFromIndex(i + 1), x: Math.round(pts[i].x), y: Math.round(pts[i].y), label: `N${i + 1}` });
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
    nodes.push({ id: idFromIndex(i+1), x: Math.round(pts[i].x), y: Math.round(pts[i].y), label:`N${i+1}` });
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
    const id = idFromIndex(i+1);
    nodes.push({ id, x: Math.round(pts[i].x), y: Math.round(pts[i].y), label:`C${i+1}` });
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
    nodes.push({ id:idFromIndex(i+1), x:Math.round(chosen[i].x), y:Math.round(chosen[i].y), label:`P${i+1}` });
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

function nodeByIdMap(nodes){ return Object.fromEntries(nodes.map(n=>[n.id,n])); }

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
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? data.payload : null;
}

async function dbSaveRound(room, round) {
  if (!round) {
    await supabase.from("rounds").delete().eq("room", room);
    return;
  }
  await supabase.from("rounds").upsert({
    id: round.id,
    room,
    game_mode: round.gameMode,
    payload: round,
    started_at: new Date(round.startedAt).toISOString(),
    ends_at: round.endsAt ? new Date(round.endsAt).toISOString() : null,
    is_open: !!round.isOpen,
    reveal_board: !!round.revealBoard,
    scored: !!round.scored,
  });
}

async function dbUpsertSubmission(roundId, username, rec) {
  await supabase.from("submissions").upsert({
    round_id: roundId,
    username,
    cost: rec.cost,
    time_sec: rec.timeSec,
    score: rec.score,
    path: rec.path,
  });
}

async function dbApplySeasonPoints(room, standings) {
  // standings = array of { name, rank } sorted by score
  const rows = standings.map((s) => ({
    room,
    username: s.name,
    points: Math.max(0, 20 - s.rank),
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
