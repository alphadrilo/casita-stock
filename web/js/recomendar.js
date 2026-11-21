/* Casita Stock — Recomendaciones de compra y datos para recetas (desde 2.0).
   Todo se calcula con el inventario y el historial reales (funciones de app.js y consumo.js).
   No guarda nada: solo propone. Agregar a la lista siempre lo confirma la persona. */
const Recomendar = (() => {
  const COMIDA = ["Despensa", "Lácteos", "Frutas y verduras", "Carnes", "Panadería", "Congelados", "Bebidas"];

  /* Marca, tienda favorita y la tienda más barata, según sus compras */
  function preferencias(p) {
    const compras = (p.historial || []).filter((h) => h.t === "c");
    const cuenta = {}, precios = {};
    for (const h of compras) {
      if (h.s) cuenta[h.s] = (cuenta[h.s] || 0) + 1;
      if (h.s && h.p != null && isFinite(+h.p)) {
        const unit = +h.p; // el historial guarda el precio por unidad
        if (!precios[h.s] || unit < precios[h.s]) precios[h.s] = unit;
      }
    }
    const tiendas = Object.entries(cuenta).sort((a, b) => b[1] - a[1]);
    const favorita = tiendas.length ? tiendas[0][0] : p.tienda || "";
    const baratas = Object.entries(precios).sort((a, b) => a[1] - b[1]);
    const barata = baratas.length > 1 ? { tienda: baratas[0][0], precio: Math.round(baratas[0][1] * 100) / 100 } : null;
    return { marca: p.marca || "", tienda: favorita, vecesEnTienda: tiendas.length ? tiendas[0][1] : 0, compras: compras.length, barata: barata && barata.tienda !== favorita ? barata : null };
  }

  /* Cuándo se acabaría, en días (null si no hay datos) */
  function diasRestantes(p) {
    const d = daysLeft(p);
    return d == null ? null : Math.max(0, Math.round(d * 10) / 10);
  }
  function fechaAgota(d) { if (d == null) return null; const t = new Date(); t.setDate(t.getDate() + Math.round(d)); return t.toISOString().slice(0, 10); }

  /* Productos que conviene comprar en los próximos `dias`, con el motivo */
  function recomendaciones({ dias = 7, max = 12 } = {}) {
    const enLista = new Set(lista.map((x) => x.productoId).filter(Boolean));
    const out = [];
    for (const p of inventory) {
      const [st] = status(p), d = diasRestantes(p), exp = expInfo(p);
      let urg = null, motivo = "";
      const conf = typeof Consumo !== "undefined" && Consumo.activo(p) ? Consumo.estimar(p).conf : null;
      const prov = conf === "baja" ? " (cálculo provisional)" : "";
      if (p.cantidad <= 0 && !enUso(p)) { urg = 0; motivo = "Se acabó."; }
      else if (st === "low") {
        urg = d != null ? d : 1;
        motivo = d != null && d < 3 ? `Queda poco: por cómo lo usan, alcanza para ${d < 1.5 ? "1 o 2 días" : `unos ${Math.round(d)} días`}${prov}.`
          : `Queda poco: hay ${qtyTxt(p)} y pediste aviso al llegar a ${p.minimo || 0}${d != null ? `; por cómo lo usan alcanza para unos ${Math.round(d)} días${prov}` : ""}.`;
      } else if (d != null && d <= dias) { urg = d; motivo = `Por cómo lo usan, se acabaría en unos ${Math.max(1, Math.round(d))} días${prov}.`; }
      if (urg == null) continue;
      const pr = preferencias(p);
      const extra = [];
      if (pr.marca) extra.push(`sueles comprar ${pr.marca}`);
      if (pr.tienda) extra.push(`casi siempre en ${pr.tienda}`);
      if (pr.barata) extra.push(`en ${pr.barata.tienda} te salió más barato (${money(pr.barata.precio)} c/u)`);
      out.push({
        productoId: p.id, nombre: p.nombre, marca: pr.marca || undefined, tienda: pr.tienda || undefined,
        cantidad: recBuy(p), cantidadTexto: qtyTxt(p, recBuy(p)), enCasa: qtyTxt(p), diasQueAlcanza: d, seAcabaria: fechaAgota(d),
        motivo: motivo + (extra.length ? " " + cap0(extra.join(", ")) + "." : ""), yaEnLista: enLista.has(p.id), urgencia: urg,
        vence: exp && exp.d <= 7 ? exp.text : undefined,
      });
    }
    return out.sort((a, b) => a.yaEnLista - b.yaEnLista || a.urgencia - b.urgencia || a.nombre.localeCompare(b.nombre)).slice(0, max);
  }

  /* Lo que hay para cocinar: primero lo que vence antes */
  function paraRecetas() {
    const hay = inventory.filter((p) => COMIDA.includes(p.categoria) && (p.cantidad > 0 || enUso(p)));
    const items = hay.map((p) => { const e = expInfo(p); return { nombre: p.nombre, marca: p.marca || undefined, hay: qtyTxt(p) + (enUso(p) ? " (hay uno abierto)" : ""), categoria: p.categoria, venceEnDias: e ? e.d : undefined, usarPronto: !!(e && e.d <= 4) }; })
      .sort((a, b) => (a.venceEnDias ?? 999) - (b.venceEnDias ?? 999));
    return { ingredientes: items.slice(0, 40), usarPrimero: items.filter((x) => x.usarPronto).map((x) => x.nombre) };
  }

  /* Agrega a la lista lo que la persona confirmó (no duplica) */
  async function agregarALista(items) {
    const hechos = [];
    for (const it of items) {
      const p = it.productoId && inventory.find((x) => x.id === it.productoId);
      const nombre = p ? p.nombre : String(it.nombre || "").trim(); if (!nombre) continue;
      const id = p ? "p_" + p.id : uid();
      const ya = lista.find((x) => (p && x.productoId === p.id) || (!p && norm(x.nombre) === norm(nombre) && !x.marcado));
      if (ya && !ya.marcado) continue;
      const data = { productoId: p ? p.id : "", nombre, cantidad: Math.max(1, Math.round(+it.cantidad || (p ? recBuy(p) : 1))), marcado: false, creado: Date.now(), u: me || "" };
      await store.set("lista", ya ? ya.id : id, data); hechos.push({ id: ya ? ya.id : id, nombre, antes: ya ? { ...ya } : null });
    }
    return hechos;
  }

  async function deshacerLista(hechos) {
    for (const h of hechos) { if (h.antes) { const { id, ...d } = h.antes; await store.set("lista", h.id, d); } else await store.del("lista", h.id); }
  }

  return { deshacerLista, preferencias, recomendaciones, paraRecetas, agregarALista, diasRestantes };
})();
window.Recomendar = Recomendar;
