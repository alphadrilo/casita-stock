/* Casita Stock — asistente de voz con nombre propio */
/* Ayudas para entender lo que dice la persona */
const DIAS=["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
const NUMS={un:1,uno:1,una:1,dos:2,tres:3,cuatro:4,cinco:5,seis:6,siete:7,ocho:8,nueve:9,diez:10,once:11,doce:12,media:6,docena:12};
const plain=s=>String(s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim();
const keyOf=s=>plain(s).split(" ").filter(w=>!/^\d+$/.test(w)&&!(w in NUMS)&&!["de","del","el","la","los","las","unos","unas"].includes(w)).map(w=>w.length>3?w.replace(/s$/,""):w).join(" ");
function learnAlias(p,dicho){const k=keyOf(dicho);if(!k||k===keyOf(p.nombre))return;const a=p.alias||[];if(!a.includes(k))p.alias=[...a,k].slice(-10)}
function localMatch(dicho,loose){
  const k=keyOf(dicho);if(!k)return null;
  const strict=inventory.find(p=>keyOf(p.nombre)===k||(p.alias||[]).includes(k)||keyOf([p.nombre,p.marca].join(" "))===k);
  if(strict||!loose)return strict||null;
  const ws=k.split(" ");const hits=inventory.filter(p=>{const n=keyOf([p.nombre,p.marca,...(p.alias||[])].join(" "));return ws.every(w=>n.split(" ").includes(w))});
  return hits.length===1?hits[0]:null;
}
const cap=s=>{s=String(s||"").trim();return s?s[0].toUpperCase()+s.slice(1):s};
function defQty(r){
  if(r.cantidad>0)return;const p=r.productoId&&inventory.find(x=>x.id===r.productoId);
  if(r.accion==="uso"){r.cantidad=r.todo&&p?Math.max(1,p.cantidad):1;return}
  const last=p&&[...(p.historial||[])].reverse().find(h=>h.t==="c");r.cantidad=last?last.n:1;
}
function buildRows(items,loose){
  const ids=new Set(inventory.map(p=>p.id));
  return (Array.isArray(items)?items:[]).filter(it=>it&&(it.dicho||it.nuevo)).map(it=>{
    const accion=it.accion==="uso"?"uso":"compra";
    let pid=ids.has(it.productoId)?it.productoId:"";
    if(!pid){const m=localMatch(it.dicho,loose);if(m)pid=m.id}
    let cands=pid?[]:(Array.isArray(it.candidatos)?it.candidatos:[]).filter(x=>ids.has(x));
    if(!pid&&cands.length===1){pid=cands[0];cands=[]}
    const nv=it.nuevo||{};const cat=CATS.includes(nv.categoria)?nv.categoria:"Otros";
    const r={key:uid(),accion,dicho:String(it.dicho||nv.nombre||""),cantidad:Number.isFinite(+it.cantidad)&&+it.cantidad>0?Math.round(+it.cantidad):0,todo:!!it.todo,
      productoId:pid,candidatos:cands,
      nuevo:{nombre:cap(nv.nombre||it.dicho),marca:String(nv.marca||""),tamano:String(nv.tamano||""),categoria:cat,ubicacion:UBIS.includes(nv.ubicacion)?nv.ubicacion:(UBI_DE[cat]||"Despensa")},
      precio:it.precio!=null&&isFinite(it.precio)&&+it.precio>0?String(+it.precio):"",
      vence:/^\d{4}-\d{2}-\d{2}$/.test(it.vence||"")&&it.vence>=today()?it.vence:"",
      minimo:Number.isInteger(+it.minimo)&&it.minimo!==null&&it.minimo!==""&&+it.minimo>=0?+it.minimo:null,paquetes:+it.paquetes>0?Math.round(+it.paquetes):0};
    r.modo=pid?"match":cands.length>1?"duda":accion==="uso"?"nohay":"nuevo";
    defQty(r);return r;
  });
}
/* Modo básico (sin IA): separa por comas o "y", detecta números y verbos de uso */
function fallbackParse(text){
  const parts=String(text).split(/[,;\n.]+|\s+y\s+|\s+e\s+/i).map(s=>s.trim()).filter(Boolean);
  const items=[];
  for(let s of parts){
    const t=plain(s);
    const todo=/(se acabo|se termino|ya no hay|no queda)/.test(t);
    const uso=todo||/^(use|gaste|consumi|nos comimos|me comi)\b/.test(t);
    let rest=t.replace(/^(compre|traje|repuse|agregue|anade|use|gaste|consumi|nos comimos|me comi|se acabo|se termino|ya no hay|no queda)\s*/,"").replace(/\b(se acabo|se termino)\b/g,"");
    let n=0;const m=rest.match(/\b(\d+)\b/);if(m)n=+m[1];else{for(const w of rest.split(" "))if(w in NUMS&&w!=="docena"&&w!=="media"){n=NUMS[w];break}}
    const docena=/\bdocenas?\b/.test(rest),paq=/\b(cartones|carton|cajas?|paquetes?|bolsas?)\b/.test(rest);
    rest=rest.split(" ").filter(w=>!/^\d+$/.test(w)&&!(w in NUMS)&&!["de","el","la","los","las","unos","unas","docena","docenas","carton","cartones","caja","cajas","paquete","paquetes","bolsa","bolsas"].includes(w)).join(" ").trim();
    if(!rest)continue;
    const it={accion:uso?"uso":"compra",dicho:rest,cantidad:docena?(n||1)*12:(n||null),todo,nuevo:{nombre:cap(rest)}};
    if(paq&&!docena&&!uso)it.paquetes=n||1;
    items.push(it);
  }
  return buildRows(items,true);
}

/* Asistente: consulta la base de datos en vivo, propone cambios y la persona confirma */
let asst={open:false,feed:[],busy:false,ctl:null,draft:"",listening:false,lastVoice:false,ended:false,listenId:0,parcial:"",verTodo:false,ultimo:null};
/* Modo manos libres (1.5): en pantalla solo lo que entendió, la respuesta corta y lo que va a guardar */
const modoVoz=()=>Voz.cfg().modo!=="texto"&&!asst.verTodo;
async function freshAll(){if(mode==="db"){try{const s=await db.collection("productos").get();return s.docs.map(d=>({...d.data(),id:d.id}))}catch(e){}}return inventory}
async function freshOne(id){if(mode==="db"){try{const s=await db.collection("productos").doc(id).get();return s.exists?{...s.data(),id}:null}catch(e){}}return inventory.find(x=>x.id===id)||null}
const compact=p=>{const dl=daysLeft(p);const o={id:p.id,nombre:p.nombre,enCasa:p.cantidad,estado:status(p)[1],avisarCuandoQueden:p.minimo};
  if(p.marca)o.marca=p.marca;if(p.tamano)o.tamano=p.tamano;if(p.vence&&p.cantidad>0)o.vence=p.vence;if(dl!==null)o.diasQueAlcanza=Math.round(dl);
  if(p.unidad)o.unidad=p.unidad;if(ppOf(p)>1){o.unidadesPorPaquete=ppOf(p);o.vieneEn=packDesc(p,ppOf(p))}if(p.ubicacion)o.dondeSeGuarda=p.ubicacion;if(p.fechaCompra)o.ultimaCompra=p.fechaCompra;if(p.tienda)o.ultimaTienda=p.tienda;if(p.precio!=null)o.ultimoPrecio=p.precio;if(p.alias&&p.alias.length)o.alias=p.alias;return o};
function searchIn(list,texto){
  const k=keyOf(texto);const code=String(texto||"").replace(/\D/g,"");if(!k&&code.length<8)return[];
  const ws=k.split(" ").filter(Boolean);
  return list.map(p=>{const nk=keyOf(p.nombre),al=p.alias||[],all=keyOf([p.nombre,p.marca,...al].join(" ")).split(" ");let s=0;
    if(code.length>=8&&p.codigo===code)s=100;else if(nk===k)s=100;else if(al.includes(k))s=90;
    else{const hit=ws.filter(w=>all.includes(w)||all.some(a=>a.startsWith(w)&&w.length>=4)).length;if(hit===ws.length&&hit)s=60;else s=hit*20}
    return{p,s}}).filter(x=>x.s>0).sort((a,b)=>b.s-a.s).slice(0,5).map(x=>x.p);
}
const validDate=(d,past)=>/^\d{4}-\d{2}-\d{2}$/.test(d||"")&&(past?d<=today():d>=today());
function insertCard(card){const i=asst.feed.findIndex(e=>e.k==="bot"&&e.pending);if(i>=0)asst.feed.splice(i,0,card);else asst.feed.push(card);renderFeed()}
function rowAfter(r){return r.accion==="compra"?r.base+r.n:r.accion==="uso"?Math.max(0,r.base-(r.todo?r.base:r.n)):r.n}
function rowDesc(r){
  if(r.accion==="uso")return r.todo?"Se acabó":`Usaste ${r.n}`;
  if(r.accion==="ajustar")return `Corregir a ${r.n}`;
  const p=inventory.find(x=>x.id===r.productoId);
  return [`Compra +${r.n}${r.pq&&p?` (${r.pq} ${empN(p,r.pq)})`:""}`,r.tienda,r.fecha!==today()?fmtDate(r.fecha):"",r.precio!=null?`${money(r.precio)} c/u`:"",r.vence?`vence ${fmtDate(r.vence)}`:"",r.minimo!=null?`avisar con ${r.minimo}`:""].filter(Boolean).join(" · ");
}
function stageChanges(cambios){
  const rows=[],bad=[];
  for(const c of (Array.isArray(cambios)?cambios:[])){
    const p=inventory.find(x=>x.id===String(c.productoId||""));if(!p){bad.push(String(c.productoId||c.dicho||"?"));continue}
    const accion=["compra","uso","ajustar"].includes(c.accion)?c.accion:"compra";
    let n=Math.max(0,Math.round(+c.cantidad||0));const todo=accion==="uso"&&!!c.todo;
    const pp=ppOf(p);const pq=accion==="compra"&&+c.paquetes>0?Math.round(+c.paquetes):0;if(pq)n=pq*pp;
    if(c.precio==null&&+c.precioPaquete>0)c.precio=+c.precioPaquete/(pq?pp:1);
    if(accion!=="ajustar"&&n<1&&!todo){if(accion==="compra"){const last=[...(p.historial||[])].reverse().find(h=>h.t==="c");n=last?last.n:1}else n=1}
    rows.push({key:uid(),productoId:p.id,nombre:p.nombre,accion,n,todo,dicho:String(c.dicho||""),fecha:validDate(c.fecha,true)?c.fecha:today(),tienda:String(c.tienda||"").trim(),
      precio:c.precio!=null&&isFinite(c.precio)&&+c.precio>0?Math.round(+c.precio*10000)/10000:null,pq,vence:validDate(c.vence,false)?c.vence:"",minimo:Number.isInteger(+c.minimo)&&c.minimo!==null&&c.minimo!==""&&+c.minimo>=0?+c.minimo:null,base:p.cantidad});
  }
  if(rows.length)insertCard({k:"cambios",id:uid(),rows,state:"pending",msg:""});
  const txt=rows.map(r=>`${r.nombre}: ${r.base} → ${rowAfter(r)}`).join("; ");
  return (rows.length?`Mostré una tarjeta para confirmar: ${txt}. Todavía NO está guardado: la persona debe tocar Guardar.`:"No se mostró ningún cambio.")+(bad.length?` Estos ids no existen en el inventario: ${bad.join(", ")}. Búscalos primero con buscar_productos.`:"");
}
function stageNew(o){
  const nombre=cap(String(o.nombre||o.dicho||"").trim());if(!nombre)return"Falta el nombre del producto nuevo.";
  const dup=inventory.find(p=>keyOf(p.nombre)===keyOf(nombre)||(p.alias||[]).includes(keyOf(nombre)));
  if(dup)return `Ese producto ya existe como "${dup.nombre}" (id ${dup.id}). Usa proponer_cambios con ese id.`;
  const cat=CATS.includes(o.categoria)?o.categoria:"Otros";
  const pp=Math.max(1,Math.round(+o.unidadesPorPaquete||1)),pq=+o.paquetes>0?Math.round(+o.paquetes):0;
  const cant=pq?pq*pp:Math.max(1,Math.round(+o.cantidad||1));
  if(o.precio==null&&+o.precioPaquete>0)o.precio=+o.precioPaquete/pp;
  insertCard({k:"nuevo",id:uid(),stage:"pedir",state:"pending",msg:"",spec:{nombre,dicho:String(o.dicho||nombre),cantidad:cant,pp,pq,empaque:pp>1?(EMPAQUES.includes(cap0(String(o.empaque||"")))?cap0(String(o.empaque)):"Paquete"):"Suelto",unidad:String(o.unidad||""),marca:String(o.marca||""),tamano:String(o.tamano||""),categoria:cat,
    ubicacion:UBIS.includes(o.ubicacion)?o.ubicacion:(UBI_DE[cat]||"Despensa"),tienda:String(o.tienda||"").trim(),fecha:validDate(o.fecha,true)?o.fecha:today(),
    precio:o.precio!=null&&isFinite(o.precio)&&+o.precio>0?Math.round(+o.precio*10000)/10000:null,vence:validDate(o.vence,false)?o.vence:"",minimo:Number.isInteger(+o.minimo)&&o.minimo!==null&&+o.minimo>=0?+o.minimo:1,codigo:"",foto:""}});
  return `Mostré una tarjeta para registrar "${nombre}" como producto nuevo. La persona debe escanear el código, tomar una foto o elegir "No tiene código", y luego tocar Guardar. Todavía NO está guardado.`;
}
const ASST_TOOLS=()=>[
  {name:"buscar_productos",description:"Busca productos en el inventario de la casa leyendo la base de datos en este momento. Devuelve hasta 5 coincidencias con id, cantidad en casa, estado, vencimiento y alias. Úsala SIEMPRE antes de hablar de un producto o de proponer cambios.",
    inputSchema:{type:"object",properties:{texto:{type:"string",description:"nombre, marca, apodo o código de barras del producto"}},required:["texto"]},
    async execute(i){const list=await freshAll();const r=searchIn(list,String(i.texto||""));return r.length?{encontrados:r.map(compact)}:{encontrados:[],nota:"No está en el inventario."}}},
  {name:"listar_productos",description:"Lista productos del inventario leyendo la base de datos ahora. filtro: por_comprar (se acabó o queda poco), vence_pronto (vence en 7 días o menos) o todo. lugar opcional: Nevera, Congelador, Despensa, Baño, Lavandería u Otro.",
    inputSchema:{type:"object",properties:{filtro:{type:"string",enum:["por_comprar","vence_pronto","todo"]},lugar:{type:"string"}},required:["filtro"]},
    async execute(i){let list=await freshAll();const f=String(i.filtro);if(f==="por_comprar")list=list.filter(needsBuy);else if(f==="vence_pronto")list=list.filter(useSoon);if(i.lugar)list=list.filter(p=>norm(p.ubicacion)===norm(i.lugar));return{total:list.length,productos:list.slice(0,40).map(compact)}}},
  {name:"ver_producto",description:"Lee un producto por su id directamente de la base de datos, con sus últimos movimientos (compras con precio y tienda, usos).",
    inputSchema:{type:"object",properties:{id:{type:"string"}},required:["id"]},
    async execute(i){const p=await freshOne(String(i.id));if(!p)throw new Error("Ese id no existe");return{...compact(p),movimientos:(p.historial||[]).slice(-6).map(h=>`${h.f}: ${h.t==="c"?"compró":h.t==="u"?"usó":"ajustó"} ${h.n}${h.p!=null?` a ${h.p} c/u`:""}${h.s?` en ${h.s}`:""}`)}}},
  {name:"proponer_cambios",description:"Muestra en pantalla una tarjeta con cambios de cantidad para que la persona los confirme. NO guarda nada. accion: compra (suma), uso (resta; todo=true si se acabó), ajustar (deja la cantidad exacta). Usa solo ids que te dio buscar_productos.",
    inputSchema:{type:"object",properties:{cambios:{type:"array",items:{type:"object",properties:{productoId:{type:"string"},accion:{type:"string",enum:["compra","uso","ajustar"]},cantidad:{type:"number"},todo:{type:"boolean"},dicho:{type:"string",description:"cómo lo llamó la persona"},fecha:{type:"string",description:"AAAA-MM-DD de la compra"},tienda:{type:"string"},paquetes:{type:"number",description:"si habló de paquetes, cartones, cajas o bolsas: cuántos compró; la app multiplica por las unidades que trae cada uno"},precio:{type:"number",description:"precio por unidad suelta"},precioPaquete:{type:"number",description:"precio de cada paquete o cartón, si lo dijo así"},vence:{type:"string",description:"AAAA-MM-DD"},minimo:{type:"number",description:"avisar cuando queden (unidades sueltas)"}},required:["productoId","accion"]}}},required:["cambios"]},
    execute(i){return stageChanges(i.cambios)}},
  {name:"pedir_producto_nuevo",description:"Cuando la persona compró algo que NO está en el inventario (buscar_productos no lo encontró): muestra una tarjeta que le pide escanear el código de barras o tomar una foto (o elegir 'No tiene código' para frutas, verduras o pan) y luego confirmar. NO guarda nada.",
    inputSchema:{type:"object",properties:{nombre:{type:"string"},dicho:{type:"string"},cantidad:{type:"number",description:"unidades sueltas"},paquetes:{type:"number",description:"cuántos paquetes o cartones compró, si lo dijo así"},unidadesPorPaquete:{type:"number",description:"cuántas unidades trae cada paquete (ej. 12 huevos), si lo dijo"},empaque:{type:"string",enum:EMPAQUES},unidad:{type:"string",description:"cómo se llama cada unidad, en singular (ej. huevo)"},precioPaquete:{type:"number"},marca:{type:"string"},tamano:{type:"string"},categoria:{type:"string",enum:CATS},ubicacion:{type:"string",enum:UBIS},tienda:{type:"string"},fecha:{type:"string"},precio:{type:"number"},vence:{type:"string"},minimo:{type:"number"}},required:["nombre"]},
    execute(i){return stageNew(i)}}
];
const ASST_RULES=()=>`Eres ${Voz.nombre()}, el asistente por voz de Casita Stock, el inventario de una casa. Te llamas ${Voz.nombre()}; si la persona te llama por tu nombre, atiende lo que pide. Hoy es ${DIAS[new Date().getDay()]} ${today()}. Tiendas que usa la persona: ${JSON.stringify(stores())}.
Reglas:
- Antes de responder sobre cantidades, vencimientos o cualquier producto, consulta SIEMPRE la base de datos con buscar_productos, listar_productos o ver_producto. Nunca respondas de memoria ni con datos de mensajes anteriores: pueden haber cambiado. Si no aparece en los resultados, di que no está en el inventario.
- Para compras, usos o correcciones usa proponer_cambios con los ids encontrados. Tú no guardas nada: la persona confirma en pantalla. Nunca digas que ya se guardó.
- Si compró algo que no existe en el inventario, usa pedir_producto_nuevo con todo lo que dijo (nombre, cantidad, marca, tamaño, tienda, fecha, precio, vencimiento) y explica que necesita una foto o el código de barras, o "No tiene código" si es fruta, verdura o pan.
- Si hay varias coincidencias posibles, pregunta cuál con opciones cortas antes de proponer.
- Las cantidades del inventario son unidades sueltas (por ejemplo, huevos). Si la persona habla de cartones, cajas o paquetes, usa el campo "paquetes" y la app multiplica por "unidadesPorPaquete". Al responder cantidades, di las unidades y, si ayuda, cuántos paquetes son ("8 huevos, menos de un cartón"). Una docena son 12 unidades.
- Singular, plural, diminutivos y errores de dictado son el mismo producto. Fechas relativas a AAAA-MM-DD. Si dice un precio total por varias unidades, divídelo.
- Después de proponer cambios o un producto nuevo, termina preguntando si lo guardas: la persona puede decir “sí” o tocar Guardar.
- No escribas nada antes de usar las herramientas. Tu respuesta final: español sencillo, máximo 3 frases, sin markdown ni listas largas, porque puede leerse en voz alta.`;
function historialChat(){
  const out=[];
  for(const e of asst.feed.slice(-14)){
    if(e.k==="me")out.push({role:"user",content:e.text});
    else if(e.k==="bot"&&!e.pending&&e.text)out.push({role:"assistant",content:e.text});
    else if(e.k==="note")out.push({role:"user",content:"[Nota de la app] "+e.text});
  }
  while(out.length&&out[0].role!=="user")out.shift();
  return out;
}
async function toolAnswer(bot){
  const r=await sample([{role:"user",content:ASST_RULES()},...historialChat()],{tools:ASST_TOOLS(),modelTier:"quick",signal:asst.ctl.signal,onText:({text})=>{bot.text=text;updBubble(bot)}});
  bot.text=r.text;
}
async function jsonAnswer(bot){
  const conv=historialChat().map(m=>(m.role==="user"?"Persona: ":"Asistente: ")+m.content).join("\n");
  const r=await sample.json(`${ASST_RULES().split("Reglas:")[0]}
Inventario leído ahora de la base de datos (JSON): ${JSON.stringify((await freshAll()).map(compact))}
Conversación:
${conv}
Responde SOLO un objeto JSON: {"respuesta":"máximo 3 frases, en español sencillo, basada solo en el inventario de arriba",
"cambios":[{"productoId":"id del inventario","accion":"compra|uso|ajustar","cantidad":número,"todo":false,"dicho":"","fecha":"","tienda":"","precio":null,"vence":"","minimo":null}],
"nuevos":[{"nombre":"","dicho":"","cantidad":1,"marca":"","tamano":"","categoria":"una de: ${CATS.join(", ")}","ubicacion":"una de: ${UBIS.join(", ")}","tienda":"","fecha":"","precio":null,"vence":""}]}
"cambios" solo si pidió comprar, usar o corregir productos que existen; "nuevos" solo para compras de productos que no están. Nada se guarda sin que la persona confirme; no digas que ya se guardó.`,{modelTier:"quick",signal:asst.ctl.signal});
  if(r&&Array.isArray(r.cambios)&&r.cambios.length)stageChanges(r.cambios);
  if(r&&Array.isArray(r.nuevos))r.nuevos.forEach(stageNew);
  bot.text=String((r&&r.respuesta)||"Listo, revisa la tarjeta.");
}
function localAnswer(text,bot){
  const t=plain(text);
  const q=t.match(/^(?:cuant[oa]s?|que tanto|hay)\s+(.+?)(?:\s+(?:hay|quedan?|tengo|tenemos|queda))?$/);
  if(q){const p=localMatch(q[1],true);bot.text=p?`Tienes ${qtyTxt(p)}${p.unidad?"":" de "+p.nombre}${enPaq(p)?` (${enPaq(p)})`:""}. ${status(p)[1]}.`:`No encontré "${q[1]}" en tu inventario.`;return}
  if(/(que (me )?falta|por comprar|lista)/.test(t)){const f=inventory.filter(needsBuy);bot.text=f.length?`Te falta: ${f.map(p=>p.nombre).join(", ")}.`:"No falta nada en casa.";return}
  if(/vence/.test(t)){const f=inventory.filter(useSoon);bot.text=f.length?`Vence pronto: ${f.map(p=>p.nombre+" ("+expInfo(p).text.toLowerCase()+")").join(", ")}.`:"Nada vence esta semana.";return}
  const rows=fallbackParse(text);
  const m=rows.filter(r=>r.modo==="match"),nw=rows.filter(r=>r.modo==="nuevo"&&r.accion==="compra"),no=rows.filter(r=>r.modo==="nohay");
  if(m.length)stageChanges(m.map(r=>({productoId:r.productoId,accion:r.accion,cantidad:r.paquetes?0:r.cantidad,paquetes:r.paquetes,todo:r.todo,dicho:r.dicho})));
  nw.forEach(r=>stageNew({nombre:r.nuevo.nombre,dicho:r.dicho,cantidad:r.cantidad,paquetes:r.paquetes}));
  bot.text=(m.length||nw.length)?"Revisa la tarjeta y toca Guardar."+(no.length?` No encontré: ${no.map(r=>r.dicho).join(", ")}.`:""):"No entendí. Prueba con algo como: compré 2 leches, usé un arroz o ¿cuánta leche hay?";
  bot.text+=" (La IA no está disponible, uso el modo básico.)";
}

/* ---- Conversación por voz ---- */
const RX_SI=/^(si|si claro|claro|dale|ok|okay|vale|correcto|de acuerdo|perfecto|hazlo|guarda|guardalo|guardalos|guardar|confirmo|confirma|confirmado|esta bien|eso es)\b/;
const RX_NO=/^(no|cancela|cancelar|cancelalo|mejor no|olvidalo|dejalo)\b/;
const RX_FIN=/^(gracias|muchas gracias|adios|eso es todo|nada mas|chao|hasta luego|listo gracias)\b/;
const RX_SINCOD=/no tiene codigo|sin codigo/;
const RX_DESHACER=/^(deshacer|deshazlo|deshaz|deshacerlo|me equivoque|borra eso|quita eso)\b/;
function sinNombre(t){const n=Voz.cfg().nombre;if(!n)return t;const r=new RegExp("^\\s*(?:oye|hola|hey|ey)?[\\s,]*"+n.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"[\\s,.:!]*","i");return t.replace(r,"").trim()||t}
const pendientes=()=>asst.feed.filter(e=>e.state==="pending"&&(e.k==="cambios"||e.k==="nuevo"));
async function respuestaRapida(text,bot){
  const p=pendientes();const t=plain(text);
  if(p.length&&RX_SI.test(t)){
    const listos=p.filter(c=>c.k==="cambios"||c.stage==="listo"),faltan=p.filter(c=>c.k==="nuevo"&&c.stage==="pedir");
    for(const c of listos){if(c.k==="cambios")await saveCambios(c);else await saveNew(c)}
    const ok=listos.filter(c=>c.state==="saved"),aun=listos.filter(c=>c.state==="pending");
    let r=ok.length?"Listo, guardado.":"";
    if(aun.length)r+=(r?" ":"")+"Alguien cambió el inventario mientras tanto. Revisa los números nuevos y dime sí otra vez.";
    if(faltan.length)r+=(r?" ":"")+`Para ${faltan.map(c=>c.spec.nombre).join(" y ")} necesito que escanees el código, le tomes una foto o me digas “no tiene código”.`;
    bot.text=r||"No había nada para guardar.";return true;
  }
  if(p.length&&RX_NO.test(t)&&!RX_SINCOD.test(t)){p.forEach(c=>c.state="cancelled");asst.feed.push({k:"note",text:"La persona canceló lo que estaba pendiente."});bot.text="Está bien, no guardé nada.";return true}
  const pedir=p.filter(c=>c.k==="nuevo"&&c.stage==="pedir");
  if(pedir.length&&RX_SINCOD.test(t)){pedir.forEach(c=>{c.stage="listo";c.msg=""});bot.text=`Perfecto. ¿Guardo ${pedir.map(c=>c.spec.nombre).join(" y ")}?`;return true}
  if(asst.ultimo&&asst.ultimo.state==="saved"&&RX_DESHACER.test(t)){const ok=await deshacer(asst.ultimo,true);bot.text=ok?"Listo, lo deshice.":"No pude deshacerlo: alguien cambió ese producto mientras tanto.";return true}
  if(!p.length&&RX_FIN.test(t)){asst.ended=true;bot.text="Con gusto. Aquí estoy cuando me necesites.";return true}
  return false;
}
async function sendAsst(text,o={}){
  text=sinNombre(String(text||"").trim());if(!text||asst.busy)return;
  if(asst.listening){asst.listenId++;asst.listening=false;Voz.parar();pintarMic()}
  asst.lastVoice=!!o.voz;if(!o.voz)asst.ended=false;
  asst.feed.push({k:"me",id:uid(),text});const bot={k:"bot",id:uid(),text:"",pending:true};asst.feed.push(bot);
  asst.busy=true;asst.draft="";const box=$("#ain");if(box)box.value="";asst.ctl=new AbortController();renderFeed();estado("");
  try{
    if(!(await respuestaRapida(text,bot))){
      if(aiState!=="ready")localAnswer(text,bot);else if(toolsOK)await toolAnswer(bot);else await jsonAnswer(bot);
    }
  }catch(e){if(e?.code==="cancelled")bot.text=(e.text||"")+(e.text?"\n":"")+"(Detenido)";else{if(aiHardOff(e))aiState="off";bot.text=(e?.text?e.text+"\n\n":"")+aiMsg(e)}}
  bot.pending=false;asst.busy=false;renderFeed();
  if(asst.open&&bot.text)await Voz.hablar(bot.text,modoVoz());
  if(asst.open&&asst.lastVoice&&Voz.cfg().continuo&&!asst.ended&&!asst.busy&&!asst.listening)escucharTurno(true);
}
async function escucharTurno(auto){
  if(asst.listening){Voz.parar();return}
  if(!Voz.soportado){estado("Toca el cuadro y usa el micrófono del teclado para dictar.");$("#ain")?.focus();return}
  if(!auto)asst.ended=false;
  const id=++asst.listenId;
  asst.listening=true;asst.parcial="";pintarMic();estado(modoVoz()?"":"Te escucho… habla ahora");
  try{
    const t=await Voz.escuchar({onParcial:p=>{if(id===asst.listenId){asst.parcial=p;const b=$("#ain");if(b)b.value=p;const d=$("#mldicho");if(d)d.textContent=p||"…"}}});
    if(id!==asst.listenId)return;
    asst.listening=false;pintarMic();
    if(!asst.open)return;
    if(t){estado("");sendAsst(t,{voz:true})}
    else estado(auto?"Toca el micrófono si quieres seguir.":"No te escuché. Toca el micrófono y vuelve a intentarlo.");
  }catch(e){if(id!==asst.listenId)return;asst.listening=false;pintarMic();estado(auto?"Toca el micrófono para seguir.":Voz.mensajeError(e))}
}
function pintarMic(){if($("#mlstage")){renderStage();return}const b=$("#amic");if(!b)return;b.classList.toggle("on",asst.listening);b.setAttribute("aria-label",asst.listening?"Terminar de hablar":"Hablar");b.innerHTML=asst.listening?icon("close"):icon("mic")}
function estado(t){const e=$("#astatus");if(e)e.textContent=t}
function updBubble(bot){const el=document.getElementById("b-"+bot.id);if(el){el.textContent=bot.text||(modoVoz()?"Déjame revisar…":"Revisando tu inventario…");const f=$("#afeed");if(f)f.scrollTop=f.scrollHeight}}
function openAsst(q,o={}){
  asst.open=true;document.body.classList.add("noscroll");buildAsst();
  if(q)sendAsst(q);
  else if(o.escuchar)escucharTurno(o.escuchar==="auto");
  else estado(modoVoz()?"":Voz.soportado?"Toca el micrófono y habla.":"Toca el cuadro y usa el micrófono del teclado.");
}
function closeAsst(){asst.verTodo=false;asst.listenId++;asst.ctl?.abort();Voz.parar();Voz.callar();asst.listening=false;asst.open=false;$("#asst").innerHTML="";if(!sheetId)document.body.classList.remove("noscroll")}
function segModo(){const v=modoVoz();return `<span class="ml-seg" role="group" aria-label="Cómo te atiende ${esc(Voz.nombre())}"><button data-amodo="voz" aria-pressed="${v}">Solo voz</button><button data-amodo="texto" aria-pressed="${!v}">Voz y texto</button></span>`}
function buildAsst(){
  const voz=modoVoz();
  const top=`<div class="top"><span class="aitag" id="as-t">${icon("mic")}${esc(Voz.nombre())}</span><span class="row" style="gap:8px;flex-wrap:nowrap;align-items:center">${segModo()}<button class="x" id="ax" aria-label="Cerrar">${icon("close")}</button></span></div>`;
  $("#asst").innerHTML=voz?`<div class="sheet-wrap" id="ascrim"><div class="sheet asst" role="dialog" aria-modal="true" aria-labelledby="as-t">
    <div class="grab" aria-hidden="true"></div>${top}
    <div class="ml"><div class="ml-stage" id="mlstage"></div><p class="hint astatus" id="astatus" aria-live="polite"></p>
      <div class="ml-pie"><button class="linkbtn" id="mlver">${icon("list")}<span id="mlvern">Ver conversación</span></button><button class="ml-tecla" id="mlkey" aria-label="Escribir en lugar de hablar">${icon("edit")}</button></div></div>
  </div></div>`:`<div class="sheet-wrap" id="ascrim"><div class="sheet asst" role="dialog" aria-modal="true" aria-labelledby="as-t">
    <div class="grab" aria-hidden="true"></div>${top}
    <div class="feed" id="afeed" aria-live="polite"></div>
    <p class="hint astatus" id="astatus" aria-live="polite"></p>
    <div class="composer">${Voz.soportado?`<button class="micbtn" id="amic" aria-label="Hablar">${icon("mic")}</button>`:""}<textarea id="ain" rows="1" placeholder="${Voz.soportado?"Escribe…":"Escribe o dicta…"}" aria-label="Mensaje para ${esc(Voz.nombre())}">${esc(asst.draft)}</textarea><button class="btn sm aib" id="asend" aria-label="Enviar">${icon("send")}</button></div>
  </div></div>`;
  $("#ax").onclick=closeAsst;
  $("#ascrim").onclick=e=>{if(e.target.id==="ascrim")closeAsst()};
  $$("[data-amodo]").forEach(b=>b.onclick=()=>{const m=b.dataset.amodo;Voz.guardar({modo:m});asst.verTodo=false;buildAsst();if(m==="texto")setTimeout(()=>{const f=$("#afeed");if(f)f.scrollTop=f.scrollHeight},50)});
  if(voz){
    $("#mlver").onclick=()=>{asst.verTodo=true;buildAsst()};
    $("#mlkey").onclick=()=>{asst.verTodo=true;if(asst.listening){asst.listenId++;asst.listening=false;Voz.parar()}buildAsst();setTimeout(()=>$("#ain")?.focus(),60)};
    renderStage();return;
  }
  $("#ain").oninput=e=>asst.draft=e.target.value;
  $("#ain").onfocus=()=>setTimeout(()=>{const f=$("#afeed");if(f)f.scrollTop=f.scrollHeight},300);
  $("#ain").onkeydown=e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendAsst(e.target.value)}};
  $("#asend").onclick=()=>{if(asst.busy)asst.ctl?.abort();else sendAsst($("#ain").value)};
  if($("#amic"))$("#amic").onclick=()=>escucharTurno(false);
  renderFeed();
}
/* Escenario del modo manos libres: escucha · piensa · responde · confirma · listo */
const ACC={compra:["plus","Sumar"],uso:["box","Usar"],ajustar:["edit","Corregir"]};
function orb(clase,ico,label){return `<button class="orb ${clase}" id="amic" aria-label="${label}">${icon(ico)}</button>`}
function mlCambios(c){
  return `<div class="ml-card"><span class="aitag" style="color:var(--ink)">${icon("edit")}${c.rows.length>1?`Confirma ${c.rows.length} cambios`:"Confirma"}</span>
    ${c.rows.map(r=>{const a=ACC[r.accion]||ACC.ajustar;const info=[r.tienda,r.fecha&&r.fecha!==today()?fmtDate(r.fecha):"",r.precio!=null?money(r.precio)+" c/u":""].filter(Boolean).join(" · ");
      return `<div class="ml-fila"><div class="t"><span class="acc">${icon(a[0])}${a[1]}</span>${info?`<span class="hint">${esc(info)}</span>`:""}</div>
      <div class="t"><div style="min-width:0"><b class="ml-nom">${esc(r.nombre)}</b>${r.accion!=="ajustar"&&!r.todo?`<br><span class="hint">${esc(rowDesc(r))}</span>`:""}</div><span class="q">${r.base} → ${rowAfter(r)} <small>en casa</small></span></div>
      ${r.todo?"":`<div class="t"><span class="stepper sm"><button data-cq="-1" data-c="${c.id}" data-r="${r.key}" aria-label="Menos">−</button><button data-cq="1" data-c="${c.id}" data-r="${r.key}" aria-label="Más">+</button></span>${c.rows.length>1?`<button class="linkbtn danger" data-crm="${r.key}" data-c="${c.id}">Quitar</button>`:""}</div>`}</div>`}).join("")}
    ${c.msg?`<div class="notice warn">${icon("alert")}<span>${esc(c.msg)}</span></div>`:""}
    <div class="row"><button class="btn" data-ccancel="${c.id}" style="flex:1">No</button><button class="btn primary" data-csave="${c.id}" style="flex:2" ${c.busy?"disabled":""}>${icon("check")}${c.busy?"Guardando…":"Sí, guardar"}</button></div></div>`;
}
function renderStage(){
  const S=$("#mlstage");if(!S)return;
  const fe=asst.feed,pend=pendientes();
  const lastMe=[...fe].reverse().find(e=>e.k==="me"),lastBot=[...fe].reverse().find(e=>e.k==="bot");
  const dicho=lastMe?`<p class="ml-dicho peq">“${esc(lastMe.text)}”</p>`:"";
  const n=fe.filter(e=>e.k==="me"||e.k==="bot").length;const v=$("#mlvern");if(v)v.textContent=n?`Ver conversación (${n})`:"Ver conversación";
  const U=asst.ultimo;const reciente=U&&(U.state==="saved"||U.state==="undone")&&lastMe&&U.trasMe===lastMe.id;
  let h;
  if(pend.length){
    // La tarjeta se queda a la vista mientras escucha el "sí" o el "no"
    const pedir=pend.some(c=>c.k==="nuevo"&&c.stage==="pedir");
    h=`<div class="ml-stage-top">${dicho}${pend.map(c=>c.k==="cambios"?mlCambios(c):cardHTML(c)).join("")}</div>
      ${asst.listening?orb("sm","mic","Terminar de hablar"):orb("sm quieto","mic","Hablar")}
      <span class="ml-estado">${asst.listening?(pedir?"Te escucho… di “no tiene código” o usa los botones":"Te escucho… di “sí” o “no”"):(pedir?"Escanea, toma una foto o di “no tiene código”":"Toca el círculo y di “sí” o “no”")}</span>
      ${asst.listening?`<p class="ml-dicho peq" id="mldicho">${esc(asst.parcial)}</p>`:""}`;
  }else if(asst.listening){
    h=`${orb("","mic","Terminar de hablar")}<span class="ml-estado">Te escucho…</span><p class="ml-dicho" id="mldicho">${esc(asst.parcial)||"…"}</p>${reciente&&U.state==="saved"&&U.puedeDeshacer
      ?`<p class="ml-nota">${icon("check")}Listo, guardado. ¿Algo más?</p><button class="btn sm" id="mlundo">${icon("back")}Deshacer</button>`
      :`<p class="ml-nota">Habla normal. Cuando te calles, ${esc(Voz.nombre())} entiende y responde.</p>`}`;
  }else if(asst.busy){
    h=`${dicho}<div class="orb habla sm piensa" aria-hidden="true">${icon("spark")}</div><p class="ml-resp" id="b-${lastBot?.id}">${esc(lastBot?.text||"")||"Déjame revisar…"}</p>
      <button class="btn sm" id="mlstop">${icon("close")}Detener</button>`;
  }else if(reciente){
    h=U.state==="saved"?`<div class="orb ok" aria-hidden="true">${icon("check")}</div><p class="ml-resp">Listo, guardado</p>${(U.result||[]).map(t=>`<p class="ml-dicho peq">${esc(t)}.</p>`).join("")}
      ${U.puedeDeshacer?`<button class="btn sm" id="mlundo">${icon("back")}Deshacer</button>`:""}${orb("sm quieto","mic","Hablar")}<p class="ml-nota">¿Algo más? Di “gracias” para terminar.</p>`
      :`<div class="orb sm" aria-hidden="true">${icon("back")}</div><p class="ml-resp">Lo deshice</p><p class="ml-dicho peq">Tu inventario quedó como antes.</p>${orb("sm quieto","mic","Hablar")}`;
  }else if(lastBot&&lastBot.text){
    h=`${dicho}${orb("habla sm quieto","mic","Hablar")}<p class="ml-resp" id="b-${lastBot.id}">${esc(lastBot.text)}</p><p class="ml-nota">${icon("mic")}Toca el círculo para seguir hablando</p>`;
  }else{
    h=`${orb("quieto","mic","Hablar")}<p class="ml-resp">Hola, soy ${esc(Voz.nombre())}</p><p class="ml-dicho peq">Toca el círculo y dime qué compraste, qué usaste o pregúntame cuánto queda.</p>
      <div class="chips" style="justify-content:center">${["¿Cuánta leche queda?","¿Qué me falta comprar?","¿Qué vence pronto?"].map(q=>`<button class="chip q sm" data-aq="${esc(q)}">${q}</button>`).join("")}</div>`;
  }
  S.innerHTML=h;
  // Un toque = una acción: se ignora un segundo toque en menos de medio segundo (toques dobles o "fantasma")
  if($("#amic"))$("#amic").onclick=()=>{const t=Date.now();if(t-(asst.tOrb||0)<600)return;asst.tOrb=t;escucharTurno(false)};
  if($("#mlstop"))$("#mlstop").onclick=()=>asst.ctl?.abort();
  if($("#mlundo"))$("#mlundo").onclick=async()=>{const ok=await deshacer(asst.ultimo);if(ok)Voz.hablar("Listo, lo deshice.",true);else toast("No se pudo deshacer: alguien cambió ese producto.")};
  bindFeed();
}
function actualizarNombreAsistente(){
  const f=$("#fab");if(f){f.setAttribute("aria-label","Hablar con "+Voz.nombre());const s=$("#fabname");if(s)s.textContent=Voz.cfg().nombre||"Asistente"}
  if(typeof render==="function"&&loaded)render();
}
window.actualizarNombreAsistente=actualizarNombreAsistente;
$("#fab").onclick=()=>openAsst(null,{escuchar:true});
actualizarNombreAsistente();
Plataforma.ready.then(()=>{actualizarNombreAsistente();if(new URLSearchParams(location.search).has("hablar"))setTimeout(()=>openAsst(null,{escuchar:"auto"}),300)});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&asst.open)closeAsst()});

function cardHTML(c){
  if(c.k==="cambios"){
    if(c.state==="saved")return `<div class="ccard saved"><span class="aitag g">${icon("check")}Guardado</span>${c.result.map(t=>`<span>${esc(t)}</span>`).join("")}</div>`;
    if(c.state==="cancelled")return `<div class="ccard off"><span class="hint">Cambios cancelados</span></div>`;
    return `<div class="ccard"><span class="aitag">${icon("edit")}Confirma los cambios</span>
      ${c.rows.map(r=>`<div class="crow"><div style="min-width:0"><b>${esc(r.nombre)}</b><br><span class="hint">${esc(rowDesc(r))}</span></div>
        <div class="cq"><span class="qty" style="font-size:1.3rem">${r.base} → ${rowAfter(r)}</span>${r.todo?"":`<span class="stepper sm"><button data-cq="-1" data-c="${c.id}" data-r="${r.key}" aria-label="Menos">−</button><button data-cq="1" data-c="${c.id}" data-r="${r.key}" aria-label="Más">+</button></span>`}<button class="xbtn" data-crm="${r.key}" data-c="${c.id}" aria-label="Quitar">${icon("close")}</button></div></div>`).join("")}
      ${c.msg?`<div class="notice warn">${icon("alert")}<span>${esc(c.msg)}</span></div>`:""}
      <div class="row"><button class="btn sm" data-ccancel="${c.id}" style="flex:1">Cancelar</button><button class="btn sm primary" data-csave="${c.id}" style="flex:2" ${c.busy?"disabled":""}>${icon("check")}${c.busy?"Revisando…":"Guardar"}</button></div></div>`;
  }
  const S=c.spec;
  if(c.state==="saved")return `<div class="ccard saved"><span class="aitag g">${icon("check")}Producto nuevo guardado</span><span>${esc(S.nombre)}: ahora ${S.cantidad} en casa.</span></div>`;
  if(c.state==="cancelled")return `<div class="ccard off"><span class="hint">Registro de ${esc(S.nombre)} cancelado</span></div>`;
  if(c.state==="merged")return `<div class="ccard"><span class="hint">${esc(c.msg)}</span></div>`;
  const info=[S.pp>1?packDesc(S,S.pp)+(S.pq?` × ${S.pq}`:""):"",S.marca,S.tamano,S.tienda,S.fecha!==today()?fmtDate(S.fecha):"",S.precio!=null?money(S.precio)+" c/u":"",S.vence?"vence "+fmtDate(S.vence):"",S.codigo?"código "+S.codigo:""].filter(Boolean).join(" · ");
  if(c.stage==="pedir")return `<div class="ccard"><span class="aitag">${icon("plus")}Producto nuevo</span>
    <div><b>${esc(S.nombre)}</b> ×${S.cantidad}${info?`<br><span class="hint">${esc(info)}</span>`:""}</div>
    <p class="lead" style="margin:0">No está en tu inventario. Para registrarlo, escanea su código o tómale una foto.</p>
    ${c.busy?`<div class="thinking"><i></i><i></i><i></i><span>${esc(c.busy)}</span></div>`:`<div class="row">
      <label class="btn sm" style="flex:1 1 140px;position:relative">${icon("scan")}Escanear código<input type="file" accept="image/*" capture="environment" data-ncode="${c.id}" aria-label="Escanear código" style="position:absolute;inset:0;opacity:0"></label>
      <label class="btn sm" style="flex:1 1 140px;position:relative">${icon("cam")}Tomar foto<input type="file" accept="image/*" capture="environment" data-nphoto="${c.id}" aria-label="Tomar foto" style="position:absolute;inset:0;opacity:0"></label></div>
      <div class="row"><button class="linkbtn" data-nnone="${c.id}">No tiene código (fruta, verdura, pan…)</button><button class="linkbtn danger" data-ccancel="${c.id}">Cancelar</button></div>`}
    ${c.msg?`<div class="notice warn">${icon("alert")}<span>${esc(c.msg)}</span></div>`:""}</div>`;
  return `<div class="ccard"><span class="aitag">${icon("plus")}Confirma el producto nuevo</span>
    <div class="confirm-head">${S.foto?`<img src="${S.foto}" alt="" style="width:72px;height:72px">`:""}<div style="min-width:0;flex:1"><input type="text" data-nn="${c.id}" value="${esc(S.nombre)}" aria-label="Nombre del producto"></div></div>
    <div class="row"><select data-ns="categoria" data-c="${c.id}" aria-label="Tipo" style="flex:1 1 130px">${CATS.map(x=>`<option ${x===S.categoria?"selected":""}>${x}</option>`).join("")}</select><select data-ns="ubicacion" data-c="${c.id}" aria-label="Dónde se guarda" style="flex:1 1 130px">${UBIS.map(x=>`<option ${x===S.ubicacion?"selected":""}>${x}</option>`).join("")}</select></div>
    <div class="crow"><label for="npp-${c.id}">¿Viene en paquete? <span class="hint">unidades por paquete (1 = suelto)</span></label><input type="text" inputmode="numeric" id="npp-${c.id}" data-npp="${c.id}" value="${S.pp||1}" style="width:5em;min-height:44px;padding:8px 10px"></div>
    <div class="crow"><span>Cantidad <span class="hint">(${esc(uni(S,2))} sueltos)</span></span><span class="stepper sm"><button data-nq="-1" data-c="${c.id}" aria-label="Menos">−</button><output>${S.cantidad}</output><button data-nq="1" data-c="${c.id}" aria-label="Más">+</button></span></div>
    ${info?`<span class="hint">${esc(info)}</span>`:""}
    ${c.msg?`<div class="notice warn">${icon("alert")}<span>${esc(c.msg)}</span></div>`:""}
    <div class="row"><button class="btn sm" data-ccancel="${c.id}" style="flex:1">Cancelar</button><button class="btn sm primary" data-nsave="${c.id}" style="flex:2" ${c.busy?"disabled":""}>${icon("check")}${c.busy?"Guardando…":"Guardar"}</button></div></div>`;
}
function renderFeed(){
  if($("#mlstage")){renderStage();return}
  const f=$("#afeed");if(!f)return;
  if(!asst.feed.length){
    f.innerHTML=`<div class="msg bot">Hola, soy ${esc(Voz.nombre())}. Toca el micrófono y pregúntame cuánto hay de algo, dime qué compraste o usaste, o pregúntame qué falta y qué vence. Todo lo reviso en tu inventario antes de responder.</div>
      <div class="chips">${["¿Cuánta leche queda?","Compré 2 leches en el supermercado","Se acabó el detergente","¿Qué me falta comprar?","¿Qué vence pronto?"].map(q=>`<button class="chip q sm" data-aq="${esc(q)}">${q}</button>`).join("")}</div>`;
  }else f.innerHTML=asst.feed.filter(e=>e.k!=="note").map(e=>e.k==="me"?`<div class="msg me">${esc(e.text)}</div>`:e.k==="bot"?`<div class="msg bot" id="b-${e.id}">${e.pending&&!e.text?"Revisando tu inventario…":esc(e.text)}</div>`:cardHTML(e)).join("");
  const sb=$("#asend");if(sb){sb.innerHTML=asst.busy?"Detener":icon("send");sb.setAttribute("aria-label",asst.busy?"Detener":"Enviar")}
  bindFeed();f.scrollTop=f.scrollHeight;
}
const cardById=id=>asst.feed.find(e=>e.id===id);
function bindFeed(){
  $$("[data-aq]").forEach(b=>b.onclick=()=>sendAsst(b.dataset.aq));
  $$("[data-cq]").forEach(b=>b.onclick=()=>{const c=cardById(b.dataset.c);const r=c&&c.rows.find(x=>x.key===b.dataset.r);if(!r)return;r.n=Math.max(r.accion==="ajustar"?0:1,r.n+(+b.dataset.cq));renderFeed()});
  $$("[data-crm]").forEach(b=>b.onclick=()=>{const c=cardById(b.dataset.c);if(!c)return;c.rows=c.rows.filter(x=>x.key!==b.dataset.crm);if(!c.rows.length)c.state="cancelled";renderFeed()});
  $$("[data-ccancel]").forEach(b=>b.onclick=()=>{const c=cardById(b.dataset.ccancel);if(c){c.state="cancelled";asst.feed.push({k:"note",text:"La persona canceló una propuesta."});renderFeed()}});
  $$("[data-csave]").forEach(b=>b.onclick=async()=>{const c=cardById(b.dataset.csave);await saveCambios(c);trasGuardarPorToque(c)});
  $$("[data-ncode]").forEach(i=>i.onchange=e=>newByCode(cardById(i.dataset.ncode),e.target.files[0]));
  $$("[data-nphoto]").forEach(i=>i.onchange=e=>newByPhoto(cardById(i.dataset.nphoto),e.target.files[0]));
  $$("[data-nnone]").forEach(b=>b.onclick=()=>{const c=cardById(b.dataset.nnone);if(c){c.stage="listo";c.msg="";renderFeed()}});
  $$("[data-nn]").forEach(i=>i.oninput=e=>{const c=cardById(i.dataset.nn);if(c)c.spec.nombre=e.target.value});
  $$("[data-ns]").forEach(s=>s.onchange=e=>{const c=cardById(s.dataset.c);if(!c)return;c.spec[s.dataset.ns]=e.target.value;if(s.dataset.ns==="categoria"){c.spec.ubicacion=UBI_DE[e.target.value]||"Despensa";renderFeed()}});
  $$("[data-nq]").forEach(b=>b.onclick=()=>{const c=cardById(b.dataset.c);if(!c)return;c.spec.pq=0;c.spec.cantidad=Math.max(1,c.spec.cantidad+(+b.dataset.nq));renderFeed()});
  $$("[data-npp]").forEach(i=>i.onchange=e=>{const c=cardById(i.dataset.npp);if(!c)return;const S=c.spec;const n=Math.max(1,parseInt(e.target.value.replace(/\D/g,""))||1);S.pp=n;S.empaque=n>1?(S.empaque&&S.empaque!=="Suelto"?S.empaque:"Paquete"):"Suelto";if(S.pq)S.cantidad=S.pq*n;renderFeed()});
  $$("[data-nsave]").forEach(b=>b.onclick=async()=>{const c=cardById(b.dataset.nsave);await saveNew(c);trasGuardarPorToque(c)});
}
async function saveCambios(c){
  if(!c||c.busy||!canWrite){if(!canWrite)toast("No tienes permiso para cambiar este inventario.");return}
  c.busy=true;c.msg="";renderFeed();
  const fresh={};let changed=false,gone=[];
  for(const r of c.rows){const f=await freshOne(r.productoId);if(!f){gone.push(r);continue}fresh[r.productoId]=fresh[r.productoId]||f;if(f.cantidad!==r.base){r.base=f.cantidad;changed=true}}
  if(gone.length){c.rows=c.rows.filter(r=>!gone.includes(r));c.msg=`${gone.map(r=>r.nombre).join(", ")} ya no está en el inventario.`;changed=true}
  if(changed&&!c.ack){c.ack=true;c.busy=false;c.msg=(c.msg?c.msg+" ":"")+"Alguien cambió el inventario mientras tanto. Revisa los números nuevos y toca Guardar otra vez.";if(!c.rows.length)c.state="cancelled";renderFeed();return}
  const work={};
  for(const r of c.rows){
    let p=work[r.productoId]||JSON.parse(JSON.stringify(fresh[r.productoId]));
    if(r.minimo!=null)p.minimo=r.minimo;learnAlias(p,r.dicho);
    if(r.accion==="compra")p=applyPurchase(p,{n:r.n,f:r.fecha,precio:r.precio,tienda:r.tienda,vence:r.vence,pq:r.pq,pp:r.pq?ppOf(p):1});
    else if(r.accion==="uso")p=applyUse(p,r.todo?p.cantidad:Math.min(r.n,p.cantidad));
    else{const d=r.n-p.cantidad;if(d){const h={t:"a",n:d,f:today()};if(me)h.u=me;p={...p,cantidad:r.n,historial:[...(p.historial||[]),h].slice(-40)};if(r.n===0)p.vence=""}}
    work[r.productoId]=p;
  }
  try{
    await Promise.all(Object.values(work).map(saveP));
    c.state="saved";c.result=Object.values(work).map(p=>`${p.nombre}: ahora ${p.cantidad} en casa`);
    c.antes=Object.keys(work).map(id=>fresh[id]);c.despues=Object.values(work).map(p=>({id:p.id,cantidad:p.cantidad}));c.puedeDeshacer=true;marcarUltimo(c);
    asst.feed.push({k:"note",text:"La persona confirmó y se guardó: "+c.result.join("; ")});toast("Guardado en el inventario");
  }catch(e){writeErr(e)}
  c.busy=false;renderFeed();
}
async function mergeIfExists(c,code){
  const list=await freshAll();const p=list.find(x=>x.codigo===code||(x.paquetes&&x.paquetes[code]));if(!p)return false;
  const S=c.spec;c.state="merged";c.msg=`Ese código ya es de "${p.nombre}" en tu inventario, así que lo sumo como reposición y la app aprende que también lo llamas "${S.dicho}".`;
  stageChanges([{productoId:p.id,accion:"compra",cantidad:S.pq?0:S.cantidad,paquetes:S.pq||0,dicho:S.dicho||S.nombre,fecha:S.fecha,tienda:S.tienda,precio:S.precio,vence:S.vence,minimo:S.minimo}]);
  return true;
}
async function newByCode(c,file){
  if(!c||!file)return;c.busy="Leyendo el código…";c.msg="";renderFeed();
  const code=await decodeImage(file);
  if(!code){c.busy=false;c.msg="No se pudo leer el código. Acerca la cámara, evita reflejos o tómale una foto a la etiqueta.";renderFeed();return}
  const clean=String(code).replace(/\D/g,"");
  if(await mergeIfExists(c,clean)){c.busy=false;renderFeed();return}
  c.spec.codigo=clean;const k=CATALOG[clean];if(k){for(const f of ["marca","tamano"])if(!c.spec[f])c.spec[f]=k[f]||"";if(c.spec.categoria==="Otros"&&k.categoria){c.spec.categoria=k.categoria;c.spec.ubicacion=UBI_DE[k.categoria]||"Despensa"}}
  c.busy=false;c.stage="listo";renderFeed();
}
async function newByPhoto(c,file){
  if(!c||!file)return;
  try{const r=await processPhoto(file);c.spec.foto=r.foto;c.blob=r.blob}catch(e){c.msg="No se pudo abrir esa foto. Prueba con otra.";renderFeed();return}
  if(aiState==="ready"&&imgOK){
    c.busy="La IA está leyendo la etiqueta…";renderFeed();
    try{const l=await readLabel(c.blob);
      if(l&&l.esProducto!==false){const S=c.spec;
        for(const f of ["marca","tamano"])if(!S[f]&&l[f])S[f]=String(l[f]);
        if(CATS.includes(l.categoria)&&S.categoria==="Otros"){S.categoria=l.categoria;S.ubicacion=UBI_DE[l.categoria]||"Despensa"}
        if(!S.vence&&validDate(l.vence,false))S.vence=l.vence;
        const code=String(l.codigo||"").replace(/\D/g,"");if(code.length>=8){if(await mergeIfExists(c,code)){c.busy=false;renderFeed();return}S.codigo=code}}
    }catch(e){if(aiHardOff(e))aiState="off"}
  }
  c.busy=false;c.stage="listo";renderFeed();
}
async function saveNew(c){
  if(!c||c.busy)return;if(!canWrite){toast("No tienes permiso para cambiar este inventario.");return}
  const S=c.spec;if(!S.nombre.trim()){c.msg="El producto necesita un nombre.";renderFeed();return}
  c.busy=true;c.msg="";renderFeed();
  const list=await freshAll();
  const dup=(S.codigo&&list.find(x=>x.codigo===S.codigo||(x.paquetes&&x.paquetes[S.codigo])))||list.find(x=>keyOf(x.nombre)===keyOf(S.nombre)||(x.alias||[]).includes(keyOf(S.nombre)));
  if(dup){c.busy=false;c.state="merged";c.msg=`"${dup.nombre}" ya está en tu inventario, así que lo sumo como reposición.`;stageChanges([{productoId:dup.id,accion:"compra",cantidad:S.cantidad,dicho:S.dicho,fecha:S.fecha,tienda:S.tienda,precio:S.precio,vence:S.vence}]);return}
  let p=newProduct({...S,nombre:S.nombre.trim()});learnAlias(p,S.dicho);
  setPack(p,{code:S.codigo,pp:S.pp||1,empaque:S.empaque,unidad:S.unidad,principal:true});
  p=applyPurchase(p,{n:S.cantidad,f:S.fecha,precio:S.precio,tienda:S.tienda,vence:S.vence,pq:S.pq,pp:S.pp||1});
  try{await saveP(p);c.state="saved";c.result=[`${p.nombre}: ahora ${p.cantidad} en casa`];c.nuevoId=p.id;c.despues=[{id:p.id,cantidad:p.cantidad}];c.puedeDeshacer=true;marcarUltimo(c);asst.feed.push({k:"note",text:`Se guardó el producto nuevo ${p.nombre} con ${p.cantidad} en casa.`});toast(`${p.nombre} se agregó al inventario`)}catch(e){writeErr(e)}
  c.busy=false;renderFeed();
}

/* ---- Último guardado y Deshacer (1.5) ---- */
function marcarUltimo(c){const m=[...asst.feed].reverse().find(e=>e.k==="me");c.trasMe=m?m.id:null;asst.ultimo=c}
function trasGuardarPorToque(c){if(!c||c.state!=="saved"||!asst.open||!modoVoz())return;Voz.hablar("Listo, guardado.",true).then(()=>{if(asst.open&&Voz.cfg().continuo&&!asst.busy&&!asst.listening&&!pendientes().length)escucharTurno(true)})}
async function deshacer(c,porVoz){
  if(!c||c.state!=="saved"||!c.puedeDeshacer||!canWrite)return false;
  // Solo si nadie cambió esos productos después de guardar
  for(const d of c.despues||[]){const f=await freshOne(d.id);if(!f||f.cantidad!==d.cantidad)return false}
  try{
    if(c.nuevoId)await store.del("productos",c.nuevoId);
    else await Promise.all((c.antes||[]).map(p=>saveP(p)));
    c.state="undone";c.puedeDeshacer=false;asst.feed.push({k:"note",text:"La persona deshizo el último cambio; el inventario volvió a como estaba."});
    if(!porVoz)toast("Cambio deshecho");renderFeed();return true;
  }catch(e){writeErr(e);return false}
}
