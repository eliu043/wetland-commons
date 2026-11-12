// Game balance: one reserve point per 45 map cells, replenished over two game minutes.
export const TILES_PER_EFFORT=45,REFILL_MS=120000;
export function effortCapacity(w){return w.version===2?Math.max(8,Math.ceil(w.tiles.length/TILES_PER_EFFORT)):4}
export function effortRecoveryMs(w){return w.version===2?REFILL_MS/effortCapacity(w):8000}
export function migrateEffort(w){
 if(w.version!==2||w.effortPolicy===2)return false;
 const cap=effortCapacity(w);w.effort=Math.min(cap,Math.max(0,Math.round(w.effort/4*cap*2)/2));
 if(w.clock&&Number.isFinite(w.clock.recoveryMs))w.clock.recoveryMs=Math.min(effortRecoveryMs(w)-1,Math.max(0,w.clock.recoveryMs/8000*effortRecoveryMs(w)));
 w.effortPolicy=2;return true;
}
