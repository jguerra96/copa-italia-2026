/* Lee el HTML de coppaitalia.cl y genera oficial.json con los cruces de varones y las confrontaciones
   de damas en el mismo formato de filas que la hoja (pestañas Cruces y Damas).
   Uso: node scripts/coppa.js pagina.html > oficial.json */
const fs=require('fs'),vm=require('vm');
const html=fs.readFileSync(process.argv[2],'utf8');
const a=html.indexOf('const CLUBS='),b=html.indexOf('/* ---------- motor');
if(a<0||b<0||b<a)throw new Error('No encontré los datos en la página (cambió el formato).');
/* Solo se evalúan las constantes de datos, sin acceso a nada más. */
const D=vm.runInNewContext(html.slice(a,b)+';({CLUBS,KO_DEF,RR_DEF,GRP_DEF,RESULTS,DAYN})',Object.create(null),{timeout:2000});
const stamp=(/datos oficiales \(([^)]*)\)/.exec(html)||[])[1]||'';

/* Nombres como los usa Stade en su página y en la hoja (por nombre del club, por si la plataforma cambia los códigos). */
const NAMES={'Prince of Wales Country Club':'PWCC','Prince of Wales':'PWCC','Parra Tenis':'Youtopia'};
function name(id){if(!id||id==='BYE')return id==='BYE'?'Libre':'';const[c,s]=id.split('-');const n=D.CLUBS[c]||c;return(NAMES[n]||n)+(s?' '+s:'')}
function day(d){return d?(D.DAYN[d]||String(d)):''}
/* Resultado de un partido con el marcador del primer equipo primero. */
function res(m){
  if(!m||m.state==='pending'||m.state==='skip')return '';
  const r=m.res||m,sets=r.sets||[];
  if(m.state==='done'&&!sets.length)return r.winner===1?'WO2':'WO1';
  return sets.map(x=>x[0]+'-'+x[1]).join(' ');
}
function results(id){const r=D.RESULTS[id];return[0,1,2].map(i=>res(r&&r.matches&&r.matches[i]))}
function wins(id){const r=D.RESULTS[id];let w=[0,0];((r&&r.matches)||[]).forEach(m=>{if(m.state==='done'&&(m.res||m).winner!=null)w[(m.res||m).winner]++});return w}

/* Varones: solo las categorías en que juega Stade. */
const KO_CAT={V35:'Varones 35+',V45:'Varones 45+',V55:'Senior 55+'};
const RNAME={8:'Octavos de final',4:'Cuartos de final',2:'Semifinal',1:'Final'};
const cruces=[];
D.KO_DEF.filter(d=>KO_CAT[d.id]).forEach(d=>{
  let ent=d.slots.slice();
  for(let r=0;ent.length>1;r++){
    const next=[];
    for(let i=0;i<ent.length;i+=2){
      const id=`${d.id}-R${r+1}-${i/2+1}`,w=(d.times[r]||[])[i/2];
      let t1=ent[i],t2=ent[i+1],win=null;
      if(t1==='BYE'){t1=t2;t2='BYE'}
      if(t2==='BYE'){win=t1;cruces.push([KO_CAT[d.id],RNAME[ent.length/2],'',name(t1),'Libre','','','','','','','','',''])}
      else{
        const rs=t1&&t2?results(id):['','',''],ww=wins(id);
        if(ww[0]>=2)win=t1;else if(ww[1]>=2)win=t2;
        cruces.push([KO_CAT[d.id],RNAME[ent.length/2],w?day(w[0]):'',name(t1),name(t2),'','','',rs[0],'',rs[1],'',rs[2],w?w[1]:'']);
      }
      next.push(win);
    }
    ent=next;
  }
});

/* Damas A (todos contra todos, fechas 2 y 3 según la fecha 1) y Damas B y C (grupos + ronda final). */
const DCAT={DA:'Damas A',DB:'Damas B',DC:'Damas C'};
const damas=[];
/* La columna 15 guarda el cruce tal como lo publica la plataforma ("Ganador P1|Perdedor P2"), para reconocerlo en la hoja. */
function drow(cat,f,t1,t2,id,hora,key){const rs=t1&&t2&&!/^(Ganador|Perdedor|\d)/.test(t1+t2)?results(id):['','',''];damas.push([cat,day(f),t1,t2,'','',rs[0],'','',rs[1],'','',rs[2],hora||'',key||''])}
D.RR_DEF.forEach(d=>{
  const P={};
  d.fechas.forEach((f,fi)=>f.pairs.forEach((p,pi)=>{
    const id=`${d.id}-F${fi+1}-${pi+1}`;
    const side=x=>{const m=/^([WL]):(P\d)$/.exec(x);if(!m)return name(x);const s=P[m[2]];
      if(s){const w=wins(s.id);if(w[0]>=2||w[1]>=2){const W=w[0]>w[1]?s.a:s.b,L=w[0]>w[1]?s.b:s.a;return m[1]==='W'?W:L}}
      return(m[1]==='W'?'Ganador ':'Perdedor ')+m[2]};
    const t1=side(p[0]),t2=side(p[1]);
    if(p[2])P[p[2]]={id,a:t1,b:t2};
    const lbl=x=>{const m=/^([WL]):(P\d)$/.exec(x);return m?(m[1]==='W'?'Ganador ':'Perdedor ')+m[2]:''};
    drow(DCAT[d.id],f.day,t1,t2,id,f.time,lbl(p[0])&&lbl(p[1])?lbl(p[0])+'|'+lbl(p[1]):'');
  }));
});
D.GRP_DEF.forEach(d=>{
  d.groups.forEach((g,gi)=>g.fechas.forEach((f,fi)=>f.pairs.forEach((p,pi)=>drow(DCAT[d.id],f.day,name(p[0]),name(p[1]),`${d.id}-G${gi+1}-F${fi+1}-${pi+1}`,''))));
  /* La ronda final la arma la plataforma con las tablas; aquí solo queda el aviso del cruce. */
  [0,1,2,3].forEach(k=>damas.push([DCAT[d.id],day(23),(k+1)+'° Grupo 1',(k+1)+'° Grupo 2','','','','','','','','','','']));
});

/* Primera vez que la sincronización vio un resultado en cada cruce (para medir cuánto tarda la plataforma en subirlos).
   Se conserva lo anotado en el oficial.json anterior (tercer argumento). */
let vistos={};try{vistos=JSON.parse(fs.readFileSync(process.argv[3],'utf8')).vistos||{}}catch(e){}
const ahora=new Date().toISOString().slice(0,16)+'Z';
cruces.forEach(r=>{if(r[8]||r[10]||r[12]){const k=[r[0],r[1],r[3],r[4]].join(' · ');if(!vistos[k])vistos[k]=ahora}});
damas.forEach(r=>{if(r[6]||r[9]||r[12]){const k=[r[0],r[1],r[2],r[3]].join(' · ');if(!vistos[k])vistos[k]=ahora}});

process.stdout.write(JSON.stringify({fuente:'https://www.coppaitalia.cl',datos:stamp,vistos,cruces,damas},null,1)+'\n');
