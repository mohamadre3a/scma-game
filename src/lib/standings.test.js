import { describe, it, expect } from 'vitest';
import { computeStandings } from './standings';

describe('computeStandings', () => {
  it('sorts players and assigns ranks and points', () => {
    const round = {
      players: {
        alice: { score: 100, timeSec: 10 },
        bob: { score: 100, timeSec: 20 },
        carol: { score: 90, timeSec: 5 }
      }
    };
    const standings = computeStandings(round);
    expect(standings[0]).toMatchObject({ name: 'alice', rank: 1, points: 23 });
    expect(standings[1]).toMatchObject({ name: 'bob', rank: 2, points: 22 });
    expect(standings[2]).toMatchObject({ name: 'carol', rank: 3, points: 21 });
  });
});
