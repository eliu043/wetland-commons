// Deliberately uncalibrated game attenuation. Units are the existing elevation/game units.
export const MARSH_RULES={baseDrag:.08,patchBonus:.12,fullPatch:9,maxReduction:.7};
function near(i,width,length){const x=i%width;return [x?i-1:-1,x<width-1?i+1:-1,i-width,i+width].filter(j=>j>=0&&j<length)}
export function marshCapacity(tiles,width=36){
 const health=tiles.map(t=>t.type==='marsh'?Math.max(.2,1-Math.min(4,t.saltAge??0)*.18)*(t.nutria?.35:1):0),patchSize=tiles.map(()=>0),drag=tiles.map(()=>0),seen=new Set();
 for(let i=0;i<tiles.length;i++){if(!health[i]||seen.has(i))continue;const patch=[i];seen.add(i);for(let a=0;a<patch.length;a++)for(const j of near(patch[a],width,tiles.length))if(health[j]&&!seen.has(j)){seen.add(j);patch.push(j)}
  const effective=patch.reduce((sum,j)=>sum+health[j],0);for(const j of patch){patchSize[j]=patch.length;drag[j]=(MARSH_RULES.baseDrag+MARSH_RULES.patchBonus*Math.min(1,effective/MARSH_RULES.fullPatch))*health[j]}
 }
 return {health,patchSize,drag};
}
export function propagateFlood(tiles,sources,level,{width=36,marshProtection=true}={}){
 const capacity=marshCapacity(tiles,width),heads=tiles.map(()=>-Infinity),queue=[];
 for(const i of sources){heads[i]=level;queue.push(i)}
 // Keep the strongest arriving path. A less-buffered bypass must override a marsh route.
 for(let a=0;a<queue.length;a++){const i=queue[a],out=Math.max(level-MARSH_RULES.maxReduction,heads[i]-(marshProtection?capacity.drag[i]:0));
  for(const j of near(i,width,tiles.length)){const t=tiles[j];if(t.type==='levee'||t.type==='water'||out<=t.elevation+1e-9||out<=heads[j]+1e-9)continue;heads[j]=out;queue.push(j)}
 }
 return {...capacity,heads,flooded:tiles.map((t,i)=>t.type!=='water'&&t.type!=='levee'&&heads[i]>t.elevation+1e-9)};
}
