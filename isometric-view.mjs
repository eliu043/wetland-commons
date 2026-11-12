import {drawEcologyOverlay} from './ecology-overlay.mjs';
import {drawLevee} from './levee-art.mjs';
// Presentation only: neither projection nor artwork changes the sourced world.
export function tileLift(tile){return tile.type==='water'?0:tile.type==='levee'?7:3}
export function createProjection(columns=36,rows=30,tileWidth=32){
 const halfW=tileWidth/2,halfH=tileWidth/4,pad=32,top=54;
 return {columns,rows,tileWidth,halfW,halfH,width:(columns+rows)*halfW+pad*2,height:(columns+rows)*halfH+top+44,originX:rows*halfW+pad,originY:top};
}
export function projectTile(p,x,y,lift=0){return {x:p.originX+(x-y)*p.halfW,y:p.originY+(x+y)*p.halfH+p.halfH-lift}}
export function depthOrder(tiles){return tiles.map((_,i)=>i).sort((a,b)=>(tiles[a].x+tiles[a].y)-(tiles[b].x+tiles[b].y)||tiles[a].x-tiles[b].x)}
export function pickIsometric(p,tiles,px,py){
 const order=depthOrder(tiles);
 for(let k=order.length-1;k>=0;k--){const i=order[k],t=tiles[i],c=projectTile(p,t.x,t.y,tileLift(t));if(Math.abs(px-c.x)/p.halfW+Math.abs(py-c.y)/p.halfH<=1)return i}
 return -1;
}
export const terrainColors={water:['#679eaa','#6bA2ad','#70a6ae'],forest:['#859b69','#8b9f70','#829769'],marsh:['#a4b17a','#aab780','#9eae77'],meadow:['#bfc294','#c3c69a','#b9bf90'],mud:['#a98a66','#b0916e','#aa8a67'],sand:['#dbcc9c','#dfd1a4','#d6c697'],developed:['#b5b6a0','#bcbba6','#b0b29e'],levee:['#c7c998','#d0cea0','#c3c590'],unknown:['#c8c5b5']};
export const tileNoise=(x,y,s=0)=>((Math.imul(x+113+s,374761393)^Math.imul(y+719,668265263))>>>0)%997;
function diamond(g,c,p,color){g.fillStyle=color;for(let row=0;row<p.halfH*2;row++){const extent=Math.min(row+1,p.halfH*2-row)*2;g.fillRect(Math.round(c.x-extent),Math.round(c.y-p.halfH+row),extent*2,1)}}
function edge(g,a,b,color){g.fillStyle=color;const steps=Math.max(Math.abs(b.x-a.x),Math.abs(b.y-a.y));for(let k=0;k<=steps;k++)g.fillRect(Math.round(a.x+(b.x-a.x)*k/steps),Math.round(a.y+(b.y-a.y)*k/steps),1,1)}
function outline(g,c,p,color){const top={x:c.x,y:c.y-p.halfH},right={x:c.x+p.halfW,y:c.y},bottom={x:c.x,y:c.y+p.halfH},left={x:c.x-p.halfW,y:c.y};edge(g,top,right,color);edge(g,right,bottom,color);edge(g,bottom,left,color);edge(g,left,top,color)}
export function drawPixelSprite(g,atlas,frames,key,c,maxW,maxH,jitter=0){
 const f=frames?.[key];if(!atlas||!f)return;
 const scale=Math.min(maxW/f.w,maxH/f.h),w=Math.max(1,Math.round(f.w*scale)),h=Math.max(1,Math.round(f.h*scale));
 g.drawImage(atlas[f.sheet??'base'],f.x,f.y,f.w,f.h,Math.round(c.x-w/2+jitter),Math.round(c.y-h+3),w,h);
}
export function vegetationKey(t){const n=tileNoise(t.x,t.y);return t.type==='forest'?(t.treeAge<3?'sapling':['cypressBroad','cypressTall','cypressForked','cypressSparse'][n%4]):['grassLow','reedsDense','reedsSparse','sedge'][n%4]}
export function drawIsometric(g,world,p,{atlas,frames,layer='land',risk=[],showRisk=true,selected=-1,valid=true,abilityTiles=[],ecology=null,ecologySpecies='foodweb'}={}){
 const order=depthOrder(world.tiles);g.imageSmoothingEnabled=false;g.clearRect(0,0,p.width,p.height);g.fillStyle='#ebe8d9';g.fillRect(0,0,p.width,p.height);
 // The shallow cutaway is a graphic convention, not measured topography.
 for(const i of order){const t=world.tiles[i],lift=tileLift(t),c=projectTile(p,t.x,t.y,lift),base=projectTile(p,t.x,t.y,-8),n=tileNoise(t.x,t.y),pal=terrainColors[t.type]??terrainColors.unknown;
  if(t.y===p.rows-1||t.x===p.columns-1){for(let y=c.y;y<=base.y;y++)diamond(g,{x:c.x,y},p,t.type==='water'?'#51858f':'#8c906a');}
  diamond(g,c,p,pal[n%pal.length]);
  if(t.type!=='water'&&lift>3){for(let y=c.y+lift-3;y>c.y;y--)diamond(g,{x:c.x,y},p,'#8e9267');diamond(g,c,p,pal[n%pal.length]);}
  if(t.type==='water'){
   for(let k=0;k<2;k++){const dx=tileNoise(t.x,t.y,k+7)%17-8,dy=tileNoise(t.y,t.x,k+17)%7-3;g.fillStyle=k?'#87b5b9':'#5b939e';g.fillRect(c.x+dx,c.y+dy,3+(n%3),1)}
   if(t.sediment){g.fillStyle='#c7b58a';for(let k=0;k<Math.min(5,t.sediment);k++)g.fillRect(c.x-6+k*3,c.y+(k%2)*2,2,1)}
  }else{for(let k=0;k<3;k++){g.fillStyle=k%2?'#ffffff15':'#4d68411c';g.fillRect(c.x+(tileNoise(t.x,t.y,k)%17)-8,c.y+(tileNoise(t.y,t.x,k)%7)-3,2,1)}}
  // Follow the actual classified shoreline, rather than painting new coastline.
  for(const [dx,dy,side] of [[1,0,'right'],[0,1,'left']]){const x=t.x+dx,y=t.y+dy,nbr=x<p.columns&&y<p.rows?world.tiles[y*p.columns+x]:null;if(nbr&&(t.type==='water')!==(nbr.type==='water')){const a=side==='right'?{x:c.x+p.halfW,y:c.y}:{x:c.x-p.halfW,y:c.y};edge(g,a,{x:c.x,y:c.y+p.halfH},t.type==='water'?'#b8c6a2':'#d1cda0')}}
 }
 // Draw objects back-to-front, independently of the terrain pass.
 for(const i of order){const t=world.tiles[i],c=projectTile(p,t.x,t.y,tileLift(t)),n=tileNoise(t.x,t.y),salt=layer==='salt';
  g.globalAlpha=salt?.35:1;
  if(t.type==='forest')drawPixelSprite(g,atlas,frames,vegetationKey(t),{x:c.x,y:c.y+(n%3)-1},24+(n%7),33+(n%7),n%5-2);
  if(t.type==='marsh')drawPixelSprite(g,atlas,frames,vegetationKey(t),{x:c.x+(n%5)-2,y:c.y+(n%3)-1},18+(n%4),12+(n%6));
  if(t.type==='developed')drawPixelSprite(g,atlas,frames,t.elevation>=2.4?'raisedHome':'home',c,27,29);
  if(t.type==='levee')drawLevee(g,world,i,c,{isometric:true,size:p.tileWidth});
  if(t.type==='mud'&&n%3===0)drawPixelSprite(g,atlas,frames,'mud',c,20,10);
  if(t.type==='sand'&&n%3===0)drawPixelSprite(g,atlas,frames,'shore',c,18,10);
  if(t.garden){g.fillStyle='#5a784f';for(let k=0;k<3;k++)g.fillRect(c.x-6+k*4,c.y-2,2,4);if(t.cropAge>=2){g.fillStyle='#ddb663';g.fillRect(c.x-2,c.y-3,2,2)}}
  if(t.mappedDefense&&!t.defenseRemoved&&t.type!=='levee')drawLevee(g,world,i,c,{isometric:true,size:p.tileWidth,context:true});
  if(t.damaged){g.fillStyle='#c67a55';g.fillRect(c.x+7,c.y-14,3,8);g.fillRect(c.x+7,c.y-4,3,2)}
  g.globalAlpha=1;
  if(t.flooded&&t.type!=='water')outline(g,c,p,'#608faba0');
  if(t.hyacinth)drawPixelSprite(g,atlas,frames,'hyacinth',c,27,19);
  if(t.nutria)drawPixelSprite(g,atlas,frames,'nutria',c,18,14);
  // Occasional egrets signify suitable habitat; they are not a population count.
  if(!salt&&t.type==='marsh'&&ecology?.feeding[i]&&n%3===0)drawPixelSprite(g,atlas,frames,'egret',{x:c.x+5,y:c.y},10,16);
 }
 if(layer==='ecology')drawEcologyOverlay(g,world,ecology,ecologySpecies,t=>projectTile(p,t.x,t.y,tileLift(t)),{isometric:true,size:p.tileWidth});
 if(showRisk){for(const i of risk){const t=world.tiles[i];outline(g,projectTile(p,t.x,t.y,tileLift(t)),p,t.type==='developed'?'#bb744b':'#bd9c5e90')}}
 for(const i of abilityTiles){const t=world.tiles[i];outline(g,projectTile(p,t.x,t.y,tileLift(t)),p,'#e5efb6')}
 if(layer==='salt'){
  for(const t of world.tiles){if(t.type!=='water')continue;const c=projectTile(p,t.x,t.y);for(let y=-3;y<=3;y++)for(let x=-3;x<=3;x++){const d=x*x+y*y;if(d>10)continue;g.fillStyle=d>=5||t.salt==='salty'||(t.salt==='brackish'&&x<0)?'#365e73':'#b7d3d3';g.fillRect(c.x+x,c.y+y,1,1)}}
 }
 g.font='bold 7px monospace';g.textAlign='center';g.textBaseline='middle';
 for(const [cells,label]of [[world.freshSources??[],'F'],[world.coastalSources??[],'C']])for(const i of cells){const t=world.tiles[i];if(t.type!=='water')continue;const c=projectTile(p,t.x,t.y);g.fillStyle='#f5f1dc';g.fillRect(c.x-4,c.y-4,8,8);g.fillStyle='#436b6e';g.fillText(label,c.x,c.y)}
 if(selected>=0){const t=world.tiles[selected],c=projectTile(p,t.x,t.y,tileLift(t));outline(g,c,p,valid?'#fff6c2':'#bd563d');outline(g,c,{...p,halfW:p.halfW-1,halfH:p.halfH-1},valid?'#506c45':'#f6c7a3');g.fillStyle=valid?'#fff6c2':'#bd563d';g.fillRect(c.x-1,c.y-3,3,3)}
 // Orientation changes with projection: north points toward the upper right.
 g.textAlign='left';g.textBaseline='alphabetic';g.fillStyle='#6d7f6c';g.font='9px monospace';g.fillText('N ↗',p.width-64,28);g.font='8px monospace';g.fillText('ISOMETRIC / SAME TERRAIN',32,p.height-16);
}
