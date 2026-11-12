import {createRegion,metrics,applyProject,stepRegion,previewProject,hydrology,suitable,SPECIES,END_YEAR,REVIEWS} from './regional-model.mjs';
import {paintIcon} from './icons.mjs';
const $=s=>document.querySelector(s),canvas=$('#map'),ctx=canvas.getContext('2d');
const colors={water:'#42757b',land:'#496747',marsh:'#8caa76',mud:'#bea077',fresh:'#92c7b2',brackish:'#557d8b',salty:'#576fa7'},speciesColors=['#e9b786','#aacfe6','#c6df8e'];
const signed=n=>`${n>0?'+':''}${n}`;
let data,water,infra,world,baseline,history,baseHistory,selected=null,preview=null,timer=null,view='basin',layer='geography',filter='all',inspected=-1;
let mapCache=new Map(),previewCache=new Map();
const overview=[-90.48,29.35,-89.80,30.06];
const nextReview=()=>REVIEWS.find(y=>y>world.year)??END_YEAR;
function projection(){
 const bounds=view==='basin'?overview:data.bbox,c=Math.cos(29.8*Math.PI/180),sx=(bounds[2]-bounds[0])*c,sy=bounds[3]-bounds[1];
 const scale=Math.min((canvas.width-80)/sx,(canvas.height-80)/sy),left=(canvas.width-sx*scale)/2,top=(canvas.height-sy*scale)/2;
 return {bounds,scale,left,top,c,point:p=>[left+(p[0]-bounds[0])*c*scale,top+(bounds[3]-p[1])*scale],inverse:p=>[bounds[0]+(p[0]-left)/scale/c,bounds[3]-(p[1]-top)/scale]};
}
const intersects=(a,b)=>a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];
function geoPath(feature,pr){
 const path=new Path2D(),g=feature.geometry;
 const parts=g.type==='Polygon'?g.coordinates:g.type==='MultiLineString'?g.coordinates:[];
 for(const ring of parts){ring.forEach((p,i)=>{const[x,y]=pr.point(p);if(i)path.lineTo(x,y);else path.moveTo(x,y)});if(g.type==='Polygon')path.closePath()}
 return path;
}
function baseMap(){
 const key=`${view}:${$('#showLevees').checked}:${$('#showControls').checked}`;
 if(mapCache.has(key))return mapCache.get(key);
 const off=document.createElement('canvas');off.width=canvas.width;off.height=canvas.height;const g=off.getContext('2d'),pr=projection();
 g.fillStyle='#1b3b34';g.fillRect(0,0,off.width,off.height);
 g.save();g.beginPath();g.rect(pr.left,pr.top,(pr.bounds[2]-pr.bounds[0])*pr.c*pr.scale,(pr.bounds[3]-pr.bounds[1])*pr.scale);g.clip();
 // Every source polygon remains georeferenced. Non-water is explicitly unclassified land.
 g.fillStyle=colors.land;g.fillRect(pr.left,pr.top,(pr.bounds[2]-pr.bounds[0])*pr.c*pr.scale,(pr.bounds[3]-pr.bounds[1])*pr.scale);
 g.fillStyle=colors.water;g.strokeStyle='#76a4a440';g.lineWidth=.6;
 for(const f of water.features){if(f.bbox&&!intersects(f.bbox,pr.bounds))continue;const p=geoPath(f,pr);g.fill(p,'evenodd');g.stroke(p)}
 if($('#showLevees').checked){g.strokeStyle='#f2c777c9';g.lineWidth=view==='basin'?1.6:2.3;for(const f of infra.features)if([11,12].includes(f.properties.layer))g.stroke(geoPath(f,pr))}
 if($('#showControls').checked){for(const f of infra.features)if(f.geometry.type==='Point'){const[x,y]=pr.point(f.geometry.coordinates);g.fillStyle=f.properties.layer===4?'#f1d99f':'#d6e6c0';g.fillRect(x-2,y-2,4,4)}}
 g.save();g.font='12px -apple-system,sans-serif';g.fillStyle='#cee0c0';g.textAlign='left';
 for(const [name,p]of [['New Orleans',[-90.075,29.975]],['Lake Cataouatche',[-90.25,29.845]],['Lake Salvador',[-90.27,29.77]],['Jean Lafitte',[-90.126,29.736]],['Barataria Bay',[-89.98,29.43]]]){
  if(p[0]<pr.bounds[0]||p[0]>pr.bounds[2]||p[1]<pr.bounds[1]||p[1]>pr.bounds[3])continue;
  const[x,y]=pr.point(p);g.fillStyle='#102d24bb';g.fillRect(x-4,y-14,g.measureText(name).width+8,19);g.fillStyle='#d9e5c9';g.fillText(name,x,y);
 }
 g.restore();g.restore();
 // Coordinate graticule and a distance bar make scale legible without remote tiles.
 g.strokeStyle='#d9e8bd15';g.lineWidth=1;g.font='11px sans-serif';g.fillStyle='#afc2a6';
 const interval=view==='basin'?.1:.05;
 for(let lon=Math.ceil(pr.bounds[0]/interval)*interval;lon<=pr.bounds[2];lon+=interval){const[x]=pr.point([lon,0]);g.beginPath();g.moveTo(x,pr.top);g.lineTo(x,canvas.height-pr.top);g.stroke();g.fillText(`${Math.abs(lon).toFixed(2)}°W`,x+3,canvas.height-15)}
 for(let lat=Math.ceil(pr.bounds[1]/interval)*interval;lat<=pr.bounds[3];lat+=interval){const[,y]=pr.point([0,lat]);g.beginPath();g.moveTo(pr.left,y);g.lineTo(canvas.width-pr.left,y);g.stroke();g.fillText(`${lat.toFixed(2)}°N`,pr.left+4,y-4)}
 const km=view==='basin'?10:3,bar=km/111.2*pr.scale;g.strokeStyle='#d8e8be';g.lineWidth=3;g.beginPath();g.moveTo(canvas.width-45-bar,canvas.height-55);g.lineTo(canvas.width-45,canvas.height-55);g.stroke();g.fillText(`${km} km approximate`,canvas.width-45-bar,canvas.height-65);
 mapCache.set(key,off);return off;
}
function cellPoint(i){return [data.bbox[0]+(i%data.width+.5)/data.width*(data.bbox[2]-data.bbox[0]),data.bbox[3]-(Math.floor(i/data.width)+.5)/data.height*(data.bbox[3]-data.bbox[1])]}
function draw(){
 const pr=projection();ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(baseMap(),0,0);
 if(view==='basin'){
  const[a,b]=pr.point([data.bbox[0],data.bbox[3]]),[c,d]=pr.point([data.bbox[2],data.bbox[1]]);
  ctx.strokeStyle='#dbe99c';ctx.lineWidth=2;ctx.setLineDash([8,5]);ctx.strokeRect(a,b,c-a,d-b);ctx.setLineDash([]);
  ctx.font='13px sans-serif';ctx.fillStyle='#e5edbd';ctx.fillText('RESTORATION SCENARIO AREA',a,b-10);
 }else{
  const cellW=(data.bbox[2]-data.bbox[0])*pr.c*pr.scale/data.width,cellH=(data.bbox[3]-data.bbox[1])*pr.scale/data.height;
  const changed=new Set(preview?.changed);
  world.tiles.forEach((t,i)=>{
   const[x,y]=pr.point(cellPoint(i));let fill=null;
   if(layer==='salinity')fill=colors[t.salt];
   else if(layer==='changes'&&t.type!==baseline.tiles[i].type)fill=colors[t.type];
   else if(layer==='geography'&&t.originalWater&&t.type!=='water')fill=colors[t.type];
   if(fill){ctx.globalAlpha=layer==='salinity'?.78:.9;ctx.fillStyle=fill;ctx.fillRect(x-cellW/2,y-cellH/2,cellW+.2,cellH+.2);ctx.globalAlpha=1}
   if(changed.has(i)){ctx.fillStyle='#f2e8a044';ctx.fillRect(x-cellW/2,y-cellH/2,cellW,cellH)}
   if(layer!=='geography'&&t.type==='marsh'&&t.saltAge){ctx.fillStyle='#efd28a';ctx.fillRect(x-cellW/2,y-cellH/2,cellW*t.saltAge/5,2)}
   if(t.type==='mud'){ctx.fillStyle='#e9edb0';ctx.fillRect(x-cellW/2,y+cellH/2-2,cellW*t.mudAge/3,2)}
  });
  if(layer==='changes'){
   const patches=new Set();world.tiles.forEach((t,i)=>t.occupied.forEach((occupied,k)=>{
    if(!occupied)return;const key=`${Math.floor(i%data.width/12)}:${Math.floor(i/data.width/12)}:${k}`;if(patches.has(key))return;patches.add(key);
    const[x,y]=pr.point(cellPoint(i));paintIcon(ctx,SPECIES[k],x-12,y-12,24,speciesColors[k],!suitable(world,i,k));
   }));
  }
  for(const site of data.sites){
   const active=world.completed.includes(site.id);if(site.kind==='gap'&&!active){
    ctx.strokeStyle='#94dfc594';ctx.lineWidth=1.5;ctx.setLineDash([3,2]);
    for(const[a,b]of site.edges){const p=pr.point(cellPoint(a)),q=pr.point(cellPoint(b)),mx=(p[0]+q[0])/2,my=(p[1]+q[1])/2;ctx.beginPath();if(a%data.width!==b%data.width){ctx.moveTo(mx,my-cellH/2);ctx.lineTo(mx,my+cellH/2)}else{ctx.moveTo(mx-cellW/2,my);ctx.lineTo(mx+cellW/2,my)}ctx.stroke()}ctx.setLineDash([]);
   }
   if(selected===site.id){ctx.strokeStyle=site.kind==='fill'?'#efc58a':'#b0f0d5';ctx.lineWidth=2;ctx.setLineDash([3,3]);for(const i of site.cells){const[x,y]=pr.point(cellPoint(i));ctx.strokeRect(x-cellW/2,y-cellH/2,cellW,cellH)}ctx.setLineDash([])}
  }
  // Source markers are explicitly scenario boundaries, never new river breaches.
  for(const [sources,color]of [[world.freshSources,'#b6f0d2'],[world.saltSources,'#b2c2fa']]){ctx.fillStyle=color;for(const i of sources){const[x,y]=pr.point(cellPoint(i));ctx.fillRect(x-2,y-2,4,4)}}
  ctx.font='12px sans-serif';ctx.fillStyle='#dbe7c4';ctx.fillText('Boundary dots: assumed freshwater (green) / coastal influence (blue)',pr.left+10,pr.top+18);
 }
 for(const site of data.sites){const[x,y]=pr.point(site.point),done=world.completed.includes(site.id);ctx.fillStyle=done?'#70836b':site.kind==='gap'?'#a6ddc6':'#e0b47b';ctx.strokeStyle=selected===site.id?'#fff7bf':'#143227';ctx.lineWidth=selected===site.id?4:2;ctx.beginPath();ctx.arc(x,y,17,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#18382b';ctx.font='bold 16px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(done?'✓':site.id,x,y);ctx.textAlign='left';ctx.textBaseline='alphabetic'}
 $('#mapLegend').innerHTML=view==='focus'&&layer==='salinity'?'<span><i style="background:#92c7b2"></i> Scenario fresh</span><span><i style="background:#557d8b"></i> Scenario brackish</span><span><i style="background:#576fa7"></i> Scenario salty</span><span>Gold wash: preview category change</span>':view==='focus'&&layer==='changes'?'<span><i style="background:#8caa76"></i> Marsh difference</span><span><i style="background:#bea077"></i> Mud difference</span><span><i class="water"></i> Water difference</span><span>🦪 🦐 🐊 Sampled scenario habitat</span>':'<span><i class="water"></i> Mapped water</span><span><i class="land"></i> Unclassified land</span><span><i class="line"></i> USACE defense</span><span><i class="gap"></i> Scenario bank gap</span><span><i class="fill"></i> Scenario canal fill</span>';
 $('#extentLabel').textContent=view==='basin'?'BARATARIA / BASIN OVERVIEW':'JEAN LAFITTE & SURROUNDING WATERWAYS';
 $('#viewTitle').textContent=view==='basin'?'A landscape engineered for water.':layer==='geography'?'Mapped water. Hypothetical interventions.':layer==='salinity'?'Scenario salinity—not observations.':'Changes caused by your plan.';
}
function stop(){clearInterval(timer);timer=null;if(world)$('#play').textContent=`▶ To year ${nextReview()}`}
function reset(){stop();world=createRegion(data,{coastalInfluence:+$('#coastal').value,erosion:$('#erosion').checked});baseline=structuredClone(world);history=[metrics(world)];baseHistory=[metrics(baseline)];selected=null;preview=null;inspected=-1;previewCache.clear();render()}
function select(id){stop();selected=id;inspected=-1;view='focus';if(!previewCache.has(id))previewCache.set(id,previewProject(world,id));preview=previewCache.get(id);render()}
function next(){if(world.year>=END_YEAR)return;world=stepRegion(world);baseline=stepRegion(baseline);history.push(metrics(world));baseHistory.push(metrics(baseline));previewCache.clear();preview=selected?previewProject(world,selected):null;if(REVIEWS.includes(world.year))stop();render()}
function commit(){if(!selected||!preview||!applyProject(world,selected))return;previewCache.clear();preview=null;history[world.year]=metrics(world);render()}
function renderSites(){
 $('#budget').textContent=`${world.budget} / 8 credits`;
 $('#siteList').innerHTML=data.sites.filter(s=>filter==='all'||s.kind===filter).map(s=>{
  const done=world.completed.includes(s.id);return `<button class="site-button ${selected===s.id?'selected':''}" data-site="${s.id}" aria-pressed="${selected===s.id}"><span class="site-letter">${done?'✓':s.id}</span><span>${s.name}<small>${s.kind==='gap'?'Gap an assumed bank':'Backfill canal segment'}</small></span><em>${done?'Done':s.cost+' cr'}</em></button>`
 }).join('');document.querySelectorAll('[data-site]').forEach(b=>b.onclick=()=>select(b.dataset.site));
}
function renderDetail(){
 const panel=$('#projectDetail');if(!selected){panel.innerHTML='<p class="eyebrow">CHOOSE A SITE</p><h2>Different actions.<br>Different futures.</h2><p>Select a marker or site to compare a project with waiting. Open exchange or close a shortcut; either can make parts of the landscape fresher or saltier.</p><p class="detail-note">All A–H work sites are hypothetical. Their waterway geometry is sourced; their banks and construction eligibility are unverified.</p>';return}
 const s=data.sites.find(s=>s.id===selected),done=world.completed.includes(s.id);
 panel.innerHTML=`<p class="eyebrow">SITE ${s.id} / ${s.kind==='gap'?'OPEN EXCHANGE':'SLOW A CORRIDOR'}</p><h2>${s.name}</h2><span class="evidence-badge">HYPOTHETICAL WORK SITE</span><div class="project-meta">Mapped waterway: ${s.mappedName}<br>Census HYDROID ${s.hydroid}<br>${s.point[1].toFixed(4)}°N, ${Math.abs(s.point[0]).toFixed(4)}°W</div><p>${s.kind==='gap'?'Remove assumed lateral bank barriers along this mapped waterway. The gap connects existing waters; it does not create freshwater or sediment.':'Place fill in a small mapped canal segment. Its cells become mud, slow exchange, and mature to marsh after three modeled years.'}</p>${preview?`<div class="connection-counts">${preview.reconnected} cells with changed exchange paths<br>${preview.fresher} shift fresher · ${preview.saltier} shift saltier</div><div class="forecast"><b>YEAR ${world.year+preview.years} / PROJECT VS. WAITING</b><span>🌾 ${signed(preview.delta.marsh)} marsh tiles</span><span>🦪 ${signed(preview.delta.oyster)} oyster · 🦐 ${signed(preview.delta.shrimp)} shrimp</span><span>🐊 ${signed(preview.delta.alligator)} alligator</span><small>Same current landscape, no subsequent projects. Exact only within these assumed rules.</small></div><button id="commit" class="primary">${s.kind==='gap'?'Open bank gap':'Backfill segment'} · ${s.cost} ${s.cost===1?'credit':'credits'}</button>`:`<p class="detail-note">${done?'Project committed. Its consequences continue through the run.':world.year>=END_YEAR?'This run is complete. Reset to try this site.':world.budget<s.cost?'Insufficient credits. Try a lower-cost action or reset.':'This segment is no longer eligible for filling in the current landscape.'}</p>`}<p class="detail-note">Hypothetical works; effects are uncalibrated game results.</p>`;
 if($('#commit'))$('#commit').onclick=commit;
}
function chart(){
 let out='';const max=Math.ceil(Math.max(10,...history.flatMap(m=>SPECIES.map(s=>m[s])),...baseHistory.flatMap(m=>SPECIES.map(s=>m[s])))/500)*500;
 for(let n=0;n<=4;n++){const y=185-n*40;out+=`<line x1="45" x2="880" y1="${y}" y2="${y}" stroke="#38503f"/><text x="35" y="${y+3}" fill="#a5b89b" font-size="10" text-anchor="end">${Math.round(max*n/4)}</text>`}
 for(let n=0;n<=20;n+=5)out+=`<text x="${45+n/20*835}" y="210" fill="#a5b89b" font-size="10" text-anchor="middle">${n===0?'Year 0':n}</text>`;
 for(const [k,s]of SPECIES.entries())for(const b of [true,false]){if(b&&!$('#baseline').checked)continue;const hs=b?baseHistory:history;out+=`<polyline fill="none" points="${hs.map((m,y)=>`${45+y/20*835},${185-m[s]/max*160}`).join(' ')}" stroke="${speciesColors[k]}" stroke-width="${b?1.5:2.5}" ${b?'stroke-dasharray="5 5" opacity=".5"':''}/>`}
 $('#chart').innerHTML=out;
}
function render(){
 draw();renderSites();renderDetail();chart();$('#year').textContent=String(world.year).padStart(2,'0');
 for(const [id,is]of [['basinView',view==='basin'],['focusView',view==='focus']])$('#'+id).setAttribute('aria-pressed',String(is));
 document.querySelectorAll('[data-layer]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.layer===layer)));
 const end=world.year>=END_YEAR;$('#advance').disabled=end;$('#play').disabled=end;if(!timer)$('#play').textContent=end?'Run complete':`▶ To year ${nextReview()}`;
 $('#review').innerHTML=`<b>${end?'Year 20 · Compare your outcomes':world.year===0?'Where will you intervene?':REVIEWS.includes(world.year)?`Year ${world.year} · Review your plan`:`Year ${world.year} · Effects are unfolding`}</b><span>${end?'Unused credits are allowed. There is no single ecological score.':REVIEWS.includes(world.year)?'Playback paused. Inspect changes, commit a project, or keep waiting.':'Eight credits for the run. Previewing is free; each project is permanent.'}</span>`;
 const m=metrics(world),b=metrics(baseline);$('#cards').innerHTML=['marsh',...SPECIES].map((s,k)=>`<div class="card" style="--c:${k?speciesColors[k-1]:'#d0e397'}"><div class="card-top"><span>${['Assumed marsh habitat','Oyster habitat','Shrimp habitat','Alligator habitat'][k]}</span><span>${['🌾','🦪','🦐','🐊'][k]}</span></div><strong>${m[s]} <small>tiles</small></strong><small>${$('#baseline').checked?`${signed(m[s]-b[s])} vs. no intervention`:'Baseline hidden'}</small></div>`).join('');
 const actions=world.actions.slice(-3).reverse().map(a=>`<div class="note"><b>YEAR ${a.year} / SITE ${a.site}</b><br>${a.kind==='fill'?'Canal segment backfilled':'Assumed bank gapped'} · ${a.cost} ${a.cost===1?'credit':'credits'} committed.</div>`).join('');
 $('#notes').innerHTML=actions+(world.events.length?world.events.slice(0,3).map(e=>`<div class="note"><b>YEAR ${e.year}</b> · ${e.built} new marsh · ${e.lost} marsh lost</div>`).join(''):'<div class="note">The map is real. Habitat and hydrology are explicitly assumed. Compare actions before committing.</div>');
 if(inspected>=0)inspectTile(inspected);else $('#inspection').textContent=view==='focus'?'Click a tile to inspect its mapped-water status and assumed habitat, salinity, and growth timers.':'Select the restoration-area view to inspect scenario tiles. The basin overview provides geographic context.';
}
function inspectTile(i){
 inspected=i;const t=world.tiles[i],p=cellPoint(i),habitat=SPECIES.map((s,k)=>`${['🦪','🦐','🐊'][k]} ${t.occupied[k]?(suitable(world,i,k)?'suitable':'1 unsuitable year; leaves next year'):'unoccupied'}`).join(' · ');
 $('#inspection').innerHTML=`<strong>${p[1].toFixed(4)}°N, ${Math.abs(p[0]).toFixed(4)}°W</strong> · ${t.originalWater?'Mapped water cell':'Unclassified source land; wetland assumed'}<br>Scenario: ${t.type} · ${t.salt}${t.type==='mud'?` · fill establishment ${t.mudAge}/3 years`:''}${t.saltAge?` · salt stress ${t.saltAge}/5`:''}<br>${habitat}`;
}
function pointer(event){const r=canvas.getBoundingClientRect();return [(event.clientX-r.left)/r.width*canvas.width,(event.clientY-r.top)/r.height*canvas.height]}
canvas.onclick=event=>{
 const p=pointer(event),pr=projection();let closest=null,dist=Infinity;
 for(const s of data.sites){const q=pr.point(s.point),d=Math.hypot(p[0]-q[0],p[1]-q[1]);if(d<dist){dist=d;closest=s}}
 if(dist<30){select(closest.id);return}
 if(view==='focus'){const geo=pr.inverse(p),x=Math.floor((geo[0]-data.bbox[0])/(data.bbox[2]-data.bbox[0])*data.width),y=Math.floor((data.bbox[3]-geo[1])/(data.bbox[3]-data.bbox[1])*data.height);if(x>=0&&x<data.width&&y>=0&&y<data.height)inspectTile(y*data.width+x)}
};
canvas.onmousemove=event=>{const p=projection().inverse(pointer(event));$('#coordinates').textContent=`${p[1].toFixed(4)}°N, ${Math.abs(p[0]).toFixed(4)}°W`};
$('#basinView').onclick=()=>{view='basin';render()};$('#focusView').onclick=()=>{view='focus';render()};
document.querySelectorAll('[data-layer]').forEach(b=>b.onclick=()=>{layer=b.dataset.layer;if(layer!=='geography')view='focus';render()});
document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(t=>t.setAttribute('aria-pressed',String(t===b)));renderSites()});
for(const s of ['#showLevees','#showControls'])$(s).onchange=draw;
$('#advance').onclick=()=>{stop();next()};$('#play').onclick=()=>{if(timer){stop();return}timer=setInterval(next,700);$('#play').textContent='Ⅱ Pause'};
$('#reset').onclick=reset;$('#coastal').onchange=reset;$('#erosion').onchange=reset;$('#baseline').onchange=render;
$('#sourcesButton').onclick=()=>$('#sources').showModal();$('#closeSources').onclick=()=>$('#sources').close();
$('#export').onclick=()=>{
 const rows=['year,basin,marsh,mud,water,oyster,shrimp,alligator,coastal_influence,edge_erosion'];
 history.forEach((m,y)=>[m,baseHistory[y]].forEach((s,k)=>rows.push([y,k?'baseline':'player',s.marsh,s.mud,s.water,...SPECIES.map(n=>s[n]),world.coastalInfluence,world.erosion].join(','))));
 rows.push('','action_year,site,action,game_credits');for(const a of world.actions)rows.push([a.year,a.site,a.kind,a.cost].join(','));
 rows.push('','assumptions','"Real mapped water; hypothetical work sites, banks, initial habitat, salinity and ecological timing. Not a forecast."');
 const url=URL.createObjectURL(new Blob([rows.join('\n')],{type:'text/csv'})),a=document.createElement('a');a.href=url;a.download='barataria-scenario-results.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
try{
 const files=await Promise.all(['barataria-grid.json','barataria-water.geojson','barataria-infrastructure.geojson'].map(async name=>{const r=await fetch(`data/${name}`);if(!r.ok)throw Error(`${name}: HTTP ${r.status}`);return r.json()}));
 [data,water,infra]=files;$('#loading').hidden=true;$('#game').hidden=false;reset();
}catch(error){$('#loading').textContent=`The local map could not load: ${error.message}. Run npm start from levee-lab and reload this page.`;console.error(error)}
