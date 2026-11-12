import {drawEcologyOverlay} from './ecology-overlay.mjs';
import {drawLevee} from './levee-art.mjs';
import {drawPixelSprite,vegetationKey,terrainColors,tileNoise} from './isometric-view.mjs';

// Plan is a north-up grid using the same illustrative object atlas as isometric.
export function drawPlan(g,world,width,height,{atlas,frames,layer='land',risk=[],showRisk=true,selected=-1,valid=true,abilityTiles=[],ecology=null,ecologySpecies='foodweb'}={}){
 const size=width/36;g.clearRect(0,0,width,height);g.imageSmoothingEnabled=false;
 for(const t of world.tiles){const x=t.x*size,y=t.y*size,n=tileNoise(t.x,t.y),pal=terrainColors[t.type]??terrainColors.unknown,c={x:x+size/2,y:y+size*.83};
  g.fillStyle=pal[n%pal.length];g.fillRect(x,y,size,size);
  g.fillStyle='#314e3210';g.fillRect(x,y,size,1);g.fillRect(x,y,1,size);
  if(t.type==='water'){g.fillStyle='#94c1c4';g.fillRect(x+6+n%8,y+12+n%5,5,1);if(t.sediment){g.fillStyle='#c7b58a';for(let k=0;k<Math.min(5,t.sediment);k++)g.fillRect(x+5+k*4,y+size*.7+k%2,2,2)}}
  const key=t.type==='forest'?vegetationKey(t):t.type==='marsh'?vegetationKey(t):t.type==='developed'?(t.elevation>=2.4?'raisedHome':'home'):t.type==='levee'?null:t.type==='mud'?'mud':t.type==='sand'?'shore':null;
  g.globalAlpha=layer==='salt'?.35:1;
  if(key)drawPixelSprite(g,atlas,frames,key,c,size*.9,size*.88);
  if(t.type==='levee')drawLevee(g,world,t.y*36+t.x,{x:x+size/2,y:y+size/2},{size});
  if(t.garden){g.fillStyle='#587b4f';for(let k=0;k<3;k++)g.fillRect(x+7+k*6,y+12,3,10);if(t.cropAge>=2){g.fillStyle='#ddb663';g.fillRect(x+13,y+10,3,3)}}
  g.globalAlpha=1;
  if(t.flooded&&t.type!=='water'){g.strokeStyle='#608fab';g.strokeRect(x+1,y+1,size-2,size-2)}
  if(t.mappedDefense&&!t.defenseRemoved&&t.type!=='levee')drawLevee(g,world,t.y*36+t.x,{x:x+size/2,y:y+size/2},{size,context:true});
  if(t.damaged){g.fillStyle='#bd6848';g.fillRect(x+size-6,y+4,3,7);g.fillRect(x+size-6,y+13,3,2)}
  if(t.hyacinth)drawPixelSprite(g,atlas,frames,'hyacinth',c,size*.9,size*.8);
  if(t.nutria)drawPixelSprite(g,atlas,frames,'nutria',c,size*.75,size*.6);
  if(ecology?.feeding[t.y*36+t.x]&&n%3===0)drawPixelSprite(g,atlas,frames,'egret',{x:c.x+6,y:c.y},size*.35,size*.6);
  if(layer==='salt'&&t.type==='water'){
   g.strokeStyle='#365e73';g.fillStyle='#365e73';g.lineWidth=2;g.beginPath();g.arc(x+size/2,y+size/2,5,0,Math.PI*2);g.stroke();if(t.salt==='salty')g.fill();if(t.salt==='brackish'){g.beginPath();g.arc(x+size/2,y+size/2,5,Math.PI/2,Math.PI*1.5);g.fill()}
  }
 }
 if(layer==='ecology')drawEcologyOverlay(g,world,ecology,ecologySpecies,t=>({x:(t.x+.5)*size,y:(t.y+.5)*size}),{size});
 if(showRisk){g.strokeStyle='#bd9c5e';g.lineWidth=1;for(const i of risk){const t=world.tiles[i];g.strokeRect(t.x*size+2,t.y*size+2,size-4,size-4)}}
 for(const i of abilityTiles){const t=world.tiles[i];g.strokeStyle='#eef4c4';g.lineWidth=2;g.strokeRect(t.x*size+1,t.y*size+1,size-2,size-2)}
 if(selected>=0){const t=world.tiles[selected];g.strokeStyle=valid?'#fff6c2':'#bd563d';g.lineWidth=3;g.strokeRect(t.x*size+1,t.y*size+1,size-2,size-2)}
 g.font='bold 8px monospace';g.textAlign='center';g.textBaseline='middle';
 for(const [cells,label] of [[world.freshSources??[],'F'],[world.coastalSources??[],'C']])for(const i of cells){const t=world.tiles[i];if(t.type!=='water')continue;g.fillStyle='#f5f1dc';g.fillRect((t.x+.5)*size-5,(t.y+.5)*size-5,10,10);g.fillStyle='#436b6e';g.fillText(label,(t.x+.5)*size,(t.y+.5)*size)}
 g.textAlign='left';g.textBaseline='alphabetic';
}
