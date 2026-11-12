// Explicit game policy, not a claim about real Louisiana funding programs.
export const ECONOMY={localPerSeason:3,statePerYear:12,grantAdvance:6,grantCompletion:8,grantTarget:3};
export const GRANTS={forest:{name:'Community grove',tool:'tree',type:'forest',description:'Plant 3 trees and keep them standing until review. They must be at least 3 seasons old.'},wetland:{name:'Wetland restoration',tool:'wetland',type:'marsh',description:'Plant 3 marsh tiles and retain them until review.'},resilience:{name:'Flood resilience',tool:'levee',type:'levee',description:'Build or repair 3 levee tiles and keep them intact until review.'}};
export function ensureEconomy(w){w.economy??={lastAppliedPeriod:-1,activeGrant:null,lastFunding:null};return w.economy}
export function grantAvailable(w){const e=w.economy;return !e?.activeGrant&&(e?.lastAppliedPeriod??-1)<Math.floor(w.season/4)}
export function applyGrant(w,key){
 if(!GRANTS[key])return {ok:false,message:'Choose a listed grant.'};
 if(!grantAvailable(w))return {ok:false,message:'One active grant at a time; a new application opens each year.'};
 const e=ensureEconomy(w),period=Math.floor(w.season/4);e.lastAppliedPeriod=period;e.activeGrant={key,started:w.season,deadline:w.season+4,tiles:[]};w.funds+=ECONOMY.grantAdvance;
 const message=`${GRANTS[key].name}: 6 advance funds received. Deliver 3 qualifying tiles within four seasons for 8 more.`;
 w.log.unshift({season:w.season,text:message});w.log=w.log.slice(0,12);return {ok:true,message};
}
export function recordGrantWork(w,tool,targets){const grant=w.economy?.activeGrant;if(!grant||GRANTS[grant.key].tool!==tool)return;grant.tiles=[...new Set([...grant.tiles,...targets])]}
export function grantProgress(w){const grant=w.economy?.activeGrant;if(!grant)return 0;return grant.tiles.filter(i=>{const t=w.tiles[i];return t?.type===GRANTS[grant.key].type&&(grant.key!=='forest'||t.treeAge>=3)&&(grant.key!=='resilience'||t.leveeHealth>0)}).length}
export function settleFunding(w){
 const e=ensureEconomy(w),funding={local:ECONOMY.localPerSeason,state:w.season%4===0?ECONOMY.statePerYear:0,grant:0,review:null};
 if(e.activeGrant&&w.season>=e.activeGrant.deadline){const progress=grantProgress(w);funding.grant=progress>=ECONOMY.grantTarget?ECONOMY.grantCompletion:0;funding.review=`${GRANTS[e.activeGrant.key].name} review: ${progress}/3 qualifying tiles; ${funding.grant?'8 completion funds awarded.':'completion payment not earned. Advance is retained.'}`;e.activeGrant=null}
 w.funds+=funding.local+funding.state+funding.grant;e.lastFunding=funding;return funding;
}
