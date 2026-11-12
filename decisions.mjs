import {breach, distances, step, metrics, DEFAULTS} from './model.mjs';
export const HORIZON = 20;
export const CHECKPOINTS = [3, 6, 10, 15, HORIZON];
export function nextCheckpoint(year) {
  return CHECKPOINTS.find(n => n > year) ?? HORIZON;
}
// Compare only the additional footprint of this opening, on the current landscape.
export function previewBreach(world, index, settings = DEFAULTS) {
  if (world.year >= HORIZON) return null;
  const candidate = structuredClone(world);
  if (!breach(candidate, index)) return null;
  const before = distances(world), after = distances(candidate);
  const fresh = [], sediment = [], oysters = [];
  candidate.tiles.forEach((tile, i) => {
    if (['river', 'levee', 'developed'].includes(tile.type)) return;
    if (after[i] <= settings.freshRadius && before[i] > settings.freshRadius && tile.baseSalt !== 'fresh') {
      fresh.push(i);
      if (world.tiles[i].occupied[0]) oysters.push(i);
    }
    if (tile.type === 'water' && !tile.breach && after[i] <= settings.sedimentRadius && before[i] > settings.sedimentRadius) sediment.push(i);
  });
  let withOpening = candidate, withoutOpening = structuredClone(world);
  const years = Math.min(6, HORIZON - world.year);
  for (let year = 0; year < years; year++) {
    withOpening = step(withOpening, settings);
    withoutOpening = step(withoutOpening, settings);
  }
  const a = metrics(withOpening), b = metrics(withoutOpening);
  return {fresh, sediment, oysters, years, delta: Object.fromEntries(Object.keys(a).map(k => [k, a[k] - b[k]]))};
}
