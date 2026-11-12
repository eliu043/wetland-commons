export const END_YEAR=20, REVIEWS=[3,6,10,15,20];
export const SPECIES=['oyster','shrimp','alligator'];
export const edgeKey=(a,b)=>a<b?`${a}:${b}`:`${b}:${a}`;
export function neighbors(i,w,h){const x=i%w,y=Math.floor(i/w);return [x?i-1:-1,x<w-1?i+1:-1,y?i-w:-1,y<h-1?i+w:-1].filter(j=>j>=0)}
class Heap {
  constructor(){this.a=[]}
  push(item){let i=this.a.length;this.a.push(item);while(i){const p=(i-1)>>1;if(this.a[p][0]<=item[0])break;this.a[i]=this.a[p];i=p}this.a[i]=item}
  pop(){const top=this.a[0],last=this.a.pop();if(this.a.length){let i=0;while(i*2+1<this.a.length){let j=i*2+1;if(j+1<this.a.length&&this.a[j+1][0]<this.a[j][0])j++;if(this.a[j][0]>=last[0])break;this.a[i]=this.a[j];i=j}this.a[i]=last}return top}
}
export function sourceDistances(world,sources){
 const n=world.tiles.length,d=new Array(n).fill(Infinity),heap=new Heap(),blocked=new Set();
 for(const site of world.sites)if(site.kind==='gap'&&!world.completed.includes(site.id))for(const [a,b]of site.edges)blocked.add(edgeKey(a,b));
 for(const i of sources){d[i]=0;heap.push([0,i])}
 while(heap.a.length){const [cost,i]=heap.pop();if(cost!==d[i])continue;
  for(const j of neighbors(i,world.width,world.height)){
   if(blocked.has(edgeKey(i,j)))continue;
   const water=world.tiles[i].type==='water'&&world.tiles[j].type==='water';
   const next=cost+(water?.35:(world.tiles[i].type==='mud'||world.tiles[j].type==='mud')?7:4);
   if(next<d[j]){d[j]=next;heap.push([next,j])}
  }
 }
 return d;
}
export function hydrology(world){
 const fresh=sourceDistances(world,world.freshSources),saline=sourceDistances(world,world.saltSources);
 const salt=fresh.map((f,i)=>{
  const s=saline[i]/world.coastalInfluence;
  if(!Number.isFinite(f)&&!Number.isFinite(s))return 'brackish';
  if(!Number.isFinite(f))return 'salty';if(!Number.isFinite(s))return 'fresh';
  const share=f/(f+s+1e-9);return share<.48?'fresh':share<.76?'brackish':'salty';
 });
 return {fresh,saline,salt};
}
export function suitable(world,i,k){const t=world.tiles[i];return k===0?t.type==='water'&&t.salt==='brackish':k===1?t.type==='water'&&neighbors(i,world.width,world.height).some(j=>world.tiles[j].type==='marsh'):t.type==='marsh'&&t.salt!=='salty'}
export function createRegion(data,options={}){
 const {width,height,bbox,sites}=data;
 const tiles=data.water.map((water,i)=>({type:water?'water':'marsh',salt:'fresh',mudAge:0,saltAge:0,occupied:[false,false,false],bad:[0,0,0],originalWater:!!water}));
 // Boundary sources are scenario assumptions, not observed salinity or river inlets.
 const freshSources=[],saltSources=[];
 tiles.forEach((t,i)=>{const x=i%width,y=Math.floor(i/width);if(!t.originalWater)return;if(y<=1||(x<=1&&y<height*.45))freshSources.push(i);if(y>=height-2||(x>=width-2&&y>height*.55))saltSources.push(i)});
 if(!freshSources.length||!saltSources.length)throw Error('Scenario needs water on both source boundaries.');
 const world={width,height,bbox,sites,tiles,freshSources,saltSources,coastalInfluence:options.coastalInfluence??1,erosion:options.erosion??false,completed:[],year:0,budget:8,actions:[],events:[]};
 const fields=hydrology(world);tiles.forEach((t,i)=>{t.salt=fields.salt[i];t.occupied=SPECIES.map((s,k)=>suitable(world,i,k))});return world;
}
export function metrics(world){return {marsh:world.tiles.filter(t=>t.type==='marsh').length,mud:world.tiles.filter(t=>t.type==='mud').length,water:world.tiles.filter(t=>t.type==='water').length,...Object.fromEntries(SPECIES.map((s,k)=>[s,world.tiles.filter(t=>t.occupied[k]).length]))}}
export function applyProject(world,id){
 const site=world.sites.find(s=>s.id===id);
 if(!site||world.year>=END_YEAR||world.completed.includes(id)||world.budget<site.cost)return false;
 if(site.kind==='fill'){
  if(site.cells.some(i=>world.tiles[i].type!=='water'))return false;
  for(const i of site.cells){const t=world.tiles[i];t.type='mud';t.mudAge=0;t.saltAge=0}
 }
 world.completed.push(id);world.budget-=site.cost;
 world.actions.push({year:world.year,site:id,kind:site.kind,cost:site.cost});
 // Salinity and ecological consequences resolve on the next annual step.
 return true;
}
export function stepRegion(world){
 if(world.year>=END_YEAR)return world;
 const fields=hydrology(world);let built=0,lost=0;
 const tiles=world.tiles.map((old,i)=>{
  const t={...old,occupied:[...old.occupied],bad:[...old.bad],salt:fields.salt[i]};
  if(old.type==='mud'){
   t.mudAge++;if(t.mudAge>=3){t.type='marsh';t.saltAge=0;built++}
  }else if(old.type==='marsh'){
   t.saltAge=t.salt==='salty'?old.saltAge+1:0;
   const exposed=neighbors(i,world.width,world.height).filter(j=>world.tiles[j].type==='water').length;
   if(t.saltAge>=5||(world.erosion&&exposed>=3)){t.type='water';t.saltAge=0;lost++}
  }
  return t;
 });
 const next={...world,tiles,year:world.year+1,events:[{year:world.year+1,built,lost},...world.events].slice(0,6)};
 tiles.forEach((t,i)=>SPECIES.forEach((s,k)=>{if(suitable(next,i,k)){t.occupied[k]=true;t.bad[k]=0}else{t.bad[k]++;if(t.bad[k]>=2)t.occupied[k]=false}}));
 return next;
}
export function previewProject(world,id){
 const candidate=structuredClone(world);if(!applyProject(candidate,id))return null;
 const before=hydrology(world),after=hydrology(candidate);
 const changed=[];let fresher=0,saltier=0,reconnected=0;const rank={fresh:0,brackish:1,salty:2};
 before.salt.forEach((s,i)=>{if(Math.abs(before.fresh[i]-after.fresh[i])>1e-6||Math.abs(before.saline[i]-after.saline[i])>1e-6)reconnected++;if(s!==after.salt[i]){changed.push(i);if(rank[after.salt[i]]<rank[s])fresher++;else saltier++}});
 let a=candidate,b=structuredClone(world);const years=Math.min(6,END_YEAR-world.year);
 for(let y=0;y<years;y++){a=stepRegion(a);b=stepRegion(b)}
 const ma=metrics(a),mb=metrics(b);
 return {changed,fresher,saltier,reconnected,years,delta:Object.fromEntries(Object.keys(ma).map(k=>[k,ma[k]-mb[k]]))};
}
