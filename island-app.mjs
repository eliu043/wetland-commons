import {ecologyState,ECOLOGY_SPECIES,FEEDING_THRESHOLD} from './ecology.mjs';
import {effortCapacity,effortRecoveryMs,migrateEffort} from './effort-budget.mjs';
import {ensureClock,tickSimulation,restoreAction,SEASON_MS} from './simulation-clock.mjs';
import {ensureEconomy,applyGrant,grantAvailable,grantProgress,GRANTS} from './economy.mjs';
import {drawPlan} from './plan-view.mjs';
import {createProjection,projectTile,pickIsometric,tileLift,drawIsometric} from './isometric-view.mjs';
import {WIDTH,HEIGHT,SEASONS,TYPES,ROLES,TOOLS,createPlaceWorld,hashSeed,neighbors,stats,habitat,roleProgress,eligibility,fishable,floodRisk,floodOutlook,action,advanceSeason} from './island-model.mjs';
const $=s=>document.querySelector(s),canvas=$('#board'),ctx=canvas.getContext('2d');
const STORAGE='levee-lab-real-places-v1';
const projection=createProjection(WIDTH,HEIGHT);
let protectionScenario='forecast',protectionPreview=null;
let outlook=null,ecology=null,ecologySpecies='foodweb';
let lastDeltas={},habitatDeltas={},running=false,speed=1,lastTick=performance.now(),undoAfter=null;
let view='isometric',zoom=1,atlas=null,spriteFrames=null;
try{view=localStorage.getItem('levee-lab-map-view')==='plan'?'plan':'isometric'}catch{}
async function loadPixelArt(){
 try{
  const images={base:new Image(),vegetation:new Image()};images.base.src='assets/wetland-pixels/wetland-atlas.png';images.vegetation.src='assets/wetland-pixels/vegetation-atlas.png';
  const [base,plants]=await Promise.all([fetch('assets/wetland-pixels/atlas.json').then(r=>{if(!r.ok)throw Error('Atlas missing');return r.json()}),fetch('assets/wetland-pixels/vegetation.json').then(r=>{if(!r.ok)throw Error('Vegetation atlas missing');return r.json()}),images.base.decode(),images.vegetation.decode()]);
  spriteFrames={...base.frames,...plants.frames};atlas=images;if(world){draw();renderLegend()}if(!$('#setup').hidden)renderSetup()
 }catch{$('#viewNote').textContent='Pixel artwork could not load. Plan view remains available; reload to retry.'}
}

let placeCatalog;
try {
 const response=await fetch('data/playable-places.json');if(!response.ok)throw Error(`HTTP ${response.status}`);
 placeCatalog=await response.json();
} catch(error) {
 $('#setup').innerHTML='<p>The real-place data could not load. Run npm start from levee-lab and reload. Fictional maps are not used as a fallback.</p>';
 throw error;
}
const LAYOUTS=Object.fromEntries(placeCatalog.places.map(place=>[place.id,place]));
const palette={water:'#aac7d1',river:'#b8d4da',mud:'#ae8768',sand:'#e4d7b5',forest:'#5d825c',marsh:'#a4b684',meadow:'#e9edd9',developed:'#7b8275',levee:'#fffdf4',paper:'#f8f5e9',ink:'#425d44'};
let world=null,selectedRole='ecologist',selectedLayout='preserve',worlds={},tool='inspect',layer='land',selected=-1,hover=-1,undoState=null,risk=[],message='Inspect a tile or choose an action. Invalid actions spend nothing.',error=false;
const wildlifeInfo=[['oyster','🦪','Oysters'],['shrimp','🦐','Shrimp'],['alligator','🐊','Alligators'],['bird','🐦','Birds'],['crab','🦀','Crabs'],['raccoon','🦝','Raccoons'],['beetle','🪲','Water beetles'],['dragonfly','🦋','Dragonflies*'],['pollinator','🐝','Pollinators']];
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function islandName(w){return LAYOUTS[w.placeId??w.layout]?.name??'Unknown location'}
function seasonName(w){return `${SEASONS[w.season%4]} · Year ${Math.floor(w.season/4)+1}`}
function save(){try{localStorage.setItem(STORAGE,JSON.stringify(world))}catch{message='Your browser could not save this landscape. Export it before closing the page.';error=true}}
function readSave(){
 try{
  const w=JSON.parse(localStorage.getItem(STORAGE));
  if(!w||w.version!==2||!ROLES[w.role]||!LAYOUTS[w.layout]||w.placeId!==w.layout||!w.geography||!Array.isArray(w.tiles)||w.tiles.length!==WIDTH*HEIGHT||!Array.isArray(w.log)||!w.initial||!w.forecast)return null;
  if(!Number.isInteger(w.season)||w.season<0||!Number.isFinite(w.funds)||w.funds<0||!Number.isFinite(w.effort)||!Number.isInteger(w.effort*2)||w.effort<0||w.effort>effortCapacity(w)||!Number.isFinite(w.rng))return null;
  if(!w.tiles.every((t,i)=>TYPES[t.type]&&t.x===i%WIDTH&&t.y===Math.floor(i/WIDTH)&&Number.isFinite(t.elevation)&&['fresh','brackish','salty'].includes(t.salt)))return null;
  return w;
 }catch{return null}
}
function renderMap(g,w,width,height,mini=false){drawPlan(g,w,width,height,{atlas,frames:spriteFrames,layer:mini?'land':layer,showRisk:false})}
function snapshotImpact(w){return {...stats(w),harvests:w.catches,funds:w.funds,effort:w.effort,habitat:habitat(w),feeding:ecologyState(w).feedingCount,buffered:floodOutlook(w).protectedHomes.length}}
function deltaText(n){return n>0?'+'+n:String(n).replace('-','−')}
function changeBadge(n,cls='metric-change'){return n?`<em class="${cls}${n<0?' negative':''}">${deltaText(n)}</em>`:''}
function recordImpact(before){
 const after=snapshotImpact(world),labels={forest:'Forest',marsh:'Marsh',homes:'Dry developed tiles',damaged:'Damaged tiles',invasives:'Invasives',harvests:'Harvests',funds:'Funds',effort:'Effort',feeding:'Bird feeding areas',buffered:'Marsh-buffered development'};
 lastDeltas={};habitatDeltas={};const changes=[],habitatChanges=[];
 for(const [key,label] of Object.entries(labels)){const delta=after[key]-before[key];lastDeltas[key]=delta;if(delta)changes.push(`${label} ${deltaText(delta)}`)}
 for(const [id,,label]of wildlifeInfo){const delta=after.habitat[id]-before.habitat[id];habitatDeltas[id]=delta;if(delta)habitatChanges.push(`${label.replace('*','')} habitat ${deltaText(delta)}`)}
 $('#impactSummary').textContent='Last change: '+([...changes,...(habitatChanges.length?[`Habitat changed for ${habitatChanges.length} species (see counts above)`]:[])].join(' · ')||'No resource or habitat count changed.');$('#impactSummary').title=[...changes,...habitatChanges].join(' · ');
}
function mountCharter(){const charter=$('.charter-panel');if(window.innerWidth<=700)$('#detailsPanel').insertBefore(charter,$('.tile-panel'));else $('.tool-panel').append(charter)}
function selectionInfo(){
 const i=hover>=0?hover:selected;
 if(i<0)return {i,valid:true,abilityTiles:[]};
 const actual=tool==='ability'?{forester:'tree',ecologist:'wetland',developer:'house',engineer:'levee',fisher:'harvest'}[world.role]:tool;
 const valid=tool==='inspect'||!eligibility(world,actual,i);
 return {i,valid,abilityTiles:tool==='ability'&&valid?[i,...neighbors(i)].filter(j=>!eligibility(world,actual,j)).slice(0,world.role==='developer'?1:3):[]};
}
function draw(){
 if(!world)return;const {i,valid,abilityTiles}=selectionInfo(),shownRisk=layer==='ecology'&&ecologySpecies==='protection'?protectionPreview.risk:risk;
 if(view==='isometric'){
  drawIsometric(ctx,world,projection,{atlas,frames:spriteFrames,layer,risk:shownRisk,showRisk:$('#showRisk').checked,selected:i,valid,abilityTiles,ecology,ecologySpecies});return;
 }
 drawPlan(ctx,world,canvas.width,canvas.height,{atlas,frames:spriteFrames,layer,risk:shownRisk,showRisk:$('#showRisk').checked,selected:i,valid,abilityTiles,ecology,ecologySpecies});
}
function updateView(center=false){
 renderEcology();const iso=view==='isometric';canvas.width=iso?projection.width:1152;canvas.height=iso?projection.height:960;
 canvas.style.imageRendering='pixelated';
 const viewport=$('#mapViewport');viewport.classList.toggle('isometric',iso);
 const maxHeight=Math.max(40,viewport.clientHeight-2),availableWidth=Math.max(40,viewport.clientWidth-2),fit=Math.min(availableWidth/canvas.width,maxHeight/canvas.height);
 canvas.style.width=`${Math.floor(canvas.width*fit*zoom)}px`;canvas.style.marginInline=zoom===1?'auto':'0';
 document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===view)));
 $('#zoomLabel').textContent=zoom===1?'Fit':`${zoom}×`;$('#zoomOut').disabled=zoom===1;$('#zoomIn').disabled=zoom===3;
 $('#viewNote').textContent=iso?'Pixel objects represent habitat and development patches, not surveyed individual trees or buildings. North ↗. Zoom in to explore.':'Plan view · north ↑. The same pixel-art objects, sourced terrain, conditions and actions as the isometric view.';
 canvas.setAttribute('aria-label',`Interactive real-location landscape, ${view} view. Click a tile footprint to act. Arrow keys move along map rows and columns; Enter applies the tool.`);
 if(world){draw();renderLegend()}
 if(center&&world){requestAnimationFrame(()=>{const t=world.tiles[selected>=0?selected:15*WIDTH+18],c=iso?projectTile(projection,t.x,t.y,tileLift(t)):{x:(t.x+.5)*32,y:(t.y+.5)*32},viewport=$('#mapViewport'),scale=canvas.getBoundingClientRect().width/canvas.width;viewport.scrollLeft=c.x*scale-viewport.clientWidth/2;viewport.scrollTop=c.y*scale-viewport.clientHeight/2})}
}
function renderSetup(){
 setRunning(false);
 document.body.classList.remove('playing');$('.title-row').hidden=false;
 $('#roles').innerHTML=Object.entries(ROLES).map(([id,r])=>`<button class="role-card" data-role="${id}" aria-pressed="${id===selectedRole}"><span class="role-emoji">${r.emoji}</span><b>${r.name}</b><p>${r.goal}${id==='forester'?' Harvest mature timber for funds, then replant.':''}</p><small>✦ ${r.ability}</small></button>`).join('');
 document.querySelectorAll('[data-role]').forEach(b=>b.onclick=()=>{selectedRole=b.dataset.role;renderSetup()});
 const seed=$('#seed').value.trim()||'reed-001';worlds=Object.fromEntries(Object.keys(LAYOUTS).map(layout=>[layout,createPlaceWorld(LAYOUTS[layout],seed,selectedRole)]));
 $('#islandChoices').innerHTML=Object.entries(LAYOUTS).map(([id,l])=>`<button class="island-choice" data-layout="${id}" aria-pressed="${selectedLayout===id}"><canvas class="mini-map" id="mini-${id}" width="576" height="480" aria-hidden="true"></canvas><span class="map-caption"><b>${l.name}</b><small>${id===selectedLayout?'SELECTED':'REAL LOCATION'}</small></span><p class="map-description">${l.description}<br><small>NOAA ${l.coverYear} · Census ${l.waterVintage}<br>${l.bbox[1].toFixed(3)}–${l.bbox[3].toFixed(3)}°N / ${Math.abs(l.bbox[2]).toFixed(3)}–${Math.abs(l.bbox[0]).toFixed(3)}°W</small></p></button>`).join('');
 for(const id of Object.keys(LAYOUTS))renderMap($('#mini-'+id).getContext('2d'),worlds[id],576,480,true);
 document.querySelectorAll('[data-layout]').forEach(b=>b.onclick=()=>{selectedLayout=b.dataset.layout;renderSetup()});
 $('#setupSummary').textContent=`${ROLES[selectedRole].name} at ${islandName(worlds[selectedLayout])}. ${ROLES[selectedRole].description}`;
}
function messageStatus(text,isError=false){message=text;error=isError;$('#actionMessage').textContent=text;$('#actionMessage').classList.toggle('error',isError);$('#tileTip').textContent=text;$('#tileTip').classList.toggle('error',isError)}
function refreshRisk(){outlook=floodOutlook(world);risk=outlook.risk;ecology=ecologyState(world);refreshProtectionPreview()}
function refreshProtectionPreview(){protectionPreview=protectionScenario==='forecast'?outlook:floodOutlook(world,protectionScenario==='rain'?1.65:2.6);ecology.protection=protectionPreview}
function apply(i){
 selected=i;if(tool==='inspect'){inspect(i);draw();return}
 const snapshot=structuredClone(world),before=snapshotImpact(world),result=action(world,tool,i);
 if(result.ok){recordImpact(before);undoState=snapshot;undoAfter={effort:world.effort,funds:world.funds};refreshRisk();save();render();messageStatus(result.message)}else{messageStatus(result.message,true);inspect(i);draw()}
}
function inspect(i){
 const t=world.tiles[i],testing=layer==='ecology'&&ecologySpecies==='protection'&&protectionScenario!=='forecast',selectedProtection=testing?protectionPreview:outlook;$('#tileTip').classList.remove('error');$('#tileTip').textContent=`${TYPES[t.type]} · ${t.salt}${t.hyacinth?' · water hyacinth':''}${t.nutria?' · nutria':''}`;
 const details=[t.type==='marsh'?`Marsh patch: ${outlook.patchSizes[i]} connected tiles · ${t.nutria?'grazed':t.saltAge?'modeled stress':'healthy vegetation'}`:null,selectedProtection.protectedTiles.includes(i)?`Marsh-buffered in ${testing?'the selected test':'the next forecast'}: dry with buffering, exposed without it.`:null,...((layer==='ecology'&&ecology)?[`Habitat: ${Object.keys(ecology.masks[i]).filter(k=>ecology.masks[i][k]).map(k=>ECOLOGY_SPECIES[k]).join(', ')||'none of the tracked species'}`,t.type==='marsh'?`Shrimp nursery access: ${ecology.preyCounts[i]} tiles (needs ${FEEDING_THRESHOLD}) · bird feeding ${ecology.feeding[i]?'supported':'not supported'}`:null]:[]),world.geography?`Source: ${t.coverName??'Unknown class'} (C-CAP ${t.coverCode??'?'})`:null,world.geography?`${t.latitude.toFixed(5)}°N, ${Math.abs(t.longitude).toFixed(5)}°W`:null,t.waterName?`Mapped water: ${t.waterName}`:null,t.mappedDefense?'Mapped USACE defense intersects this cell (coarse representation).':null,t.kind==='sea'?'Coastal water':null,t.garden?`Food garden · ${t.cropAge}/2 seasons to harvest`:null,t.type==='levee'?`Levee condition ${t.leveeHealth}/3`:null,t.type==='developed'?(t.damaged?'Flood damaged · repair with the home tool':t.elevation>=2.4?'Home on a raised foundation':'Undamaged home'):null,t.type==='forest'?`Tree age ${t.treeAge} seasons · ${t.treeAge>=3?'ready for selective harvest':'young; not harvestable yet'}`:null,t.type==='mud'?`Mud establishment ${t.mudAge}/3 non-salty seasons`:null,t.sediment&&t.type==='water'?`Silt ${t.sediment}/6 seasons`:null,t.hyacinth?'Hyacinth blocks usable aquatic habitat. Clear it with the invasive tool.':null,t.nutria?'Nutria may graze this marsh. Clear before advancing.':null,t.saltAge?`Salt stress ${t.saltAge}/4 seasons`:null,(testing?protectionPreview.risk:risk).includes(i)?`Amber: exposed in ${testing?'the selected water test':'the next forecast'}.`:null].filter(Boolean);
 const creatures=[];if(t.type==='water'&&t.salt==='brackish'&&!t.hyacinth)creatures.push('🦪');if(fishable(world,i))creatures.push('🦐');if(t.type==='marsh'&&t.salt!=='salty')creatures.push('🐊');if(['forest','marsh'].includes(t.type)&&!t.nutria)creatures.push('🐦');
 $('#inspector').innerHTML=`<b>${TYPES[t.type]} / ${t.x+1}, ${t.y+1}</b><br>${t.salt[0].toUpperCase()+t.salt.slice(1)} · elevation ${t.elevation.toFixed(1)} game units${details.length?'<br>'+details.map(escape).join('<br>'):''}<div class="tile-species">${creatures.join(' ')}</div>`;
}
function chooseTool(name){tool=name;renderTools();draw();messageStatus(name==='inspect'?'Inspection is free. Click a tile to read its conditions.':name==='ability'?ROLES[world.role].description:name==='timber'?'Harvest a mature tree for 0.5 effort and gain 3 funds. Forest and wildlife habitat will decrease.':`${TOOLS[name].name}: ${TOOLS[name].effort} effort${TOOLS[name].cost?`, ${TOOLS[name].cost} funds`:''}. Choose an eligible tile.`)}
function renderTools(){
 $('#tools').innerHTML=Object.entries(TOOLS).filter(([id])=>id!=='ability').map(([id,t])=>`<button class="tool" data-tool="${id}" aria-pressed="${tool===id}"><span class="tool-icon">${t.emoji}</span><span><b>${t.name}</b><small>${id==='inspect'?'Free':id==='timber'?'0.5 effort / +3 funds':`${t.effort} effort${t.cost?' / '+t.cost+' funds':''}`}</small></span></button>`).join('');
 document.querySelectorAll('[data-tool]').forEach(b=>b.onclick=()=>chooseTool(b.dataset.tool));
 $('#abilityButton').setAttribute('aria-pressed',String(tool==='ability'));
}
function render(){
 if(!world)return;document.body.classList.add('playing');mountCharter();const r=ROLES[world.role],s=stats(world),progress=roleProgress(world),ready=world.season>=world.abilityReady;
 $('#setup').hidden=true;$('#play').hidden=false;$('.title-row').hidden=true;
 $('#roleSummary').innerHTML=`<span class="role-emoji">${r.emoji}</span><span><b>${r.name}</b><small>ONE ROLE / ONE PLACE</small></span>`;
 $('#effort').textContent=`${world.effort} / ${effortCapacity(world)}`;$('#funds').textContent=world.funds;$('#season').textContent=seasonName(world);
 $('#islandLabel').textContent=`NOAA ${world.geography.coverYear} / CENSUS ${world.geography.waterVintage} · EVENT SEED ${world.seed}`;$('#islandName').textContent=islandName(world);$('#placeCoordinates').textContent=`${world.geography.bbox[1].toFixed(3)}–${world.geography.bbox[3].toFixed(3)}°N · ${Math.abs(world.geography.bbox[2]).toFixed(3)}–${Math.abs(world.geography.bbox[0]).toFixed(3)}°W · ~${world.geography.cellSizeMeters[0]} m tiles`;
 $('#forecastName').textContent=world.forecast.name;$('#forecastText').textContent=world.forecast.text;
 const threatened=risk.filter(i=>world.tiles[i].type==='developed'&&!world.tiles[i].damaged).length;
 $('#locateInvasive').disabled=s.invasives===0;
 $('#forecastStakes').innerHTML=`${threatened} developed game tile${threatened===1?'':'s'} exposed · ${s.invasives} invasive patch${s.invasives===1?'':'es'} present<br><button id=showMarshBenefit class=marsh-benefit>🌾 Marsh buffers ${outlook.protectedHomes.length} developed tiles · View</button>`;$('#showMarshBenefit').onclick=()=>chooseEcology('protection');
 renderClock();renderFunding();
 $('#charterTitle').textContent=r.name;$('#charterGoal').textContent=r.goal;
 $('#goalBar').style.width=Math.min(100,Math.max(0,progress/r.target*100))+'%';$('#goalCount').textContent=progress>=r.target?`✓ Charter met · ${progress} / ${r.target}. Keep tending this landscape.`:`${Math.max(0,progress)} / ${r.target}${progress<0?' · losses must be recovered first':''}`;
 $('#abilityButton').textContent=`✦ ${r.ability}${ready?'':` · ${world.abilityReady-world.season} season cooldown`}`;$('#abilityButton').disabled=!ready;
 $('#abilityHelp').textContent=r.description+' Available every three seasons.';
 $('#undo').disabled=!undoState;
 $('#lastEvent').textContent=world.lastEvent;
 $('#stats').innerHTML=[['forest','Forest',s.forest,'🌳',`${s.forest-world.initial.forest>=0?'+':''}${s.forest-world.initial.forest} since arrival`],['marsh','Marsh',s.marsh,'🌾',`${s.restoredMarsh} restored`],['homes','Dry developed',s.homes,'🏠',`${s.damaged} need repair`],['invasives','Invasives',s.invasives,'🪻','Clear to protect habitat'],['harvests','Harvests',world.catches,'🧺','Catches + gardens']].map(([key,label,n,emoji,note])=>`<div class="stat"><div class="stat-top"><span>${label}</span><span>${emoji}</span></div><strong>${n}</strong>${changeBadge(lastDeltas[key])}<small>${note}</small></div>`).join('');
 const h=habitat(world);$('#wildlife').innerHTML=wildlifeInfo.map(([id,emoji,label])=>`<div class="wildlife-item" title="${label}: ${h[id]} suitable habitat tiles${habitatDeltas[id]?', changed by '+deltaText(habitatDeltas[id]):''}"><span class="animal">${emoji}</span><span><b>${h[id]}${changeBadge(habitatDeltas[id],'habitat-change')}</b><small>${label.replace('*','')}</small></span></div>`).join('');
 $('#journal').innerHTML=world.log.slice(0,5).map(entry=>`<div class="journal-note"><b>${SEASONS[entry.season%4].toUpperCase()} / YEAR ${Math.floor(entry.season/4)+1}</b><br>${escape(entry.text)}</div>`).join('');
 renderEcology();renderLegend();
 renderTools();updateView();if(selected>=0)inspect(selected);messageStatus(message,error);
}
function setRunning(value){running=Boolean(value&&world&&!$('#play').hidden);lastTick=performance.now();if(world)renderClock();if(!running&&world)save()}
function openDialog(id){setRunning(false);$(id).showModal()}
function renderClock(){
 if(!world)return;const clock=ensureClock(world),capacity=effortCapacity(world),recoveryMs=effortRecoveryMs(world);
 $('#effort').textContent=`${world.effort} / ${capacity}`;$('#effortBar').style.width=`${world.effort/capacity*100}%`;
 $('#effortMeter').setAttribute('aria-valuemax',String(capacity));$('#effortMeter').setAttribute('aria-valuenow',String(world.effort));
 $('#effortRecovery').textContent=world.effort>=capacity?'Full reserve':running?`+1 in ${Math.ceil((recoveryMs-clock.recoveryMs)/1000/speed)}s`:`Paused · +1 / ${Math.round(recoveryMs/1000*10)/10}s`;
 $('#effortRate').textContent=`+1 / ${Math.round(recoveryMs/1000*10)/10}s`;
 const left=Math.ceil((SEASON_MS-clock.seasonMs)/1000/speed);
 $('#playPause').textContent=running?'Ⅱ Pause':'▶ Play';$('#playPause').setAttribute('aria-pressed',String(running));
 $('#clockLabel').textContent=`${running?'Next season':'Paused'} · ${left}s${speed>1?' at '+speed+'×':''}`;
 $('#seasonProgress').style.width=`${clock.seasonMs/SEASON_MS*100}%`;
 document.querySelectorAll('[data-speed]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.speed)===speed)));
 $('#fundingSummary').textContent=`Local +3 next season · State +12 in ${4-world.season%4} season${4-world.season%4===1?'':'s'}`;
}
function renderFunding(){
 if(!world)return;const e=ensureEconomy(world),g=e.activeGrant;
 $('#fundingButton').textContent=g?`Grant: ${grantProgress(world)}/3 ready · review in ${Math.max(0,g.deadline-world.season)} seasons`:grantAvailable(world)?'✦ Funding & grants · available':'Funding & grants';
 $('#fundingSchedule').textContent=`Local funding: +3 every season. State allocation: +12 every spring (in ${4-world.season%4} season${4-world.season%4===1?'':'s'}). One grant application per year. Time is paused here.`;
 $('#grantStatus').textContent=g?`${GRANTS[g.key].name}: ${g.tiles.length} project tiles tracked; ${grantProgress(world)}/3 currently qualify. Review in ${Math.max(0,g.deadline-world.season)} season${g.deadline-world.season===1?'':'s'}. Keep qualifying tiles intact for the completion payment.`:grantAvailable(world)?'A grant application is available. Choose a commitment below; 6 advance funds arrive immediately.':'This year’s application has been used. The next opportunity opens in spring.';
 $('#grantChoices').innerHTML=Object.entries(GRANTS).map(([key,grant])=>`<button class="grant-choice" data-grant="${key}" ${grantAvailable(world)?'':'disabled'}><b>${grant.name}</b><span>${grant.description}</span><small>6 funds now · 8 on completion · review after 4 seasons</small></button>`).join('');
 document.querySelectorAll('[data-grant]').forEach(b=>b.onclick=()=>{const before=snapshotImpact(world),result=applyGrant(world,b.dataset.grant);if(result.ok){recordImpact(before);undoState=null;undoAfter=null;save();render();renderFunding()}messageStatus(result.message,!result.ok)});
}
$('#playPause').onclick=()=>setRunning(!running);
document.querySelectorAll('[data-speed]').forEach(b=>b.onclick=()=>{speed=Number(b.dataset.speed);lastTick=performance.now();renderClock()});
$('#fundingButton').onclick=()=>{openDialog('#fundingDialog');renderFunding()};$('#closeFunding').onclick=()=>$('#fundingDialog').close();
document.addEventListener('visibilitychange',()=>{if(document.hidden)setRunning(false)});
window.addEventListener('pagehide',()=>setRunning(false));
setInterval(()=>{
 const now=performance.now(),elapsed=Math.min(1000,Math.max(0,now-lastTick));lastTick=now;
 if(!running||!world||document.hidden||$('#play').hidden||document.querySelector('dialog[open]'))return;
 const before=ensureClock(world).seasonMs+elapsed*speed>=SEASON_MS?snapshotImpact(world):null,result=tickSimulation(world,elapsed,speed);
 if(result.seasons.length){recordImpact(before);undoState=null;undoAfter=null;hover=-1;refreshRisk();save();render();messageStatus(`${world.lastEvent.split(':')[0]} · ${result.seasons[0].damage} newly damaged tiles · public funding +${Object.values(result.seasons[0].funding).filter(v=>typeof v==='number').reduce((a,b)=>a+b,0)}.${result.seasons[0].funding.review?' Grant review recorded in Journal.':''}`)}
 else if(result.recovered){$('#effort').textContent=`${world.effort} / ${effortCapacity(world)}`;save()}
 renderClock();
},250);
function renderEcology(){
 const active=layer==='ecology';$('#ecologyControls').hidden=!active;$('.board-panel').classList.toggle('ecology-active',active);
 if(!world||!ecology)return;
 if(!$('#ecologySpecies').options.length)$('#ecologySpecies').innerHTML=Object.entries(ECOLOGY_SPECIES).map(([id,label])=>`<option value="${id}">${label}</option>`).join('');
 $('#ecologySpecies').value=ecologySpecies;$('#protectionEvent').hidden=ecologySpecies!=='protection';$('#protectionEvent').value=protectionScenario;
 const count=ecologySpecies==='feeding'?ecology.feedingCount:ecology.masks.filter(m=>m[ecologySpecies]).length;
 $('#ecologySummary').innerHTML=ecologySpecies==='protection'?`<span class=prey-key>● Marsh</span> → <span class=buffer-key>● ${protectionPreview.protectedTiles.length} buffered (${protectionPreview.protectedHomes.length} developed)</span>`:ecologySpecies==='foodweb'?`<span class=prey-key>● ${ecology.shrimpCount} nursery tiles</span> → <span class=predator-key>● ${ecology.feedingCount} feeding areas</span>`:`<span class=prey-key>● ${count} suitable tiles</span>`;
 $('#foodWebCount').textContent=`${ecology.feedingCount} feeding areas`;
 $('#findFeeding').textContent=ecologySpecies==='protection'?'Find buffered tile':'Find feeding area';$('#findFeeding').disabled=ecologySpecies==='protection'?protectionPreview.protectedTiles.length===0:ecology.feedingCount===0;
}
function chooseEcology(species='foodweb'){
 layer='ecology';ecologySpecies=species;document.querySelectorAll('[data-layer]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.layer===layer)));render();
}
$('#protectionEvent').onchange=e=>{protectionScenario=e.target.value;refreshProtectionPreview();renderEcology();draw();if(selected>=0)inspect(selected)};
$('#ecologySpecies').onchange=e=>{ecologySpecies=e.target.value;renderEcology();draw();if(selected>=0)inspect(selected)};
$('#openEcology').onclick=()=>chooseEcology();
$('#ecologyHelp').onclick=()=>openDialog('#ecologyDialog');$('#closeEcology').onclick=()=>$('#ecologyDialog').close();
$('#findFeeding').onclick=()=>{const cells=ecologySpecies==='protection'?protectionPreview.protectedTiles:ecology.feeding.map((v,i)=>v?i:-1).filter(i=>i>=0);if(!cells.length)return;selected=cells.find(i=>i>selected)??cells[0];hover=-1;tool='inspect';renderTools();updateView(true);inspect(selected)};
function renderLegend(){
 const node=$('#legend');
 if(layer==='ecology'&&ecologySpecies==='protection'){node.innerHTML='<span>Teal: marsh vegetation</span><span>Blue P: buffered in the selected forecast or test by marsh</span><span>Compared with the same terrain and event with marsh attenuation turned off. Not a real flood prediction.</span>';return}
 if(layer==='ecology'){node.innerHTML='<span>Teal: selected suitable habitat / shrimp nursery</span><span>Gold B: supported wading-bird feeding area</span><span>Game threshold: 3 nursery tiles within 2 connected water steps. Counts are habitat, not animals.</span>';return}
 if(layer==='salt'){node.innerHTML='<span>○ Fresh</span><span>◐ Brackish</span><span>● Salty</span><span>Salinity markers appear on water tiles.</span>';return}
 const items=[['cypress','Forest'],['reeds','Marsh'],['home','Development'],['levee','Levee'],['hyacinth','Hyacinth'],['nutria','Nutria']];
 node.innerHTML='<span><i class="legend-icon"></i> Water</span>'+items.map(([key,label])=>`<span><canvas width="32" height="32" data-sprite-key="${key}" aria-hidden="true"></canvas>${label}</span>`).join('')+'<span>Brown dots = silt</span><span>F / C = assumed source boundaries</span><span>Egrets illustrate suitable habitat</span>';
 if(atlas&&spriteFrames)for(const c of node.querySelectorAll('canvas')){const f=spriteFrames[c.dataset.spriteKey],g=c.getContext('2d'),scale=Math.min(30/f.w,30/f.h),w=Math.round(f.w*scale),h=Math.round(f.h*scale);g.imageSmoothingEnabled=false;g.drawImage(atlas[f.sheet??'base'],f.x,f.y,f.w,f.h,Math.round((32-w)/2),32-h,w,h)}
}
function canvasIndex(e){const rect=canvas.getBoundingClientRect(),px=(e.clientX-rect.left)/rect.width*canvas.width,py=(e.clientY-rect.top)/rect.height*canvas.height;
 if(view==='isometric')return pickIsometric(projection,world.tiles,px,py);
 const x=Math.floor(px/canvas.width*WIDTH),y=Math.floor(py/canvas.height*HEIGHT);return x>=0&&x<WIDTH&&y>=0&&y<HEIGHT?y*WIDTH+x:-1;
}
canvas.onmousemove=e=>{const i=canvasIndex(e);if(i!==hover){hover=i;if(i>=0)inspect(i);draw()}};canvas.onmouseleave=()=>{hover=-1;if(selected>=0)inspect(selected);draw()};canvas.onclick=e=>{const i=canvasIndex(e);if(i>=0)apply(i)};
canvas.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter',' '].includes(e.key))return;e.preventDefault();if(selected<0)selected=15*WIDTH+18;const x=selected%WIDTH,y=Math.floor(selected/WIDTH);if(e.key==='ArrowLeft'&&x>0)selected--;if(e.key==='ArrowRight'&&x<WIDTH-1)selected++;if(e.key==='ArrowUp'&&y>0)selected-=WIDTH;if(e.key==='ArrowDown'&&y<HEIGHT-1)selected+=WIDTH;if(e.key==='Enter'||e.key===' '){apply(selected);hover=-1;draw();return}hover=-1;inspect(selected);draw()};
$('#locateInvasive').onclick=()=>{const patches=world.tiles.map((t,i)=>t.hyacinth||t.nutria?i:-1).filter(i=>i>=0);if(!patches.length)return;selected=patches.find(i=>i>selected)??patches[0];hover=-1;chooseTool('clear');inspect(selected);draw();canvas.focus({preventScroll:true});updateView(true);messageStatus('Invasive patch selected. Click the outlined tile or press Enter to clear it for 1 effort and 1 fund.');};
$('#abilityButton').onclick=()=>chooseTool('ability');
$('#undo').onclick=()=>{
 if(!undoState)return;const before=snapshotImpact(world);
 world=restoreAction(undoState,undoAfter,world);recordImpact(before);undoState=null;undoAfter=null;refreshRisk();save();render();messageStatus('Last action undone. Elapsed time and effort recovery are preserved.');
};
$('#showRisk').onchange=draw;
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{view=b.dataset.view;hover=-1;try{localStorage.setItem('levee-lab-map-view',view)}catch{}updateView(true)});
$('#zoomIn').onclick=()=>{zoom=Math.min(3,zoom+1);updateView(true)};
$('#zoomOut').onclick=()=>{zoom=Math.max(1,zoom-1);updateView(true)};
$('#fitMap').onclick=()=>{zoom=1;updateView()};
window.addEventListener('resize',()=>{if(world){mountCharter();updateView()}});

document.querySelectorAll('[data-layer]').forEach(b=>b.onclick=()=>{layer=b.dataset.layer;document.querySelectorAll('[data-layer]').forEach(t=>t.setAttribute('aria-pressed',String(t===b)));render()});
$('#seed').onchange=renderSetup;$('#reroll').onclick=()=>{$('#seed').value='events-'+Math.floor(Math.random()*999999).toString(36);renderSetup()};
$('#start').onclick=()=>{setRunning(false);lastDeltas={};habitatDeltas={};$('#impactSummary').textContent='Make a small change. Its impacts appear here.';const seed=$('#seed').value.trim()||'reed-001';world=createPlaceWorld(LAYOUTS[selectedLayout],seed,selectedRole);tool='inspect';selected=-1;hover=-1;undoState=null;ensureClock(world);ensureEconomy(world);refreshRisk();save();render();setRunning(true);messageStatus('The clock is running. Pause to plan, or choose a tool and make a small change.');$('#play').scrollIntoView({block:'start',behavior:'instant'})};
$('#newIsland').onclick=()=>openDialog('#replaceDialog');$('#keepPlaying').onclick=()=>$('#replaceDialog').close();$('#chooseNew').onclick=()=>{$('#replaceDialog').close();$('#play').hidden=true;$('#setup').hidden=false;renderSetup();if(!$('#resume')){const b=document.createElement('button');b.id='resume';b.textContent='Return to current landscape';b.onclick=()=>{render();$('#play').scrollIntoView({block:'start',behavior:'instant'})};$('.start-row').append(b)}$('#setup').scrollIntoView({block:'start',behavior:'instant'})};
$('#openJournal').onclick=()=>openDialog('#journalDialog');$('#closeJournal').onclick=()=>$('#journalDialog').close();
$('#openMapKey').onclick=()=>openDialog('#mapKeyDialog');$('#closeMapKey').onclick=()=>$('#mapKeyDialog').close();
$('#openDetails').onclick=()=>{const open=$('#detailsPanel').classList.toggle('open');$('#openDetails').setAttribute('aria-expanded',String(open))};
$('#rulesButton').onclick=()=>openDialog('#rules');$('#closeRules').onclick=()=>$('#rules').close();
$('#export').onclick=()=>{const data={...world,notes:'Real-place terrain from NOAA/Census/NLD; simplified, uncalibrated game ecology and hypothetical interventions. Not an environmental prediction.'},url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='wetland-commons-island.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
world=readSave();if(world){migrateEffort(world);ensureClock(world);ensureEconomy(world);refreshRisk();render();messageStatus('Welcome back. Your game is paused; press Play when ready. No offline time has elapsed.')}else renderSetup();
updateView();loadPixelArt();
