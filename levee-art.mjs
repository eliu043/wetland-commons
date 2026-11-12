// Connect displayed embankments along the classified defense path. No physics changes.
export function leveeConnections(w,i,width=36){
 const t=w.tiles[i],height=w.tiles.length/width,isDefense=(x,y)=>x>=0&&x<width&&y>=0&&y<height&&((w.tiles[y*width+x].type==='levee')||(w.tiles[y*width+x].mappedDefense&&!w.tiles[y*width+x].defenseRemoved));
 const result=[];
 for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]])if(isDefense(t.x+dx,t.y+dy))result.push([dx,dy]);
 for(const [dx,dy] of [[1,1],[1,-1],[-1,1],[-1,-1]])if(isDefense(t.x+dx,t.y+dy)&&!isDefense(t.x+dx,t.y)&&!isDefense(t.x,t.y+dy))result.push([dx,dy]);
 return result.length?result:[[1,0],[-1,0]];
}
function pixelLine(g,a,b,size,color){const steps=Math.max(1,Math.ceil(Math.max(Math.abs(b.x-a.x),Math.abs(b.y-a.y))));g.fillStyle=color;for(let k=0;k<=steps;k++)g.fillRect(Math.round(a.x+(b.x-a.x)*k/steps-size/2),Math.round(a.y+(b.y-a.y)*k/steps-size/2),size,size)}
export function drawLevee(g,w,i,c,{isometric=false,size=32,context=false}={}){
 const t=w.tiles[i],scale=size/32,vectors=leveeConnections(w,i),segments=vectors.map(([dx,dy])=>({x:c.x+(isometric?(dx-dy)*size/4:dx*size/2),y:c.y+(isometric?(dx+dy)*size/8:dy*size/2)}));
 if(context){for(const end of segments)pixelLine(g,c,end,1,'#a8894e');return}
 for(const [width,color,offset] of [[9,'#817d54',3],[8,'#81905b',1],[5,'#b7bc7e',0],[3,'#efe2b6',-1]])for(const end of segments)pixelLine(g,{x:c.x,y:c.y+offset*scale},{x:end.x,y:end.y+offset*scale},Math.max(1,Math.round(width*scale)),color);
 if(t.leveeHealth<3){g.fillStyle='#92714b';g.fillRect(Math.round(c.x-2*scale),Math.round(c.y-2*scale),Math.round(5*scale),Math.round(4*scale));if(t.leveeHealth===1){g.fillStyle='#695c43';g.fillRect(Math.round(c.x-scale),Math.round(c.y-scale),Math.max(1,Math.round(2*scale)),Math.round(3*scale))}}
}
