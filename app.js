(function(){
  const API_URL = 'https://script.google.com/macros/s/AKfycbzlCo2SCTJ0hAsexiC59SKhJvHg0aQNYMvDvxH-mKW9sGF1XX1VR3jzCGPjF7AOhIjb-g/exec';
  let pedidos = [], stock = [], finanzas = [], currentTab = 'taller', historialMonthOffset = 0, editId = null;

  // --- Helpers ---
  const $ = id => document.getElementById(id);
  const fmt = n => '$' + Math.round(n).toLocaleString('es-CL');
  const norm = s => (s||'').toString().toLowerCase().replace(/\s+/g,' ').trim();
  const cap = s => s ? s.toLowerCase().replace(/(?:^|[\s-])\w/g, m => m.toUpperCase()) : '';
  const esc = str => { const d = document.createElement('div'); d.textContent = str||''; return d.innerHTML; };
  const fechaCorta = iso => { const d = new Date(iso); return d.toLocaleDateString('es-CL',{day:'2-digit',month:'2-digit'})+' '+d.toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'}); };
  const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const STAR = '<svg class="w-full h-full" viewBox="0 0 100 100" fill="none"><path d="M50 5 C52 35 55 45 95 50 C55 55 52 65 50 95 C48 65 45 55 5 50 C45 45 48 35 50 5 Z" fill="#E8E8E8"/></svg>';

  const main=$('main'), sheet=$('sheetOverlay'), pasteBox=$('pasteBox'), previewBox=$('previewBox'),
    errorMsg=$('errorMsg'), toast=$('toast'), loadingScreen=$('loadingScreen'), connBanner=$('connBanner'),
    btnGuardar=$('btnGuardar'), modalTitle=$('modalTitle'), montoTotal=$('montoTotal'),
    montoAbonado=$('montoAbonado'), porPagarPreview=$('porPagarPreview'),
    porPagarPreviewAmt=$('porPagarPreviewAmt'), stockIndicator=$('stockIndicator');
  // despacho
  const toggleRetiro=$('toggleRetiro'), toggleDespacho=$('toggleDespacho'), despachoWrap=$('despachoWrap'), montoDespacho=$('montoDespacho');

  // --- UI ---
  function showToast(msg){
    toast.textContent=msg;
    toast.classList.replace('opacity-0','opacity-100'); toast.classList.remove('translate-y-2');
    setTimeout(()=>{ toast.classList.replace('opacity-100','opacity-0'); toast.classList.add('translate-y-2'); },2500);
  }

  function setOnline(online){
    connBanner.classList.toggle('hidden',online); connBanner.classList.toggle('flex',!online);
  }

  function saveLocal(){ localStorage.setItem('onyx_pedidos',JSON.stringify(pedidos)); }

  function customConfirm(title,msg,danger=false){
    return new Promise(resolve=>{
      const ov=$('confirmOverlay'),box=$('confirmBox'),ok=$('btnConfirmOk'),ca=$('btnConfirmCancel');
      $('confirmTitle').textContent=title; $('confirmMessage').textContent=msg;
      ok.className=danger
        ?"px-5 py-2.5 rounded-lg text-xs font-bold tracking-wider uppercase bg-red-950/40 text-red-400 border border-red-900/50 hover:bg-red-900/60 transition-all"
        :"px-5 py-2.5 rounded-lg text-xs font-bold tracking-wider uppercase bg-[#E8E8E8] text-[#0A0A0A] hover:bg-white transition-all";
      ok.textContent=danger?"Eliminar":"Confirmar";
      const close=r=>{ ov.classList.replace('opacity-100','opacity-0'); box.classList.replace('scale-100','scale-95'); setTimeout(()=>{ ov.classList.add('hidden'); ov.classList.remove('flex'); },200); ok.onclick=ca.onclick=null; resolve(r); };
      ok.onclick=()=>close(true); ca.onclick=()=>close(false);
      ov.classList.remove('hidden'); ov.classList.add('flex');
      requestAnimationFrame(()=>{ ov.classList.replace('opacity-0','opacity-100'); box.classList.replace('scale-95','scale-100'); });
    });
  }

  // --- API ---
  async function api(action=null,data=null){
    const opts=action
      ?{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action,...data})}
      :{method:'GET'};
    const res=await fetch(API_URL,opts);
    if(!res.ok) throw new Error('API error');
    return res.json();
  }

  async function cargar(loader){
    const rb=localStorage.getItem('onyx_pedidos');
    if(rb){ pedidos=JSON.parse(rb); render(); }
    try{
      const data=await api();
      if(data.pedidos){ pedidos=data.pedidos; saveLocal(); }
      if(data.stock){ stock=data.stock; }
      if(data.finanzas){ finanzas=data.finanzas; }
      setOnline(true);
    }catch(e){ setOnline(false); }
    if(loader) loadingScreen.style.display='none';
    render();
  }

  $('btnReintentar').addEventListener('click',()=>{ $('loadingText').textContent='Reintentando...'; loadingScreen.style.display='flex'; cargar(true); });

  // --- Parser de texto libre ---
  // Detecta campos con etiqueta (Nombre: Juan) o sin etiqueta por posición
  function parsearTexto(txt){
    const c={cliente:'',telefono:'',direccion:'',color:'',talla:''};
    if(!txt.trim()) return c;

    const lineas=txt.trim().split('\n').map(l=>l.trim()).filter(Boolean);

    // Primero intentar detección por etiqueta (con o sin ":")
    const conEtiqueta = lineas.some(l=>l.includes(':') && l.indexOf(':')<20);

    if(conEtiqueta){
      lineas.forEach(l=>{
        const i=l.indexOf(':'); if(i===-1) return;
        const k=norm(l.slice(0,i)), v=cap(l.slice(i+1).trim());
        if(!v) return;
        if(k.includes('nombre')||k.includes('cliente')) c.cliente=v;
        else if(k.includes('tel')||k.includes('cel')||k.includes('fono')) c.telefono=l.slice(i+1).trim();
        else if(k.includes('direcci')) c.direccion=v;
        else if(k.includes('polera')){
          // "Polera: negro xl" -> separa color y talla si vienen juntos
          const TALLAS=['XS','S','M','L','XL','XXL','XXXL'];
          const partes=l.slice(i+1).trim().split(/\s+/);
          const ultima=partes[partes.length-1].toUpperCase();
          if(partes.length>1 && TALLAS.includes(ultima)){
            c.talla=ultima;
            c.color=cap(partes.slice(0,-1).join(' '));
          } else {
            c.color=v;
          }
        }
        else if(k.includes('color')) c.color=v;
        else if(k.includes('talla')) c.talla=l.slice(i+1).trim().toUpperCase();
      });
      return c;
    }

    // Sin etiquetas: detectar por contenido de cada línea
    const TALLAS = ['XS','S','M','L','XL','XXL','XXXL'];
    const COLORES = [...new Set(stock.map(s=>norm(s.color)))]; // colores del stock
    const TELEFONO_RE = /^[\+\d][\d\s\-]{6,}/;

    lineas.forEach(l=>{
      const lu = l.toUpperCase().trim();
      const ln = norm(l);

      if(!c.talla && TALLAS.includes(lu)){
        c.talla = lu; return;
      }
      if(!c.talla && TALLAS.some(t=>lu===t)){
        c.talla = lu; return;
      }
      if(!c.color && COLORES.length && COLORES.some(col=>ln.includes(col))){
        // extraer el color del stock que coincide
        const match = COLORES.find(col=>ln.includes(col));
        c.color = cap(match); return;
      }
      if(!c.telefono && TELEFONO_RE.test(l)){
        c.telefono = l.trim(); return;
      }
      // Si tiene números y letras, probablemente dirección
      if(!c.direccion && /\d/.test(l) && l.length > 5 && !TELEFONO_RE.test(l)){
        c.direccion = cap(l); return;
      }
      // Lo que queda y no tiene números → nombre
      if(!c.cliente && !/\d/.test(l) && l.length > 2){
        c.cliente = cap(l); return;
      }
    });

    // Segunda pasada: si color sigue vacío, buscar en lineas que no sean nombre/tel/dir/talla
    if(!c.color){
      lineas.forEach(l=>{
        const lu=l.toUpperCase().trim();
        if(l===c.cliente||l===c.telefono||l===c.direccion||lu===c.talla) return;
        if(!/\d/.test(l) && l.length>1 && !c.color) c.color=cap(l);
      });
    }

    return c;
  }

  function actualizarPreview(){
    const txt=pasteBox.value.trim();
    if(!txt){
      previewBox.innerHTML='<span class="italic text-[#5A5A5A]">Aquí verás los datos detectados.</span>';
      stockIndicator.classList.add('hidden');
    } else {
      const c=parsearTexto(txt);
      // indicador de stock
      if(c.color||c.talla){
        const item=stock.find(s=>norm(s.color)===norm(c.color)&&norm(s.talla)===norm(c.talla));
        const cant=item?Number(item.cantidad):-1;
        stockIndicator.classList.remove('hidden');
        if(cant>2){
          stockIndicator.className='rounded-lg px-3 py-2 text-xs font-semibold mb-4 border flex items-center gap-2 bg-emerald-950/20 border-emerald-900/30 text-emerald-400';
          stockIndicator.innerHTML=`<span>✓</span><span>${cant} unidades disponibles</span>`;
        } else if(cant>0){
          stockIndicator.className='rounded-lg px-3 py-2 text-xs font-semibold mb-4 border flex items-center gap-2 bg-amber-950/20 border-amber-800/30 text-amber-400';
          stockIndicator.innerHTML=`<span>⚠️</span><span>Últimas ${cant} unidade${cant===1?'':'s'} — stock bajo</span>`;
        } else {
          stockIndicator.className='rounded-lg px-3 py-2 text-xs font-semibold mb-4 border flex items-center gap-2 bg-red-950/20 border-red-900/30 text-red-400';
          stockIndicator.innerHTML=`<span>✕</span><span>Sin stock — quedará como "Por Comprar"</span>`;
        }
      } else {
        stockIndicator.classList.add('hidden');
      }
      previewBox.innerHTML=`
        <div class="space-y-1">
          <div>👤 <b class="text-[#E8E8E8]">${esc(c.cliente)||'—'}</b>${c.telefono?` · 📱 ${esc(c.telefono)}`:''}</div>
          ${c.direccion?`<div>📍 ${esc(c.direccion)}</div>`:''}
          <div>👕 Polera <b class="text-[#E8E8E8]">${esc(c.color)||'—'}</b>${c.talla?` · Talla <b class="text-[#E8E8E8]">${esc(c.talla)}</b>`:''}</div>
        </div>`;
    }
    // por pagar
    const total=parseFloat(montoTotal.value)||0, abonado=parseFloat(montoAbonado.value)||0;
    const despacho=parseFloat(montoDespacho?.value)||0;
    if(!montoTotal.value){ porPagarPreview.classList.add('hidden'); return; }
    const pp=total+despacho-abonado;
    porPagarPreview.classList.remove('hidden');
    porPagarPreview.className=`text-center p-3 rounded-lg mb-4 border ${pp>0?'bg-red-950/14 border-red-900/30 text-red-400':'bg-emerald-950/14 border-emerald-900/30 text-emerald-400'}`;
    porPagarPreviewAmt.textContent=fmt(pp);
  }

  ['input','change'].forEach(ev=>{
    pasteBox.addEventListener(ev,actualizarPreview);
    montoTotal.addEventListener(ev,actualizarPreview);
    montoAbonado.addEventListener(ev,actualizarPreview);
    montoDespacho?.addEventListener(ev,actualizarPreview);
  });

  // --- Modal ---
  const cerrarSheet=()=>{ sheet.classList.remove('flex'); sheet.classList.add('hidden'); };

  const abrirModal=(id=null)=>{
    editId=id; errorMsg.classList.add('hidden'); stockIndicator.classList.add('hidden');
    if(id){
      modalTitle.textContent="Editar pedido";
      const p=pedidos.find(x=>x.id===id);
      pasteBox.value=`Nombre: ${p.cliente}\nTeléfono: ${p.telefono||''}\nDirección: ${p.direccion||''}\nColor: ${p.color||''}\nTalla: ${p.talla||''}`;
      montoTotal.value=p.montoTotal; montoAbonado.value=p.montoAbonado;
      const dep=Number(p.despacho)||0;
      if(dep>0){ setModoEnvio('despacho'); montoDespacho.value=dep; }
      else { setModoEnvio('retiro'); }
    } else {
      modalTitle.textContent="Nuevo pedido";
      pasteBox.value=montoTotal.value=montoAbonado.value='';
      setModoEnvio('retiro');
    }
    actualizarPreview();
    sheet.classList.remove('hidden'); sheet.classList.add('flex');
    setTimeout(()=>pasteBox.focus(),200);
  };

  $('btnNuevo').addEventListener('click',()=>abrirModal(null));

  // Toggle Retiro / Despacho
  function setModoEnvio(modo){
    const esDespacho=modo==='despacho';
    toggleRetiro.classList.toggle('bg-[#E8E8E8]',!esDespacho);
    toggleRetiro.classList.toggle('text-[#0A0A0A]',!esDespacho);
    toggleRetiro.classList.toggle('text-[#5A5A5A]',esDespacho);
    toggleDespacho.classList.toggle('bg-[#E8E8E8]',esDespacho);
    toggleDespacho.classList.toggle('text-[#0A0A0A]',esDespacho);
    toggleDespacho.classList.toggle('text-[#5A5A5A]',!esDespacho);
    despachoWrap.classList.toggle('hidden',!esDespacho);
    if(!esDespacho) montoDespacho.value='';
    actualizarPreview();
  }
  toggleRetiro.addEventListener('click',()=>setModoEnvio('retiro'));
  toggleDespacho.addEventListener('click',()=>setModoEnvio('despacho'));
  $('btnPlantilla').addEventListener('click',()=>{
    pasteBox.value='Nombre: \nTeléfono: \nDirección: \nColor: \nTalla: ';
    pasteBox.focus();
    // mover cursor al final de "Nombre: "
    const pos=pasteBox.value.indexOf('\n'); pasteBox.setSelectionRange(pos,pos);
    actualizarPreview();
  });
  window.appEditarPedido=abrirModal;
  $('btnCancelar').addEventListener('click',cerrarSheet);
  sheet.addEventListener('click',e=>{ if(e.target===sheet) cerrarSheet(); });

  // --- Guardar ---
  btnGuardar.addEventListener('click',async()=>{
    const c=parsearTexto(pasteBox.value.trim());
    const total=parseFloat(montoTotal.value), abonado=parseFloat(montoAbonado.value)||0;
    if(!c.cliente||isNaN(total)){
      errorMsg.textContent=!c.cliente?'No se detectó el nombre del cliente.':'Ingresa el monto total.';
      errorMsg.classList.remove('hidden'); return;
    }
    btnGuardar.disabled=true; btnGuardar.textContent='Guardando...';
    const despacho=parseFloat(montoDespacho?.value)||0;
    const payload={cliente:c.cliente,telefono:c.telefono,direccion:c.direccion,
      color:c.color,talla:c.talla,montoTotal:total,montoAbonado:abonado,despacho:despacho,porPagar:total+despacho-abonado};
    try{
      if(editId){
        await api('update',{id:editId,...payload});
        showToast('Pedido actualizado ✓');
      } else {
        payload.fecha=new Date().toISOString(); payload.estado='Pendiente';
        const r=await api('create',{pedido:payload});
        showToast(r&&r.sinStock?'⚠️ Guardado · Sin stock disponible':'Pedido guardado ✓');
      }
      setOnline(true); cerrarSheet(); await cargar(false);
    }catch(e){
      setOnline(false); errorMsg.textContent='Error de conexión. Intenta de nuevo.'; errorMsg.classList.remove('hidden');
    }finally{ btnGuardar.disabled=false; btnGuardar.textContent='Guardar Pedido'; }
  });

  // --- Tabs ---
  document.querySelectorAll('.tab').forEach(tab=>{
    tab.addEventListener('click',()=>{
      document.querySelectorAll('.tab').forEach(t=>t.classList.remove('text-[#E8E8E8]','border-[#E8E8E8]'));
      tab.classList.add('text-[#E8E8E8]','border-[#E8E8E8]');
      currentTab=tab.dataset.tab;
      if(currentTab==='historial') historialMonthOffset=0;
      // Ocultar botón + en stock e historial
      $('btnNuevoWrap').classList.toggle('hidden', currentTab!=='taller' && currentTab!=='finanzas');
      if(currentTab==='finanzas') $('btnNuevoWrap').classList.add('hidden');
      render();
    });
  });

  // --- Acciones pedidos ---
  window.appMarcarEntregado=async id=>{
    if(!await customConfirm('Entregar pedido','¿Marcar como entregado? Se moverá al historial.',false)) return;
    const p=pedidos.find(x=>x.id===id); if(!p) return;
    p.estado='Entregado'; saveLocal(); render();
    try{ await api('updateEstado',{id,estado:'Entregado'}); setOnline(true); showToast('Pedido entregado'); await cargar(false); }
    catch(e){ setOnline(false); p.estado='Pendiente'; saveLocal(); showToast('Error. Reintenta.'); render(); }
  };

  window.appEliminarPedido=async id=>{
    if(!await customConfirm('Eliminar pedido','¿Eliminar permanentemente? No se puede deshacer.',true)) return;
    const rb=pedidos; pedidos=pedidos.filter(x=>x.id!==id); saveLocal(); render();
    try{ await api('delete',{id}); setOnline(true); showToast('Pedido eliminado'); await cargar(false); }
    catch(e){ setOnline(false); pedidos=rb; saveLocal(); showToast('Error. Reintenta.'); render(); }
  };

  // --- Render helpers ---
  const getMonthBounds=offset=>{
    const now=new Date(), t=new Date(now.getFullYear(),now.getMonth()+offset,1);
    return{start:new Date(t.getFullYear(),t.getMonth(),1),end:new Date(t.getFullYear(),t.getMonth()+1,1),year:t.getFullYear(),month:t.getMonth()};
  };

  function calcSinStock(p){
    // El backend reconcilia el campo sinStock en cada carga (doGet), asignando
    // unidades disponibles al pedido pendiente más antiguo de cada talla/color.
    // Por eso aquí confiamos directamente en el valor que llega de la hoja,
    // sin volver a cruzarlo contra el stock local (eso causaba que 2 pedidos
    // de la misma talla cambiaran de alerta a la vez al agregar 1 sola unidad).
    return !!p.sinStock;
  }

  function renderDashboard(){
    const b=getMonthBounds(0), pAct=pedidos.filter(p=>{ const f=new Date(p.fecha); return f>=b.start&&f<b.end; });
    const ingresos=pAct.reduce((s,p)=>s+(p.estado==='Entregado'?p.montoTotal:p.montoAbonado),0);
    const ventas=pAct.reduce((s,p)=>s+p.montoTotal,0);
    return`<div class="mb-4">
      <div class="text-xs text-[#5A5A5A] tracking-wider mb-3 flex justify-between items-baseline">
        <span>Rendimiento del mes</span>
        <span class="font-display text-sm text-[#E8E8E8] font-semibold capitalize">${MESES[new Date().getMonth()]} ${new Date().getFullYear()}</span>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div class="bg-[#141414] border border-[#2A2A2A] rounded-xl p-4 relative overflow-hidden">
          <div class="absolute top-2.5 right-2.5 w-4 h-4 opacity-20">${STAR}</div>
          <div class="text-[10px] tracking-wider uppercase text-emerald-500 mb-2 font-semibold">Ingreso Real</div>
          <div class="font-display text-2xl font-semibold text-[#E8E8E8] leading-none">${fmt(ingresos)}</div>
          <div class="text-[10px] text-[#5A5A5A] mt-2">Dinero en caja</div>
        </div>
        <div class="bg-[#141414] border border-[#2A2A2A] rounded-xl p-4 relative overflow-hidden hidden md:block">
          <div class="absolute top-2.5 right-2.5 w-4 h-4 opacity-20">${STAR}</div>
          <div class="text-[10px] tracking-wider uppercase text-[#5A5A5A] mb-2">Venta Bruta</div>
          <div class="font-display text-2xl font-semibold text-[#E8E8E8] leading-none">${fmt(ventas)}</div>
          <div class="text-[10px] text-[#5A5A5A] mt-2">Total si todos pagan</div>
        </div>
        <div class="bg-[#141414] border border-[#2A2A2A] rounded-xl p-4 relative overflow-hidden">
          <div class="absolute top-2.5 right-2.5 w-4 h-4 opacity-20">${STAR}</div>
          <div class="text-[10px] tracking-wider uppercase text-[#5A5A5A] mb-2">Pedidos Mes</div>
          <div class="font-display text-2xl font-semibold text-[#E8E8E8] leading-none">${pAct.length}</div>
          <div class="text-[10px] text-[#5A5A5A] mt-2">Nuevos trabajos</div>
        </div>
      </div>
    </div>`;
  }

  function cartaPedido(p){
    const debe=p.porPagar>0, sinStock=calcSinStock(p);
    return`<div class="bg-[#141414] border ${sinStock?'border-amber-800/50':'border-[#2A2A2A]'} rounded-xl relative overflow-hidden flex flex-col hover:border-[#5A5A5A] transition-colors">
      <div class="absolute top-0 left-0 bottom-0 w-[3px] ${sinStock?'bg-amber-500':debe?'bg-red-600':'bg-emerald-600'}"></div>
      ${sinStock?`<div class="bg-amber-950/30 border-b border-amber-800/30 px-4 py-2 flex items-center gap-2"><span>⚠️</span><span class="text-[10px] font-bold uppercase tracking-widest text-amber-400">Por Comprar · Falta Stock</span></div>`:''}
      <div class="p-5 pl-6 flex-1 flex flex-col">
        <div class="flex justify-between items-start mb-2">
          <div>
            <div class="font-mono text-[10.5px] text-[#5A5A5A] tracking-wider">N° ${String(p.id).padStart(3,'0')}</div>
            <div class="font-display text-xl font-semibold text-[#E8E8E8] mt-0.5 leading-tight">${esc(p.cliente)}</div>
            ${p.telefono?`<a href="https://wa.me/${p.telefono.replace(/\D/g,'')}" target="_blank" class="text-xs text-blue-400 hover:text-blue-300 mt-1 inline-block">📱 ${esc(p.telefono)}</a>`:''}
          </div>
          <div class="text-[10px] text-[#5A5A5A] text-right whitespace-nowrap">${fechaCorta(p.fecha)}</div>
        </div>
        <div class="flex flex-wrap gap-1.5 my-3">
          ${(p.color||p.talla)?`<span class="text-xs px-3 py-1.5 rounded-md border font-medium tracking-wide ${sinStock?'bg-amber-950/20 border-amber-800/40 text-amber-300':'bg-[#1C1C1C] border-[#2A2A2A] text-[#E8E8E8]'}">👕 Polera ${p.color?esc(cap(p.color)):''}${p.talla?` · Talla ${esc(p.talla)}`:''}</span>`:''}
        </div>
        ${p.direccion?`<a href="https://maps.google.com/?q=${encodeURIComponent(p.direccion)}" target="_blank" rel="noopener" class="text-[12.5px] text-[#9C9C9C] my-2 flex gap-2 items-start bg-[#1C1C1C] p-2.5 rounded-lg border border-[#2A2A2A]/50 hover:border-[#5A5A5A] hover:text-[#E8E8E8] transition-colors active:scale-[0.99]"><span>📍</span><span class="flex-1">${esc(p.direccion)}</span><span class="text-[10px] text-blue-400 self-center whitespace-nowrap">Ver mapa ›</span></a>`:''}
        <div class="mt-auto pt-4 border-t border-[#2A2A2A]">
          <div class="flex gap-3 text-[11px] text-[#5A5A5A] mb-3">
            <div>Poleras<b class="block text-[13px] text-[#E8E8E8] font-mono font-normal mt-0.5">${fmt(p.montoTotal)}</b></div>
            ${Number(p.despacho)>0?`<div>Despacho<b class="block text-[13px] text-[#E8E8E8] font-mono font-normal mt-0.5">${fmt(p.despacho)}</b></div>`:'<div>🏠 Retiro<b class="block text-[13px] text-[#9C9C9C] font-mono font-normal mt-0.5">—</b></div>'}
            <div>Abono<b class="block text-[13px] text-[#E8E8E8] font-mono font-normal mt-0.5">${fmt(p.montoAbonado)}</b></div>
          </div>
          <div class="flex justify-between items-center pt-2 border-t border-[#2A2A2A]/50">
            <div class="text-[9.5px] uppercase tracking-wider text-[#5A5A5A]">${debe?'Deuda pendiente':'Al día ✓'}</div>
            <div class="font-display text-xl font-bold leading-none ${debe?'text-red-500':'text-emerald-500'}">${fmt(p.porPagar)}</div>
          </div>
        </div>
        ${p.imagenUrl?`<button class="w-full mt-3 bg-[#1C1C1C] border border-[#2A2A2A] rounded-lg py-2.5 text-xs font-bold tracking-widest uppercase text-[#9C9C9C] hover:bg-[#2A2A2A] hover:text-[#E8E8E8] transition-colors flex items-center justify-center gap-2" onclick="appVisualizarDTF(${p.id},'${p.imagenUrl}')">🖼 Visualizar diseño</button>`:''}
        <div class="flex gap-2 mt-3 pt-4 border-t border-[#2A2A2A]/50">
          <button class="flex-1 bg-[#E8E8E8] text-[#0A0A0A] py-2.5 rounded-lg text-xs font-bold tracking-wider uppercase active:scale-[0.98] hover:bg-white transition-all" onclick="appMarcarEntregado(${p.id})">Entregar</button>
          <button class="w-12 bg-[#1C1C1C] border border-[#2A2A2A] rounded-lg text-[#9C9C9C] text-sm flex items-center justify-center hover:bg-[#2A2A2A] transition-colors" onclick="appEditarPedido(${p.id})">✏️</button>
          <button class="w-12 bg-red-950/20 border border-red-900/30 rounded-lg text-red-500/70 text-sm flex items-center justify-center hover:bg-red-900/40 hover:text-red-400 transition-colors" onclick="appEliminarPedido(${p.id})">✕</button>
        </div>
      </div>
    </div>`;
  }

  function renderTaller(){
    const pendientes=pedidos.filter(p=>p.estado==='Pendiente');
    const listaHtml=lista=>lista.length===0
      ?`<div class="col-span-full text-center py-16 text-[#5A5A5A]"><div class="w-8 h-8 mx-auto mb-3 opacity-40">${STAR}</div><p class="text-sm text-[#9C9C9C] font-semibold">No hay pedidos pendientes.</p></div>`
      :lista.map(cartaPedido).join('');

    main.innerHTML=renderDashboard()+`
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-3 my-4">
        <div class="text-xs tracking-[0.12em] uppercase text-[#5A5A5A] flex items-center gap-2 after:content-[''] after:flex-1 after:h-[1px] after:bg-[#2A2A2A] md:w-1/2">En producción (${pendientes.length})</div>
        <div class="relative md:w-1/2">
          <span class="absolute left-3 top-1/2 -translate-y-1/2 opacity-50 text-xs">🔎</span>
          <input type="text" id="buscadorTaller" class="w-full py-2.5 pl-9 pr-4 rounded-lg border border-[#2A2A2A] bg-[#141414] text-sm text-[#E8E8E8] focus:outline-none focus:border-[#5A5A5A]" placeholder="Buscar pedido...">
        </div>
      </div>
      <div id="tallerList" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">${listaHtml(pendientes)}</div>`;

    $('buscadorTaller')?.addEventListener('input',e=>{
      const q=e.target.value.trim().toLowerCase();
      $('tallerList').innerHTML=listaHtml(pendientes.filter(p=>
        p.cliente.toLowerCase().includes(q)||(p.telefono&&p.telefono.includes(q))||String(p.id).includes(q)
      ));
    });
  }

  function renderHistorial(){
    const b=getMonthBounds(historialMonthOffset);
    const ents=pedidos.filter(p=>p.estado==='Entregado'&&new Date(p.fecha)>=b.start&&new Date(p.fecha)<b.end)
      .sort((a,b)=>new Date(b.fecha)-new Date(a.fecha));
    const totalMes=ents.reduce((s,p)=>s+p.montoTotal,0);
    const itemHtml=p=>`<div class="bg-[#141414] border border-[#2A2A2A] rounded-xl p-4 mb-3 flex justify-between items-center hover:border-[#5A5A5A] transition-colors">
      <div>
        <div class="font-semibold text-[15px] text-[#E8E8E8]">${esc(p.cliente)}</div>
        <div class="text-[11px] text-[#5A5A5A] mt-1">N° ${String(p.id).padStart(3,'0')} · ${fechaCorta(p.fecha)}</div>
        ${(p.color||p.talla)?`<div class="text-[11px] text-[#5A5A5A] mt-1">👕 ${p.color?esc(cap(p.color)):''}${p.talla?` · Talla ${esc(p.talla)}`:''}</div>`:''}
      </div>
      <div class="text-right flex flex-col items-end">
        <span class="text-[9px] uppercase tracking-widest font-bold text-emerald-400 bg-emerald-950/30 px-2.5 py-1 rounded-md border border-emerald-900/40 mb-1.5">Entregado</span>
        <div class="font-mono text-sm text-[#9C9C9C]">${fmt(p.montoTotal)}</div>
      </div>
    </div>`;

    let html=`<div class="flex items-center justify-between mb-5 py-2 bg-[#141414] rounded-xl border border-[#2A2A2A] px-4">
      <button id="prevMonth" class="w-10 h-10 rounded-full hover:bg-[#2A2A2A] text-[#9C9C9C] flex items-center justify-center text-lg transition-colors">‹</button>
      <div class="font-display text-xl font-semibold text-[#E8E8E8] capitalize">${MESES[b.month]} ${b.year}</div>
      <button id="nextMonth" class="w-10 h-10 rounded-full hover:bg-[#2A2A2A] text-[#9C9C9C] flex items-center justify-center text-lg disabled:opacity-30" ${historialMonthOffset===0?'disabled':''}>›</button>
    </div>
    ${ents.length?`<div class="text-xs tracking-[0.12em] uppercase text-[#5A5A5A] my-4 flex items-center gap-2 after:content-[''] after:flex-1 after:h-[1px] after:bg-[#2A2A2A]">${ents.length} entregados · ${fmt(totalMes)}</div>`:''}
    <div class="relative mb-5">
      <span class="absolute left-4 top-1/2 -translate-y-1/2 opacity-50 text-sm">🔎</span>
      <input type="text" id="buscadorInput" class="w-full py-3.5 pl-10 pr-4 rounded-xl border border-[#2A2A2A] bg-[#141414] text-sm text-[#E8E8E8] focus:outline-none focus:border-[#5A5A5A]" placeholder="Buscar en el historial...">
    </div>`;

    if(!ents.length){
      main.innerHTML=html+`<div class="text-center py-20 text-[#5A5A5A]"><div class="w-10 h-10 mx-auto mb-4 opacity-30">${STAR}</div><p class="text-base text-[#9C9C9C] font-semibold">Sin entregas este mes.</p></div>`;
    } else {
      main.innerHTML=html+`<div id="histList" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">${ents.map(itemHtml).join('')}</div>`;
      $('buscadorInput')?.addEventListener('input',e=>{
        const q=e.target.value.trim().toLowerCase();
        const f=ents.filter(p=>p.cliente.toLowerCase().includes(q)||String(p.id).includes(q));
        $('histList').innerHTML=f.length?f.map(itemHtml).join(''):`<div class="col-span-full text-center py-8 text-sm text-[#5A5A5A]">Sin resultados.</div>`;
      });
    }
    $('prevMonth')?.addEventListener('click',()=>{ historialMonthOffset--; render(); });
    $('nextMonth')?.addEventListener('click',()=>{ if(historialMonthOffset<0){ historialMonthOffset++; render(); } });
  }

  function renderStock(){
    if(!stock.length){
      main.innerHTML=`<div class="text-center py-20 text-[#5A5A5A]"><div class="w-10 h-10 mx-auto mb-4 opacity-30">${STAR}</div><p class="text-base text-[#9C9C9C] font-semibold">Sin datos de stock.</p><p class="text-xs mt-2">Actualiza tu hoja Stock en Google Sheets.</p></div>`;
      return;
    }

    // Agrupar por color
    const porColor={};
    stock.forEach(s=>{
      const color=cap(s.color)||'Sin color';
      if(!porColor[color]) porColor[color]=[];
      porColor[color].push(s);
    });

    const totalUnidades=stock.reduce((s,i)=>s+Number(i.cantidad),0);
    const sinStock=stock.filter(i=>Number(i.cantidad)===0).length;

    let html=`
      <div class="mb-5">
        <div class="text-xs text-[#5A5A5A] tracking-wider mb-3 flex justify-between items-baseline">
          <span>Inventario actual</span>
          <span class="text-[#E8E8E8] font-semibold">${totalUnidades} unidades · <span class="text-red-400">${sinStock} sin stock</span></span>
        </div>
      </div>`;

    Object.entries(porColor).forEach(([color,items])=>{
      const totalColor=items.reduce((s,i)=>s+Number(i.cantidad),0);
      html+=`<div class="mb-5">
        <div class="text-xs tracking-[0.12em] uppercase text-[#5A5A5A] mb-3 flex items-center gap-2 after:content-[''] after:flex-1 after:h-[1px] after:bg-[#2A2A2A]">
          👕 ${esc(color)} <span class="text-[#3A3A3A] normal-case tracking-normal">(${totalColor} uds.)</span>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">`;

      items.forEach(s=>{
        const cant=Number(s.cantidad)||0;
        const [colorCls,bgCls]=cant===0
          ?['text-red-400','bg-red-950/20 border-red-900/30']
          :cant<=2
            ?['text-amber-400','bg-amber-950/20 border-amber-800/30']
            :['text-emerald-400','bg-emerald-950/20 border-emerald-900/30'];
        const colorKey=encodeURIComponent(s.color); const tallaKey=encodeURIComponent(s.talla);
        html+=`<div class="flex flex-col items-center justify-center p-3 rounded-xl border ${bgCls} gap-1">
          <span class="text-[11px] font-bold uppercase tracking-widest text-[#E8E8E8]">Talla ${esc(s.talla)}</span>
          <span class="font-display text-2xl font-semibold ${colorCls}">${cant}</span>
          <span class="text-[9px] uppercase tracking-wider ${colorCls} mb-1">${cant===0?'Sin stock':cant<=2?'Stock bajo':'Disponible'}</span>
          <div class="flex items-center gap-2 mt-1">
            <button onclick="appAjustarStock('${colorKey}','${tallaKey}',-1)" class="w-7 h-7 rounded-lg bg-[#1C1C1C] border border-[#2A2A2A] text-[#9C9C9C] text-base font-bold flex items-center justify-center hover:bg-[#2A2A2A] hover:text-[#E8E8E8] transition-colors active:scale-95" ${cant===0?'disabled style="opacity:0.3;pointer-events:none"':''}>−</button>
            <button onclick="appAjustarStock('${colorKey}','${tallaKey}',1)" class="w-7 h-7 rounded-lg bg-[#1C1C1C] border border-[#2A2A2A] text-[#9C9C9C] text-base font-bold flex items-center justify-center hover:bg-[#2A2A2A] hover:text-[#E8E8E8] transition-colors active:scale-95">＋</button>
          </div>
        </div>`;
      });

      html+=`</div></div>`;
    });

    main.innerHTML=html;
  }

  function render(){
    if(currentTab==='taller') renderTaller();
    else if(currentTab==='historial') renderHistorial();
    else if(currentTab==='stock') renderStock();
    else renderFinanzas();
  }

  // --- Ajuste manual de stock desde la app ---
  window.appAjustarStock=async(colorEnc,tallaEnc,delta)=>{
    const color=decodeURIComponent(colorEnc), talla=decodeURIComponent(tallaEnc);
    // Actualizar visualmente de inmediato
    const item=stock.find(s=>norm(s.color)===norm(color)&&norm(s.talla)===norm(talla));
    if(!item) return;
    const nuevaCant=Math.max(0,Number(item.cantidad)+delta);
    item.cantidad=nuevaCant;
    renderStock();
    // Guardar en Sheets
    try{
      await api('updateStock',{color,talla,cantidad:nuevaCant});
      setOnline(true);
      showToast(delta>0?`+1 polera ${cap(color)} ${talla} ✓`:`-1 polera ${cap(color)} ${talla} ✓`);
      // Recargar para reconciliar pedidos Por Comprar si se agregó stock
      if(delta>0) await cargar(false);
    }catch(e){
      // Revertir si falla
      item.cantidad=nuevaCant-delta;
      setOnline(false);
      showToast('Error al guardar. Reintenta.');
      renderStock();
    }
  };

  // --- Finanzas / Caja ---
  function getWeekBounds(){
    const now=new Date();
    const day=now.getDay(); // 0=dom
    const lunes=new Date(now); lunes.setDate(now.getDate()-(day===0?6:day-1)); lunes.setHours(0,0,0,0);
    const domingo=new Date(lunes); domingo.setDate(lunes.getDate()+7);
    return{start:lunes,end:domingo};
  }

  function calcFinanzas(rango){
    const gastos=finanzas.filter(f=>f.tipo==='gasto'&&new Date(f.fecha)>=rango.start&&new Date(f.fecha)<rango.end);
    const poleras=gastos.filter(f=>f.categoria==='poleras').reduce((s,f)=>s+f.monto,0);
    const dtf=gastos.filter(f=>f.categoria==='dtf').reduce((s,f)=>s+f.monto,0);
    // Ingresos desde pedidos (montoAbonado si pendiente, montoTotal si entregado)
    const ingresos=pedidos.filter(p=>new Date(p.fecha)>=rango.start&&new Date(p.fecha)<rango.end)
      .reduce((s,p)=>s+(p.estado==='Entregado'?p.montoTotal:p.montoAbonado),0);
    return{poleras,dtf,totalGasto:poleras+dtf,ingresos,balance:ingresos-(poleras+dtf)};
  }

  function renderFinanzas(){
    const semana=getWeekBounds();
    const mesAct=getMonthBounds(0);
    const s=calcFinanzas(semana), m=calcFinanzas(mesAct);
    // Total global: todos los ingresos históricos menos todos los gastos históricos
    const todosGastos=finanzas.filter(f=>f.tipo==='gasto').reduce((s,f)=>s+f.monto,0);
    const todosIngresos=pedidos.reduce((s,p)=>s+(p.estado==='Entregado'?p.montoTotal:p.montoAbonado),0);
    const globalTotal=240000-todosGastos;

    const tarjeta=(label,valor,sub,color='text-[#E8E8E8]')=>`
      <div class="bg-[#141414] border border-[#2A2A2A] rounded-xl p-4 relative overflow-hidden">
        <div class="absolute top-2.5 right-2.5 w-4 h-4 opacity-20">${STAR}</div>
        <div class="text-[10px] tracking-wider uppercase text-[#5A5A5A] mb-2 font-semibold">${label}</div>
        <div class="font-display text-2xl font-semibold ${color} leading-none">${fmt(valor)}</div>
        ${sub?`<div class="text-[10px] text-[#5A5A5A] mt-2">${sub}</div>`:''}
      </div>`;

    const separador=(titulo)=>`<div class="text-xs tracking-[0.12em] uppercase text-[#5A5A5A] mb-3 mt-5 flex items-center gap-2 after:content-[''] after:flex-1 after:h-[1px] after:bg-[#2A2A2A]">${titulo}</div>`;

    const html=`
      <!-- Total Global -->
      <div class="bg-[#141414] border ${globalTotal>=0?'border-emerald-900/40':'border-red-900/40'} rounded-2xl p-5 mb-5 relative overflow-hidden">
        <div class="absolute top-3 right-3 w-6 h-6 opacity-15">${STAR}</div>
        <div class="text-[10px] tracking-widest uppercase ${globalTotal>=0?'text-emerald-400':'text-red-400'} font-bold mb-1">Total Global · Caja</div>
        <div class="font-display text-4xl font-semibold ${globalTotal>=0?'text-emerald-400':'text-red-400'} leading-none">${fmt(globalTotal)}</div>
        <div class="text-[10px] text-[#5A5A5A] mt-2">Gastos registrados: ${fmt(todosGastos)}</div>
      </div>

      <!-- Semana -->
      ${separador('📅 Esta semana')}
      <div class="grid grid-cols-2 gap-3 mb-3">
        ${tarjeta('Poleras 📉',s.poleras,'Inversión en prendas','text-red-400')}
        ${tarjeta('DTF 📉',s.dtf,'Inversión en láminas','text-red-400')}
      </div>
      <div class="grid grid-cols-2 gap-3 mb-3">
        ${tarjeta('Total Invertido',s.totalGasto,'Poleras + DTF',s.totalGasto>0?'text-red-400':'text-[#E8E8E8]')}
        ${tarjeta('Ganado 📈',s.ingresos,'Ingresos de pedidos','text-emerald-400')}
      </div>
      <div class="bg-[#141414] border ${s.balance>=0?'border-emerald-900/30':'border-red-900/30'} rounded-xl p-4 mb-2">
        <div class="text-[10px] tracking-wider uppercase text-[#5A5A5A] mb-1 font-semibold">Balance neto semanal</div>
        <div class="font-display text-3xl font-semibold ${s.balance>=0?'text-emerald-400':'text-red-400'}">${fmt(s.balance)}</div>
        <div class="text-[10px] text-[#5A5A5A] mt-1">${s.balance>=0?'La semana ya dejó ganancias ✓':'Esta semana invertiste más de lo que entraste'}</div>
      </div>

      <!-- Mes -->
      ${separador('🗓️ Este mes · '+MESES[new Date().getMonth()])}
      <div class="grid grid-cols-2 gap-3 mb-3">
        ${tarjeta('Poleras 📉',m.poleras,'Inversión en prendas','text-red-400')}
        ${tarjeta('DTF 📉',m.dtf,'Inversión en láminas','text-red-400')}
      </div>
      <div class="grid grid-cols-2 gap-3 mb-3">
        ${tarjeta('Total Invertido',m.totalGasto,'Poleras + DTF',m.totalGasto>0?'text-red-400':'text-[#E8E8E8]')}
        ${tarjeta('Ganado 📈',m.ingresos,'Ingresos del mes','text-emerald-400')}
      </div>
      <div class="bg-[#141414] border ${m.balance>=0?'border-emerald-900/30':'border-red-900/30'} rounded-xl p-4 mb-5">
        <div class="text-[10px] tracking-wider uppercase text-[#5A5A5A] mb-1 font-semibold">Resultado neto del mes</div>
        <div class="font-display text-3xl font-semibold ${m.balance>=0?'text-emerald-400':'text-red-400'}">${fmt(m.balance)}</div>
        <div class="text-[10px] text-[#5A5A5A] mt-1">${m.balance>=0?'Mes rentable ✓':'Mes en negativo'}</div>
      </div>

      <!-- Formulario registrar gasto -->
      ${separador('➕ Registrar gasto')}
      <div class="bg-[#141414] border border-[#2A2A2A] rounded-xl p-4 mb-4">
        <input type="number" id="gastoMonto" class="w-full border border-[#2A2A2A] bg-[#1C1C1C] rounded-lg p-3 text-sm text-[#E8E8E8] focus:outline-none focus:border-[#5A5A5A] mb-3" placeholder="Monto del gasto (ej: 20000)" inputmode="numeric">
        <div class="grid grid-cols-2 gap-2">
          <button onclick="appRegistrarGasto('poleras')" class="py-3 rounded-lg bg-[#1C1C1C] border border-[#2A2A2A] text-xs font-bold uppercase tracking-wider text-[#9C9C9C] hover:bg-[#2A2A2A] hover:text-[#E8E8E8] transition-colors active:scale-95">− Gasto Poleras</button>
          <button onclick="appRegistrarGasto('dtf')" class="py-3 rounded-lg bg-[#1C1C1C] border border-[#2A2A2A] text-xs font-bold uppercase tracking-wider text-[#9C9C9C] hover:bg-[#2A2A2A] hover:text-[#E8E8E8] transition-colors active:scale-95">− Gasto DTF</button>
        </div>
      </div>

      <!-- Historial de gastos recientes -->
      ${separador('🕐 Últimos gastos')}
      <div class="space-y-2 mb-4">
        ${finanzas.length===0
          ? `<div class="text-center py-8 text-[#5A5A5A] text-sm">Sin gastos registrados aún.</div>`
          : finanzas.slice().reverse().slice(0,10).map((f,i)=>{
              const idx=finanzas.length-1-i;
              return `<div class="bg-[#141414] border border-[#2A2A2A] rounded-lg px-4 py-3">
                <div class="flex justify-between items-center">
                  <div>
                    <span class="text-[10px] uppercase tracking-wider font-bold ${f.categoria==='poleras'?'text-blue-400':'text-purple-400'}">${f.categoria==='poleras'?'👕 Poleras':'🖨 DTF'}</span>
                    <div class="text-[11px] text-[#5A5A5A] mt-0.5">${new Date(f.fecha).toLocaleDateString('es-CL',{day:'2-digit',month:'2-digit',year:'2-digit'})}</div>
                  </div>
                  <div class="flex items-center gap-3">
                    <div class="font-mono text-sm text-red-400">−${fmt(f.monto)}</div>
                    <button onclick="appEditarGasto(${idx})" class="w-7 h-7 rounded-lg bg-[#1C1C1C] border border-[#2A2A2A] text-[#9C9C9C] text-xs flex items-center justify-center hover:bg-[#2A2A2A] hover:text-[#E8E8E8] transition-colors">✏️</button>
                    <button onclick="appBorrarGasto(${idx})" class="w-7 h-7 rounded-lg bg-red-950/20 border border-red-900/30 text-red-500/70 text-xs flex items-center justify-center hover:bg-red-900/40 hover:text-red-400 transition-colors">✕</button>
                  </div>
                </div>
                <div id="editGasto_${idx}" class="hidden mt-3 pt-3 border-t border-[#2A2A2A] flex gap-2">
                  <input type="number" id="editGastoMonto_${idx}" value="${f.monto}" class="flex-1 border border-[#2A2A2A] bg-[#1C1C1C] rounded-lg p-2 text-sm text-[#E8E8E8] focus:outline-none focus:border-[#5A5A5A]" inputmode="numeric">
                  <select id="editGastoCat_${idx}" class="border border-[#2A2A2A] bg-[#1C1C1C] rounded-lg p-2 text-xs text-[#E8E8E8] focus:outline-none focus:border-[#5A5A5A]">
                    <option value="poleras" ${f.categoria==='poleras'?'selected':''}>👕 Poleras</option>
                    <option value="dtf" ${f.categoria==='dtf'?'selected':''}>🖨 DTF</option>
                  </select>
                  <button onclick="appGuardarEdicionGasto(${idx})" class="px-3 py-2 rounded-lg bg-[#E8E8E8] text-[#0A0A0A] text-xs font-bold">✓</button>
                </div>
              </div>`;
            }).join('')
        }
      </div>`;

    main.innerHTML=html;
  }

  window.appRegistrarGasto=async(categoria)=>{
    const input=$('gastoMonto');
    const monto=parseFloat(input?.value);
    if(!monto||monto<=0){ showToast('Ingresa un monto válido'); return; }
    const gasto={fecha:new Date().toISOString(),tipo:'gasto',categoria,monto};
    finanzas.push(gasto);
    renderFinanzas();
    try{
      await api('registrarGasto',{gasto});
      setOnline(true);
      showToast(`Gasto ${categoria==='poleras'?'Poleras':'DTF'} registrado ✓`);
    }catch(e){
      finanzas.pop();
      setOnline(false);
      showToast('Error al guardar. Reintenta.');
      renderFinanzas();
    }
  };

  window.appEditarGasto=idx=>{
    const wrap=$(`editGasto_${idx}`);
    if(!wrap) return;
    wrap.classList.toggle('hidden');
  };

  window.appGuardarEdicionGasto=async idx=>{
    const monto=parseFloat($(`editGastoMonto_${idx}`)?.value);
    const cat=$(`editGastoCat_${idx}`)?.value;
    if(!monto||monto<=0){ showToast('Monto inválido'); return; }
    const anterior={...finanzas[idx]};
    finanzas[idx]={...finanzas[idx],monto,categoria:cat};
    renderFinanzas();
    try{
      await api('editarGasto',{idx,monto,categoria:cat,fecha:anterior.fecha});
      setOnline(true); showToast('Gasto actualizado ✓');
    }catch(e){
      finanzas[idx]=anterior; setOnline(false); showToast('Error al guardar. Reintenta.'); renderFinanzas();
    }
  };

  window.appBorrarGasto=async idx=>{
    if(!await customConfirm('Eliminar gasto','¿Eliminar este gasto permanentemente?',true)) return;
    const rb=[...finanzas]; finanzas.splice(idx,1); renderFinanzas();
    try{
      await api('borrarGasto',{idx});
      setOnline(true); showToast('Gasto eliminado ✓');
    }catch(e){
      finanzas=rb; setOnline(false); showToast('Error al eliminar. Reintenta.'); renderFinanzas();
    }
  };

  // --- Módulo DTF ---
  window.appVisualizarDTF = (id, url) => {
    const ov = $('dtfOverlay');
    const img = $('dtfImg');
    const load = $('dtfLoading');
    if(!ov || !img) return;
    img.src = '';
    load.classList.remove('hidden');
    img.classList.add('hidden');
    ov.classList.remove('hidden'); ov.classList.add('flex');
    img.onload = () => { load.classList.add('hidden'); img.classList.remove('hidden'); };
    img.onerror = () => { load.innerHTML = '<p class="text-[#5A5A5A] text-sm">No se pudo cargar la imagen.</p>'; };
    img.src = url;
  };

  window.appCerrarDTF = () => {
    const ov = $('dtfOverlay');
    ov.classList.add('hidden'); ov.classList.remove('flex');
    $('dtfImg').src = '';
  };

  // Pinch-to-zoom táctil en imagen DTF
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelector('.tab[data-tab="taller"]')?.classList.add('text-[#E8E8E8]','border-[#E8E8E8]');
    const img = $('dtfImg');
    if(!img) return;
    let scale=1, lastDist=0, startX=0, startY=0, tx=0, ty=0, dragging=false, lastTx=0, lastTy=0;
    const applyTransform=()=>{ img.style.transform=`translate(${tx}px,${ty}px) scale(${scale})`; };
    img.addEventListener('touchstart', e=>{
      if(e.touches.length===2){
        lastDist=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);
      } else if(e.touches.length===1 && scale>1){
        dragging=true; startX=e.touches[0].clientX-tx; startY=e.touches[0].clientY-ty;
      }
    },{passive:true});
    img.addEventListener('touchmove', e=>{
      if(e.touches.length===2){
        const dist=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);
        scale=Math.min(5,Math.max(1,scale*(dist/lastDist)));
        lastDist=dist; applyTransform();
      } else if(dragging && e.touches.length===1){
        tx=e.touches[0].clientX-startX; ty=e.touches[0].clientY-startY; applyTransform();
      }
    },{passive:true});
    img.addEventListener('touchend', ()=>{ dragging=false; if(scale<=1){scale=1;tx=0;ty=0;applyTransform();} });
    // doble tap para resetear
    let lastTap=0;
    img.addEventListener('touchend', ()=>{
      const now=Date.now();
      if(now-lastTap<300){ scale=1;tx=0;ty=0;applyTransform(); }
      lastTap=now;
    });
    // ESC en PC
    document.addEventListener('keydown', e=>{ if(e.key==='Escape') window.appCerrarDTF?.(); });
  });

  cargar(true);
})();
