/* Casita Stock — app principal (diseñada para iPhone: ver CLAUDE.md) */
/* Teclado del iPhone: guarda el alto y la posición del área visible para que las hojas no queden tapadas */
(()=>{const vv=window.visualViewport;if(!vv)return;const r=document.documentElement.style;
  const set=()=>{r.setProperty("--vvh",vv.height+"px");r.setProperty("--vvtop",vv.offsetTop+"px")};
  vv.addEventListener("resize",set);vv.addEventListener("scroll",set);set()})();
/* ================= Constantes y utilidades ================= */
const CATS=["Despensa","Lácteos","Frutas y verduras","Carnes","Panadería","Bebidas","Congelados","Limpieza","Higiene","Mascotas","Otros"];
const UBIS=["Nevera","Congelador","Despensa","Baño","Lavandería","Otro"];
const UBI_DE={"Lácteos":"Nevera","Frutas y verduras":"Nevera","Carnes":"Nevera","Congelados":"Congelador","Limpieza":"Lavandería","Higiene":"Baño"};
const STEPS=[
  {name:"Escanear",q:"¿Qué producto compraste?",help:"Apunta la cámara al código de barras del empaque."},
  {name:"Datos",q:"¿Es este producto?",help:"Revisa el nombre y corrige lo que haga falta."},
  {name:"Cantidad",q:"¿Cuántos compraste?",help:"Toca + o −. El precio y la tienda son opcionales."},
  {name:"Detalles",q:"Últimos detalles",help:"Así te avisamos a tiempo antes de que se acabe o se venza."},
  {name:"Confirmar",q:"¿Todo está bien?",help:"Revisa antes de guardar. Puedes cambiar cualquier dato."}
];
const MES=["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
const localISO=d=>{const z=new Date(d.getTime()-d.getTimezoneOffset()*60000);return z.toISOString().slice(0,10)};
const today=()=>localISO(new Date());
const daysAgo=n=>{const t=new Date();t.setDate(t.getDate()-n);return localISO(t)};
const inDays=n=>daysAgo(-n);
const dayDiff=(a,b)=>Math.round((Date.parse(b+"T12:00:00")-Date.parse(a+"T12:00:00"))/864e5);
const svgImg=(bg,fg,label)=>"data:image/svg+xml;utf8,"+encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 150'><rect width='200' height='150' fill='${bg}'/><rect x='70' y='22' width='60' height='106' rx='10' fill='${fg}'/><rect x='70' y='55' width='60' height='40' fill='#fff' opacity='.9'/><text x='100' y='80' font-family='sans-serif' font-size='11' font-weight='700' text-anchor='middle' fill='${fg}'>${label}</text></svg>`);
const NO_PHOTO=svgImg("#e4e9e5","#8a9a91","SIN FOTO");
const icon=(id,cls="i")=>`<svg class="${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;
const $=s=>document.querySelector(s);
const $$=s=>document.querySelectorAll(s);
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const fmtDate=d=>{if(!d)return"—";if(d===today())return"hoy";if(d===daysAgo(1))return"ayer";if(d===inDays(1))return"mañana";const [y,m,dd]=d.split("-");return `${+dd} de ${MES[m-1]}${y!==today().slice(0,4)?" de "+y:""}`};
const plural=(n,s,p)=>`${n} ${n===1?s:(p||s+"s")}`;
const norm=s=>(s||"").trim().toLowerCase();
const uid=()=>"p"+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const money=n=>(n==null||n===""||isNaN(n))?"":"$"+Number(n).toLocaleString("es-US",{minimumFractionDigits:Number(n)%1?2:0,maximumFractionDigits:2});
function parseMoney(s){s=String(s??"").replace(/[\s$]/g,"");if(!s)return null;if(/,\d{1,2}$/.test(s))s=s.replace(/\./g,"").replace(",",".");else s=s.replace(/,/g,"");const n=parseFloat(s);return isFinite(n)&&n>=0?Math.round(n*100)/100:null}
const LS={get(k,d){try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return d}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};

/* ================= Cálculos del inventario ================= */
/* Consumo diario según los usos de los últimos 60 días */
function rate(p){
  const h=p.historial||[];const lim=daysAgo(60);const w=h.filter(e=>e.f>=lim);
  const used=w.filter(e=>e.t==="u").reduce((a,e)=>a+(+e.n||0),0);if(!used)return null;
  const first=w.reduce((m,e)=>e.f<m?e.f:m,today());
  return used/Math.max(7,dayDiff(first,today()));
}
const daysLeft=p=>{const r=rate(p);return r?p.cantidad/r:null};
const sugMin=p=>{const r=rate(p);return r?Math.max(1,Math.ceil(r*5)):null};
const recBuy=p=>{const r=rate(p);const byUse=r?Math.ceil(r*14)-p.cantidad:0;return Math.max(1,byUse,(p.minimo||0)+1-p.cantidad)};
function status(p){
  if(p.cantidad<=0)return["out","Se acabó","x"];
  const dl=daysLeft(p);
  if(p.cantidad<=p.minimo||(dl!==null&&dl<3))return["low","Queda poco","alert"];
  return["ok","Hay suficiente","check"];
}
function expInfo(p){
  if(!p.vence||p.cantidad<=0)return null;
  const d=dayDiff(today(),p.vence);
  if(d<0)return{cls:"out",d,text:"Vencido"};
  if(d===0)return{cls:"out",d,text:"Vence hoy"};
  if(d<=3)return{cls:"low",d,text:`Vence en ${plural(d,"día")}`};
  if(d<=7)return{cls:"soon",d,text:`Vence en ${d} días`};
  return{cls:"far",d,text:`Vence el ${fmtDate(p.vence)}`};
}
function dlText(p){const dl=daysLeft(p);if(dl===null||p.cantidad<=0)return"";if(dl<1.5)return"Se acaba en 1 o 2 días";if(dl>60)return"Te alcanza para más de 2 meses";return`Te alcanza para unos ${Math.round(dl)} días`}
const needsBuy=p=>status(p)[0]!=="ok";
const useSoon=p=>{const e=expInfo(p);return e&&e.d<=7};
/* Unidades por paquete: el inventario siempre cuenta unidades sueltas; cada código recuerda cuántas trae su paquete */
const EMPAQUES=["Suelto","Paquete","Cartón","Caja","Bolsa","Botella","Lata"];
const plu=w=>{w=String(w||"");if(!w)return w;if(/ón$/.test(w))return w.replace(/ón$/,"ones");if(/z$/.test(w))return w.replace(/z$/,"ces");if(/[aeiouáéó]$/i.test(w))return w+"s";return w+"es"};
const cap0=s=>s?s[0].toUpperCase()+s.slice(1):s;
const ppOf=(p,code)=>Math.max(1,Math.round((code&&p&&p.paquetes&&p.paquetes[code])||(p&&p.porPaquete)||1));
const emp=o=>(o&&o.empaque&&o.empaque!=="Suelto")?o.empaque.toLowerCase():"paquete";
const art=w=>/a$/.test(w)?"una":"un";
const empN=(o,n)=>n===1?emp(o):plu(emp(o));
const uni=(o,n)=>{const u=String((o&&o.unidad)||"").trim();return u?(n===1?u:plu(u)):(n===1?"unidad":"unidades")};
const qtyTxt=(p,n=p.cantidad)=>p.unidad?`${n} ${uni(p,n)}`:`${n}`;
function enPaq(p){const pp=ppOf(p);if(pp<=1||p.cantidad<=0)return"";const k=Math.floor(p.cantidad/pp),r=p.cantidad%pp;
  return k?`${k} ${empN(p,k)}${r?` y ${r} ${uni(p,r)}`:""}`:`menos de ${art(emp(p))} ${emp(p)}`}
const packDesc=(o,pp)=>pp>1?`${cap0(emp(o))} de ${pp} ${uni(o,pp)}`:"Suelto";
const recPacks=p=>Math.max(1,Math.ceil(recBuy(p)/ppOf(p)));

/* ================= Datos: base de datos de la página o este navegador ================= */
const CATALOG={"7702001041474":{nombre:"Café molido",marca:"Sello Rojo",categoria:"Despensa",tamano:"500 g"}};
let db=null, users=null, me=null, mode="loading", loaded=false, fresh=false, offline=false, canWrite=true;
let inventory=[], lista=[], analysis=null, compras=[];
const K={p:"cs5-productos",l:"cs5-lista",a:"cs5-analisis",m:"cs5-mirror",c:"cs5-compras"};
/* Colecciones locales (modo demo / sin nube) */
const LOCAL_COL={productos:()=>[inventory,v=>inventory=v,K.p],lista:()=>[lista,v=>lista=v,K.l],compras:()=>[compras,v=>compras=v,K.c]};
const LOCAL_EXAMPLES=()=>[
  {id:"ej1",codigo:"7702511000014",nombre:"Arroz blanco",marca:"Diana",categoria:"Despensa",ubicacion:"Despensa",tamano:"1 kg",cantidad:2,minimo:1,fechaCompra:daysAgo(14),precio:2.5,tienda:"Éxito",foto:svgImg("#dfe8e1","#2f6b4f","ARROZ"),ejemplo:true,historial:[{t:"c",n:3,f:daysAgo(14),p:2.5,s:"Éxito"},{t:"u",n:1,f:daysAgo(6)}]},
  {id:"ej2",codigo:"7702129000013",nombre:"Leche entera",marca:"Alpina",categoria:"Lácteos",ubicacion:"Nevera",tamano:"1 L",cantidad:1,minimo:3,fechaCompra:daysAgo(7),vence:inDays(3),precio:1.2,tienda:"D1",foto:svgImg("#e3e8f0","#3b5b8a","LECHE"),ejemplo:true,historial:[{t:"c",n:6,f:daysAgo(7),p:1.2,s:"D1"},{t:"u",n:5,f:daysAgo(1)}]}
];
const store={
  async set(col,id,body){
    const b=JSON.parse(JSON.stringify(body));delete b.id;b.actualizado=Date.now();
    if(mode==="db")return db.collection(col).doc(id).set(b);
    const [arr,,key]=LOCAL_COL[col]();const i=arr.findIndex(x=>x.id===id);
    if(i>=0)arr[i]={...b,id};else arr.unshift({...b,id});
    LS.set(key,arr);onData();
  },
  async del(col,id){
    if(mode==="db")return db.collection(col).doc(id).delete();
    const [arr,setArr,key]=LOCAL_COL[col]();const nv=arr.filter(x=>x.id!==id);setArr(nv);LS.set(key,nv);
    onData();
  },
  async saveAnalysis(a){analysis=a;if(mode==="db"){try{await db.doc("ajustes/analisis").set(JSON.parse(JSON.stringify(a)))}catch(e){}}else LS.set(K.a,a)}
};
const saveP=p=>store.set("productos",p.id,p);
const writeErr=e=>{if(e&&e.code==="invalid_argument"){canWrite=false;toast("No tienes permiso para cambiar este inventario.");render()}else if(e&&e.code==="quota_exceeded")toast("El inventario está lleno. Borra productos que ya no uses.");else toast("No se pudo guardar. Revisa tu conexión e inténtalo otra vez.")};

(async()=>{await 0;
  try{db=window.claude?await window.claude.use("db"):null}catch(e){db=null}
  try{users=window.claude?await window.claude.use("user"):null}catch(e){users=null}
  if(users){try{me=await users.id()}catch(e){}try{const c=await users.can("data.write");if(c===false)canWrite=false}catch(e){}}
  if(db){
    mode="db";
    const mirror=LS.get(K.m,null);
    if(mirror){inventory=mirror.p||[];lista=mirror.l||[];analysis=mirror.a||null;compras=mirror.c||[];loaded=true;onData()}
    setTimeout(()=>{if(!fresh&&mode==="db"){offline=true;onData()}},8000);
    const fail=()=>{if(!fresh){mode="local";inventory=LS.get(K.p,null)||LOCAL_EXAMPLES();lista=LS.get(K.l,[]);analysis=LS.get(K.a,null);compras=LS.get(K.c,[]);loaded=true;onData()}};
    db.collection("productos").onSnapshot(s=>{inventory=s.docs.map(d=>({...d.data(),id:d.id}));loaded=true;fresh=true;mirrorSave();onData()},fail);
    db.collection("lista").onSnapshot(s=>{lista=s.docs.map(d=>({...d.data(),id:d.id}));mirrorSave();onData()},()=>{});
    db.collection("compras").onSnapshot(s=>{compras=s.docs.map(d=>({...d.data(),id:d.id}));mirrorSave();onData()},()=>{});
    db.doc("ajustes/analisis").onSnapshot(s=>{analysis=s.exists?s.data():null;mirrorSave();if(tab==="ai"&&analysisState!=="busy")render()},()=>{});
  }else{mode="local";inventory=LS.get(K.p,null)||LOCAL_EXAMPLES();lista=LS.get(K.l,[]);analysis=LS.get(K.a,null);compras=LS.get(K.c,[]);loaded=true;fresh=true;onData()}
})();
function mirrorSave(){LS.set(K.m,{p:inventory,l:lista,a:analysis,c:compras})}

/* Nombres de quién compró o usó (familia) */
const names={};
async function fillNames(){
  if(!users)return;const ids=[...new Set([...$$("[data-uid]")].map(e=>e.dataset.uid))].filter(Boolean);if(!ids.length)return;
  try{const ps=await users.profiles(ids);for(const id of ids)names[id]=(ps[id]&&ps[id].name)||""}catch(e){}
  $$("[data-uid]").forEach(e=>{const n=e.dataset.uid===me?"ti":names[e.dataset.uid];e.textContent=n?` · por ${n}`:""});
}

/* ================= IA ================= */
let sample=null, aiState="loading", imgOK=false, toolsOK=false;
(async()=>{await 0;
  try{sample=window.claude?await window.claude.use("sample"):null}catch(e){sample=null}
  aiState=sample?"ready":"off";
  if(sample){try{const l=await sample.limits();imgOK=!!l.images;toolsOK=!!l.tools}catch(e){}}
  refresh();
})();
const AI_ERR={not_granted:"La IA no está disponible ahora. Inténtalo más tarde.",sampling_disabled:"La IA no está configurada. Revisa la llave de la API en Vercel.",rate_limited:"La IA está ocupada. Espera un momento y vuelve a intentarlo.",session_expired:"Tu sesión terminó. Vuelve a iniciar sesión.",image_rejected:"La IA no pudo usar esa foto. Prueba con otra.",refused:"La IA no pudo responder a esto.",invalid_json:"La IA respondió en un formato inesperado. Inténtalo otra vez.",cancelled:""};
const aiMsg=e=>AI_ERR[e?.code]??"Hubo un problema con la IA. Inténtalo otra vez.";
const aiHardOff=e=>["not_granted","sampling_disabled","not_declared","capability_disabled","capability_removed"].includes(e?.code);
function dataURLtoBlob(u){if(!u||!/^data:image\/(jpeg|png|webp)/.test(u))return null;const [h,b]=u.split(",");const bin=atob(b);const a=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);return new Blob([a],{type:h.slice(5,h.indexOf(";"))})}
const productForAI=p=>{const dl=daysLeft(p);return{nombre:p.nombre,marca:p.marca||undefined,tamano:p.tamano||undefined,categoria:p.categoria,dondeSeGuarda:p.ubicacion||undefined,cantidadEnCasa:p.cantidad,unidad:p.unidad||undefined,vieneEn:ppOf(p)>1?packDesc(p,ppOf(p)):undefined,avisarCuandoQueden:p.minimo,
  diasQueAlcanza:dl===null?undefined:Math.round(dl),vence:p.vence||undefined,ultimoPrecio:p.precio??undefined,tienda:p.tienda||undefined,ultimaCompra:p.fechaCompra,
  historial:(p.historial||[]).slice(-15).map(h=>`${h.f}: ${h.t==="c"?"compró":h.t==="u"?"usó":"ajustó"} ${h.n}${h.p!=null?` a ${money(h.p)} c/u`:""}${h.s?` en ${h.s}`:""}`)}};
const inventoryForAI=()=>JSON.stringify(inventory.map(productForAI));
async function classify(list){
  if(aiState!=="ready"||!list.length)return{};
  try{const r=await sample.json(`Clasifica estos productos de una casa. Responde SOLO un objeto JSON {"<nombre exacto>":"<categoría>"} usando solo estas categorías: ${CATS.join(", ")}.\nProductos: ${JSON.stringify(list)}`,{modelTier:"quick"});return r&&typeof r==="object"?r:{}}catch(e){if(aiHardOff(e))aiState="off";return{}}
}

/* ================= Fotos y códigos ================= */
async function loadImg(file){try{return await createImageBitmap(file)}catch(e){}return await new Promise((res,rej)=>{const i=new Image();const u=URL.createObjectURL(file);i.onload=()=>{URL.revokeObjectURL(u);res(i)};i.onerror=rej;i.src=u})}
function resize(img,max){const s=Math.min(1,max/Math.max(img.width,img.height));const c=document.createElement("canvas");c.width=Math.round(img.width*s);c.height=Math.round(img.height*s);c.getContext("2d").drawImage(img,0,0,c.width,c.height);return c}
async function processPhoto(file){const img=await loadImg(file);return{foto:resize(img,360).toDataURL("image/jpeg",.72),blob:await new Promise(r=>resize(img,1100).toBlob(r,"image/jpeg",.85))}}
async function decodeImage(file){
  if("BarcodeDetector" in window){try{const r=await new BarcodeDetector().detect(await createImageBitmap(file));if(r[0])return r[0].rawValue}catch(e){}}
  if(window.ZXing){const url=URL.createObjectURL(file);try{const h=new Map();h.set(ZXing.DecodeHintType.TRY_HARDER,true);const res=await new ZXing.BrowserMultiFormatReader(h).decodeFromImageUrl(url);return res.getText()}catch(e){}finally{URL.revokeObjectURL(url)}}
  return null;
}
async function readLabel(blob){
  return sample.json(`Esta es una foto de un producto comprado para una casa. Lee la etiqueta.
Responde SOLO un objeto JSON con esta forma exacta:
{"nombre":"nombre corto y claro en español, ej. Arroz blanco","marca":"marca o vacío","tamano":"contenido neto, ej. 1 kg o 500 ml, o vacío","categoria":"una de: ${CATS.join(", ")}","codigo":"solo los dígitos del código de barras si se leen completos, si no vacío","vence":"fecha de vencimiento AAAA-MM-DD si se lee en el empaque, si no vacío","esProducto":true}
Si la foto no muestra un producto, pon "esProducto": false y el resto vacío.`,{images:blob,modelTier:"quick"});
}

/* ================= Toast con Deshacer ================= */
let toastUndo=null;
function toast(t,undo){
  const el=$("#toast");el.innerHTML="";const s=document.createElement("span");s.textContent=t;el.append(s);toastUndo=undo||null;
  if(undo){const b=document.createElement("button");b.className="undo";b.textContent="Deshacer";b.onclick=async()=>{el.hidden=true;const f=toastUndo;toastUndo=null;if(f){try{await f();toast("Listo, se deshizo")}catch(e){writeErr(e)}}};el.append(b)}
  else s.style.paddingRight="10px";
  el.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>{el.hidden=true;toastUndo=null},undo?6000:2800);
}

/* ================= Movimientos de inventario ================= */
function applyPurchase(p,{n,f,precio,tienda,vence,pq,pp,cid}){
  const np={...p,cantidad:(p.cantidad||0)+n,fechaCompra:f};
  if(precio!=null)np.precio=precio;
  if(tienda)np.tienda=tienda;
  if(vence)np.vence=(p.vence&&p.cantidad>0&&p.vence<vence)?p.vence:vence;
  const h={t:"c",n,f};if(precio!=null)h.p=precio;if(tienda)h.s=tienda;if(me)h.u=me;if(pq&&pp>1){h.pq=pq;h.pp=pp}if(cid)h.cid=cid;
  np.historial=[...(p.historial||[]),h].slice(-40);
  return np;
}
/* Guarda en el producto cómo viene el paquete de este código */
function setPack(p,{code,pp,empaque,unidad,principal}){
  pp=Math.max(1,Math.round(+pp||1));
  if(code)p.paquetes={...(p.paquetes||{}),[code]:pp};
  if(principal||!p.porPaquete){p.porPaquete=pp;p.empaque=pp>1?(empaque&&empaque!=="Suelto"?empaque:"Paquete"):"Suelto"}
  if(String(unidad||"").trim())p.unidad=String(unidad).trim();
  return p;
}
function applyUse(p,n){
  const np={...p,cantidad:Math.max(0,p.cantidad-n)};
  if(np.cantidad===0)np.vence="";
  const h={t:"u",n,f:today()};if(me)h.u=me;
  np.historial=[...(p.historial||[]),h].slice(-40);
  return np;
}
const newProduct=o=>({id:uid(),codigo:o.codigo||"",nombre:(o.nombre||"").trim(),marca:(o.marca||"").trim(),categoria:o.categoria||"Otros",ubicacion:o.ubicacion||UBI_DE[o.categoria]||"Despensa",tamano:(o.tamano||"").trim(),cantidad:0,minimo:o.minimo??1,fechaCompra:today(),foto:o.foto||"",historial:[],descripcionIA:"",vence:""});
const stores=()=>{const c={};inventory.forEach(p=>(p.historial||[]).forEach(h=>{if(h.s)c[h.s]=(c[h.s]||0)+1}));return Object.entries(c).sort((a,b)=>b[1]-a[1]).map(x=>x[0]).slice(0,5)};

/* ================= Estado de la interfaz ================= */
let tab="add", step=0, draft={}, scanMsg={t:"",err:false}, lastSaved=null, extract={state:"idle",msg:""}, saving=false;
let screen=null, screenTab=null, lote={rows:[],msg:{t:"",err:false}}, review=null, done=null;
let invFilter=null, invQuery="", invUbi="";
let analysisState="idle", analysisErr="";
let sheetId=null, descState={id:null,state:"idle",text:"",err:""}, confirmDel=false, descCtl=null, editing=null;
const reset=()=>{draft={codigo:"",foto:null,blob:null,nombre:"",marca:"",categoria:"Despensa",ubicacion:"Despensa",ubiManual:false,tamano:"",cantidad:1,minimo:1,fechaCompra:today(),precio:"",tienda:"",vence:"",origen:null,porIA:false,empaque:"Suelto",pp:1,unidad:"",existenteId:""};step=0;scanMsg={t:"",err:false};extract={state:"idle",msg:""}};
reset();
const findDup=()=>draft.existenteId?inventory.find(p=>p.id===draft.existenteId):draft.codigo?inventory.find(p=>p.codigo===draft.codigo||(p.paquetes&&p.paquetes[draft.codigo])):inventory.find(p=>!p.codigo&&norm(p.nombre)===norm(draft.nombre)&&norm(p.marca)===norm(draft.marca));
const listaChecked=()=>lista.filter(x=>x.marcado);
const listaNeeded=()=>{const ids=new Set(lista.filter(x=>x.productoId).map(x=>x.productoId));return inventory.filter(p=>needsBuy(p)&&!ids.has(p.id))};

function onData(){
  const m=$("#mode");
  if(mode==="db"&&!fresh){m.textContent=offline?"Sin conexión":"Actualizando…";m.className="mode"+(offline?" off":"")}
  else{m.textContent=mode==="db"?"En la nube":(window.CS_DEMO?"Modo demo":"En este teléfono");m.title=mode==="db"?"Tus datos se guardan en la nube":"";m.className="mode"+(mode==="db"?" on":"")}
  const soon=inventory.filter(useSoon).length;const bi=$("#badge-inv");bi.hidden=!soon;bi.textContent=soon;
  const nl=listaNeeded().length+lista.filter(x=>!x.marcado).length;const bl=$("#badge-list");bl.hidden=!nl;bl.textContent=nl;
  const typing=(tab==="add"&&!screen&&step>0&&step<5)||(screen&&tab===screenTab&&(screen==="lote"||screen==="review"||screen==="facrev"||(screen==="factura"&&typeof fac!=="undefined"&&fac.state==="busy")));
  if(!typing)render();
  if(sheetId&&!editing)renderSheet();
}
function refresh(){if(!(tab==="add"&&!screen&&(step===2||step===3)))render();if(sheetId&&!editing)renderSheet()}
function go(t){tab=t;render();scrollTo(0,0)}
function openScreen(s,t){screen=s;screenTab=t;render();scrollTo(0,0)}
function closeScreen(){screen=null;screenTab=null;render();scrollTo(0,0)}

/* ================= Cabecera de cada pantalla ================= */
function header(){
  const p=$("#progress");
  if(screen&&tab===screenTab){
    const H={lote:["Compra grande","Varios productos seguidos","Escanea uno tras otro. Al final revisas todo junto."],
      review:["Revisión","Revisa tu compra","Ajusta cantidades y, si quieres, el precio de cada uno."],
      factura:["Escanear factura","Tu factura del supermercado","Toma fotos o sube el PDF. La IA lee cada producto y tú revisas antes de guardar."],
      facrev:["Revisión de la factura","¿Está bien lo que leyó la IA?","Corrige lo que haga falta. Nada cambia en tu inventario hasta que toques Guardar."],
      hist:["Historial","Tus compras y gastos","Cada compra guardada, cuánto gastas, dónde y qué subió de precio."]};
    const h=H[screen];if(!h){p.hidden=true;return}
    p.hidden=false;p.innerHTML=`<span class="count">${h[0]}</span><h2>${h[1]}</h2><p class="help">${h[2]}</p>`;return;
  }
  if(tab==="add"&&step<=4){
    const s=STEPS[step];let help=s.help;
    if(step===2&&draft.origen==="inventario")help="Ya tienes este producto. Solo dime cuántos compraste.";
    p.hidden=false;
    p.innerHTML=`<span class="count">Paso ${step+1} de 5</span><h2>${s.q}</h2><p class="help">${help}</p>
      <ol class="dots" aria-hidden="true">${STEPS.map((x,i)=>`<li class="${i<step?"done":i===step?"now":""}">${x.name}</li>`).join("")}</ol>`;
    return;
  }
  const H={inv:["","Lo que hay en casa","Toca la foto de un producto para ver su ficha y la descripción de la IA."],
    list:["","Lista de compras","Marca lo que vas metiendo al carrito. Al terminar, todo se suma a tu inventario."],
    ai:["Asistente con IA","¿Cómo van tus compras?","Tus gastos y lo que la IA recomienda según lo que usas."]};
  const h=H[tab];if(!h){p.hidden=true;return}
  p.hidden=false;p.innerHTML=`${h[0]?`<span class="count" style="color:var(--ai)">${h[0]}</span>`:""}<h2>${h[1]}</h2><p class="help">${h[2]}</p>`;
}

function render(){
  ["add","inv","list","ai"].forEach(t=>$("#tab-"+t).setAttribute("aria-pressed",tab===t));
  header();
  const v=$("#view"), bar=$("#bar");
  if(screen&&tab===screenTab){if(screen==="lote")return renderLote(v,bar);if(screen==="review")return renderReview(v,bar);if(screen==="hecho")return renderDone(v,bar);
    if(screen==="factura")return renderFactura(v,bar);if(screen==="facrev")return renderFacRev(v,bar);if(screen==="hist")return renderHist(v,bar)}
  if(tab==="inv")return renderInv(v,bar);
  if(tab==="list")return renderList(v,bar);
  if(tab==="ai")return renderAI(v,bar);
  renderAdd(v,bar);
}

/* ================= Agregar: un producto (5 pasos) ================= */
function handleCode(raw){
  const code=String(raw||"").replace(/\D/g,"");
  if(code.length<8){scanMsg={t:"Ese número está incompleto. Los códigos de barras tienen entre 8 y 13 números.",err:true};render();return}
  draft.codigo=code;
  const have=inventory.find(p=>p.codigo===code||(p.paquetes&&p.paquetes[code]));
  if(have){Object.assign(draft,{pp:ppOf(have,code),empaque:ppOf(have,code)>1?(have.empaque&&have.empaque!=="Suelto"?have.empaque:"Paquete"):"Suelto",unidad:have.unidad||"",nombre:have.nombre,marca:have.marca,categoria:have.categoria,ubicacion:have.ubicacion||UBI_DE[have.categoria]||"Despensa",ubiManual:true,tamano:have.tamano,minimo:have.minimo,foto:have.foto,tienda:have.tienda||"",origen:"inventario"});step=2}
  else if(CATALOG[code]){Object.assign(draft,CATALOG[code],{ubicacion:UBI_DE[CATALOG[code].categoria]||"Despensa",origen:"catalogo"});step=1}
  else{draft.origen="nuevo";step=1}
  render();scrollTo(0,0);
}
async function readWithAI(){
  if(!draft.blob||aiState!=="ready"||!imgOK)return;
  extract={state:"busy",msg:""};render();
  try{
    const r=await readLabel(draft.blob);
    if(r&&r.esProducto!==false&&r.nombre){
      draft.nombre=String(r.nombre||"");draft.marca=String(r.marca||"");draft.tamano=String(r.tamano||"");
      if(CATS.includes(r.categoria)){draft.categoria=r.categoria;if(!draft.ubiManual)draft.ubicacion=UBI_DE[r.categoria]||"Despensa"}
      const c=String(r.codigo||"").replace(/\D/g,"");if(!draft.codigo&&c.length>=8)draft.codigo=c;
      if(/^\d{4}-\d{2}-\d{2}$/.test(r.vence||"")&&r.vence>=today())draft.vence=r.vence;
      draft.porIA=true;extract={state:"done",msg:""};
    }else extract={state:"err",msg:"No reconocí un producto en la foto. Escribe los datos o prueba con otra foto."};
  }catch(e){if(aiHardOff(e))aiState="off";extract={state:"err",msg:aiMsg(e)}}
  if(tab==="add"&&step===1&&!screen)render();
}
function renderAdd(v,bar){
  if(!canWrite){v.innerHTML=`<section class="card"><div class="notice warn">${icon("alert")}<span>Puedes ver este inventario, pero no cambiarlo. Pide al dueño que te dé permiso de colaborador.</span></div></section>`;bar.innerHTML="";return}
  const canAI=aiState==="ready"&&imgOK;
  if(step===0){
    const known=inventory.find(p=>p.codigo);
    v.innerHTML=`${window.Plataforma&&Plataforma.esIOS&&!Plataforma.instalada?`<div class="notice warn">${icon("alert")}<span><b>Instálala en tu iPhone:</b> toca Compartir en Safari y luego “Añadir a pantalla de inicio”.</span></div>`:""}
    <button class="card big-action" id="gofac"><span class="ico">${icon("receipt")}</span><span><b>Escanear factura</b><span>Toma una foto o sube el PDF de tu compra y la IA agrega todos los productos.</span></span></button>
    <button class="card big-action" id="goasst"><span class="ico" style="background:var(--ai-soft);color:var(--ai)">${icon("mic")}</span><span><b>Díselo a ${esc(Voz.nombre())}</b><span>“Compré 2 leches en el supermercado”, “se acabó el arroz” o “¿cuánta leche queda?”</span></span></button>
    <section class="card">
      <div class="scan">${icon("scan")}<div><div class="big">Toca aquí para escanear</div><div class="sub">Se abre la cámara. También puedes elegir una foto.</div></div>
        <input type="file" id="scanfile" accept="image/*" capture="environment" aria-label="Escanear código de barras"></div>
      <div class="status ${scanMsg.err?"err":""}" id="scanstatus" aria-live="polite">${esc(scanMsg.t)}</div>
      <div class="divider">o escribe los números del código</div>
      <div class="inline"><input type="text" id="manual" class="code" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" inputmode="numeric" placeholder="Ej.: 7702511000014" aria-label="Números del código de barras"><button class="btn sm" id="find">Buscar</button></div>
      <button class="linkbtn" id="nocode">${icon("cam")}Mi producto no tiene código: usar una foto${canAI?" (la IA lee la etiqueta)":""}</button>
    </section>
    <button class="card big-action" id="golote"><span class="ico">${icon("layers")}</span><span><b>¿Volviste del supermercado?</b><span>Registra varios productos seguidos y revísalos todos juntos al final.</span></span></button>
    <section class="card"><div class="field"><span class="lbl">¿Solo quieres probar? <span class="hint">Toca un ejemplo</span></span>
      <div class="chips"><button class="chip try" data-code="7702001041474">Café<small>Producto conocido</small></button><button class="chip try" data-code="7501055300075">Otro<small>Producto nuevo</small></button>${known?`<button class="chip try" data-code="${known.codigo}">${esc(known.nombre)}<small>Ya lo tienes</small></button>`:""}</div></div></section>`;
    $("#scanfile").onchange=async e=>{const f=e.target.files[0];if(!f)return;const st=$("#scanstatus");st.className="status";st.textContent="Leyendo el código…";
      const code=await decodeImage(f);e.target.value="";
      if(code)handleCode(code);else{scanMsg={t:"No se pudo leer. Acerca un poco más la cámara y evita los reflejos, o escribe los números.",err:true};render()}};
    $("#find").onclick=()=>handleCode($("#manual").value);
    $("#manual").onkeydown=e=>{if(e.key==="Enter")handleCode(e.target.value)};
    $$("[data-code]").forEach(b=>b.onclick=()=>handleCode(b.dataset.code));
    $("#nocode").onclick=()=>{draft.origen="sin-codigo";step=1;render()};
    $("#goasst").onclick=()=>openAsst(null,{escuchar:true});
    $("#golote").onclick=()=>{lote={rows:[],msg:{t:"",err:false}};openScreen("lote","add")};
    $("#gofac").onclick=()=>abrirFactura("add");
    bar.innerHTML=`<button class="btn primary" id="scanbtn">${icon("scan")}Escanear código</button>`;
    $("#scanbtn").onclick=()=>$("#scanfile").click();
  }

  if(step===1){
    let head="";
    if(extract.state==="busy")head=`<div class="notice ai"><div class="thinking"><i></i><i></i><i></i></div><span>La IA está leyendo la etiqueta…</span></div>`;
    else if(extract.state==="err")head=`<div class="notice warn">${icon("alert")}<span>${esc(extract.msg)}</span></div>`;
    else if(draft.porIA)head=`<div class="notice ai">${icon("spark")}<span>La IA llenó estos datos con la foto. Revisa que estén bien.</span></div>`;
    else if(draft.origen==="catalogo")head=`<div class="notice ok">${icon("check")}<span>Encontramos este producto por su código. Revisa que esté bien.</span></div>`;
    else if(draft.origen==="nuevo")head=`<div class="notice ok">${icon("check")}<span>Es la primera vez que registras este producto. ${canAI?"Toma una foto de la etiqueta y la IA llena los datos.":"Escribe sus datos una vez y la próxima vez aparecerán solos."}</span></div>`;
    else if(canAI)head=`<div class="notice ai">${icon("spark")}<span>Toma una foto de la etiqueta y la IA llena los datos por ti.</span></div>`;
    v.innerHTML=`<section class="card">${head}
      <label class="photo">${draft.foto?`<img src="${draft.foto}" alt="">`:`<span class="ph">${icon("cam")}</span>`}
        <span><b>${draft.foto?"Cambiar foto":"Tomar foto del producto"}</b><span>${canAI?"La IA lee la etiqueta":"Te ayuda a reconocerlo en la lista"}</span></span>
        <input type="file" id="photo" accept="image/*" capture="environment" aria-label="Foto del producto"></label>
      ${draft.blob&&canAI&&extract.state!=="busy"?`<button class="linkbtn ai" id="reread">${icon("spark")}Volver a leer la foto con IA</button>`:""}
      <div class="field"><label for="nombre">Nombre del producto</label><input type="text" id="nombre" value="${esc(draft.nombre)}" placeholder="Ej.: Arroz blanco"></div>
      <div class="row"><div class="field"><label for="marca">Marca <span class="hint">(opcional)</span></label><input type="text" id="marca" value="${esc(draft.marca)}" placeholder="Ej.: Diana"></div>
      <div class="field"><label for="tamano">Tamaño <span class="hint">(opcional)</span></label><input type="text" id="tamano" value="${esc(draft.tamano)}" placeholder="Ej.: 1 kg"></div></div>
      <div class="field"><span class="lbl">¿Qué tipo de producto es?</span>
        <div class="chips">${CATS.map(c=>`<button class="chip sm" aria-pressed="${c===draft.categoria}" data-cat="${esc(c)}">${c}</button>`).join("")}</div></div>
      <div class="field"><span class="lbl">¿Dónde lo guardas?</span>
        <div class="chips">${UBIS.map(c=>`<button class="chip sm" aria-pressed="${c===draft.ubicacion}" data-ubi="${esc(c)}">${c}</button>`).join("")}</div></div>
      <div class="field"><span class="lbl">¿Cómo viene?</span>
        <div class="chips">${EMPAQUES.map(c=>`<button class="chip sm" aria-pressed="${c===draft.empaque}" data-emp="${c}">${c}</button>`).join("")}</div>
        ${draft.empaque!=="Suelto"?`<span class="lbl" style="margin-top:4px">¿Cuántas unidades trae ${art(emp(draft))} ${esc(emp(draft))}?</span>
        <div class="chips">${[2,4,6,8,10,12,18,20,24,30].map(n=>`<button class="chip sm" data-pp="${n}" aria-pressed="${n===draft.pp}">${n}</button>`).join("")}</div>
        <div class="row"><div class="field"><label for="ppn" class="hint">Otro número</label><input type="text" id="ppn" inputmode="numeric" value="${draft.pp>1?draft.pp:""}" placeholder="Ej.: 36"></div>
        <div class="field"><label for="uni" class="hint">¿Cómo llamas a cada uno? (opcional)</label><input type="text" id="uni" value="${esc(draft.unidad)}" placeholder="Ej.: huevo"></div></div>
        <p class="hint" style="margin:0">En el inventario se cuentan ${esc(uni(draft,2))} sueltos: “Usé 1” descuenta uno.</p>`:""}</div>
      ${draft.origen==="nuevo"&&draft.codigo&&inventory.length?`<div class="field"><label for="exis">¿Es otro tamaño de algo que ya tienes? <span class="hint">(opcional)</span></label>
        <select id="exis"><option value="">No, es un producto nuevo</option>${[...inventory].sort((a,b)=>a.nombre.localeCompare(b.nombre)).map(x=>`<option value="${x.id}" ${x.id===draft.existenteId?"selected":""}>${esc(x.nombre)}${x.marca?" · "+esc(x.marca):""}</option>`).join("")}</select>
        ${draft.existenteId?`<span class="hint">Este código se guardará en ese producto y lo que compres se sumará ahí.</span>`:""}</div>`:""}
      <div class="field"><label for="codigo">Código de barras <span class="hint">(opcional)</span></label><input type="text" id="codigo" class="code" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" inputmode="numeric" value="${esc(draft.codigo)}" placeholder="Sin código"></div>
    </section>`;
    $("#photo").onchange=async e=>{const f=e.target.files[0];if(!f)return;
      try{const r=await processPhoto(f);draft.foto=r.foto;draft.blob=r.blob}catch(err){toast("No se pudo abrir esa foto. Prueba con otra.");return}
      render();if(canAI&&draft.origen!=="catalogo")readWithAI()};
    if($("#reread"))$("#reread").onclick=readWithAI;
    ["nombre","marca","tamano"].forEach(k=>$("#"+k).oninput=e=>{draft[k]=e.target.value;$("#next").disabled=!draft.nombre.trim()});
    $$("[data-cat]").forEach(b=>b.onclick=()=>{draft.categoria=b.dataset.cat;$$("[data-cat]").forEach(x=>x.setAttribute("aria-pressed",x===b));
      if(!draft.ubiManual){draft.ubicacion=UBI_DE[draft.categoria]||"Despensa";$$("[data-ubi]").forEach(x=>x.setAttribute("aria-pressed",x.dataset.ubi===draft.ubicacion))}});
    $$("[data-ubi]").forEach(b=>b.onclick=()=>{draft.ubicacion=b.dataset.ubi;draft.ubiManual=true;$$("[data-ubi]").forEach(x=>x.setAttribute("aria-pressed",x===b))});
    $("#codigo").oninput=e=>draft.codigo=e.target.value.replace(/\D/g,"");
    $$("[data-emp]").forEach(b=>b.onclick=()=>{draft.empaque=b.dataset.emp;if(draft.empaque==="Suelto")draft.pp=1;render()});
    $$("[data-pp]").forEach(b=>b.onclick=()=>{draft.pp=+b.dataset.pp;$("#ppn").value=draft.pp;$$("[data-pp]").forEach(x=>x.setAttribute("aria-pressed",x===b))});
    if($("#ppn"))$("#ppn").oninput=e=>{const n=parseInt(e.target.value.replace(/\D/g,""));draft.pp=n>0?n:1;$$("[data-pp]").forEach(x=>x.setAttribute("aria-pressed",+x.dataset.pp===draft.pp))};
    if($("#uni"))$("#uni").oninput=e=>draft.unidad=e.target.value;
    if($("#exis"))$("#exis").onchange=e=>{draft.existenteId=e.target.value;const x=inventory.find(y=>y.id===draft.existenteId);
      if(x)Object.assign(draft,{nombre:x.nombre,marca:x.marca||"",categoria:x.categoria,ubicacion:x.ubicacion||"Despensa",ubiManual:true,unidad:draft.unidad||x.unidad||""});render()};
    bar.innerHTML=`<button class="btn" id="back">${icon("back")}Atrás</button><button class="btn primary" id="next" ${draft.nombre.trim()?"":"disabled"}>Siguiente${icon("arrow")}</button>`;
  }

  if(step===2){
    const d=findDup();const st=stores();const pp=Math.max(1,draft.pp||1);const eq=n=>`= ${n*pp} ${uni(draft,n*pp)}`;
    v.innerHTML=`<section class="card">
      ${d?`<div class="notice warn">${icon("alert")}<span>En casa ya hay <b>${d.unidad?qtyTxt(d):plural(d.cantidad,"unidad","unidades")}</b> de ${esc(d.nombre)}. Lo que agregues se suma.</span></div>`:""}
      ${pp>1?`<span class="lbl" style="text-align:center;justify-content:center">¿Cuántos ${esc(plu(emp(draft)))} de ${pp}?</span>`:""}
      <div class="stepper"><button id="qm" aria-label="Quitar uno">−</button><output id="qv" aria-live="polite">${draft.cantidad}</output><button id="qp" aria-label="Agregar uno">+</button></div>
      ${pp>1?`<p class="hint" id="qeq" style="text-align:center;margin:0">${eq(draft.cantidad)}</p>`:""}
      <div class="field"><span class="lbl">¿Cuándo los compraste?</span>
        <div class="chips">${[["Hoy",0],["Ayer",1],["Hace una semana",7]].map(([l,n])=>`<button class="chip" data-d="${n}" aria-pressed="${draft.fechaCompra===daysAgo(n)}">${l}</button>`).join("")}</div>
        <label for="fecha" class="hint">Otra fecha</label><input type="date" id="fecha" value="${draft.fechaCompra}" max="${today()}"></div>
      <div class="field"><label for="precio">${pp>1?`¿Cuánto costó cada ${esc(emp(draft))}?`:"¿Cuánto costó cada uno?"} <span class="hint">(opcional)</span></label>
        <input type="text" id="precio" class="money" autocomplete="off" autocorrect="off" spellcheck="false" inputmode="decimal" value="${esc(draft.precio)}" placeholder="${d&&d.precio!=null?"La última vez: "+money(d.precio*pp):"Ej.: 2.50"}"></div>
      <div class="field"><label for="tienda">¿Dónde lo compraste? <span class="hint">(opcional)</span></label>
        <input type="text" id="tienda" value="${esc(draft.tienda)}" placeholder="Ej.: supermercado del barrio">
        ${st.length?`<div class="chips">${st.map(s=>`<button class="chip sm" data-st="${esc(s)}" aria-pressed="${s===draft.tienda}">${esc(s)}</button>`).join("")}</div>`:""}</div>
    </section>`;
    const setQ=n=>{draft.cantidad=Math.max(1,n);$("#qv").textContent=draft.cantidad;if($("#qeq"))$("#qeq").textContent=eq(draft.cantidad)};
    $("#qm").onclick=()=>setQ(draft.cantidad-1);$("#qp").onclick=()=>setQ(draft.cantidad+1);
    const syncD=()=>$$("[data-d]").forEach(x=>x.setAttribute("aria-pressed",draft.fechaCompra===daysAgo(+x.dataset.d)));
    $("#fecha").oninput=e=>{if(e.target.value)draft.fechaCompra=e.target.value;syncD()};
    $$("[data-d]").forEach(b=>b.onclick=()=>{draft.fechaCompra=daysAgo(+b.dataset.d);$("#fecha").value=draft.fechaCompra;syncD()});
    $("#precio").oninput=e=>draft.precio=e.target.value;
    $("#tienda").oninput=e=>{draft.tienda=e.target.value;$$("[data-st]").forEach(x=>x.setAttribute("aria-pressed",x.dataset.st===draft.tienda))};
    $$("[data-st]").forEach(b=>b.onclick=()=>{draft.tienda=b.dataset.st;$("#tienda").value=draft.tienda;$$("[data-st]").forEach(x=>x.setAttribute("aria-pressed",x===b))});
    bar.innerHTML=`<button class="btn" id="back">${icon("back")}Atrás</button><button class="btn primary" id="next">Siguiente${icon("arrow")}</button>`;
  }

  if(step===3){
    const d=findDup();const sm=d?sugMin(d):null;const pp=Math.max(1,draft.pp||1);
    const MINS=pp>1?[...new Set([0,1,Math.ceil(pp/4),Math.ceil(pp/2),pp])].sort((a,b)=>a-b):[0,1,2,3,4,5];
    const VC=[["No vence",""],["En 1 semana",inDays(7)],["En 1 mes",inDays(30)],["En 3 meses",inDays(90)]];
    v.innerHTML=`<section class="card">
      <div class="field"><span class="lbl">¿Cuándo vence? <span class="hint">(mira la fecha en el empaque)</span></span>
        <div class="chips">${VC.map(([l,dd])=>`<button class="chip" data-v="${dd}" aria-pressed="${draft.vence===dd}">${l}</button>`).join("")}</div>
        <label for="vence" class="hint">Fecha exacta</label><input type="date" id="vence" value="${draft.vence}" min="${today()}"></div>
      <div class="field"><span class="lbl">Avísame cuando queden <span class="hint">(${pp>1?esc(uni(draft,2))+" sueltos":"para tu lista de compras"})</span></span>
        <div class="chips">${MINS.map(n=>`<button class="chip" data-m="${n}" aria-pressed="${n===draft.minimo}">${n===0?"Ninguno":pp>1&&n===pp?`${n} (${art(emp(draft))} ${esc(emp(draft))})`:n}</button>`).join("")}</div>
        ${sm!==null?`<div class="notice ok">${icon("bulb")}<span>Según lo que usas, te sugerimos que te avise cuando queden <b>${sm}</b>. <button class="linkbtn" id="usesm" style="display:inline-flex;min-height:0;padding:0">Usar ${sm}</button></span></div>`:""}</div>
    </section>`;
    const syncV=()=>$$("[data-v]").forEach(x=>x.setAttribute("aria-pressed",x.dataset.v===draft.vence));
    $$("[data-v]").forEach(b=>b.onclick=()=>{draft.vence=b.dataset.v;$("#vence").value=draft.vence;syncV()});
    $("#vence").oninput=e=>{draft.vence=e.target.value;syncV()};
    const syncM=()=>$$("[data-m]").forEach(x=>x.setAttribute("aria-pressed",+x.dataset.m===draft.minimo));
    $$("[data-m]").forEach(b=>b.onclick=()=>{draft.minimo=+b.dataset.m;syncM()});
    if($("#usesm"))$("#usesm").onclick=()=>{draft.minimo=Math.min(sm,99);if(sm>5)toast(`Te avisaremos cuando queden ${sm}`);syncM()};
    bar.innerHTML=`<button class="btn" id="back">${icon("back")}Atrás</button><button class="btn primary" id="next">Revisar${icon("arrow")}</button>`;
  }

  if(step===4){
    const d=findDup();const pp=Math.max(1,draft.pp||1);const units=draft.cantidad*pp;const total=(d?d.cantidad:0)+units;const pr=parseMoney(draft.precio);const uo=d&&d.unidad?d:draft;
    v.innerHTML=`<section class="card">
      <div class="confirm-head"><img src="${draft.foto||NO_PHOTO}" alt=""><div><h3>${esc(draft.nombre)}</h3><div class="lead">${esc([draft.marca,draft.tamano].filter(Boolean).join(" · ")||draft.categoria)}</div></div></div>
      <p class="sentence">Vas a agregar <b>${pp>1?`${draft.cantidad} ${esc(empN(draft,draft.cantidad))} (${units} ${esc(uni(uo,units))})`:plural(draft.cantidad,"unidad","unidades")}</b> compradas <b>${fmtDate(draft.fechaCompra)}</b>${pr!=null?` por <b>${money(pr*draft.cantidad)}</b>`:""}. ${d?`Tenías ${d.cantidad}, así que tendrás <b>${total}</b>.`:`Tendrás <b>${total}</b> en casa.`}</p>
      <dl class="sum">
        <div><dt>Tipo</dt><dd>${esc(draft.categoria)}</dd><button data-go="1">Cambiar</button></div>
        <div><dt>Dónde se guarda</dt><dd>${esc(draft.ubicacion)}</dd><button data-go="1">Cambiar</button></div>
        <div><dt>Cómo viene</dt><dd>${esc(packDesc(draft,pp))}</dd><button data-go="1">Cambiar</button></div>
        <div><dt>Cantidad</dt><dd>${pp>1?`${draft.cantidad} × ${pp} = ${units}`:draft.cantidad}</dd><button data-go="2">Cambiar</button></div>
        <div><dt>Fecha de compra</dt><dd>${fmtDate(draft.fechaCompra)}</dd><button data-go="2">Cambiar</button></div>
        <div><dt>${pp>1?`Precio por ${esc(emp(draft))}`:"Precio por unidad"}</dt><dd>${pr!=null?money(pr)+(pp>1?` <span class="hint">(${money(pr/pp)} c/u)</span>`:""):"Sin precio"}</dd><button data-go="2">Cambiar</button></div>
        ${draft.tienda?`<div><dt>Tienda</dt><dd>${esc(draft.tienda)}</dd><button data-go="2">Cambiar</button></div>`:""}
        <div><dt>Vence</dt><dd>${draft.vence?fmtDate(draft.vence):"No vence"}</dd><button data-go="3">Cambiar</button></div>
        <div><dt>Avisar cuando queden</dt><dd>${draft.minimo===0?"No avisar":draft.minimo+(pp>1?" "+esc(uni(uo,draft.minimo)):"")}</dd><button data-go="3">Cambiar</button></div>
        <div><dt>Código</dt><dd class="mono">${esc(draft.codigo)||"Sin código"}</dd><button data-go="1">Cambiar</button></div>
      </dl>
      ${d?`<div class="notice warn">${icon("alert")}<span><b>Ya tenías este producto.</b> No se crea uno nuevo; se suma al que ya está.</span></div>`:""}
    </section>`;
    $$("[data-go]").forEach(b=>b.onclick=()=>{step=+b.dataset.go;render();scrollTo(0,0)});
    bar.innerHTML=`<button class="btn" id="back">${icon("back")}Atrás</button><button class="btn primary" id="save" ${saving?"disabled":""}>${icon("check")}${saving?"Guardando…":"Guardar"}</button>`;
    $("#save").onclick=saveOne;
  }

  if(step===5){
    const p=inventory.find(x=>x.id===lastSaved)||{cantidad:0,nombre:"",minimo:0,historial:[]};const [s]=status(p);const dl=dlText(p);
    v.innerHTML=`<section class="card done-card" aria-live="polite">
      <div class="ring">${icon("check")}</div><h2>¡Listo, guardado!</h2>
      <p class="summary-line">Ahora tienes <b>${p.unidad?esc(qtyTxt(p)):p.cantidad}</b>${p.unidad?"":` de ${esc(p.nombre)}`}${enPaq(p)?` <span class="hint">(${esc(enPaq(p))})</span>`:""}.${dl?`<br><span class="hint">${dl}.</span>`:""}</p>
      ${s!=="ok"?`<div class="notice warn">${icon("cart")}<span>Sigue en tu lista de compras porque ${s==="out"?"se acabó":"queda poco"}.</span></div>`:""}
    </section>`;
    bar.innerHTML=`<button class="btn" id="see">${icon("box")}Ver inventario</button><button class="btn primary" id="again">${icon("scan")}Agregar otro</button>`;
    $("#see").onclick=()=>{reset();go("inv")};
    $("#again").onclick=()=>{reset();render()};
  }

  const n=$("#next"),b=$("#back");
  if(n)n.onclick=()=>{step++;render();scrollTo(0,0)};
  if(b)b.onclick=()=>{step=(step===2&&draft.origen==="inventario")?0:step-1;if(step===0)reset();render();scrollTo(0,0)};
}
async function saveOne(){
  if(saving)return;saving=true;render();
  const d=findDup();const pp=Math.max(1,draft.pp||1);const precioPaq=parseMoney(draft.precio);const precio=precioPaq!=null?Math.round(precioPaq/pp*10000)/10000:null;
  const base=d?{...d}:newProduct(draft);
  Object.assign(base,{nombre:draft.nombre.trim(),marca:draft.marca.trim(),categoria:draft.categoria,ubicacion:draft.ubicacion,tamano:draft.tamano.trim()||base.tamano||"",minimo:draft.minimo,foto:draft.foto||base.foto||"",codigo:base.codigo||draft.codigo});
  setPack(base,{code:draft.codigo,pp,empaque:draft.empaque,unidad:draft.unidad,principal:!d||base.codigo===draft.codigo});
  const p=applyPurchase(base,{n:draft.cantidad*pp,f:draft.fechaCompra,precio,tienda:draft.tienda.trim(),vence:draft.vence,pq:draft.cantidad,pp});
  try{await saveP(p);lastSaved=p.id;if(mode==="db"&&!inventory.find(x=>x.id===p.id))inventory.unshift(p);step=5}catch(e){writeErr(e)}
  saving=false;render();scrollTo(0,0);
}

/* ================= Compra grande (varios seguidos) ================= */
function loteAdd(code){
  code=String(code||"").replace(/\D/g,"");
  if(code.length<8){lote.msg={t:"Ese número está incompleto. Los códigos tienen entre 8 y 13 números.",err:true};render();return}
  const ex=lote.rows.find(r=>r.codigo===code);
  if(ex){ex.cantidad++;lote.msg={t:`${ex.nombre||"Producto"}: ahora llevas ${ex.cantidad}`,err:false};render();return}
  const have=inventory.find(p=>p.codigo===code||(p.paquetes&&p.paquetes[code]));
  if(have)lote.rows.unshift({key:uid(),productoId:have.id,codigo:code,nombre:have.nombre,foto:have.foto,cantidad:1,precio:"",pp:ppOf(have,code),empaque:have.empaque,unidad:have.unidad});
  else if(CATALOG[code])lote.rows.unshift({key:uid(),codigo:code,...CATALOG[code],cantidad:1,precio:"",pp:1});
  else lote.rows.unshift({key:uid(),codigo:code,nombre:"",cantidad:1,precio:"",nuevo:true,pp:1});
  lote.msg={t:have?`${have.nombre} agregado`:CATALOG[code]?`${CATALOG[code].nombre} agregado`:"Producto nuevo: escribe su nombre o tómale una foto",err:false};
  render();
}
function renderLote(v,bar){
  const canAI=aiState==="ready"&&imgOK;
  const rows=lote.rows;
  v.innerHTML=`<section class="card">
    <div class="scan sm">${icon("scan")}<div><div class="big">Escanear siguiente</div><div class="sub">${plural(rows.length,"producto")} en esta compra</div></div>
      <input type="file" id="lscan" accept="image/*" capture="environment" aria-label="Escanear siguiente código"></div>
    <div class="status ${lote.msg.err?"err":""}" id="lstatus" aria-live="polite">${esc(lote.msg.t)}</div>
    <div class="inline"><input type="text" id="lman" class="code" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" inputmode="numeric" placeholder="O escribe el código" aria-label="Código de barras"><button class="btn sm" id="ladd">Agregar</button></div>
    <button class="linkbtn" id="lnocode">${icon("plus")}Agregar un producto sin código</button>
  </section>
  ${rows.length?`<div class="inv">${rows.map(r=>`<div class="line" data-k="${r.key}">
      <div class="top">${r.nuevo?`<input type="text" class="lname" data-k="${r.key}" value="${esc(r.nombre)}" placeholder="¿Qué producto es?" aria-label="Nombre del producto">`:`<span class="nm">${esc(r.nombre)}${r.nuevo?` <span class="pill">Nuevo</span>`:""}</span>`}
        <button class="xbtn" data-rm="${r.key}" aria-label="Quitar">${icon("close")}</button></div>
      <div class="ctrls"><div class="stepper sm"><button data-q="-1" data-k="${r.key}" aria-label="Quitar uno">−</button><output>${r.cantidad}</output><button data-q="1" data-k="${r.key}" aria-label="Agregar uno">+</button></div>
        ${r.nuevo?`<label class="hint" style="display:flex;align-items:center;gap:6px">Cada uno trae<input type="text" inputmode="numeric" data-lpp="${r.key}" value="${r.pp>1?r.pp:""}" placeholder="1" aria-label="Unidades por paquete" style="width:4.2em;min-height:40px;padding:6px 10px"></label>`:r.pp>1?`<span class="hint">${esc(empN(r,r.cantidad))} de ${r.pp}</span>`:""}
        ${r.nuevo&&canAI?`<label class="minicam">${icon("cam")}${r.leyendo?"Leyendo…":"Leer con foto"}<input type="file" accept="image/*" capture="environment" data-cam="${r.key}" aria-label="Foto de la etiqueta"></label>`:""}</div>
    </div>`).join("")}</div>`:`<p class="empty">Todavía no has escaneado nada.</p>`}`;
  $("#lscan").onchange=async e=>{const f=e.target.files[0];if(!f)return;$("#lstatus").className="status";$("#lstatus").textContent="Leyendo el código…";
    const c=await decodeImage(f);e.target.value="";if(c)loteAdd(c);else{lote.msg={t:"No se pudo leer el código. Prueba otra vez o escríbelo.",err:true};render()}};
  $("#ladd").onclick=()=>loteAdd($("#lman").value);
  $("#lman").onkeydown=e=>{if(e.key==="Enter")loteAdd(e.target.value)};
  $("#lnocode").onclick=()=>{lote.rows.unshift({key:uid(),codigo:"",nombre:"",cantidad:1,precio:"",nuevo:true});lote.msg={t:"",err:false};render();setTimeout(()=>$(".lname")?.focus(),30)};
  $$(".lname").forEach(i=>{i.oninput=e=>{const r=rows.find(x=>x.key===i.dataset.k);if(r)r.nombre=e.target.value;syncLoteBar()};i.onblur=()=>{const r=rows.find(x=>x.key===i.dataset.k);if(r&&r.nombre.trim()){const dup=inventory.find(p=>norm(p.nombre)===norm(r.nombre));if(dup){r.productoId=dup.id;r.nuevo=false;r.nombre=dup.nombre;render()}}}});
  $$("[data-rm]").forEach(b=>b.onclick=()=>{lote.rows=rows.filter(x=>x.key!==b.dataset.rm);render()});
  $$("[data-q]").forEach(b=>b.onclick=()=>{const r=rows.find(x=>x.key===b.dataset.k);if(!r)return;r.cantidad=Math.max(1,r.cantidad+(+b.dataset.q));b.parentElement.querySelector("output").textContent=r.cantidad});
  $$("[data-lpp]").forEach(i=>i.oninput=e=>{const r=rows.find(x=>x.key===i.dataset.lpp);if(!r)return;const n=parseInt(e.target.value.replace(/\D/g,""));r.pp=n>0?n:1;if(r.pp>1&&(!r.empaque||r.empaque==="Suelto"))r.empaque="Paquete"});
  $$("[data-cam]").forEach(i=>i.onchange=async e=>{const f=e.target.files[0];const r=rows.find(x=>x.key===i.dataset.cam);if(!f||!r)return;
    try{const ph=await processPhoto(f);r.foto=ph.foto;r.leyendo=true;render();const res=await readLabel(ph.blob);
      if(res&&res.esProducto!==false&&res.nombre){Object.assign(r,{nombre:String(res.nombre),marca:String(res.marca||""),tamano:String(res.tamano||"")});if(CATS.includes(res.categoria))r.categoria=res.categoria;if(/^\d{4}-\d{2}-\d{2}$/.test(res.vence||"")&&res.vence>=today())r.vence=res.vence}
      else toast("No reconocí el producto. Escribe su nombre.")}catch(err){if(aiHardOff(err))aiState="off";toast(aiMsg(err)||"No se pudo leer la foto")}
    r.leyendo=false;render()});
  bar.innerHTML=`<button class="btn" id="lback">${icon("back")}Salir</button><button class="btn primary" id="lrev">Revisar compra${icon("arrow")}</button>`;
  $("#lback").onclick=()=>{if(rows.length&&!$("#lback").dataset.c){$("#lback").dataset.c="1";$("#lback").innerHTML="¿Salir sin guardar?";return}closeScreen()};
  $("#lrev").onclick=()=>{review={origen:"lote",rows:rows.map(r=>({...r})),tienda:"",fecha:today()};openScreen("review","add")};
  syncLoteBar();
}
function syncLoteBar(){const b=$("#lrev");if(!b)return;const rows=lote.rows;b.disabled=!rows.length||rows.some(r=>!String(r.nombre||"").trim())}

/* ================= Revisión de compra (lote o lista) ================= */
function reviewTotal(){let t=0,any=false;review.rows.forEach(r=>{const p=parseMoney(r.precio);if(p!=null){t+=p*r.cantidad;any=true}});return any?t:null}
function renderReview(v,bar){
  const st=stores();const tot=reviewTotal();
  v.innerHTML=`<section class="card">
      <div class="field"><label for="rtienda">¿Dónde compraste? <span class="hint">(opcional)</span></label><input type="text" id="rtienda" value="${esc(review.tienda)}" placeholder="Ej.: supermercado del barrio">
        ${st.length?`<div class="chips">${st.map(s=>`<button class="chip sm" data-st="${esc(s)}" aria-pressed="${s===review.tienda}">${esc(s)}</button>`).join("")}</div>`:""}</div>
      <div class="field"><span class="lbl">¿Cuándo?</span><div class="chips">${[["Hoy",0],["Ayer",1]].map(([l,n])=>`<button class="chip sm" data-d="${n}" aria-pressed="${review.fecha===daysAgo(n)}">${l}</button>`).join("")}</div></div>
    </section>
    <div class="inv">${review.rows.map(r=>{const p=r.productoId&&inventory.find(x=>x.id===r.productoId);return `<div class="line">
      <div class="top"><span class="nm">${esc(r.nombre)}${!r.productoId?` <span class="pill">Nuevo</span>`:""}</span><button class="xbtn" data-rm="${r.key}" aria-label="Quitar">${icon("close")}</button></div>
      <div class="ctrls"><div class="stepper sm"><button data-q="-1" data-k="${r.key}" aria-label="Quitar uno">−</button><output>${r.cantidad}</output><button data-q="1" data-k="${r.key}" aria-label="Agregar uno">+</button></div>
        <div class="price"><span class="hint">$ c/${(r.pp||1)>1?esc(emp(r.empaque?r:p||r)):"u"}</span><input type="text" class="money" autocomplete="off" autocorrect="off" spellcheck="false" inputmode="decimal" data-pr="${r.key}" value="${esc(r.precio)}" placeholder="${p&&p.precio!=null?money(p.precio*(r.pp||1)):"Precio"}" aria-label="Precio de ${esc(r.nombre)}"></div></div>
      ${(r.pp||1)>1?`<span class="hint" data-eq="${r.key}">${r.cantidad} ${esc(empN(r.empaque?r:p||r,r.cantidad))} de ${r.pp} = ${r.cantidad*r.pp} ${esc(uni(p&&p.unidad?p:r,r.cantidad*r.pp))}</span>`:""}
    </div>`}).join("")}</div>
    <section class="card"><div class="total"><span>Total</span><b id="rtotal">${tot!=null?money(tot):"—"}</b></div>
      <p class="hint" style="margin:0">El precio es opcional. Con precios, el asistente te muestra cuánto gastas y dónde sale más barato.</p></section>`;
  $("#rtienda").oninput=e=>{review.tienda=e.target.value;$$("[data-st]").forEach(x=>x.setAttribute("aria-pressed",x.dataset.st===review.tienda))};
  $$("[data-st]").forEach(b=>b.onclick=()=>{review.tienda=b.dataset.st;$("#rtienda").value=review.tienda;$$("[data-st]").forEach(x=>x.setAttribute("aria-pressed",x===b))});
  $$("[data-d]").forEach(b=>b.onclick=()=>{review.fecha=daysAgo(+b.dataset.d);$$("[data-d]").forEach(x=>x.setAttribute("aria-pressed",x===b))});
  $$("[data-rm]").forEach(b=>b.onclick=()=>{review.rows=review.rows.filter(x=>x.key!==b.dataset.rm);render()});
  const upTot=()=>{const t=reviewTotal();$("#rtotal").textContent=t!=null?money(t):"—"};
  $$("[data-q]").forEach(b=>b.onclick=()=>{const r=review.rows.find(x=>x.key===b.dataset.k);if(!r)return;r.cantidad=Math.max(1,r.cantidad+(+b.dataset.q));b.parentElement.querySelector("output").textContent=r.cantidad;upTot();if((r.pp||1)>1)render()});
  $$("[data-pr]").forEach(i=>i.oninput=e=>{const r=review.rows.find(x=>x.key===i.dataset.pr);if(r)r.precio=e.target.value;upTot()});
  bar.innerHTML=`<button class="btn" id="rback">${icon("back")}Atrás</button><button class="btn primary" id="rsave" ${saving||!review.rows.length?"disabled":""}>${icon("check")}${saving?"Guardando…":`Guardar ${plural(review.rows.reduce((a,r)=>a+r.cantidad,0),"producto")}`}</button>`;
  $("#rback").onclick=()=>{if(review.origen==="lote"){lote.rows=review.rows.map(r=>({...r}));screen="lote";render()}else closeScreen()};
  $("#rsave").onclick=saveReview;
}
async function saveReview(){
  if(saving)return;saving=true;render();
  const tienda=review.tienda.trim(),f=review.fecha;
  const nuevos=review.rows.filter(r=>!r.productoId&&!r.categoria).map(r=>r.nombre.trim());
  const cats=nuevos.length?await classify(nuevos):{};
  const writes=[];let total=0,count=0;const cid=compraId();const items=[];
  for(const r of review.rows){
    const pp=Math.max(1,r.pp||1);const precioPaq=parseMoney(r.precio);if(precioPaq!=null)total+=precioPaq*r.cantidad;count+=r.cantidad;
    const precio=precioPaq!=null?Math.round(precioPaq/pp*10000)/10000:null;
    let base=r.productoId&&inventory.find(x=>x.id===r.productoId);
    if(!base){const dup=r.codigo?inventory.find(p=>p.codigo===r.codigo||(p.paquetes&&p.paquetes[r.codigo])):inventory.find(p=>norm(p.nombre)===norm(r.nombre));base=dup||null}
    let nuevo=false;
    if(!base){const cat=r.categoria||(CATS.includes(cats[r.nombre.trim()])?cats[r.nombre.trim()]:"Otros");base=newProduct({...r,categoria:cat});nuevo=true}
    else base={...base,foto:base.foto||r.foto||""};
    if(nuevo||(r.codigo&&!(base.paquetes&&base.paquetes[r.codigo])&&pp>1))setPack(base,{code:r.codigo,pp,empaque:r.empaque,unidad:r.unidad,principal:nuevo});
    writes.push(saveP(applyPurchase(base,{n:r.cantidad*pp,f,precio,tienda,vence:r.vence||"",pq:r.cantidad,pp,cid})));
    items.push({productoId:base.id,nombre:base.nombre,cantidad:r.cantidad,unidades:r.cantidad*pp,precioUnitario:precioPaq,total:precioPaq!=null?Math.round(precioPaq*r.cantidad*100)/100:null});
    if(r.listaId)writes.push(store.del("lista",r.listaId));
  }
  writes.push(guardarCompra(cid,{fecha:f,tienda,origen:review.origen,items,total:total?Math.round(total*100)/100:null}));
  try{await Promise.all(writes);done={count,total:total||null,origen:review.origen,compraId:cid};screen="hecho";review=null;if(screenTab==="add")lote={rows:[],msg:{t:"",err:false}}}
  catch(e){writeErr(e)}
  saving=false;render();scrollTo(0,0);
}
function renderDone(v,bar){
  v.innerHTML=`<section class="card done-card" aria-live="polite"><div class="ring">${icon("check")}</div><h2>¡Compra guardada!</h2>
    <p class="summary-line">Sumaste <b>${plural(done.count,"producto")}</b> a tu inventario${done.total?` por <b>${money(done.total)}</b>`:""}.</p>
    ${done.nuevos?`<p class="hint" style="margin:0">${plural(done.nuevos,"producto nuevo","productos nuevos")} en tu inventario.</p>`:""}
    ${done.compraId?`<button class="btn sm" id="dhist">${icon("list")}Ver en el historial de compras</button>`:""}</section>`;
  bar.innerHTML=`<button class="btn" id="dinv">${icon("box")}Ver inventario</button><button class="btn primary" id="dok">${icon("check")}Listo</button>`;
  if($("#dhist"))$("#dhist").onclick=()=>{screen="hist";render();scrollTo(0,0)};
  $("#dinv").onclick=()=>{screen=null;go("inv")};
  $("#dok").onclick=()=>{screen=null;render()};
}

/* ================= Inventario ================= */
async function useOne(id){
  const p=inventory.find(x=>x.id===id);if(!p||p.cantidad<=0||!canWrite)return;
  const prev=JSON.parse(JSON.stringify(p));const np=applyUse(p,1);
  try{await saveP(np);const[s]=status(np);
    toast(np.cantidad===0?`Se acabó ${np.nombre}. Va a tu lista.`:s==="low"?`Quedan ${qtyTxt(np)}. Va a tu lista.`:`Quedan ${qtyTxt(np)}${np.unidad?"":" de "+np.nombre}`,()=>saveP(prev))}catch(e){writeErr(e)}
}
function itemHTML(p){
  const[s,t,ic]=status(p);const e=expInfo(p);const dl=dlText(p);
  return `<div class="item ${s}">
    <button class="thumb" data-open="${p.id}" aria-label="Ver ficha de ${esc(p.nombre)}"><img src="${p.foto||NO_PHOTO}" alt="">${aiState==="ready"?`<span class="spark">${icon("spark")}</span>`:""}</button>
    <button class="info" data-open="${p.id}"><span class="n">${esc(p.nombre)}</span>
      <span class="m">${esc([p.marca,p.tamano].filter(Boolean).join(" · ")||p.categoria)}${p.ubicacion?" · "+esc(p.ubicacion):""}${p.ejemplo?' · <span class="example">ejemplo</span>':""}</span>
      <span class="tags"><span class="state ${s}">${icon(ic)}${t}</span>${e?`<span class="pill ${e.cls}">${icon("clock")}${e.text}</span>`:""}</span>
      ${enPaq(p)?`<span class="m">${esc(enPaq(p))}</span>`:""}
      ${dl&&s!=="out"?`<span class="m">${dl}</span>`:""}</button>
    <div class="qtybox"><div class="qty">${p.cantidad}<small>${p.unidad?esc(uni(p,p.cantidad)):"en casa"}</small></div>${canWrite?`<button class="use" data-use="${p.id}" ${p.cantidad?"":"disabled"}>Usé 1</button>`:""}</div></div>`;
}
function renderInv(v,bar){
  bar.innerHTML=canWrite?`<button class="btn primary" id="go-add">${icon("scan")}Agregar un producto</button>`:"";
  if($("#go-add"))$("#go-add").onclick=()=>{reset();go("add")};
  if(!loaded){v.innerHTML=`<div class="loading"><div class="thinking"><i></i><i></i><i></i></div>Cargando tu inventario…</div>`;return}
  if(!inventory.length){v.innerHTML=`<section class="card done-card"><div class="ring">${icon("box")}</div><h3>Tu inventario está vacío</h3><p class="lead">Escanea el código de barras de un producto para agregarlo.</p></section>`;return}
  const rank={out:0,low:1,ok:2};
  const sorted=[...inventory].sort((a,b)=>{const ea=expInfo(a),eb=expInfo(b);return rank[status(a)[0]]-rank[status(b)[0]]||((ea?ea.d:999)-(eb?eb.d:999))||a.nombre.localeCompare(b.nombre)});
  const falta=sorted.filter(needsBuy), pronto=[...inventory].filter(useSoon).sort((a,b)=>expInfo(a).d-expInfo(b).d);
  if(invFilter===null)invFilter=pronto.length?"pronto":falta.length?"falta":"todo";
  let list=invFilter==="falta"?falta:invFilter==="pronto"?pronto:sorted;
  const q=norm(invQuery);if(q)list=sorted.filter(p=>[p.nombre,p.marca,p.codigo,p.categoria,...(p.alias||[])].some(x=>norm(x).includes(q)));
  if(invUbi)list=list.filter(p=>(p.ubicacion||"")===invUbi);
  const ubis=UBIS.filter(u=>inventory.some(p=>p.ubicacion===u));
  v.innerHTML=`<section class="card">
      <p class="summary-line">Tienes <b>${plural(inventory.length,"producto")}</b>. ${falta.length?`Hay que comprar <b>${falta.length}</b>.`:"No falta nada."}${pronto.length?` <b>${pronto.length}</b> ${pronto.length===1?"vence":"vencen"} pronto.`:""}</p>
      <input type="search" id="q" value="${esc(invQuery)}" placeholder="Buscar producto, marca o código" aria-label="Buscar">
      ${q?"":`<div class="seg" role="group" aria-label="Filtro"><button data-f="pronto" aria-pressed="${invFilter==="pronto"}">Úsalo pronto (${pronto.length})</button><button data-f="falta" aria-pressed="${invFilter==="falta"}">Por comprar (${falta.length})</button><button data-f="todo" aria-pressed="${invFilter==="todo"}">Todo (${inventory.length})</button></div>`}
      ${ubis.length>1?`<div class="chips scroll" role="group" aria-label="Dónde se guarda"><button class="chip sm" data-u="" aria-pressed="${!invUbi}">Toda la casa</button>${ubis.map(u=>`<button class="chip sm" data-u="${u}" aria-pressed="${invUbi===u}">${u}</button>`).join("")}</div>`:""}
    </section>
    <div class="inv" id="invlist">${list.length?list.map(itemHTML).join(""):`<p class="empty">${q?"No encontré productos con esa búsqueda.":invFilter==="pronto"?"Nada vence esta semana.":invFilter==="falta"?"No falta nada por comprar.":"No hay productos aquí."}</p>`}</div>
    <div class="row">${downloads?`<button class="linkbtn" id="csv">${icon("down")}Descargar inventario (Excel)</button>`:""}
      ${inventory.some(p=>p.ejemplo)&&canWrite?`<button class="linkbtn danger" id="delex">${icon("trash")}Borrar los productos de ejemplo</button>`:""}</div>`;
  const qi=$("#q");qi.oninput=e=>{invQuery=e.target.value;const pos=qi.selectionStart;render();const n=$("#q");n.focus();try{n.setSelectionRange(pos,pos)}catch(err){}};
  $$("[data-f]").forEach(b=>b.onclick=()=>{invFilter=b.dataset.f;render()});
  $$("[data-u]").forEach(b=>b.onclick=()=>{invUbi=b.dataset.u;render()});
  $$("[data-use]").forEach(b=>b.onclick=()=>useOne(b.dataset.use));
  $$("[data-open]").forEach(b=>b.onclick=()=>openSheet(b.dataset.open));
  if($("#csv"))$("#csv").onclick=exportCSV;
  if($("#delex"))$("#delex").onclick=async()=>{const b=$("#delex");if(b.dataset.c!=="1"){b.dataset.c="1";b.innerHTML=icon("trash")+"Toca otra vez para borrar los ejemplos";return}
    const ex=inventory.filter(x=>x.ejemplo).map(x=>JSON.parse(JSON.stringify(x)));
    try{await Promise.all(ex.map(p=>store.del("productos",p.id)));toast(`Se borraron ${ex.length} ejemplos`,()=>Promise.all(ex.map(p=>saveP(p))))}catch(e){writeErr(e)}};
}

/* Exportar a CSV (se abre en Excel) */
let downloads=null;
(async()=>{await 0;try{downloads=window.claude?await window.claude.use("downloads"):null}catch(e){downloads=null}if(tab==="inv")render()})();
async function exportCSV(){
  const cols=["Producto","Marca","Tamaño","Tipo","Dónde se guarda","En casa","Unidad","Viene en","Avisar cuando queden","Te alcanza (días)","Vence","Última compra","Último precio","Tienda","Código"];
  const q=v=>`"${String(v??"").replace(/"/g,'""')}"`;
  const rows=inventory.map(p=>{const dl=daysLeft(p);return[p.nombre,p.marca,p.tamano,p.categoria,p.ubicacion,p.cantidad,uni(p,2),packDesc(p,ppOf(p)),p.minimo,dl===null?"":Math.round(dl),p.vence||"",p.fechaCompra||"",p.precio??"",p.tienda||"",p.codigo?"'"+p.codigo:""]});
  const csv="﻿"+[cols,...rows].map(r=>r.map(q).join(",")).join("\r\n");
  try{await downloads.save({filename:`casita-stock-${today()}.csv`,data:csv});toast("Archivo listo")}catch(e){if(e?.code!=="declined")toast("No se pudo descargar el archivo.")}
}

/* ================= Ficha del producto ================= */
function openSheet(id){sheetId=id;confirmDel=false;editing=null;document.body.classList.add("noscroll");renderSheet();
  const p=inventory.find(x=>x.id===id);
  if(p&&!p.descripcionIA&&aiState==="ready"&&!(descState.id===id&&descState.state==="busy"))describe(p);
}
function closeSheet(){sheetId=null;editing=null;descCtl?.abort();$("#sheet").innerHTML="";document.body.classList.remove("noscroll")}
async function describe(p,force){
  descCtl?.abort();descCtl=new AbortController();const ctl=descCtl;
  descState={id:p.id,state:"busy",text:"",err:""};renderSheet();
  const blob=imgOK?dataURLtoBlob(p.foto):null;
  const prompt=`Eres el asistente de una app de inventario del hogar. ${blob?"La foto muestra el producto. ":""}Datos del producto: ${JSON.stringify(productForAI(p))}. Fecha de hoy: ${today()}.
Escribe en español sencillo, para una persona en su casa, exactamente 3 líneas con este formato (sin markdown, sin viñetas):
Qué es: (qué producto es y para qué sirve, 1-2 frases)
Cómo guardarlo: (cómo conservarlo y cuánto suele durar abierto, 1-2 frases)
Consejo de compra: (consejo práctico según su cantidad, su consumo, su vencimiento y su precio, 1-2 frases)
Máximo 90 palabras en total.`;
  try{
    const opts={modelTier:"quick",signal:ctl.signal,cache:force?{gcTime:300000,refresh:true}:{gcTime:300000},onText:({text})=>{if(descState.id===p.id){descState.text=text;renderDescOnly()}}};
    if(blob)opts.images=blob;
    const r=await sample(prompt,opts);
    descState={id:p.id,state:"done",text:r.text,err:""};
    if(canWrite){const cur=inventory.find(x=>x.id===p.id);if(cur){try{await saveP({...cur,descripcionIA:r.text})}catch(e){}}}
  }catch(e){
    if(e?.code==="cancelled")return;
    if(aiHardOff(e))aiState="off";
    descState={id:p.id,state:"err",text:e?.text||"",err:aiMsg(e)};
  }
  if(sheetId===p.id&&!editing)renderSheet();
}
function descHTML(p){
  const txt=(descState.id===p.id&&descState.text)?descState.text:p.descripcionIA;
  if(descState.id===p.id&&descState.state==="busy"&&!descState.text)return `<div class="thinking"><i></i><i></i><i></i><span>La IA está mirando el producto…</span></div>`;
  let h="";
  if(txt)h+=`<div class="aitext">${txt.split(/\n+/).filter(l=>l.trim()).map(l=>{const m=l.match(/^\s*([^:]{2,30}):\s*(.*)$/);return m?`<p><b>${esc(m[1])}:</b> ${esc(m[2])}</p>`:`<p>${esc(l)}</p>`}).join("")}</div>`;
  if(descState.id===p.id&&descState.state==="err")h+=`<div class="notice warn">${icon("alert")}<span>${esc(descState.err)}</span></div>`;
  if(aiState==="off"&&!txt)h+=`<p class="lead">La IA no está activada. Sigue la guía de instalación para conectarla.</p>`;
  return h;
}
function renderDescOnly(){const el=$("#desc");const p=inventory.find(x=>x.id===sheetId);if(el&&p)el.innerHTML=descHTML(p)}
function priceInfo(p){
  const buys=(p.historial||[]).filter(h=>h.t==="c"&&h.p!=null);if(!buys.length)return"";
  const pp=ppOf(p),u=buys[buys.length-1];
  let out=`<div class="fact"><span>Último precio</span><b>${money(u.p)}${pp>1?` por ${esc(uni(p,1))}`:""}</b>${pp>1?` <span>${money(u.p*pp)} ${art(emp(p))} ${esc(emp(p))}</span>`:""}${u.s?` <span>en ${esc(u.s)}</span>`:""}</div>`;
  const by={};buys.forEach(b=>{if(b.s)by[b.s]=Math.min(by[b.s]??Infinity,b.p)});const st=Object.entries(by).sort((a,b)=>a[1]-b[1]);
  if(st.length>1)out+=`<div class="fact"><span>Más barato en</span><b>${esc(st[0][0])}</b> <span>${money(st[0][1])}</span></div>`;
  return out;
}
function renderSheet(){
  const host=$("#sheet");const p=inventory.find(x=>x.id===sheetId);
  if(!p){host.innerHTML="";if(sheetId){sheetId=null;document.body.classList.remove("noscroll")}return}
  if(editing)return renderEdit(host,p);
  const[s,t,ic]=status(p);const e=expInfo(p);const dl=dlText(p);const sm=sugMin(p);
  const hist=(p.historial||[]).slice(-8).reverse();
  const busy=descState.id===p.id&&descState.state==="busy";
  host.innerHTML=`<div class="sheet-wrap" id="scrim"><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sh-t">
    <div class="grab" aria-hidden="true"></div>
    <div class="top"><span class="tags"><span class="state ${s}">${icon(ic)}${t}</span>${e?`<span class="pill ${e.cls}">${icon("clock")}${e.text}</span>`:""}</span><button class="x" id="shx" aria-label="Cerrar">${icon("close")}</button></div>
    <img class="hero" src="${p.foto||NO_PHOTO}" alt="">
    <div><h2 id="sh-t">${esc(p.nombre)}</h2><p class="lead">${esc([p.marca,p.tamano,p.categoria,p.ubicacion].filter(Boolean).join(" · "))}</p></div>
    ${p.alias&&p.alias.length?`<p class="hint" style="margin:0">También lo llamas: ${p.alias.map(a=>esc(a)).join(", ")}</p>`:""}
    <section class="card ai" style="padding:16px">
      <div class="top"><span class="aitag">${icon("spark")}Sobre este producto</span>${aiState==="ready"&&!busy?`<button class="linkbtn ai" id="redo" style="min-height:36px;padding:0">${p.descripcionIA?"Actualizar":"Describir"}</button>`:""}</div>
      <div id="desc">${descHTML(p)}</div>
    </section>
    <div class="field"><span class="lbl">En casa${p.unidad?` <span class="hint">(${esc(uni(p,2))})</span>`:""} ${enPaq(p)?`<span class="hint">· ${esc(enPaq(p))}</span>`:""} ${dl?`<span class="hint">· ${dl}</span>`:""}</span>
      ${canWrite?`<div class="stepper sm"><button id="am" aria-label="Quitar uno">−</button><output>${p.cantidad}</output><button id="ap" aria-label="Agregar uno">+</button></div>`:`<div class="qty" style="text-align:left">${p.cantidad}</div>`}</div>
    <div class="facts">
      <div class="fact"><span>Última compra</span><b>${fmtDate(p.fechaCompra)}</b></div>
      ${ppOf(p)>1?`<div class="fact"><span>Viene en</span><b>${esc(packDesc(p,ppOf(p)))}</b>${Object.keys(p.paquetes||{}).length>1?` <span>${Object.keys(p.paquetes).length} tamaños</span>`:""}</div>`:""}
      <div class="fact"><span>Avisar cuando queden</span><b>${p.minimo===0?"No avisar":p.minimo}</b>${sm!==null&&sm!==p.minimo?` <span>Sugerido: ${sm}</span>`:""}</div>
      ${priceInfo(p)}
      ${p.codigo?`<div class="fact"><span>Código</span><b style="font-family:var(--mono);font-weight:500;font-size:.9rem">${esc(p.codigo)}</b></div>`:""}
    </div>
    ${sm!==null&&sm!==p.minimo&&canWrite?`<button class="linkbtn" id="applysm">${icon("bulb")}Avisarme cuando queden ${sm} (según lo que usas)</button>`:""}
    ${hist.length?`<div class="field"><span class="lbl">Movimientos recientes</span><ul class="list">${hist.map(h=>`<li><span class="num">${h.t==="u"||h.n<0?"−":"+"}${Math.abs(h.n)}</span><div><b>${h.t==="c"?"Compra":h.t==="u"?"Usado":"Ajuste"}${h.pq?` · ${h.pq} ${esc(empN(p,h.pq))} de ${h.pp}`:""}${h.p!=null?` · ${money(h.pq?h.p*h.pp:h.p)} ${h.pq?"c/"+esc(emp(p)):"c/u"}`:""}</b><span>${fmtDate(h.f)}${h.s?" · "+esc(h.s):""}<span data-uid="${esc(h.u||"")}"></span></span></div></li>`).join("")}</ul></div>`:""}
    ${canWrite?`<div class="row"><button class="btn" id="edit">${icon("edit")}Editar datos</button><button class="btn" id="tolist">${icon("cart")}A la lista</button></div>`:""}
    ${canWrite?(confirmDel?`<div class="notice bad">${icon("alert")}<span>¿Borrar ${esc(p.nombre)} del inventario?</span></div><div class="row"><button class="btn" id="nodel">Cancelar</button><button class="btn danger" id="yesdel">${icon("trash")}Sí, borrar</button></div>`
      :`<button class="linkbtn danger" id="del">${icon("trash")}Borrar del inventario</button>`):""}
  </div></div>`;
  $("#shx").onclick=closeSheet;
  $("#scrim").onclick=ev=>{if(ev.target.id==="scrim")closeSheet()};
  if($("#redo"))$("#redo").onclick=()=>describe(p,true);
  const adj=async d=>{if(d<0){if(p.cantidad<=0)return;try{await saveP(applyUse(p,1))}catch(err){writeErr(err)}}else{const h={t:"a",n:1,f:today()};if(me)h.u=me;try{await saveP({...p,cantidad:p.cantidad+1,historial:[...(p.historial||[]),h].slice(-40)})}catch(err){writeErr(err)}}};
  if($("#am"))$("#am").onclick=()=>adj(-1);
  if($("#ap"))$("#ap").onclick=()=>adj(1);
  if($("#applysm"))$("#applysm").onclick=async()=>{try{await saveP({...p,minimo:sm});toast(`Te avisaremos cuando queden ${sm}`)}catch(err){writeErr(err)}};
  if($("#edit"))$("#edit").onclick=()=>{editing={nombre:p.nombre,marca:p.marca||"",tamano:p.tamano||"",categoria:p.categoria,ubicacion:p.ubicacion||"Despensa",minimo:p.minimo,vence:p.vence||"",empaque:ppOf(p)>1?(p.empaque||"Paquete"):"Suelto",pp:ppOf(p),unidad:p.unidad||"",paquetes:{...(p.paquetes||{})}};renderSheet()};
  if($("#tolist"))$("#tolist").onclick=async()=>{try{await store.set("lista","p_"+p.id,{productoId:p.id,nombre:p.nombre,cantidad:recBuy(p),marcado:false,creado:Date.now(),u:me||""});toast(`${p.nombre} está en tu lista`)}catch(err){writeErr(err)}};
  if($("#del"))$("#del").onclick=()=>{confirmDel=true;renderSheet()};
  if($("#nodel"))$("#nodel").onclick=()=>{confirmDel=false;renderSheet()};
  if($("#yesdel"))$("#yesdel").onclick=async()=>{const copy=JSON.parse(JSON.stringify(p));try{await store.del("productos",p.id);closeSheet();toast(`${copy.nombre} se borró`,()=>saveP(copy))}catch(err){writeErr(err)}};
  fillNames();
}
function renderEdit(host,p){
  const E=editing;
  host.innerHTML=`<div class="sheet-wrap" id="scrim"><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="ed-t">
    <div class="grab" aria-hidden="true"></div>
    <div class="top"><h2 id="ed-t">Editar ${esc(p.nombre)}</h2><button class="x" id="edx" aria-label="Cancelar">${icon("close")}</button></div>
    <div class="field"><label for="e-n">Nombre</label><input type="text" id="e-n" value="${esc(E.nombre)}"></div>
    <div class="row"><div class="field"><label for="e-m">Marca</label><input type="text" id="e-m" value="${esc(E.marca)}"></div><div class="field"><label for="e-t">Tamaño</label><input type="text" id="e-t" value="${esc(E.tamano)}"></div></div>
    <div class="field"><span class="lbl">Tipo</span><div class="chips">${CATS.map(c=>`<button class="chip sm" data-ec="${esc(c)}" aria-pressed="${c===E.categoria}">${c}</button>`).join("")}</div></div>
    <div class="field"><span class="lbl">Dónde se guarda</span><div class="chips">${UBIS.map(c=>`<button class="chip sm" data-eu="${c}" aria-pressed="${c===E.ubicacion}">${c}</button>`).join("")}</div></div>
    <div class="field"><span class="lbl">Cómo viene</span><div class="chips">${EMPAQUES.map(c=>`<button class="chip sm" data-ee="${c}" aria-pressed="${c===E.empaque}">${c}</button>`).join("")}</div>
      ${E.empaque!=="Suelto"?`<div class="row"><div class="field"><label for="e-pp" class="hint">Unidades por ${esc(emp(E))}</label><input type="text" id="e-pp" inputmode="numeric" value="${E.pp}"></div>
      <div class="field"><label for="e-u" class="hint">Cada uno se llama</label><input type="text" id="e-u" value="${esc(E.unidad)}" placeholder="Ej.: huevo"></div></div>`:""}
      ${Object.keys(E.paquetes).length?`<span class="hint">Códigos de este producto (toca para quitar):</span><div class="chips">${Object.entries(E.paquetes).map(([c,n])=>`<button class="chip sm" data-ex="${esc(c)}">${esc(c)} · ${n>1?n+" c/u":"suelto"} ${icon("close")}</button>`).join("")}</div>`:""}</div>
    <div class="field"><span class="lbl">Avisar cuando queden ${E.unidad?`<span class="hint">(${esc(uni(E,2))})</span>`:""}</span><div class="chips">${[...new Set([0,1,2,3,4,5,6,8,10,...(E.pp>1?[Math.ceil(E.pp/2),E.pp]:[])])].sort((a,b)=>a-b).map(n=>`<button class="chip sm" data-em="${n}" aria-pressed="${n===E.minimo}">${n===0?"No avisar":n}</button>`).join("")}</div></div>
    <div class="field"><label for="e-v">Vence <span class="hint">(déjalo vacío si no vence)</span></label><input type="date" id="e-v" value="${E.vence}"></div>
    <div class="row"><button class="btn" id="edc">Cancelar</button><button class="btn primary" id="eds">${icon("check")}Guardar cambios</button></div>
  </div></div>`;
  const pick=(attr,key,num)=>$$(`[data-${attr}]`).forEach(b=>b.onclick=()=>{E[key]=num?+b.dataset[attr]:b.dataset[attr];$$(`[data-${attr}]`).forEach(x=>x.setAttribute("aria-pressed",x===b))});
  pick("ec","categoria");pick("eu","ubicacion");pick("em","minimo",true);
  $("#e-n").oninput=e=>E.nombre=e.target.value;$("#e-m").oninput=e=>E.marca=e.target.value;$("#e-t").oninput=e=>E.tamano=e.target.value;$("#e-v").oninput=e=>E.vence=e.target.value;
  $$("[data-ee]").forEach(b=>b.onclick=()=>{E.empaque=b.dataset.ee;if(E.empaque==="Suelto")E.pp=1;else if(E.pp<2)E.pp=12;renderSheet()});
  if($("#e-pp"))$("#e-pp").oninput=e=>{const n=parseInt(e.target.value.replace(/\D/g,""));E.pp=n>0?n:1};
  if($("#e-u"))$("#e-u").oninput=e=>E.unidad=e.target.value;
  $$("[data-ex]").forEach(b=>b.onclick=()=>{delete E.paquetes[b.dataset.ex];renderSheet()});
  const cancel=()=>{editing=null;renderSheet()};
  $("#edx").onclick=cancel;$("#edc").onclick=cancel;
  $("#eds").onclick=async()=>{if(!E.nombre.trim()){toast("El producto necesita un nombre");return}
    const pq={...E.paquetes};if(p.codigo&&pq[p.codigo]!==undefined)pq[p.codigo]=E.pp;
    try{await saveP({...p,nombre:E.nombre.trim(),marca:E.marca.trim(),tamano:E.tamano.trim(),categoria:E.categoria,ubicacion:E.ubicacion,minimo:E.minimo,vence:E.vence,empaque:E.empaque,porPaquete:E.empaque==="Suelto"?1:Math.max(1,E.pp),unidad:E.unidad.trim(),paquetes:pq});editing=null;toast("Cambios guardados");renderSheet()}catch(err){writeErr(err)}};
}
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&typeof asst!=="undefined"&&asst.open)return;if(e.key==="Escape"&&sheetId){if(editing){editing=null;renderSheet()}else closeSheet()}});

/* ================= Lista de compras ================= */
async function toggleNeeded(p){
  const id="p_"+p.id;const ex=lista.find(x=>x.id===id);
  try{if(ex)await store.set("lista",id,{...ex,marcado:!ex.marcado});else await store.set("lista",id,{productoId:p.id,nombre:p.nombre,cantidad:recBuy(p),marcado:true,creado:Date.now(),u:me||""})}catch(e){writeErr(e)}
}
function renderList(v,bar){
  bar.innerHTML="";
  if(!loaded){v.innerHTML=`<div class="loading"><div class="thinking"><i></i><i></i><i></i></div>Cargando tu lista…</div>`;return}
  const auto=listaNeeded();
  const fromP=lista.filter(x=>x.productoId), manual=lista.filter(x=>!x.productoId);
  const checked=listaChecked();
  const all=auto.length+lista.length;
  const rowP=(p,entry)=>{const on=!!(entry&&entry.marcado);const pp=ppOf(p);const un=entry?entry.cantidad:recBuy(p);const qn=pp>1?`${Math.max(1,Math.ceil(un/pp))} ${empN(p,Math.max(1,Math.ceil(un/pp)))}`:un;const[s]=status(p);
    return `<div class="rowx"><button class="check" aria-pressed="${on}" data-tp="${p.id}"><span class="box">${icon("check")}</span><span><span class="cn">${esc(p.nombre)}</span><br><span class="cm">${s==="out"?"Se acabó":`Te ${p.cantidad===1?"queda":"quedan"} ${esc(qtyTxt(p))}`}${p.tienda?` · ${esc(p.tienda)}`:""}${p.precio!=null?` · ${money(p.precio*pp)}${pp>1?" c/"+esc(emp(p)):""}`:""}</span></span><span class="qn">×${qn}</span></button>
      ${entry?`<button class="xbtn" data-rl="${entry.id}" aria-label="Quitar de la lista">${icon("close")}</button>`:""}</div>`};
  const rowM=e=>`<div class="rowx"><button class="check" aria-pressed="${!!e.marcado}" data-tm="${e.id}"><span class="box">${icon("check")}</span><span><span class="cn">${esc(e.nombre)}</span><br><span class="cm">Agregado a mano<span data-uid="${esc(e.u||"")}"></span></span></span><span class="qn">×${e.cantidad||1}</span></button>
      <button class="xbtn" data-rl="${e.id}" aria-label="Quitar de la lista">${icon("close")}</button></div>`;
  v.innerHTML=`<section class="card">
      <p class="summary-line">${all?`Tienes <b>${plural(all,"cosa")}</b> en la lista.${checked.length?` Ya marcaste <b>${checked.length}</b>.`:""}`:"Tu lista está vacía. No falta nada en casa."}</p>
      ${canWrite?`<div class="inline"><input type="text" id="addm" placeholder="Agregar algo, ej. pan" aria-label="Agregar a la lista"><button class="btn sm" id="addmb">${icon("plus")}Agregar</button></div>`:""}
    </section>
    ${auto.length||fromP.length?`<div class="field"><span class="lbl">${icon("alert")}Lo que se acaba en casa</span><div class="inv">
      ${fromP.map(e=>{const p=inventory.find(x=>x.id===e.productoId);return p?rowP(p,e):rowM({...e,productoId:""})}).join("")}${auto.map(p=>rowP(p,null)).join("")}</div></div>`:""}
    ${manual.length?`<div class="field"><span class="lbl">${icon("list")}Agregado por ti</span><div class="inv">${manual.map(rowM).join("")}</div></div>`:""}
    ${aiState==="ready"&&inventory.length?`<button class="card big-action" id="aiList"><span class="ico" style="background:var(--ai-soft);color:var(--ai)">${icon("spark")}</span><span><b>¿Se me olvida algo?</b><span>La IA revisa tu consumo y te dice qué más deberías comprar.</span></span></button>`:""}
    ${canWrite?`<button class="card big-action" id="lfac"><span class="ico">${icon("receipt")}</span><span><b>¿Ya compraste? Escanea la factura</b><span>La IA suma al inventario todo lo de la factura.</span></span></button>`:""}
    <button class="btn sm" id="lhist" style="align-self:flex-start">${icon("list")}Historial de compras y gastos</button>
    <p class="hint">Invita a tu familia desde Ajustes con el código de tu casa: todos ven la misma lista y el mismo inventario.</p>`;
  if($("#lfac"))$("#lfac").onclick=()=>abrirFactura("list");
  $("#lhist").onclick=()=>openScreen("hist","list");
  if($("#addm")){const add=async()=>{const n=$("#addm").value.trim();if(!n)return;const dup=inventory.find(p=>norm(p.nombre)===norm(n));
      try{if(dup)await store.set("lista","p_"+dup.id,{productoId:dup.id,nombre:dup.nombre,cantidad:recBuy(dup),marcado:false,creado:Date.now(),u:me||""});
        else await store.set("lista",uid(),{productoId:"",nombre:n,cantidad:1,marcado:false,creado:Date.now(),u:me||""});
        toast(`${dup?dup.nombre:n} está en tu lista`)}catch(e){writeErr(e)}};
    $("#addmb").onclick=add;$("#addm").onkeydown=e=>{if(e.key==="Enter")add()}}
  $$("[data-tp]").forEach(b=>b.onclick=()=>{const p=inventory.find(x=>x.id===b.dataset.tp);if(p&&canWrite)toggleNeeded(p)});
  $$("[data-tm]").forEach(b=>b.onclick=async()=>{const e=lista.find(x=>x.id===b.dataset.tm);if(!e||!canWrite)return;try{await store.set("lista",e.id,{...e,marcado:!e.marcado})}catch(err){writeErr(err)}});
  $$("[data-rl]").forEach(b=>b.onclick=async()=>{const e=lista.find(x=>x.id===b.dataset.rl);if(!e)return;const copy={...e};try{await store.del("lista",e.id);toast(`${e.nombre} salió de la lista`,()=>store.set("lista",copy.id,copy))}catch(err){writeErr(err)}});
  if($("#aiList"))$("#aiList").onclick=()=>{openAsst("Revisa mi inventario y mi consumo. ¿Qué más debería comprar esta semana que no esté ya en mi lista? La lista tiene: "+[...lista.map(x=>x.nombre),...auto.map(p=>p.nombre)].join(", "))};
  fillNames();
  if(canWrite)bar.innerHTML=`<button class="btn primary" id="finish" ${checked.length?"":"disabled"}>${icon("check")}${checked.length?`Terminé de comprar (${checked.length})`:"Marca lo que compraste"}</button>`;
  if($("#finish"))$("#finish").onclick=()=>{
    review={origen:"lista",tienda:"",fecha:today(),rows:checked.map(e=>{const p=e.productoId&&inventory.find(x=>x.id===e.productoId);const pp=p?ppOf(p):1;return{key:uid(),listaId:e.id,productoId:p?p.id:"",nombre:p?p.nombre:e.nombre,cantidad:Math.max(1,Math.ceil((e.cantidad||1)/pp)),precio:"",pp,empaque:p?p.empaque:"",unidad:p?p.unidad:""}})};
    openScreen("review","list")};
}

/* ================= Asistente ================= */
function spending(){
  const m=today().slice(0,7);const d=new Date();d.setMonth(d.getMonth()-1);const lm=localISO(d).slice(0,7);
  let tm=0,tl=0,any=false;const cat={};const ups=[];
  inventory.forEach(p=>{const buys=(p.historial||[]).filter(h=>h.t==="c"&&h.p!=null);
    buys.forEach(h=>{any=true;const v=h.p*h.n;if(h.f.startsWith(m)){tm+=v;cat[p.categoria]=(cat[p.categoria]||0)+v}else if(h.f.startsWith(lm))tl+=v});
    if(buys.length>1){const a=buys[buys.length-2].p,b=buys[buys.length-1].p;if(b>a*1.05)ups.push({n:p.nombre,a,b})}});
  return{any,tm,tl,cat:Object.entries(cat).sort((a,b)=>b[1]-a[1]),ups};
}
async function analyze(){
  if(aiState!=="ready"||!inventory.length)return;
  analysisState="busy";analysisErr="";render();
  try{
    const r=await sample.json(`Eres el asistente de compras de una app de inventario del hogar. Fecha de hoy: ${today()}.
Inventario actual (JSON; "historial" muestra compras y usos con fecha, precio y tienda; "diasQueAlcanza" es una estimación; "vence" es la fecha de vencimiento):
${inventoryForAI()}

Analiza el consumo, lo que se acabó o está por acabarse, lo que vence pronto, los precios (subidas, tiendas más baratas) y patrones de compra (compras repetidas, compras muy grandes o pequeñas para lo que se usa).
Responde SOLO un objeto JSON con esta forma exacta, en español sencillo y cercano:
{"resumen":"1-2 frases sobre cómo está la casa hoy",
 "comprar":[{"producto":"nombre","cantidad":2,"motivo":"por qué y para cuándo, 1 frase"}],
 "usarPronto":[{"producto":"nombre","idea":"cómo aprovecharlo antes de que venza, 1 frase"}],
 "alertas":[{"producto":"nombre","mensaje":"1 frase"}],
 "mejoras":["consejo concreto para comprar mejor o ahorrar, 1 frase"]}
Máximo 6 en "comprar", 3 en "usarPronto", 4 en "alertas", 4 en "mejoras". Usa solo productos del inventario; no inventes datos que no estén.`,{modelTier:"default"});
    analysisState="done";await store.saveAnalysis({...r,fecha:today()});
  }catch(e){if(aiHardOff(e))aiState="off";analysisState="err";analysisErr=aiMsg(e)}
  if(tab==="ai")render();
}
function renderAI(v,bar){
  bar.innerHTML="";
  if(!loaded){v.innerHTML=`<div class="loading"><div class="thinking"><i></i><i></i><i></i></div>Preparando el asistente…</div>`;return}
  const sp=spending();
  const gastos=`<section class="card"><span class="aitag g">${icon("money")}Tus gastos</span>
    ${sp.any?`<div><div class="big-num">${money(sp.tm)}</div><p class="lead">gastado este mes${sp.tl?` · el mes pasado: ${money(sp.tl)}`:""}</p></div>
      ${sp.cat.length?`<div class="bars">${sp.cat.slice(0,6).map(([c,val])=>`<div class="barrow"><span>${esc(c)}</span><div class="track"><div class="fill" style="width:${Math.max(4,val/sp.cat[0][1]*100)}%"></div></div><span class="v">${money(val)}</span></div>`).join("")}</div>`:""}
      ${sp.ups.length?`<div class="field"><span class="lbl">Subieron de precio</span><ul class="list">${sp.ups.slice(0,4).map(u=>`<li><span class="ico w">${icon("up")}</span><div><b>${esc(u.n)}</b><span>De ${money(u.a)} a ${money(u.b)}</span></div></li>`).join("")}</ul></div>`:""}`
      :`<p class="lead">Escribe el precio cuando registres tus compras, o escanea tus facturas, y aquí verás cuánto gastas al mes, en qué y qué subió de precio.</p>`}
    <button class="btn sm" id="gohist">${icon("list")}Historial de compras y gastos</button>
  </section>`;
  let aiBlock="";
  if(aiState==="loading")aiBlock=`<div class="loading"><div class="thinking"><i></i><i></i><i></i></div>Preparando la IA…</div>`;
  else if(aiState==="off")aiBlock=`<section class="card"><div class="notice warn">${icon("alert")}<span>La IA no está activada todavía. Sigue la guía de instalación para conectarla.</span></div></section>`;
  else if(!inventory.length)aiBlock=`<section class="card done-card"><div class="ring" style="background:var(--ai-soft);color:var(--ai)">${icon("spark")}</div><h3>Agrega productos primero</h3><p class="lead">Cuando tengas productos, la IA podrá analizarlos.</p></section>`;
  else{
    let res="";
    if(analysisState==="busy")res=`<div class="thinking"><i></i><i></i><i></i><span>Revisando tu inventario, tus gastos y tus hábitos… puede tardar unos segundos.</span></div>`;
    else if(analysisState==="err")res=`<div class="notice warn">${icon("alert")}<span>${esc(analysisErr)}</span></div>`;
    const a=analysis;
    if(a&&analysisState!=="busy"){
      const L=(arr,f)=>Array.isArray(arr)&&arr.length?f(arr):"";
      res+=`${a.fecha?`<span class="hint">Análisis de ${fmtDate(a.fecha)}</span>`:""}
        ${a.resumen?`<p class="sentence" style="font-weight:600">${esc(a.resumen)}</p>`:""}
        ${L(a.comprar,x=>`<div class="field"><span class="lbl">${icon("cart")}Comprar pronto</span><ul class="list">${x.map(c=>`<li><span class="num">${esc(c.cantidad??"")}</span><div><b>${esc(c.producto)}</b><span>${esc(c.motivo)}</span></div></li>`).join("")}</ul>
          ${canWrite?`<button class="btn sm" id="addAll" style="align-self:flex-start">${icon("plus")}Pasar todo a mi lista</button>`:""}</div>`)}
        ${L(a.usarPronto,x=>`<div class="field"><span class="lbl">${icon("clock")}Úsalo pronto</span><ul class="list">${x.map(c=>`<li><span class="ico w">${icon("clock")}</span><div><b>${esc(c.producto)}</b><span>${esc(c.idea)}</span></div></li>`).join("")}</ul></div>`)}
        ${L(a.alertas,x=>`<div class="field"><span class="lbl">Atención</span><ul class="list">${x.map(c=>`<li><span class="ico w">${icon("alert")}</span><div><b>${esc(c.producto)}</b><span>${esc(c.mensaje)}</span></div></li>`).join("")}</ul></div>`)}
        ${L(a.mejoras,x=>`<div class="field"><span class="lbl">Para comprar mejor</span><ul class="list">${x.map(m=>`<li><span class="ico a">${icon("bulb")}</span><div><span style="color:var(--ink)">${esc(m)}</span></div></li>`).join("")}</ul></div>`)}`;
    }
    aiBlock=`<section class="card ai"><span class="aitag">${icon("spark")}Análisis de tu inventario</span>
        ${!a&&analysisState==="idle"?`<p class="lead">La IA revisa lo que tienes, lo que usas, lo que vence y lo que gastas, y te dice qué comprar y cómo mejorar.</p>`:""}
        ${res}
        <button class="btn aib" id="analyze" ${analysisState==="busy"?"disabled":""}>${icon("spark")}${a?"Analizar otra vez":"Analizar mi inventario"}</button>
      </section>
      <section class="card ai"><span class="aitag">${icon("mic")}Habla con ${esc(Voz.nombre())}</span>
        <p class="lead" style="margin:0">Pregúntale cuánto hay, dile qué compraste o usaste y pídele consejos. Revisa tu inventario antes de responder y tú confirmas cada cambio.</p>
        <div class="chips">${["¿Qué cocino con lo que vence pronto?","¿Qué estoy comprando de más?","¿Cómo puedo ahorrar en mis compras?","¿Qué me falta para esta semana?"].map(q=>`<button class="chip q" data-q="${esc(q)}">${q}</button>`).join("")}</div>
        <button class="btn aib" id="openasst">${icon("mic")}Hablar con ${esc(Voz.nombre())}</button>
      </section>`;
  }
  v.innerHTML=aiBlock+gastos+`<section class="card"><span class="aitag g">${icon("users")}En familia</span><p class="lead">Invita a tu familia desde Ajustes (el engranaje de arriba) con el código de tu casa. Todos verán el mismo inventario y la misma lista, y en cada producto verás quién compró o usó.</p></section>`;
  if($("#analyze"))$("#analyze").onclick=analyze;
  if($("#gohist"))$("#gohist").onclick=()=>openScreen("hist","ai");
  if($("#addAll"))$("#addAll").onclick=async()=>{const items=(analysis.comprar||[]);let n=0;
    try{await Promise.all(items.map(c=>{const p=inventory.find(x=>norm(x.nombre)===norm(c.producto));n++;const qn=Math.max(1,parseInt(c.cantidad)||1);
      return p?store.set("lista","p_"+p.id,{productoId:p.id,nombre:p.nombre,cantidad:qn,marcado:false,creado:Date.now(),u:me||""}):store.set("lista",uid(),{productoId:"",nombre:String(c.producto),cantidad:qn,marcado:false,creado:Date.now(),u:me||""})}));
      toast(`${plural(n,"producto")} en tu lista`)}catch(e){writeErr(e)}};
  $$("[data-q]").forEach(b=>b.onclick=()=>openAsst(b.dataset.q));
  if($("#openasst"))$("#openasst").onclick=()=>openAsst(null,{escuchar:true});
}

/* ================= Pestañas ================= */
$("#tab-add").onclick=()=>{if(step===5)reset();if(screen==="hecho"&&screenTab==="add")screen=null;go("add")};
$("#tab-inv").onclick=()=>go("inv");
$("#tab-list").onclick=()=>{if(screen==="hecho"&&screenTab==="list")screen=null;go("list")};
$("#tab-ai").onclick=()=>go("ai");
$("#cfg").onclick=()=>Plataforma.abrirAjustes();
if(new URLSearchParams(location.search).get("pestana")==="compras")tab="list";
render();
