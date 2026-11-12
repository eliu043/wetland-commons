import {habitatAt,neighbors} from './island-model.mjs';
export const FEEDING_THRESHOLD=3,FORAGING_DISTANCE=2;
export const ECOLOGY_SPECIES={protection:'Marsh flood protection',foodweb:'Shrimp → wading birds',oyster:'Oyster habitat',shrimp:'Shrimp nursery',alligator:'Alligator habitat',bird:'General bird habitat',crab:'Crab habitat',raccoon:'Raccoon habitat',beetle:'Water beetle habitat',dragonfly:'Dragonfly habitat',pollinator:'Pollinator habitat',feeding:'Wading-bird feeding areas'};
// A deliberately invented habitat-support threshold, not animal abundance or a population forecast.
export function ecologyState(w){
 const masks=w.tiles.map((_,i)=>habitatAt(w,i)),preyCounts=w.tiles.map(()=>0),feeding=w.tiles.map(()=>false);
 for(let i=0;i<w.tiles.length;i++){
  const t=w.tiles[i];if(t.type!=='marsh'||t.nutria)continue;
  const visited=new Set([i]),queue=[[i,0]];
  for(let k=0;k<queue.length;k++){const [cell,distance]=queue[k];if(distance>=FORAGING_DISTANCE)continue;
   for(const j of neighbors(cell)){if(visited.has(j)||w.tiles[j].type!=='water')continue;visited.add(j);queue.push([j,distance+1]);if(masks[j].shrimp)preyCounts[i]++}
  }
  feeding[i]=preyCounts[i]>=FEEDING_THRESHOLD;
 }
 return {masks,preyCounts,feeding,feedingCount:feeding.filter(Boolean).length,shrimpCount:masks.filter(m=>m.shrimp).length};
}
