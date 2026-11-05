import {simulate,launchVel,powerToSpeed,assistSolve} from '../js/physics.js';
const row=(name,p,th)=>{
  const out=[];
  for(const pw of [0.1,0.25,0.4,0.55,0.7,0.85,1.0]){
    const tr=simulate(p,launchVel(powerToSpeed(pw),th,0,-1));
    out.push(`${pw}→${tr.net?'LƯỚI':tr.land.z.toFixed(1)}`);
  }
  console.log(name.padEnd(26),out.join('  '));
};
row('clear 45° z=5.5 y1.8',[0,1.8,5.5],45);
row('clear 35° z=5.5 y2.4',[0,2.4,5.5],35);
row('lift 62° z=5.5 y1.0',[0,1.0,5.5],62);
row('drop 30° z=4 y2.2',[0,2.2,4],30);
row('drop 40° z=3 y2.0',[0,2.0,3],40);
row('drive 10° z=2.5 y1.8',[0,1.8,2.5],10);
row('smash -8° z=3.5 y2.7',[0,2.7,3.5],-8);
row('serve 40° z=2.4 y0.9',[0,0.9,2.4],40);
row('serve 55° z=2.4 y0.9',[0,0.9,2.4],55);
// trợ lực
for (const [n,p,el,d] of [['clear 12m',[0,1.8,5.5],45,12],['drop 4m',[0,2.0,3],15,4],['smash 6m',[0,2.7,3.5],-10,6],['serve ngắn 3.5m',[0,0.9,2.4],10,3.8],['serve dài đơn 8m',[0,0.9,2.4],30,8.4],['drive 9m',[0,1.4,2.5],5,9]]) {
  const r=assistSolve(p,0,-1,el,d); const tr=simulate(p,launchVel(r.speed,r.el,0,-1));
  console.log('assist',n.padEnd(18),'v=',r.speed.toFixed(1),'el=',r.el,'ok=',r.ok,'→ z=',tr.net?'LƯỚI':(p[2]+(-1)*Math.hypot(tr.land.x-p[0],tr.land.z-p[2])).toFixed(2),'t=',tr.land?.t.toFixed(2));
}
