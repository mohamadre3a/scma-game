export function computeStandings(round) {
  const entries = Object.entries(round.players || {}).map(([name, r]) => ({ name, ...r }));
  entries.sort((a, b) => b.score - a.score || a.timeSec - b.timeSec);
  return entries.map((e, i) => ({ ...e, rank: i + 1, points: Math.max(0, 24 - (i + 1)) }));
}
