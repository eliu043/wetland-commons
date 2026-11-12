import {propagateFlood} from './marsh-resilience.mjs';
import {effortCapacity,effortRecoveryMs} from './effort-budget.mjs';
import {recordGrantWork,settleFunding} from './economy.mjs';
export const WIDTH=36,HEIGHT=30;
export const SEASONS=['Spring','Summer','Autumn','Winter'];
export const TYPES={water:'Water',mud:'Mud',sand:'Sand',developed:'Developed',levee:'Levee',forest:'Forest',marsh:'Marsh',meadow:'Open land',unknown:'Unclassified'};
export const ROLES={
 forester:{name:'Forester',sheet:'Lumberjack / forest steward',emoji:'🌳',goal:'Grow 12 more forest tiles than you started with.',ability:'Grove planting',description:'Plant up to three neighboring trees for 1 effort and 2 funds.',target:12},
 ecologist:{name:'Ecologist',emoji:'🌿',goal:'Establish 10 marsh tiles through your own restoration.',ability:'Wetland nursery',description:'Plant up to three eligible mud or wet meadow tiles for 1 effort and 2 funds.',target:10},
 developer:{name:'Developer',emoji:'🏠',goal:'Create four new occupied, undamaged homes.',ability:'Raised foundation',description:'Build one house with extra elevation for 1 effort and 4 funds.',target:4},
 engineer:{name:'Engineer',emoji:'🧰',goal:'Finish eight seasons without any homes taking flood damage.',ability:'Levee crew',description:'Build or repair up to three neighboring levee tiles for 1 effort and 2 funds.',target:8},
 fisher:{name:'Fisher / farmer',emoji:'🦐',goal:'Collect 16 sustainable catches or crop harvests.',ability:'Community harvest',description:'Harvest up to three ready fishing or farm tiles for 1 effort, at no fund cost.',target:16}
};
export const TOOLS={
 inspect:{name:'Inspect',emoji:'↖',cost:0,effort:0},timber:{name:'Harvest timber',emoji:'🪓',cost:0,effort:.5},dig:{name:'Dig channel',emoji:'〰',cost:3,effort:1},tree:{name:'Plant tree',emoji:'🌳',cost:2,effort:1},wetland:{name:'Plant marsh',emoji:'🌾',cost:2,effort:1},
 levee:{name:'Build / repair levee',emoji:'▣',cost:2,effort:1},remove:{name:'Remove levee',emoji:'⌫',cost:1,effort:1},house:{name:'Build / repair home',emoji:'🏠',cost:4,effort:1},
 harvest:{name:'Fish / harvest',emoji:'🧺',cost:0,effort:1},farm:{name:'Plant food garden',emoji:'🌱',cost:2,effort:1},clear:{name:'Clear invasives',emoji:'🪻',cost:1,effort:1},fill:{name:'Place sediment',emoji:'●',cost:3,effort:1},ability:{name:'Role ability',emoji:'✦',cost:0,effort:1}
};
export function hashSeed(text){let h=2166136261;for(const c of String(text)){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0}
export function random(world){world.rng=(world.rng+0x6d2b79f5)>>>0;let n=world.rng;n=Math.imul(n^n>>>15,n|1);n^=n+Math.imul(n^n>>>7,n|61);return ((n^n>>>14)>>>0)/4294967296}
export function neighbors(i,width=WIDTH,height=HEIGHT){let x=i%width,y=Math.floor(i/width);return [x?i-1:-1,x<width-1?i+1:-1,y?i-width:-1,y<height-1?i+width:-1].filter(n=>n>=0)}
function coord(i){return [i%WIDTH,Math.floor(i/WIDTH)]}
function line(tiles,a,b,width=1,kind='river'){
 const steps=Math.max(Math.abs(a[0]-b[0]),Math.abs(a[1]-b[1]))*3;
 for(let n=0;n<=steps;n++){const x=Math.round(a[0]+(b[0]-a[0])*n/steps),y=Math.round(a[1]+(b[1]-a[1])*n/steps);
  for(let dy=-width;dy<=width;dy++)for(let dx=-width;dx<=width;dx++){const xx=x+dx,yy=y+dy;if(xx>=0&&xx<WIDTH&&yy>=0&&yy<HEIGHT){const t=tiles[yy*WIDTH+xx];t.type='water';t.kind=kind;t.elevation=0}}
 }
}
export function generateIsland(seed='reed-001',layout='west',role='ecologist'){
 const w={version:1,seed:String(seed).slice(0,48),layout,role:ROLES[role]?role:'ecologist',rng:hashSeed(seed+layout),season:0,funds:24,effort:4,catches:0,safeSeasons:0,abilityReady:0,tiles:[],log:[],waterLevel:0,lastEvent:'A new island, a new responsibility.',forecast:null};
 for(let y=0;y<HEIGHT;y++)for(let x=0;x<WIDTH;x++){
  const edge=Math.min(x-2,WIDTH-3-x,y-2,HEIGHT-3-y),coast=edge<0||(edge<2&&random(w)<.28);
  const elevation=.7+random(w)*1.4+(y<10?.8:0);
  const r=random(w),type=coast?'water':edge<2?'sand':r<.32?'forest':r<.48?'marsh':'meadow';
  w.tiles.push({x,y,type,kind:coast?'sea':'land',elevation,salt:coast?'salty':'fresh',flooded:false,damaged:false,leveeHealth:3,sediment:0,mudAge:0,saltAge:0,hyacinth:false,nutria:false,garden:false,cropAge:0,harvestedAt:-99,treeAge:4});
 }
 const points=[[18,0],[18,5],[14+Math.floor(random(w)*6),10],[20,15],[15,20]];
 if(layout==='east')points.push([26,21],[35,23]);else if(layout==='double')points.push([12,24],[12,29]);else points.push([8,22],[0,22]);
 for(let p=1;p<points.length;p++)line(w.tiles,points[p-1],points[p],0);
 if(layout==='double'){line(w.tiles,[20,15],[25,23],0);line(w.tiles,[25,23],[25,29],0)}
 // A small connected side channel and ponds make local interventions possible.
 line(w.tiles,[18,5],[25,8],0);line(w.tiles,[25,8],[28,12],0);
 for(let k=0;k<3;k++){const x=7+Math.floor(random(w)*22),y=8+Math.floor(random(w)*14);if(w.tiles[y*WIDTH+x].kind==='land')line(w.tiles,[x,y],[x+1,y],0,'pond')}
 // Discontinuous starting levees, deliberately editable. They do not create water sources.
 for(let y=7;y<=18;y++)for(let x=1;x<WIDTH-1;x++){
  const i=y*WIDTH+x,t=w.tiles[i];if(t.kind==='land'&&t.type!=='sand'&&neighbors(i).some(j=>w.tiles[j].kind==='river')&&random(w)<.42){t.type='levee';t.elevation=1.1}
 }
 // Place a small village on moderate land, with some exposure to create a reason to protect it.
 for(const [x,y]of [[9,10],[10,10],[27,17],[28,17],[8,24],[27,24]]){
  const t=w.tiles[y*WIDTH+x];if(t.kind==='land'&&t.type!=='sand'){t.type='developed';t.elevation=y>20?1.35:2.2;t.originalHome=true}
 }
 refreshWater(w,0);w.initial=stats(w);w.forecast=rollEvent(w);w.log=[{season:0,text:'Choose a tool, act on a tile, then advance the season. You have four effort per season.'}];return w;
}
export function waterFields(world){
 const fresh=new Array(WIDTH*HEIGHT).fill(Infinity),sea=new Array(WIDTH*HEIGHT).fill(Infinity);
 function spread(d,seeds){const q=seeds.filter(i=>world.tiles[i]?.type==='water');for(const i of q)d[i]=0;for(let a=0;a<q.length;a++)for(const j of neighbors(q[a]))if(world.tiles[j].type==='water'&&d[j]===Infinity){d[j]=d[q[a]]+1;q.push(j)}}
 const fs=[],ss=[];world.tiles.forEach((t,i)=>{if(t.type!=='water')return;if(t.kind==='river'&&t.y<2)fs.push(i);if(t.kind==='sea'&&(t.x<2||t.x>WIDTH-3||t.y>HEIGHT-3))ss.push(i)});
 spread(fresh,world.freshSources??fs);spread(sea,world.coastalSources??ss);return {fresh,sea};
}
export function refreshWater(w,level=0,{marshProtection=true}={}){
 const fields=waterFields(w);
 w.tiles.forEach((t,i)=>{if(t.type==='water'){
  const f=fields.fresh[i],s=fields.sea[i];t.salt=!Number.isFinite(f)?(Number.isFinite(s)?'salty':'fresh'):!Number.isFinite(s)?'fresh':f/(f+s)<.48?'fresh':f/(f+s)<.78?'brackish':'salty';t.flooded=false;
 }});
 // Two-step moisture reach is a toy rule, blocked by levees. Read only water salt states.
 w.tiles.forEach((t,i)=>{if(t.type!=='water'){
  let near=neighbors(i).filter(j=>w.tiles[j].type!=='levee');
  near=[...new Set([...near,...near.flatMap(j=>neighbors(j).filter(k=>w.tiles[k].type!=='levee'))])];
  const waters=near.filter(j=>w.tiles[j].type==='water');
  t.salt=waters.some(j=>w.tiles[j].salt==='salty')?'salty':waters.some(j=>w.tiles[j].salt==='brackish')?'brackish':'fresh';t.flooded=false;
 }});
 // Connected marsh attenuates overland flooding; open-water bypasses retain full pressure.
 const sources=w.tiles.map((t,i)=>t.type==='water'&&(Number.isFinite(fields.fresh[i])||Number.isFinite(fields.sea[i]))?i:-1).filter(i=>i>=0);
 const flood=propagateFlood(w.tiles,sources,level,{width:WIDTH,marshProtection});
 for(let i=0;i<w.tiles.length;i++){const t=w.tiles[i];t.flooded=flood.flooded[i];t.floodHead=Number.isFinite(flood.heads[i])?flood.heads[i]:null;t.marshDrag=flood.drag[i];t.marshPatchSize=flood.patchSize[i]}
 return fields;
}
export function fishable(w,i){const t=w.tiles[i];return t.type==='water'&&t.kind!=='sea'&&!t.hyacinth&&neighbors(i).some(j=>['marsh','forest'].includes(w.tiles[j].type))}
export function habitatAt(w,i){const t=w.tiles[i],near=neighbors(i);return {
 oyster:t.type==='water'&&t.salt==='brackish'&&!t.hyacinth,
 shrimp:fishable(w,i)&&near.some(j=>w.tiles[j].type==='marsh'),
 alligator:t.type==='marsh'&&t.salt!=='salty',
 bird:['forest','marsh'].includes(t.type)&&!t.nutria,
 pollinator:t.type==='meadow'&&t.garden&&!t.flooded,
 crab:t.type==='sand'&&t.salt!=='fresh',
 raccoon:t.type==='forest'&&near.some(j=>w.tiles[j].type==='developed'),
 beetle:t.type==='marsh'&&t.salt==='fresh',
 dragonfly:t.type==='water'&&t.salt==='fresh'&&!t.hyacinth&&near.some(j=>w.tiles[j].type==='marsh')
}}
export function habitat(w){const result={oyster:0,shrimp:0,alligator:0,bird:0,pollinator:0,crab:0,raccoon:0,beetle:0,dragonfly:0};for(let i=0;i<w.tiles.length;i++)for(const [key,eligible]of Object.entries(habitatAt(w,i)))if(eligible)result[key]++;return result}
export function stats(w){return {forest:w.tiles.filter(t=>t.type==='forest').length,marsh:w.tiles.filter(t=>t.type==='marsh').length,restoredMarsh:w.tiles.filter(t=>t.type==='marsh'&&t.restoredByPlayer).length,homes:w.tiles.filter(t=>t.type==='developed'&&!t.damaged).length,damaged:w.tiles.filter(t=>t.type==='developed'&&t.damaged).length,invasives:w.tiles.filter(t=>t.hyacinth||t.nutria).length,...habitat(w)}}
export function roleProgress(w){const s=stats(w);return w.role==='forester'?s.forest-w.initial.forest:w.role==='ecologist'?s.restoredMarsh:w.role==='developer'?s.homes-w.initial.homes:w.role==='engineer'?w.safeSeasons:w.catches}
export function rollEvent(w){
 const r=random(w),season=(w.season+1)%4;
 if(season===3&&r<.6)return {type:'tide',name:'High water',text:'Low ground connected to water may flood. Pause to inspect amber risk tiles before the season changes.',level:1.85};
 if(season===1&&r<.72)return {type:'hyacinth',name:'Hyacinth drift',text:'A floating patch may arrive in fresh river water. Clear it before it spreads.',level:1.25};
 if(r<.14)return {type:'nutria',name:'Nutria sighting',text:'A patch of marsh may face grazing. Clearing the affected tile can contain the damage.',level:1.3};
 if(r<.43)return {type:'rain',name:'Heavy rain',text:'Water may reach connected low ground. Connected marsh, levees and raised homes can help.',level:1.65};
 return {type:'quiet',name:'Gentle season',text:'A good window to plant, repair, or harvest. Existing invasive patches can still spread.',level:1.1};
}
export function floodOutlook(w,level=w.forecast.level){
 const copy=structuredClone(w),baseline=structuredClone(w);refreshWater(copy,level);refreshWater(baseline,level,{marshProtection:false});
 const risk=[],protectedTiles=[],protectedHomes=[];
 copy.tiles.forEach((t,i)=>{if(t.flooded)risk.push(i);if(baseline.tiles[i].flooded&&!t.flooded){protectedTiles.push(i);if(t.type==='developed')protectedHomes.push(i)}});
 return {risk,protectedTiles,protectedHomes,patchSizes:copy.tiles.map(t=>t.marshPatchSize),drag:copy.tiles.map(t=>t.marshDrag)};
}
export function floodRisk(w){return floodOutlook(w).risk}

function wetNeighbor(w,i){return neighbors(i).some(j=>w.tiles[j].type==='water')}
export function eligibility(w,tool,i,special=false){
 const t=w.tiles[i];if(!t)return 'Choose a tile on the map.';
 if(tool==='timber')return t.type==='forest'&&t.treeAge>=3?null:'Harvest mature forest only. New trees need three seasons before they can be cut.';
 if(tool==='dig')return ['mud','sand','meadow'].includes(t.type)&&!t.garden&&wetNeighbor(w,i)?null:'Dig in mud, sand, or meadow beside existing water.';
 if(tool==='tree')return ['meadow','marsh'].includes(t.type)&&!t.flooded&&!t.garden?null:'Trees need dry meadow or marsh without a garden.';
 if(tool==='wetland')return (t.type==='mud'||(t.type==='meadow'&&wetNeighbor(w,i)))?null:'Plant marsh on mud, or meadow next to water.';
 if(tool==='levee')return (t.type==='levee'&&t.leveeHealth<3)||(['meadow','marsh','sand','mud'].includes(t.type)&&!t.garden&&neighbors(i).some(j=>['water','levee'].includes(w.tiles[j].type)))?null:'Build beside water or another levee; repair a damaged levee.';
 if(tool==='remove')return t.type==='levee'?null:'Select an existing levee.';
 if(tool==='house')return (t.type==='developed'&&t.damaged)||(['meadow','sand','forest'].includes(t.type)&&!t.flooded&&!t.garden)?null:'Build on dry meadow, sand, or forest; repair a damaged home.';
 if(tool==='harvest')return (fishable(w,i)&&t.harvestedAt!==w.season)||(t.garden&&t.cropAge>=2&&!t.flooded)?null:'Fish beside healthy habitat once per tile per season, or harvest a mature garden.';
 if(tool==='farm')return t.type==='meadow'&&t.salt==='fresh'&&!t.flooded&&!t.garden?null:'Gardens need fresh, dry meadow.';
 if(tool==='clear')return t.hyacinth||t.nutria?null:'Select a tile with hyacinth or nutria.';
 if(tool==='fill')return t.type==='water'&&t.kind!=='sea'&&t.y>2&&!(w.freshSources??[]).includes(i)&&!(w.coastalSources??[]).includes(i)?null:'Place sediment in inland water, away from the headwater source.';
 return 'Choose an action tool.';
}
function applyTile(w,tool,i,raised=false){
 const t=w.tiles[i];
 if(tool==='timber'){t.type='meadow';t.treeAge=0;w.funds+=3}
 if(tool==='dig'){t.type='water';t.kind='channel';t.elevation=0;t.mudAge=0;t.sediment=0;t.nutria=false}
 if(tool==='tree'){t.type='forest';t.treeAge=0}
 if(tool==='wetland'){t.type='marsh';t.mudAge=0;t.saltAge=0;t.restoredByPlayer=true}
 if(tool==='levee'){if(t.type!=='levee')t.underlyingType=t.type;t.type='levee';t.defenseRemoved=false;t.leveeHealth=3;t.hyacinth=false;t.nutria=false}
 if(tool==='remove'){if(t.mappedDefense)t.defenseRemoved=true;t.type=t.underlyingType??(t.elevation<1.4?'mud':'meadow');t.mudAge=0;t.leveeHealth=0}
 if(tool==='house'){t.type='developed';t.damaged=false;if(raised)t.elevation=Math.max(t.elevation,2.4)}
 if(tool==='harvest'){const amount=t.garden?2:1;w.catches+=amount;w.funds+=amount*2;t.harvestedAt=w.season;if(t.garden)t.cropAge=0}
 if(tool==='farm'){t.garden=true;t.cropAge=0}
 if(tool==='clear'){t.hyacinth=false;t.nutria=false}
 if(tool==='fill'){t.type='mud';t.mudAge=0;t.kind='land';t.elevation=1.3;t.hyacinth=false;t.sediment=0;t.restoredByPlayer=true}
}
export function action(w,tool,i){
 if(tool==='inspect')return {ok:false,message:'Inspection costs no effort.'};
 let targets=[i],actual=tool,cost=TOOLS[tool]?.cost??0,raised=false;
 if(tool==='ability'){
  if(w.season<w.abilityReady)return {ok:false,message:`Your ability returns in ${w.abilityReady-w.season} season(s).`};
  actual={forester:'tree',ecologist:'wetland',developer:'house',engineer:'levee',fisher:'harvest'}[w.role];cost={forester:2,ecologist:2,developer:4,engineer:2,fisher:0}[w.role];raised=w.role==='developer';
  targets=[i,...neighbors(i)].filter(j=>!eligibility(w,actual,j)).slice(0,w.role==='developer'?1:3);
  if(!targets.includes(i))return {ok:false,message:eligibility(w,actual,i)};
 }else{const reason=eligibility(w,tool,i);if(reason)return {ok:false,message:reason}}
 const effort=TOOLS[tool]?.effort??1;
 if(w.effort<effort)return {ok:false,message:`You need ${effort} effort. Let the clock run to recover 1 effort every ${Math.round(effortRecoveryMs(w)/1000*10)/10} game seconds (capacity ${effortCapacity(w)}).`};
 if(w.funds<cost)return {ok:false,message:`You need ${cost} funds. Fishing, gardens and seasonal support replenish funds.`};
 w.funds-=cost;w.effort-=effort;for(const j of targets)applyTile(w,actual,j,raised);recordGrantWork(w,actual,targets);
 if(tool==='ability')w.abilityReady=w.season+3;
 refreshWater(w,w.waterLevel??0);
 const message=`${tool==='ability'?ROLES[w.role].ability:TOOLS[tool].name}: ${targets.length} tile${targets.length===1?'':'s'} affected.`;
 w.log.unshift({season:w.season,text:message});w.log=w.log.slice(0,12);return {ok:true,message,targets};
}
export function advanceSeason(w,{continuous=false}={}){
 const event=w.forecast;w.season++;if(!continuous)w.effort=effortCapacity(w);let damage=0,grown=0,arrived=false;
 w.waterLevel=event.level;refreshWater(w,event.level);
 // Invasives spread from the previous footprint; new patches never cascade within a single season.
 const additions=new Set(),grazed=new Set();
 for(let i=0;i<w.tiles.length;i++){
  const t=w.tiles[i];
  if(t.hyacinth){if(t.type!=='water'||t.salt!=='fresh')t.hyacinth=false;else for(const j of neighbors(i))if(w.tiles[j].type==='water'&&w.tiles[j].salt==='fresh'&&!w.tiles[j].hyacinth&&random(w)<.4)additions.add(j)}
  if(t.nutria){if(t.type!=='marsh')t.nutria=false;else if(random(w)<.35)grazed.add(i)}
 }
 for(const i of additions)w.tiles[i].hyacinth=true;
 for(const i of grazed){w.tiles[i].type='mud';w.tiles[i].mudAge=0;w.tiles[i].nutria=false}
 if(event.type==='hyacinth'){
  const eligible=w.tiles.map((t,i)=>t.type==='water'&&['river','channel'].includes(t.kind)&&t.salt==='fresh'&&!t.hyacinth?i:-1).filter(i=>i>=0);
  if(eligible.length){w.tiles[eligible[Math.floor(random(w)*eligible.length)]].hyacinth=true;arrived=true;}
 }
 if(event.type==='nutria'){
  const eligible=w.tiles.map((t,i)=>t.type==='marsh'&&!t.nutria?i:-1).filter(i=>i>=0);
  if(eligible.length){w.tiles[eligible[Math.floor(random(w)*eligible.length)]].nutria=true;arrived=true;}
 }
 const before=w.tiles.map(t=>({...t}));
 w.tiles.forEach((t,i)=>{
  if(t.type==='developed'&&t.flooded&&!t.damaged){t.damaged=true;damage++}
  if(t.type==='levee'&&event.level>1.6&&wetNeighbor(w,i)){t.leveeHealth--;if(t.leveeHealth<=0){t.type='mud';t.mudAge=0}}
  if(t.type==='mud'&&!t.nutria){t.mudAge=t.salt==='salty'?0:t.mudAge+1;if(t.mudAge>=3){t.type='marsh';grown++}}
  if(t.type==='water'&&['river','channel'].includes(t.kind)&&t.salt==='fresh'&&t.y>3&&neighbors(i).some(j=>before[j].type==='marsh')){
   t.sediment++;if(t.sediment>=6){t.type='mud';t.kind='land';t.mudAge=0;t.elevation=1.2;t.hyacinth=false}
  }
  if(t.type==='marsh'){
   t.saltAge=t.salt==='salty'?t.saltAge+1:0;if(t.saltAge>=4){t.type='mud';t.mudAge=0;t.saltAge=0}
  }
  if(t.type==='forest'){t.treeAge++;if(t.flooded&&t.treeAge<2&&event.level>1.6&&random(w)<.35){t.type='meadow';t.treeAge=0}}
  if(t.garden){if(t.flooded||t.salt!=='fresh'){t.cropAge=0}else t.cropAge=Math.min(2,t.cropAge+1)}
 });
 if(!damage&&!w.tiles.some(t=>t.type==='developed'&&t.damaged))w.safeSeasons++;
 // Undamaged homes provide modest revenue; the benefit competes with forest/land conversion.
 w.funds+=Math.min(4,w.tiles.filter(t=>t.type==='developed'&&!t.damaged&&!t.originalHome).length);
 const funding=settleFunding(w);
 w.lastEvent=`${event.name}: ${arrived?(event.type==='hyacinth'?'A hyacinth patch arrived. ':'Nutria appeared in the marsh. '):''}${damage?`${damage} home${damage===1?'':'s'} damaged. `:'No new home damage. '}${grown?`${grown} mud tile${grown===1?'':'s'} became marsh. `:''}${additions.size?`${additions.size} new hyacinth patches. `:''}Local funding +${funding.local}.${funding.state?' State allocation +'+funding.state+'.':''}${funding.review?' '+funding.review:''}`;
 w.log.unshift({season:w.season,text:w.lastEvent});w.log=w.log.slice(0,12);w.forecast=rollEvent(w);
 return {damage,grown,spread:additions.size,event:event.type,funding};
}

// Main game factory: terrain is entirely imported. The seed affects events only.
export function createPlaceWorld(place,eventSeed='field-001',role='ecologist'){
 if(place.width!==WIDTH||place.height!==HEIGHT||place.tiles.length!==WIDTH*HEIGHT)throw Error('Unexpected real-place grid dimensions.');
 const w={version:2,seed:String(eventSeed).slice(0,48),layout:place.id,placeId:place.id,geography:{name:place.name,bbox:[...place.bbox],coverYear:place.coverYear,waterVintage:place.waterVintage,defenseRetrieved:place.defenseRetrieved,sampling:place.sampling,cellSizeMeters:place.cellSizeMeters},role:ROLES[role]?role:'ecologist',rng:hashSeed(eventSeed+place.id),season:0,funds:24,effort:4,catches:0,safeSeasons:0,abilityReady:0,tiles:[],log:[],waterLevel:0,lastEvent:'A real landscape. A new game scenario.',forecast:null};
 w.tiles=place.tiles.map((source,i)=>{
  const wetland=[13,14,15,16,17,18,22,23].includes(source.coverCode);
  const elevation=source.type==='water'?0:wetland?1.15:source.type==='developed'?(source.coverCode===4?1.55:2.2):source.type==='sand'?1.1:2.1;
  return {...structuredClone(source),x:i%WIDTH,y:Math.floor(i/WIDTH),kind:source.type==='water'?'channel':'land',elevation,salt:'fresh',flooded:false,damaged:false,leveeHealth:3,sediment:0,mudAge:0,saltAge:0,hyacinth:false,nutria:false,garden:false,cropAge:0,harvestedAt:-99,treeAge:4,originalHome:source.type==='developed'};
 });
 const waters=w.tiles.map((t,i)=>t.type==='water'?i:-1).filter(i=>i>=0);
 if(!waters.length)throw Error('Real-place board has no mapped water.');
 w.effortPolicy=2;w.effort=effortCapacity(w);
 const north=Math.min(...waters.map(i=>Math.floor(i/WIDTH))),south=Math.max(...waters.map(i=>Math.floor(i/WIDTH)));
 w.freshSources=waters.filter(i=>Math.floor(i/WIDTH)<=north+1);
 w.coastalSources=waters.filter(i=>Math.floor(i/WIDTH)>=south-1);
 refreshWater(w,0);w.initial=stats(w);w.forecast=rollEvent(w);
 w.log=[{season:0,text:`${place.name}: terrain from NOAA ${place.coverYear} land cover and Census ${place.waterVintage} water. Elevation, salinity, source boundaries, homes and ecological effects are game abstractions.`}];
 return w;
}
