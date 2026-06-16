(function(){
  const API_URL = 'https://script.google.com/macros/s/AKfycbz588_UceGmqWqu9J_4U5ntXw91qyKEH0oyV6L0zOXL77RXcDPg2kmiulMWdcIjSb9sew/exec';
  let pedidos = [];
  let currentTab = 'taller';
  let historialMonthOffset = 0;
  let isOnline = true;
  let editId = null; // Variable para saber si estamos editando

  const $ = id => document.getElementById(id);
  const main = $('main'), sheet = $('sheetOverlay'), pasteBox = $('pasteBox'), previewBox = $('previewBox'), montoTotal = $('montoTotal'), montoAbonado = $('montoAbonado'), porPagarPreview = $('porPagarPreview'), porPagarPreviewAmt = $('porPagarPreviewAmt'), errorMsg = $('errorMsg'), toast = $('toast'), loadingScreen = $('loadingScreen'), connBanner = $('connBanner'), btnGuardar = $('btnGuardar'), modalTitle = $('modalTitle');

  const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const STAR_SVG = '<svg class="w-full h-full" viewBox="0 0 100 100" fill="none"><path d="M50 5 C52 35 55 45 95 50 C55 55 52 65 50 95 C48 65 45 55 5 50 C45 45 48 35 50 5 Z" fill="#E8E8E8"/></svg>';

  const fmt = n => '$' + Math.round(n).toLocaleString('es-CL');
  
  // Novedad: Capitalizar cada palabra
  const capitalize = str => {
    if (!str) return '';
    return str.toLowerCase().replace(/(?:^|[\s-])\w/g, match => match.toUpperCase());
  };

  function showToast(msg){
    toast.textContent = msg;
    toast.classList.remove('opacity-0', 'translate-y-2');
    toast.classList.add('opacity-100');
    setTimeout(() => {
      toast.classList.remove('opacity-100');
      toast.classList.add('opacity-0', 'translate-y-2');
    }, 2500);
  }

  function setOnlineStatus(online){
    isOnline = online;
    connBanner.classList.toggle('hidden', online);
    connBanner.classList.toggle('flex', !online);
  }

  // Novedad: Respaldo Local (Local Storage)
  function guardarRespaldoLocal() {
    localStorage.setItem('onyx_pedidos', JSON.stringify(pedidos));
  }

  async function apiRequest(action = null, data = null) {
    const options = action ? {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, ...data })
    } : { method: 'GET' };
    
    const res = await fetch(API_URL, options);
    if(!res.ok) throw new Error('Error en conexión API');
    return res.json();
  }

  async function cargarPedidos(mostrarLoader){
    // Carga rápida del respaldo local primero
    const respaldo = localStorage.getItem('onyx_pedidos');
    if (respaldo) {
      pedidos = JSON.parse(respaldo);
      render();
    }

    try{
      const data = await apiRequest();
      if(data.pedidos) {
        pedidos = data.pedidos;
        guardarRespaldoLocal();
      }
      setOnlineStatus(true);
    }catch(e){
      setOnlineStatus(false);
    }
    if(mostrarLoader) loadingScreen.style.display = 'none';
    render();
  }

  $('btnReintentar').addEventListener('click', () => {
    $('loadingText').textContent = 'Reintentando conexión...';
    loadingScreen.style.display = 'flex';
    cargarPedidos(true);
  });

  function parseTexto(texto){
    const campos = { cliente:'', telefono:'', direccion:'', color:'', talla:'' };
    texto.split('\n').forEach(linea => {
      const idx = linea.indexOf(':');
      if(idx === -1) return;
      const clave = linea.slice(0, idx).trim().toLowerCase();
      // Capitalizamos el valor automáticamente al detectarlo
      const valor = capitalize(linea.slice(idx + 1).trim());
      if(!valor) return;
      
      if(clave.includes('nombre') || clave.includes('cliente')) campos.cliente = valor;
      else if(clave.includes('tel') || clave.includes('cel')) campos.telefono = valor;
      else if(clave.includes('dirección') || clave.includes('direccion')) campos.direccion = valor;
      else if(clave.includes('color')) campos.color = valor;
      else if(clave.includes('talla')) campos.talla = valor;
    });
    return campos;
  }

  function actualizarPreview(){
    const texto = pasteBox.value.trim();
    if(!texto){
      previewBox.innerHTML = '<span class="italic text-[#5A5A5A]">Aquí verás los datos detectados.</span>';
    } else {
      const c = parseTexto(texto);
      previewBox.innerHTML = `Cliente: <b>${c.cliente || '—'}</b> ${c.telefono ? `(📞 ${c.telefono})` : ''}<br>Dirección: <b>${c.direccion || '—'}</b><br>Color: <b>${c.color || '—'}</b> · Talla: <b>${c.talla || '—'}</b>`;
    }

    const total = parseFloat(montoTotal.value) || 0;
    const abonado = parseFloat(montoAbonado.value) || 0;
    if(montoTotal.value === ''){
      porPagarPreview.classList.add('hidden');
    } else {
      const porPagar = total - abonado;
      porPagarPreview.classList.remove('hidden');
      porPagarPreview.className = `text-center p-3 rounded-lg mb-4 border ${porPagar > 0 ? 'bg-red-950/14 border-red-900/30 text-red-400' : 'bg-emerald-950/14 border-emerald-900/30 text-emerald-400'}`;
      porPagarPreviewAmt.textContent = fmt(porPagar);
    }
  }

  ['input', 'change'].forEach(evt => {
    pasteBox.addEventListener(evt, actualizarPreview);
    montoTotal.addEventListener(evt, actualizarPreview);
    montoAbonado.addEventListener(evt, actualizarPreview);
  });

  // Función para abrir el modal (sirve para Nuevo y Editar)
  const abrirModal = (id = null) => {
    editId = id;
    errorMsg.classList.add('hidden');
    
    if (id) {
      modalTitle.textContent = "Editar pedido";
      const p = pedidos.find(x => x.id === id);
      // Pre-llenar datos
      pasteBox.value = `Nombre: ${p.cliente}\nTeléfono: ${p.telefono || ''}\nDirección: ${p.direccion || ''}\nColor: ${p.color || ''}\nTalla: ${p.talla || ''}`;
      montoTotal.value = p.montoTotal;
      montoAbonado.value = p.montoAbonado;
    } else {
      modalTitle.textContent = "Nuevo pedido";
      pasteBox.value = montoTotal.value = montoAbonado.value = '';
    }
    
    actualizarPreview();
    sheet.classList.remove('hidden');
    sheet.classList.add('flex');
    setTimeout(() => pasteBox.focus(), 200);
  };

  $('btnNuevo').addEventListener('click', () => abrirModal(null));
  window.appEditarPedido = abrirModal; // Exponemos la función

  const cerrarSheet = () => { sheet.classList.remove('flex'); sheet.classList.add('hidden'); };
  $('btnCancelar').addEventListener('click', cerrarSheet);
  sheet.addEventListener('click', (e) => { if(e.target === sheet) cerrarSheet(); });

  btnGuardar.addEventListener('click', async () => {
    const texto = pasteBox.value.trim();
    const campos = parseTexto(texto);
    const total = parseFloat(montoTotal.value);
    const abonado = parseFloat(montoAbonado.value) || 0;

    if(!campos.cliente || isNaN(total)){
      errorMsg.textContent = !campos.cliente ? 'Falta el nombre del cliente.' : 'Ingresa el monto total.';
      errorMsg.classList.remove('hidden');
      return;
    }

    btnGuardar.disabled = true;
    btnGuardar.textContent = 'Guardando...';
    
    const payload = {
      cliente: campos.cliente, telefono: campos.telefono, direccion: campos.direccion,
      color: campos.color, talla: campos.talla, montoTotal: total, montoAbonado: abonado,
      porPagar: total - abonado
    };

    try{
      if (editId) {
        // Lógica de Edición
        await apiRequest('update', { id: editId, ...payload });
        showToast('Pedido actualizado ✓');
      } else {
        // Lógica de Creación
        payload.fecha = new Date().toISOString();
        payload.estado = 'Pendiente';
        await apiRequest('create', { pedido: payload });
        showToast('Pedido guardado ✓');
      }
      
      setOnlineStatus(true);
      cerrarSheet();
      await cargarPedidos(false);
    }catch(e){
      setOnlineStatus(false);
      errorMsg.textContent = 'Error de conexión. Intenta de nuevo.';
      errorMsg.classList.remove('hidden');
    }finally{
      btnGuardar.disabled = false;
      btnGuardar.textContent = 'Guardar Pedido';
    }
  });

  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('text-[#E8E8E8]', 'border-[#E8E8E8]'));
      tab.classList.add('text-[#E8E8E8]', 'border-[#E8E8E8]');
      currentTab = tab.dataset.tab;
      if(currentTab === 'historial') historialMonthOffset = 0;
      render();
    });
  });

  const fechaCorta = iso => {
    const d = new Date(iso);
    return d.toLocaleDateString('es-CL', {day:'2-digit', month:'2-digit'}) + ' ' + d.toLocaleTimeString('es-CL', {hour:'2-digit', minute:'2-digit'});
  };

  const escapeHtml = str => {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  };

  window.appMarcarEntregado = async id => {
    // Novedad: Confirmación al marcar entregado
    if(!confirm('¿Marcar este pedido como entregado? Se moverá al historial.')) return;

    const p = pedidos.find(x => x.id === id);
    if(!p) return;
    p.estado = 'Entregado';
    guardarRespaldoLocal();
    render();
    
    try{
      await apiRequest('updateEstado', { id, estado: 'Entregado' });
      setOnlineStatus(true);
      showToast('Pedido entregado');
      await cargarPedidos(false);
    }catch(e){
      setOnlineStatus(false);
      p.estado = 'Pendiente';
      guardarRespaldoLocal();
      showToast('Error al actualizar. Reintenta.');
      render();
    }
  };

  window.appEliminarPedido = async id => {
    // Novedad: Confirmación obligatoria antes de eliminar
    if(!confirm('🚨 ¿Estás seguro de eliminar este pedido? Esta acción no se puede deshacer.')) return;

    const respaldo = pedidos;
    pedidos = pedidos.filter(x => x.id !== id);
    guardarRespaldoLocal();
    render();
    
    try{
      await apiRequest('delete', { id });
      setOnlineStatus(true);
      showToast('Pedido eliminado');
    }catch(e){
      setOnlineStatus(false);
      pedidos = respaldo;
      guardarRespaldoLocal();
      showToast('Error al eliminar. Reintenta.');
      render();
    }
  };

  const getMonthBounds = offset => {
    const now = new Date();
    const target = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    return {
      start: new Date(target.getFullYear(), target.getMonth(), 1),
      end: new Date(target.getFullYear(), target.getMonth() + 1, 1),
      year: target.getFullYear(), month: target.getMonth()
    };
  };

  function renderDashboard(){
    const bAct = getMonthBounds(0);
    const pAct = pedidos.filter(p => { let f = new Date(p.fecha); return f >= bAct.start && f < bAct.end; });

    // Novedad: Estadísticas de Ingresos Reales
    // Ingresos Reales = Lo que ya pagaron los entregados + los abonos de los pendientes
    const ingresosReales = pAct.reduce((s,p) => s + (p.estado === 'Entregado' ? p.montoTotal : p.montoAbonado), 0);
    const ventasTotales = pAct.reduce((s,p) => s + p.montoTotal, 0);
    const cAct = pAct.length;

    return `
      <div class="mb-6">
        <div class="text-xs text-[#5A5A5A] tracking-wider mb-3 flex justify-between items-baseline">
          <span>Rendimiento del mes</span>
          <span class="font-display text-sm text-[#E8E8E8] font-semibold capitalize">${MESES[new Date().getMonth()]} ${new Date().getFullYear()}</span>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div class="bg-[#141414] border border-[#2A2A2A] rounded-xl p-4 relative overflow-hidden">
            <div class="absolute top-2.5 right-2.5 w-4 h-4 opacity-20">${STAR_SVG}</div>
            <div class="text-[10px] tracking-wider uppercase text-emerald-500 mb-2 font-semibold">Ingreso Real</div>
            <div class="font-display text-2xl font-semibold text-[#E8E8E8] leading-none" title="Abonos + Entregados">${fmt(ingresosReales)}</div>
            <div class="text-[10px] text-[#5A5A5A] mt-2">Dinero en caja</div>
          </div>
          <div class="bg-[#141414] border border-[#2A2A2A] rounded-xl p-4 relative overflow-hidden hidden md:block">
            <div class="absolute top-2.5 right-2.5 w-4 h-4 opacity-20">${STAR_SVG}</div>
            <div class="text-[10px] tracking-wider uppercase text-[#5A5A5A] mb-2">Venta Bruta</div>
            <div class="font-display text-2xl font-semibold text-[#E8E8E8] leading-none">${fmt(ventasTotales)}</div>
            <div class="text-[10px] text-[#5A5A5A] mt-2">Total si todos pagan</div>
          </div>
          <div class="bg-[#141414] border border-[#2A2A2A] rounded-xl p-4 relative overflow-hidden">
            <div class="absolute top-2.5 right-2.5 w-4 h-4 opacity-20">${STAR_SVG}</div>
            <div class="text-[10px] tracking-wider uppercase text-[#5A5A5A] mb-2">Pedidos Mes</div>
            <div class="font-display text-2xl font-semibold text-[#E8E8E8] leading-none">${cAct}</div>
            <div class="text-[10px] text-[#5A5A5A] mt-2">Nuevos trabajos</div>
          </div>
        </div>
      </div>`;
  }

  function renderTaller(){
    const pendientes = pedidos.filter(p => p.estado === 'Pendiente');
    
    let html = renderDashboard() + `
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-3 my-4">
        <div class="text-xs tracking-[0.12em] uppercase text-[#5A5A5A] flex items-center gap-2 after:content-[''] after:flex-1 after:h-[1px] after:bg-[#2A2A2A] md:w-1/2">En producción (${pendientes.length})</div>
        <div class="relative md:w-1/2">
          <span class="absolute left-3 top-1/2 -translate-y-1/2 opacity-50 text-xs">🔎</span>
          <input type="text" id="buscadorTaller" class="w-full py-2.5 pl-9 pr-4 rounded-lg border border-[#2A2A2A] bg-[#141414] text-sm text-[#E8E8E8] focus:outline-none focus:border-[#5A5A5A]" placeholder="Buscar pedido pendiente...">
        </div>
      </div>
      <div id="tallerList" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">`; // Novedad: Grid responsivo

    const generarHTMLCartas = (lista) => {
      if(lista.length === 0){
        return `<div class="col-span-full text-center py-[60px] px-6 text-[#5A5A5A]"><div class="w-[30px] h-[30px] mx-auto mb-3.5 opacity-40">${STAR_SVG}</div><p class="text-sm text-[#9C9C9C] font-semibold">No hay resultados.</p></div>`;
      }
      return lista.map(p => {
        const debe = p.porPagar > 0;
        return `
          <div class="bg-[#141414] border border-[#2A2A2A] rounded-xl relative overflow-hidden flex flex-col hover:border-[#5A5A5A] transition-colors">
            <div class="absolute top-0 left-0 bottom-0 w-[3px] ${debe ? 'bg-red-600' : 'bg-emerald-600'}"></div>
            <div class="p-5 pl-6 flex-1 flex flex-col">
              <div class="flex justify-between items-start mb-2">
                <div>
                  <div class="font-mono text-[10.5px] text-[#5A5A5A] tracking-wider">N° ${String(p.id).padStart(3,'0')}</div>
                  <div class="font-display text-xl font-semibold text-[#E8E8E8] mt-0.5 leading-tight">${escapeHtml(p.cliente)}</div>
                  ${p.telefono ? `<a href="https://wa.me/${p.telefono.replace(/\+/g, '')}" target="_blank" class="text-xs text-blue-400 hover:text-blue-300 mt-1 inline-block">📱 ${escapeHtml(p.telefono)}</a>` : ''}
                </div>
                <div class="text-[10px] text-[#5A5A5A] text-right whitespace-nowrap">${fechaCorta(p.fecha)}</div>
              </div>
              <div class="flex flex-wrap gap-1.5 my-3">
                ${p.color ? `<span class="text-xs px-2.5 py-1 rounded-md bg-[#1C1C1C] text-[#9C9C9C] border border-[#2A2A2A]">${escapeHtml(p.color)}</span>` : ''}
                ${p.talla ? `<span class="text-xs px-2.5 py-1 rounded-md bg-[#1C1C1C] text-[#9C9C9C] border border-[#2A2A2A]">Talla ${escapeHtml(p.talla)}</span>` : ''}
              </div>
              ${p.direccion ? `<div class="text-[12.5px] text-[#9C9C9C] my-2 flex gap-2 items-start leading-relaxed bg-[#1C1C1C] p-2.5 rounded-lg border border-[#2A2A2A]/50"><span>📍</span><span class="flex-1">${escapeHtml(p.direccion)}</span></div>` : ''}
              
              <div class="mt-auto pt-4 border-t border-[#2A2A2A] mt-4 flex justify-between items-end">
                <div class="flex gap-4 text-[11px] text-[#5A5A5A]">
                  <div>Total<b class="block text-[13px] text-[#E8E8E8] font-mono font-normal mt-0.5">${fmt(p.montoTotal)}</b></div>
                  <div>Abono<b class="block text-[13px] text-[#E8E8E8] font-mono font-normal mt-0.5">${fmt(p.montoAbonado)}</b></div>
                </div>
                <div class="text-right">
                  <div class="text-[9.5px] uppercase tracking-wider text-[#5A5A5A] mb-1">${debe ? 'Deuda' : 'Pagado'}</div>
                  <div class="font-display text-xl font-bold leading-none ${debe ? 'text-red-500' : 'text-emerald-500'}">${fmt(p.porPagar)}</div>
                </div>
              </div>

              <div class="flex gap-2 mt-4 pt-4 border-t border-[#2A2A2A]/50">
                <button class="flex-1 bg-[#E8E8E8] text-[#0A0A0A] border-none py-2.5 rounded-lg text-xs font-bold tracking-wider uppercase active:scale-[0.98] hover:bg-white transition-all" onclick="appMarcarEntregado(${p.id})">Entregar</button>
                <button class="w-12 bg-[#1C1C1C] border border-[#2A2A2A] rounded-lg text-[#9C9C9C] text-sm flex items-center justify-center hover:bg-[#2A2A2A] transition-colors" onclick="appEditarPedido(${p.id})" title="Editar">✏️</button>
                <button class="w-12 bg-red-950/20 border border-red-900/30 rounded-lg text-red-500/70 text-sm flex items-center justify-center hover:bg-red-900/40 hover:text-red-400 transition-colors" onclick="appEliminarPedido(${p.id})" title="Eliminar">✕</button>
              </div>
            </div>
          </div>`;
      }).join('');
    };

    html += generarHTMLCartas(pendientes) + `</div>`;
    main.innerHTML = html;

    // Lógica del buscador del taller
    const buscador = $('buscadorTaller');
    if (buscador) {
      buscador.addEventListener('input', (e) => {
        const q = e.target.value.trim().toLowerCase();
        const filtrados = pendientes.filter(p => 
          p.cliente.toLowerCase().includes(q) || 
          (p.telefono && p.telefono.includes(q)) || 
          String(p.id).includes(q)
        );
        $('tallerList').innerHTML = generarHTMLCartas(filtrados);
      });
    }
  }

  function renderHistorial(){
    const b = getMonthBounds(historialMonthOffset);
    const entregados = pedidos.filter(p => p.estado === 'Entregado' && new Date(p.fecha) >= b.start && new Date(p.fecha) < b.end).sort((a,b) => new Date(b.fecha) - new Date(a.fecha));
    const totalMes = entregados.reduce((s,p) => s + p.montoTotal, 0);

    let html = `
      <div class="flex items-center justify-between mb-5 py-2 bg-[#141414] rounded-xl border border-[#2A2A2A] px-4">
        <button id="prevMonth" class="w-10 h-10 rounded-full hover:bg-[#2A2A2A] text-[#9C9C9C] flex items-center justify-center text-lg transition-colors">‹</button>
        <div class="font-display text-xl font-semibold text-[#E8E8E8] capitalize">${MESES[b.month]} ${b.year}</div>
        <button id="nextMonth" class="w-10 h-10 rounded-full hover:bg-[#2A2A2A] text-[#9C9C9C] flex items-center justify-center text-lg transition-colors disabled:opacity-30 disabled:hover:bg-transparent" ${historialMonthOffset === 0 ? 'disabled' : ''}>›</button>
      </div>`;

    if(entregados.length > 0) {
      html += `<div class="text-xs tracking-[0.12em] uppercase text-[#5A5A5A] my-4 flex items-center gap-2 after:content-[''] after:flex-1 after:h-[1px] after:bg-[#2A2A2A]">${entregados.length} entregados · ${fmt(totalMes)}</div>`;
    }

    html += `
      <div class="relative mb-5">
        <span class="absolute left-4 top-1/2 -translate-y-1/2 opacity-50 text-sm">🔎</span>
        <input type="text" id="buscadorInput" class="w-full py-3.5 pl-10 pr-4 rounded-xl border border-[#2A2A2A] bg-[#141414] text-sm text-[#E8E8E8] focus:outline-none focus:border-[#5A5A5A] shadow-inner" placeholder="Buscar en el historial...">
      </div>`;

    if(entregados.length === 0){
      main.innerHTML = html + `<div class="text-center py-[80px] px-6 text-[#5A5A5A]"><div class="w-[40px] h-[40px] mx-auto mb-4 opacity-30">${STAR_SVG}</div><p class="text-base text-[#9C9C9C] font-semibold">Sin entregas registradas este mes.</p></div>`;
      bindMonthNav();
      return;
    }

    const itemHtml = p => `
      <div class="bg-[#141414] border border-[#2A2A2A] rounded-xl p-4 mb-3 flex justify-between items-center hover:border-[#5A5A5A] transition-colors">
        <div>
          <div class="font-semibold text-[15px] text-[#E8E8E8]">${escapeHtml(p.cliente)}</div>
          <div class="text-[11px] text-[#5A5A5A] mt-1">N° ${String(p.id).padStart(3,'0')} · ${fechaCorta(p.fecha)}</div>
        </div>
        <div class="text-right flex flex-col items-end">
          <span class="text-[9px] uppercase tracking-widest font-bold text-emerald-400 bg-emerald-950/30 px-2.5 py-1 rounded-md border border-emerald-900/40 mb-1.5">Entregado</span>
          <div class="font-mono text-sm text-[#9C9C9C]">${fmt(p.montoTotal)}</div>
        </div>
      </div>`;

    // Novedad: Grid responsivo también en el historial
    html += `<div id="histList" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">${entregados.map(itemHtml).join('')}</div>`;
    main.innerHTML = html;

    bindMonthNav();
    
    $('buscadorInput').addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      const filtrados = entregados.filter(p => p.cliente.toLowerCase().includes(q) || String(p.id).includes(q));
      $('histList').innerHTML = filtrados.length 
        ? filtrados.map(itemHtml).join('') 
        : `<div class="col-span-full text-center py-8 text-sm text-[#5A5A5A]">Sin resultados para "${escapeHtml(e.target.value)}"</div>`;
    });
  }

  function bindMonthNav(){
    $('prevMonth').addEventListener('click', () => { historialMonthOffset--; render(); });
    $('nextMonth').addEventListener('click', () => { if(historialMonthOffset < 0) { historialMonthOffset++; render(); } });
  }

  function render(){
    if(currentTab === 'taller') renderTaller();
    else renderHistorial();
  }

  document.addEventListener('DOMContentLoaded', () => {
    const firstTab = document.querySelector('.tab[data-tab="taller"]');
    if (firstTab) firstTab.classList.add('text-[#E8E8E8]', 'border-[#E8E8E8]');
  });

  cargarPedidos(true);
})();