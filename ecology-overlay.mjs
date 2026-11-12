// Drawing only. Habitat decisions come from ecology.mjs / the same predicates as the counters.
export function drawEcologyOverlay(g,w,ecology,species,centerOf,{isometric=false,size=32}={}){
 if(!ecology)return;g.fillStyle='#f5f2e380';g.fillRect(0,0,g.canvas?.width??1152,g.canvas?.height??960);
 const mark=(i,color,label)=>{const c=centerOf(w.tiles[i]);g.strokeStyle=color;g.fillStyle=color;g.lineWidth=2;
  if(isometric){g.beginPath();g.moveTo(c.x,c.y-size/4);g.lineTo(c.x+size/2,c.y);g.lineTo(c.x,c.y+size/4);g.lineTo(c.x-size/2,c.y);g.closePath();g.stroke()}
  else g.strokeRect(c.x-size/2+2,c.y-size/2+2,size-4,size-4);
  g.fillRect(c.x-3,c.y-3,6,6);if(label){g.font='bold 7px monospace';g.textAlign='center';g.textBaseline='middle';g.fillStyle='#fff9e7';g.fillText(label,c.x,c.y)}
 };
 for(let i=0;i<w.tiles.length;i++){
  if(species==='protection'){if(w.tiles[i].type==='marsh')mark(i,'#24877d','');if(ecology.protection?.protectedTiles.includes(i))mark(i,'#497cbd','P')}
  else if(species==='foodweb'){if(ecology.masks[i].shrimp)mark(i,'#24877d','');if(ecology.feeding[i])mark(i,'#b27b25','B')}
  else if(species==='feeding'?ecology.feeding[i]:ecology.masks[i][species])mark(i,species==='feeding'?'#b27b25':'#24877d','');
 }
 g.textAlign='left';g.textBaseline='alphabetic';
}
