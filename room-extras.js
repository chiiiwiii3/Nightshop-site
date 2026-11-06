/* Extra things placed in the 3D lounge. Add new items here (a plant, a neon sign, a drink, a statue...).

   ctx gives you: THREE, scene, box(w,h,d,mat,x,y,z,parent), cyl(rTop,rBottom,h,mat,x,y,z,segments,parent),
   M (materials: gold, leather, dark, neonGreen, neonGold, warm...), canvasTex(w,h,draw) for painted textures,
   colliders (push [minX,maxX,minZ,maxZ] so nobody walks through it), interactive (tappable meshes with userData.action),
   animated (push a function (seconds)=>{} to make something move) and addLight(color,intensity,x,y,z,distance).
   The room is 18 m wide (x -9..9) and 12 m deep (z -6..6), 4.4 m tall. The sign wall is at z = -6. */
export function addExtras(ctx) {
  // nothing extra yet
}
