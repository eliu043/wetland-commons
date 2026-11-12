import {effortCapacity,effortRecoveryMs} from './effort-budget.mjs';
import {advanceSeason} from './island-model.mjs';
export const SEASON_MS=60000,RECOVERY_MS=8000;
export function ensureClock(w){if(!w.clock||!Number.isFinite(w.clock.seasonMs)||w.clock.seasonMs<0||w.clock.seasonMs>=SEASON_MS||!Number.isFinite(w.clock.recoveryMs)||w.clock.recoveryMs<0||w.clock.recoveryMs>=effortRecoveryMs(w))w.clock={seasonMs:0,recoveryMs:0};return w.clock}
export function restoreAction(before,after,current){const restored=structuredClone(before);restored.clock=structuredClone(ensureClock(current));restored.effort=Math.min(effortCapacity(current),current.effort+before.effort-after.effort);restored.funds=current.funds+before.funds-after.funds;return restored}
// Call only while playing. No wall-clock catch-up is performed when loading a save.
export function tickSimulation(w,elapsedMs,speed=1){
 if(![1,2,4].includes(speed)||!Number.isFinite(elapsedMs)||elapsedMs<0)throw Error('Invalid clock input');
 const clock=ensureClock(w),recoveryMs=effortRecoveryMs(w);let remaining=elapsedMs*speed,recovered=0;const seasons=[];
 while(remaining>0){const dt=Math.min(remaining,SEASON_MS-clock.seasonMs,recoveryMs-clock.recoveryMs);clock.seasonMs+=dt;clock.recoveryMs+=dt;remaining-=dt;
  if(clock.recoveryMs>=recoveryMs){clock.recoveryMs=0;const gain=Math.min(1,effortCapacity(w)-w.effort);w.effort+=gain;recovered+=gain}
  if(clock.seasonMs>=SEASON_MS){clock.seasonMs=0;seasons.push(advanceSeason(w,{continuous:true}))}
 }
 return {recovered,seasons};
}
