# SCMA Morning Dash 🎮🚚

An interactive **classroom logistics game** built for **SCMA 455 – Logistics Management** at the University of Calgary.  
It helps students wake up in morning lectures and learn key logistics concepts by competing on shortest-path, TSP, VRP, and order-picking puzzles.  

---

## ✨ Features
- Instructor dashboard to start/close rounds.
- Multiple game modes:
  - **Shortest Path (SP)** with single/dual objectives.
  - **Traveling Salesperson (TSP)**.
  - **Vehicle Routing Problem (VRP)** with capacity constraints.
  - **Warehouse Order-Picking** with Manhattan distance.
- Leaderboard with cumulative season points:
  - `points = 20 – placement` (e.g., 1st = 19 pts).
- Student login via **username + PIN** (from CSV roster).
- Persistent data storage with **Supabase** (does not reset on redeploy).
- Export round/season results to CSV.

---

## 🎮 How to Play & Score

1. Instructor starts a round and chooses a scenario.
2. Students join with their **username + PIN** and see a countdown timer.
3. Click nodes to build a valid route; use the **Undo** button to backtrack.
4. Submit your route before time runs out.

### Game goals
- **Shortest Path:** go from start **S** to target **T** while minimizing the chosen metric (time, cost, or CO₂).
- **Traveling Salesperson:** start at **S**, visit every node once, and return to **S**.
- **Vehicle Routing:** serve all customers without exceeding vehicle capacity; return to the depot to reload.
- **Order Picking:** walk the warehouse grid, collect all picks, and return to the dock.

### Score calculation
- **Base:** `1000 × (optimal cost ÷ your cost)`.
- **Time bonus:** `max(0, 200 − seconds used)`.
- **Total score:** base + time bonus (higher is better).
- **Goal:** maximize your score to rank high and earn season points (`20 − place`).

---

## 🚀 Setup (Local Development)

1. Clone this repo:
   ```bash
   git clone https://github.com/<your-username>/scma-dash.git
   cd scma-dash
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create `.env.local`:
   ```env
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_key
   ```

4. Run dev server:
   ```bash
   npm run dev
   ```
   Open [http://localhost:5173](http://localhost:5173).

---

## 🌐 Deployment (Free)

We recommend **Vercel (frontend)** + **Supabase (backend database)**.

1. Push your repo to GitHub.
2. Create a project in [Supabase](https://supabase.com).
3. Run the provided SQL (see `docs/schema.sql`) to create tables:
   - `roster` (student logins)
   - `rounds`
   - `submissions`
   - `season_totals`
4. Import your **username+PIN CSV** into the `roster` table.
5. On Vercel:
   - Import your GitHub repo.
   - Framework: **Vite**.
   - Build: `npm run build`.
   - Output: `dist/`.
   - Add environment variables from `.env.local`.

Custom domain? Point `scma.shahsahebi.com` (CNAME) → Vercel.

---

## 🎲 Game Modes Explained

### 1) Shortest Path (SP)
- **Goal:** Reach **T** from **S**.
- **Objectives:**
  - Minimize **time**, **cost**, or **CO₂**.
  - Or dual-objective: `α·A + (1–α)·B`.
- **Rules:** Click nodes along valid edges only. Submit at **T** before time runs out.

---

### 2) Traveling Salesperson (TSP)
- **Goal:** Start at **S**, visit every node exactly once, and return to **S**.
- **Distances:** Euclidean.
- **Hints:** App shows dashed lines from your current node to all unvisited nodes with distances.
- **Rules:** Submit only when tour is complete.

---

### 3) Vehicle Routing Problem (VRP)
- **Goal:** Serve all customers with **vehicle capacity Q**.
- **Demands:** Shown beside each customer as `d:x`.
- **Rules:**
  - Click customers in sequence.
  - Click **S** to return/reset load.
  - App prevents moves that would exceed Q.
- **Status:** Panel shows **current load** and per-leg distances.

---

### 4) Warehouse Order-Picking
- **Goal:** Start at **S (dock)**, visit all pick locations, and return to **S**.
- **Distance metric:** Manhattan (grid/aisles, no diagonals).
- **Panel:** Shows step-by-step walking distance.

---

## 🏆 Scoring

- **Round Score:** `score = 1000 × (baseline / your cost) + max(0, 200 − time in seconds)`.
- **Season Points:**
  - Placement → `20 – rank`.
  - Example: 1st = 19 pts, 5th = 15 pts, ≥20th = 0.
- Non-submitters get **0**.

---

## 📊 Instructor Workflow

1. Log in with instructor PIN.
2. Open a round (choose mode, nodes, timer).
3. Students log in (username + PIN).
4. When time ends → close round → reveal leaderboard.
5. Export results if needed.
6. Season totals update automatically.

---

## 📂 File Structure
```
/src
  App.jsx         # Main app
  lib/supabase.js # Supabase client
/docs
  schema.sql      # SQL for Supabase tables
```

---

## 📝 Roster CSV Example
```csv
room,username,pin,display_name
SCMA,alice,1111,Alice R.
SCMA,bob,2222,Bob K.
SCMA,charlie,3333,Charlie P.
```

---

## ✅ Next Steps
- Add more scenarios with custom node layouts.
- Add optional difficulty scaling (larger TSP/VRP).
- Export season standings automatically at term end.

---
