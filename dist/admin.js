(() => {
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const money = value => (Number(value || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const slugify = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  const modules = {
    overview: 'Dashboard', products: 'Produtos', categories: 'Categorias', brands: 'Marcas', stock: 'Estoque',
    customers: 'Clientes', orders: 'Pedidos', coupons: 'Cupons', banners: 'Banners / Parceiros', images: 'Biblioteca de imagens', settings: 'Configurações'
  };
  let page = 'overview';
  let editing = null;
  let selectedImage = '';
  let selectedImageSource = '';
  let libraryImageCache = [];
  let data = AtleticStore.load();

  function refresh() { data = AtleticStore.load(); }
  function notify(text) { $('#adminStatus').textContent = text; $('#adminStatus').classList.add('visible'); clearTimeout(notify.timer); notify.timer = setTimeout(() => $('#adminStatus').classList.remove('visible'), 3200); }
  function brandName(id) { return data.brands.find(x => x.id === id)?.name || 'Sem marca'; }
  function categoryName(id) { return data.categories.find(x => x.id === id)?.name || 'Sem categoria'; }
  function productName(id) { return data.products.find(x => x.id === id)?.name || 'Produto removido'; }
  function variantLabel(id) { const v = data.variants.find(x => x.id === id); return v ? `${productName(v.productId)} · ${v.size || ''} ${v.flavor || ''}`.trim() : 'Variação removida'; }
  function balance(variantId) { return AtleticStore.stockBalance(data, variantId); }
  function activeVariant(productId) { return data.variants.find(v => v.productId === productId) || null; }
  function persist(message = 'Alteração salva. A vitrine deste navegador já usa os mesmos dados.') { AtleticStore.save(data); notify(message); }
  function imageFor(product) { return product?.images?.[0]?.url || ''; }

  function notice() {
    const cfg = window.ATLETIC_CONFIG || {};
    const remoteReady = Boolean(cfg.supabaseUrl && cfg.supabasePublishableKey);
    $('#setupNotice').innerHTML = `<div><strong>${remoteReady ? 'Backend configurado' : 'Arquitetura v2 ativa em modo demonstração'}</strong><p>${remoteReady ? 'O frontend já possui as chaves públicas do projeto. A próxima validação é Auth/RLS antes de gravar dados reais.' : 'Admin e vitrine compartilham a mesma base local neste navegador. O schema Supabase definitivo e a função protegida de busca de imagens já estão preparados para a conexão real.'}</p></div><span class="mode-pill">${remoteReady ? 'SUPABASE' : 'LOCAL / DEMO'}</span>`;
  }

  function renderOverview() {
    const stockUnits = data.variants.reduce((sum, variant) => sum + Math.max(0, balance(variant.id)), 0);
    const low = data.variants.filter(v => v.active && balance(v.id) <= Number(v.minStock || 0)).length;
    const activeProducts = data.products.filter(x => x.active).length;
    const activeBanners = AtleticStore.activeBanners(data).length;
    $('#adminContent').innerHTML = `
      <div class="admin-cards">
        <div class="admin-card"><span>Produtos ativos</span><strong>${activeProducts}</strong></div>
        <div class="admin-card"><span>Unidades em estoque</span><strong>${stockUnits}</strong></div>
        <div class="admin-card"><span>Estoque mínimo / alerta</span><strong>${low}</strong></div>
        <div class="admin-card"><span>Banners ativos</span><strong>${activeBanners}</strong></div>
      </div>
      <div class="admin-grid">
        <section class="panel"><h2>Operação preparada</h2><ul><li>Produtos separados de variações, marcas e categorias.</li><li>Preço normal, preço promocional, custo, SKU e estoque mínimo por variação.</li><li>Histórico de entradas e saídas preservado como movimentos.</li><li>Banners e parceiros com agendamento, imagens e WhatsApp.</li><li>Clientes, pedidos e pagamentos previstos no schema para o backend real.</li></ul></section>
        <section class="panel"><h2>Próximas ativações</h2><p class="muted">Conectar projeto Supabase exclusivo, aplicar schema, criar o primeiro administrador e configurar a chave da busca de imagens na Vercel.</p><div class="status-row"><span class="status-chip">GitHub ✓</span><span class="status-chip">Vercel ✓</span><span class="status-chip">Supabase preparado</span><span class="status-chip">Checkout pendente</span></div></section>
      </div>`;
  }

  function toolbar(label, allowNew = true) {
    return `<div class="admin-toolbar"><input id="tableSearch" type="search" placeholder="Pesquisar ${esc(label.toLowerCase())}" aria-label="Pesquisar"><div>${allowNew ? `<button id="newRecord" class="button">+ ${label === 'Estoque' ? 'Movimentar estoque' : 'Novo cadastro'}</button>` : ''}</div></div><div id="records"></div>`;
  }

  function rowsForCurrent() {
    const term = ($('#tableSearch')?.value || '').trim().toLowerCase();
    const has = row => JSON.stringify(row).toLowerCase().includes(term);
    if (page === 'products') return data.products.filter(p => has({...p, brand:brandName(p.brandId), category:categoryName(p.categoryId), variant:activeVariant(p.id)}));
    return (data[page] || []).filter(has);
  }

  function renderRows() {
    const rows = rowsForCurrent();
    let head = [];
    let body = '';
    if (page === 'products') {
      head = ['Produto','Marca / categoria','SKU / variação','Preço','Estoque','Status','Ações'];
      body = rows.map(p => { const v=activeVariant(p.id); const qty=v?balance(v.id):0; const low=v&&qty<=Number(v.minStock||0); return `<tr><td><div class="product-cell">${imageFor(p)?`<img class="product-thumb" src="${esc(imageFor(p))}" alt="">`:'<span class="product-thumb"></span>'}<div><strong>${esc(p.name)}</strong><br><small>${esc(p.description||'')}</small></div></div></td><td>${esc(brandName(p.brandId))}<br><small>${esc(categoryName(p.categoryId))}</small></td><td>${esc(v?.sku||'—')}<br><small>${esc([v?.size,v?.flavor].filter(Boolean).join(' · ')||'Sem variação')}</small></td><td>${v?money(v.price):'—'}${v?.comparePrice?`<br><small>de ${money(v.comparePrice)}</small>`:''}</td><td class="${low?'stock-low':'stock-ok'}">${qty}${v?` / mín. ${v.minStock||0}`:''}</td><td><span class="badge">${p.active?'Ativo':'Inativo'}</span></td><td><button data-edit="${p.id}">Editar</button><button data-delete="${p.id}">Excluir</button></td></tr>`; }).join('');
    } else if (page === 'categories') {
      head=['Categoria','Slug','Status','Ações']; body=rows.map(r=>`<tr><td>${esc(r.name)}</td><td>${esc(r.slug)}</td><td><span class="badge">${r.active?'Ativa':'Inativa'}</span></td><td><button data-edit="${r.id}">Editar</button><button data-delete="${r.id}">Excluir</button></td></tr>`).join('');
    } else if (page === 'brands') {
      head=['Marca','Status','Ações']; body=rows.map(r=>`<tr><td>${esc(r.name)}</td><td><span class="badge">${r.active?'Ativa':'Inativa'}</span></td><td><button data-edit="${r.id}">Editar</button><button data-delete="${r.id}">Excluir</button></td></tr>`).join('');
    } else if (page === 'stock') {
      head=['Produto / variação','Lote','Movimento','Motivo','Data','Saldo atual']; body=rows.slice().reverse().map(r=>`<tr><td>${esc(variantLabel(r.variantId))}</td><td>${esc(r.lot||'Sem lote')}<br><small>${esc(r.expires||'Sem validade')}</small></td><td><strong>${Number(r.delta)>0?'+':''}${Number(r.delta)}</strong></td><td>${esc(r.reason)}</td><td>${new Date(r.createdAt).toLocaleString('pt-BR')}</td><td>${balance(r.variantId)}</td></tr>`).join('');
    } else if (page === 'coupons') {
      head=['Código','Desconto','Mínimo','Validade','Status','Ações']; body=rows.map(r=>`<tr><td><strong>${esc(r.code)}</strong></td><td>${r.kind==='percent'?`${r.amount}%`:money(r.amount)}</td><td>${money(r.minimum)}</td><td>${esc(r.expiresAt||'Sem validade')}</td><td><span class="badge">${r.active?'Ativo':'Inativo'}</span></td><td><button data-edit="${r.id}">Editar</button><button data-delete="${r.id}">Excluir</button></td></tr>`).join('');
    } else if (page === 'banners') {
      head=['Ordem','Parceiro / campanha','Título','Destino','Período','Status','Ações']; body=rows.sort((a,b)=>Number(a.position)-Number(b.position)).map(r=>`<tr><td>${Number(r.position||0)}</td><td>${esc(r.partner|| (r.type==='partner'?'Parceiro':'Campanha'))}</td><td>${esc(r.title).replace(/\n/g,' / ')}</td><td>${r.type==='partner'?esc(r.whatsapp||'WhatsApp pendente'):esc(r.href||'#catalog')}</td><td>${esc(r.startsAt||'Agora')} → ${esc(r.expiresAt||'Sem fim')}</td><td><span class="badge">${r.active?'Ativo':'Inativo'}</span></td><td><button data-edit="${r.id}">Editar</button><button data-delete="${r.id}">Excluir</button></td></tr>`).join('');
    }
    $('#records').innerHTML = rows.length ? `<div class="table-wrap"><table><thead><tr>${head.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>` : '<div class="empty-panel">Nenhum registro encontrado.</div>';
  }

  function renderCustomers() {
    $('#adminContent').innerHTML = toolbar('Clientes', false);
    const rows=data.customers||[];
    $('#records').innerHTML=rows.length?`<div class="table-wrap"><table><thead><tr><th>Cliente</th><th>Contato</th><th>Pedidos</th><th>Cadastro</th></tr></thead><tbody>${rows.map(c=>`<tr><td>${esc(c.name)}</td><td>${esc(c.email||'—')}<br><small>${esc(c.phone||'—')}</small></td><td>${data.orders.filter(o=>o.customerId===c.id).length}</td><td>${esc(c.createdAt||'—')}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty-panel"><h2>Clientes</h2><p>O módulo está estruturado, mas dados pessoais reais só serão habilitados após Supabase Auth + RLS. Isso evita armazenar clientes no navegador.</p></div>';
  }

  function renderOrders() {
    $('#adminContent').innerHTML = toolbar('Pedidos', false);
    const rows=data.orders||[];
    $('#records').innerHTML=rows.length?`<div class="table-wrap"><table><thead><tr><th>Pedido</th><th>Cliente</th><th>Status</th><th>Total</th><th>Data</th></tr></thead><tbody>${rows.map(o=>`<tr><td>${esc(o.id)}</td><td>${esc(data.customers.find(c=>c.id===o.customerId)?.name||'—')}</td><td><span class="badge">${esc(o.status)}</span></td><td>${money(o.total)}</td><td>${esc(o.createdAt||'—')}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty-panel"><h2>Pedidos</h2><p>Checkout e pedidos reais ficam bloqueados até o servidor validar preço, cupom, frete, reserva de estoque e pagamento. O schema já possui as tabelas necessárias.</p></div>';
  }

  async function renderImageLibrary() {
    $('#adminContent').innerHTML = `
      <div class="library-toolbar">
        <div>
          <h2>Biblioteca de imagens</h2>
          <p class="muted">Imagens importadas do site atual e imagens escolhidas nas buscas da internet.</p>
        </div>
        <button id="libraryImport" class="button">Importar / atualizar site atual</button>
      </div>
      <div class="admin-toolbar">
        <input id="librarySearch" type="search" placeholder="Buscar por produto, marca ou categoria" aria-label="Buscar imagens">
        <div class="status-row"><span class="status-chip" id="libraryCount">Carregando…</span></div>
      </div>
      <p class="muted" id="libraryStatus"></p>
      <div id="libraryGrid" class="library-grid"><div class="empty-panel">Carregando biblioteca…</div></div>
    `;

    const search = $('#librarySearch');
    const grid = $('#libraryGrid');
    const count = $('#libraryCount');
    const status = $('#libraryStatus');

    async function loadLibrary() {
      const token = adminToken();
      const q = search.value.trim();
      grid.innerHTML = '<div class="empty-panel">Carregando biblioteca…</div>';
      try {
        const response = await fetch(`/api/image-library?q=${encodeURIComponent(q)}&limit=60`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar a biblioteca.');
        const images = payload.images || [];
        count.textContent = `${images.length} imagem(ns)`;
        status.textContent = q ? `Resultado para “${q}”.` : 'Mostrando as imagens mais recentes.';
        grid.innerHTML = images.length ? images.map(img => `
          <article class="library-card">
            <div class="library-image"><img src="${esc(img.thumbnail_url || img.image_url)}" alt="${esc(img.title)}"></div>
            <div class="library-card-body">
              <strong title="${esc(img.title)}">${esc(img.title)}</strong>
              <small>${esc([img.brand, img.category].filter(Boolean).join(' · ') || 'Sem classificação')}</small>
              <span class="badge">${img.source_type === 'legacy_store' ? 'SITE ATUAL' : img.source_type === 'serper' ? 'INTERNET' : 'BIBLIOTECA'}</span>
              ${img.source_product_url ? `<a href="${esc(img.source_product_url)}" target="_blank" rel="noopener">Ver origem ↗</a>` : ''}
            </div>
          </article>
        `).join('') : '<div class="empty-panel">Nenhuma imagem encontrada.</div>';
      } catch (error) {
        grid.innerHTML = `<div class="empty-panel">${esc(error.message)}</div>`;
        count.textContent = 'Erro';
      }
    }

    let debounce;
    search.oninput = () => {
      clearTimeout(debounce);
      debounce = setTimeout(loadLibrary, 250);
    };

    $('#libraryImport').onclick = async () => {
      const button = $('#libraryImport');
      button.disabled = true;
      status.textContent = 'Atualizando imagens a partir do site atual…';
      try {
        const token = adminToken();
        const response = await fetch('/api/image-library', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ action: 'import_legacy', maxPages: 20 })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Falha na importação.');
        status.textContent = `Atualização concluída: ${payload.importedImages || 0} imagem(ns) encontradas em ${payload.pagesRead || 0} página(s).`;
        await loadLibrary();
      } catch (error) {
        status.textContent = error.message;
      } finally {
        button.disabled = false;
      }
    };

    await loadLibrary();
  }

  function renderSettings() {
    const cfg=window.ATLETIC_CONFIG||{};
    $('#adminContent').innerHTML=`<div class="admin-grid"><section class="panel"><h2>Integrações</h2><div class="status-row"><span class="status-chip">GitHub → Vercel: conectado</span><span class="status-chip">Supabase: ${cfg.supabaseUrl?'configurado':'aguardando projeto exclusivo'}</span><span class="status-chip">Busca de imagens: função criada</span><span class="status-chip">Pagamento: integrar depois</span></div><p class="muted" style="margin-top:16px">A chave secreta do provedor de imagens deve ficar apenas nas variáveis da Vercel. O navegador nunca recebe essa chave.</p></section><section class="panel"><h2>Dados de demonstração</h2><p class="muted">Admin e vitrine deste navegador compartilham os mesmos cadastros locais.</p><div class="button-row"><button id="resetDemo" class="button secondary">Restaurar exemplos</button></div></section></div>`;
    $('#resetDemo').onclick=()=>{if(confirm('Restaurar todos os dados demonstrativos deste navegador?')){AtleticStore.reset();refresh();render();notify('Dados de demonstração restaurados.')}};
  }

  function render() {
    refresh(); notice();
    document.querySelectorAll('[data-page]').forEach(button => button.classList.toggle('active', button.dataset.page === page));
    $('#pageTitle').textContent = modules[page];
    if(page==='overview') return renderOverview();
    if(page==='customers') return renderCustomers();
    if(page==='orders') return renderOrders();
    if(page==='images') return renderImageLibrary();
    if(page==='settings') return renderSettings();
    $('#adminContent').innerHTML = toolbar(modules[page]);
    $('#newRecord').onclick = () => openEditor();
    $('#tableSearch').oninput = renderRows;
    renderRows();
  }

  function input(name,label,type='text',value='',options=[],full=false,required=false) {
    const cls=full?' class="full"':''; const req=required?' required':'';
    if(type==='textarea') return `<label${cls}>${label}<textarea name="${name}"${req}>${esc(value)}</textarea></label>`;
    if(type==='select') return `<label${cls}>${label}<select name="${name}"${req}>${options.map(([v,t])=>`<option value="${esc(v)}" ${String(value)===String(v)?'selected':''}>${esc(t)}</option>`).join('')}</select></label>`;
    if(type==='checkbox') return `<label${cls}>${label}<input name="${name}" type="checkbox" ${value?'checked':''}></label>`;
    const attr=type==='money'?'type="number" min="0" step="0.01"':type==='number'?'type="number" step="1"':'type="'+type+'"';
    const val=type==='money'?(Number(value||0)/100).toFixed(2):value;
    return `<label${cls}>${label}<input name="${name}" ${attr}${req} value="${esc(val)}"></label>`;
  }

  function openEditor(id=null) {
    editing=id; selectedImage=''; selectedImageSource=''; $('#formError').textContent=''; $('#imageResults').innerHTML=''; $('#imageSearchStatus').textContent=''; $('#imageSearchBox').hidden=page!=='products';
    let html='';
    if(page==='products'){
      const p=data.products.find(x=>x.id===id)||{}; const v=activeVariant(id)||{}; selectedImage=imageFor(p); selectedImageSource=p.images?.[0]?.sourceUrl||'';
      html += input('name','Nome do produto','text',p.name||'',[],true,true);
      html += input('brandId','Marca','select',p.brandId||data.brands[0]?.id||'',data.brands.map(x=>[x.id,x.name]),false,true);
      html += input('categoryId','Categoria','select',p.categoryId||data.categories[0]?.id||'',data.categories.map(x=>[x.id,x.name]),false,true);
      html += input('sku','SKU / código interno','text',v.sku||'',[],false,true);
      html += input('barcode','Código de barras','text',v.barcode||'');
      html += input('flavor','Sabor', 'text',v.flavor||''); html += input('size','Peso / tamanho','text',v.size||'');
      html += input('price','Preço de venda','money',v.price||0,[],false,true); html += input('comparePrice','Preço anterior/promocional','money',v.comparePrice||0);
      html += input('cost','Custo','money',v.cost||0); html += input('minStock','Estoque mínimo','number',v.minStock||0);
      html += input('description','Descrição','textarea',p.description||'',[],true); html += input('featured','Em destaque','checkbox',Boolean(p.featured)); html += input('active','Produto ativo','checkbox',p.active??true);
      if(selectedImage) $('#imageSearchStatus').innerHTML=`<div class="selected-image"><img src="${esc(selectedImage)}" alt=""><div><strong>Imagem atual selecionada</strong><br><small>${esc(selectedImage)}</small></div></div>`;
    } else if(page==='categories') { const r=data.categories.find(x=>x.id===id)||{}; html=input('name','Nome','text',r.name||'',[],true,true)+input('slug','Slug','text',r.slug||'',[],true)+input('active','Ativa','checkbox',r.active??true); }
    else if(page==='brands') { const r=data.brands.find(x=>x.id===id)||{}; html=input('name','Nome','text',r.name||'',[],true,true)+input('active','Ativa','checkbox',r.active??true); }
    else if(page==='stock') { html=input('variantId','Produto / variação','select','',data.variants.map(v=>[v.id,variantLabel(v.id)]),true,true)+input('lot','Lote','text','',[],false,true)+input('expires','Validade','date','')+input('delta','Entrada (+) ou saída (-)','number','',[],false,true)+input('reason','Motivo','text','',[],true,true); }
    else if(page==='coupons') { const r=data.coupons.find(x=>x.id===id)||{}; html=input('code','Código','text',r.code||'',[],false,true)+input('kind','Tipo','select',r.kind||'percent',[['percent','Percentual'],['fixed','Valor fixo']],false,true)+input('amount','Desconto',r.kind==='fixed'?'money':'number',r.kind==='fixed'?r.amount:Number(r.amount||10),[],false,true)+input('minimum','Compra mínima','money',r.minimum||0)+input('startsAt','Início','datetime-local',r.startsAt||'')+input('expiresAt','Fim','datetime-local',r.expiresAt||'')+input('active','Ativo','checkbox',r.active??true); }
    else if(page==='banners') { const r=data.banners.find(x=>x.id===id)||{}; html=input('type','Tipo','select',r.type||'campaign',[['campaign','Campanha'],['partner','Parceiro']],false,true)+input('position','Ordem','number',r.position||0)+input('partner','Parceiro','text',r.partner||'')+input('eyebrow','Chamada curta','text',r.eyebrow||'')+input('title','Título','textarea',r.title||'',[],true,true)+input('description','Descrição','textarea',r.description||'',[],true)+input('button','Texto do botão','text',r.button||'Saiba mais')+input('href','Link da campanha','text',r.href||'#catalog')+input('whatsapp','WhatsApp (DDI+DDD+número)','tel',r.whatsapp||'')+input('message','Mensagem do WhatsApp','textarea',r.message||'',[],true)+input('image','Imagem desktop HTTPS','url',r.image||'',[],true)+input('mobileImage','Imagem mobile HTTPS','url',r.mobileImage||'',[],true)+input('startsAt','Início','datetime-local',r.startsAt||'')+input('expiresAt','Fim','datetime-local',r.expiresAt||'')+input('active','Ativo','checkbox',r.active??true); }
    $('#editTitle').textContent = page==='stock'?'Movimentar estoque':`${id?'Editar':'Novo'} ${modules[page].toLowerCase()}`;
    $('#fields').innerHTML=html;
    $('#libraryBrowseTools').hidden=true;
    $('#libraryFilter').value='';
    $('#libraryBrowseCount').textContent='';
    libraryImageCache=[];
    $('#editor').showModal();
  }

  function adminToken() {
    return localStorage.getItem('atletic.supabase.access_token') || '';
  }

  function showImageOptions(images, sourceLabel) {
    $('#imageResults').innerHTML = images.map(img => {
      const imageUrl = img.imageUrl || img.image_url || '';
      const thumb = img.thumbnailUrl || img.thumbnail_url || imageUrl;
      const sourceUrl = img.sourceUrl || img.source_product_url || '';
      const title = img.title || 'Imagem';
      const source = img.source || img.brand || sourceLabel || title;
      const origin = img.origin || (img.source_type === 'legacy_store' ? 'library' : '');
      return `<button type="button" class="image-option" data-image="${esc(imageUrl)}" data-source="${esc(sourceUrl)}" data-origin="${esc(origin)}" data-title="${esc(title)}" title="${esc(title)}"><img src="${esc(thumb)}" alt=""><span>${esc(source)}</span></button>`;
    }).join('');
  }

  function normalizeLibraryFilter(value='') {
    return String(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'')
      .toLowerCase()
      .trim();
  }

  function renderLibraryBrowse() {
    const term = normalizeLibraryFilter($('#libraryFilter')?.value || '');
    const filtered = term
      ? libraryImageCache.filter(img => normalizeLibraryFilter([img.title,img.brand,img.category,img.sku].filter(Boolean).join(' ')).includes(term))
      : libraryImageCache;

    $('#libraryBrowseCount').textContent = term
      ? `${filtered.length} de ${libraryImageCache.length} imagens`
      : `${libraryImageCache.length} imagens`;

    showImageOptions(filtered, 'Biblioteca Atletic');

    if (!filtered.length) {
      $('#imageResults').innerHTML = '<div class="empty-panel">Nenhuma imagem encontrada com esse filtro.</div>';
    }
  }

  async function searchLibrary() {
    const button = $('#searchLibrary');
    button.disabled = true;
    $('#libraryBrowseTools').hidden = false;
    $('#libraryFilter').value = '';
    $('#imageSearchStatus').textContent = 'Carregando toda a biblioteca da Atletic…';
    $('#imageResults').innerHTML = '';
    try {
      const token = adminToken();
      const response = await fetch('/api/image-library?limit=500', {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Biblioteca indisponível.');
      libraryImageCache = (payload.images || []).map(img => ({ ...img, origin: 'library' }));
      $('#imageSearchStatus').textContent = libraryImageCache.length
        ? 'Toda a biblioteca foi carregada. Escolha visualmente um produto ou use o filtro abaixo.'
        : 'A biblioteca ainda está vazia. Importe o site atual ou use “Buscar na internet”.';
      renderLibraryBrowse();
    } catch (error) {
      libraryImageCache = [];
      $('#libraryBrowseCount').textContent = '';
      $('#imageSearchStatus').textContent = error.message;
    } finally {
      button.disabled = false;
    }
  }

  async function saveImageToLibrary({ title, imageUrl, thumbnailUrl, sourceUrl }) {
    try {
      const token = adminToken();
      if (!token || !imageUrl) return;
      await fetch('/api/image-library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action: 'add',
          title,
          imageUrl,
          thumbnailUrl: thumbnailUrl || imageUrl,
          sourceUrl,
          sourceType: 'serper',
          sourceSite: 'Serper'
        })
      });
    } catch {}
  }

  async function searchImages() {
    const name=$('#editForm [name=name]')?.value.trim(); if(!name){$('#imageSearchStatus').textContent='Digite primeiro o nome do produto.';return;}
    const button=$('#searchImages'); button.disabled=true; $('#libraryBrowseTools').hidden=true; $('#imageSearchStatus').textContent='Pesquisando imagens na internet…'; $('#imageResults').innerHTML='';
    try{
      const token=adminToken();
      const response=await fetch((window.ATLETIC_CONFIG||{}).imageSearchEndpoint||'/api/product-images',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify({query:name})});
      const payload=await response.json().catch(()=>({})); if(!response.ok) throw new Error(payload.error||'Busca indisponível.');
      const images=(payload.images||[]).map(img=>({...img,origin:'serper'})); $('#imageSearchStatus').textContent=images.length?`${images.length} opções encontradas na internet. Selecione uma imagem.`:'Nenhuma imagem encontrada.';
      showImageOptions(images, 'Internet');
    }catch(error){$('#imageSearchStatus').textContent=error.message;}finally{button.disabled=false;}
  }

  async function importLegacyImages() {
    const button = $('#importLegacyImages');
    button.disabled = true;
    $('#imageSearchStatus').textContent = 'Importando imagens do site atual da Atletic… isso pode levar alguns segundos.';
    try {
      const token = adminToken();
      const response = await fetch('/api/image-library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ action: 'import_legacy', maxPages: 12 })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Não foi possível importar o catálogo.');
      $('#imageSearchStatus').textContent = `Importação concluída: ${payload.importedImages || 0} imagens encontradas em ${payload.pagesRead || 0} página(s). Buscando correspondências para este produto…`;
      await searchLibrary();
    } catch (error) {
      $('#imageSearchStatus').textContent = error.message;
    } finally {
      button.disabled = false;
    }
  }

  $('#editForm').onsubmit = event => {
    event.preventDefault(); const fd=new FormData(event.currentTarget);
    try{
      if(page==='products'){
        const product=editing?data.products.find(x=>x.id===editing):{id:AtleticStore.uid('prod'),images:[]};
        const variant=editing?activeVariant(editing):{id:AtleticStore.uid('var'),productId:product.id};
        const name=String(fd.get('name')||'').trim(); const sku=String(fd.get('sku')||'').trim(); if(!name||!sku) throw new Error('Nome e SKU são obrigatórios.');
        if(data.variants.some(v=>v.id!==variant.id&&v.sku.toLowerCase()===sku.toLowerCase())) throw new Error('Já existe uma variação com esse SKU.');
        Object.assign(product,{name,brandId:String(fd.get('brandId')),categoryId:String(fd.get('categoryId')),description:String(fd.get('description')||'').trim(),featured:fd.has('featured'),active:fd.has('active')});
        if(selectedImage) product.images=[{url:selectedImage,sourceUrl:selectedImageSource,alt:name}];
        Object.assign(variant,{sku,barcode:String(fd.get('barcode')||'').trim(),flavor:String(fd.get('flavor')||'').trim(),size:String(fd.get('size')||'').trim(),price:Math.round(Number(fd.get('price')||0)*100),comparePrice:Math.round(Number(fd.get('comparePrice')||0)*100),cost:Math.round(Number(fd.get('cost')||0)*100),minStock:Number(fd.get('minStock')||0),active:fd.has('active')});
        if(!editing){data.products.push(product);data.variants.push(variant);}
      } else if(page==='categories') { const r=editing?data.categories.find(x=>x.id===editing):{id:AtleticStore.uid('cat')}; r.name=String(fd.get('name')||'').trim(); r.slug=slugify(fd.get('slug')||r.name); r.active=fd.has('active'); if(!r.name)throw new Error('Informe a categoria.'); if(!editing)data.categories.push(r); }
      else if(page==='brands') { const r=editing?data.brands.find(x=>x.id===editing):{id:AtleticStore.uid('brand')}; r.name=String(fd.get('name')||'').trim(); r.active=fd.has('active'); if(!r.name)throw new Error('Informe a marca.'); if(!editing)data.brands.push(r); }
      else if(page==='stock') { const variantId=String(fd.get('variantId')); const delta=Number(fd.get('delta')); if(!Number.isInteger(delta)||delta===0)throw new Error('Informe uma quantidade inteira diferente de zero.'); if(balance(variantId)+delta<0)throw new Error('Saída maior que o saldo atual.'); data.stock.push({id:AtleticStore.uid('mov'),variantId,lot:String(fd.get('lot')||'').trim(),expires:String(fd.get('expires')||''),delta,reason:String(fd.get('reason')||'').trim(),createdAt:new Date().toISOString()}); }
      else if(page==='coupons') { const r=editing?data.coupons.find(x=>x.id===editing):{id:AtleticStore.uid('cup')}; r.code=String(fd.get('code')||'').trim().toUpperCase(); r.kind=String(fd.get('kind')); r.amount=r.kind==='fixed'?Math.round(Number(fd.get('amount')||0)*100):Number(fd.get('amount')||0); r.minimum=Math.round(Number(fd.get('minimum')||0)*100); r.startsAt=String(fd.get('startsAt')||''); r.expiresAt=String(fd.get('expiresAt')||''); r.active=fd.has('active'); if(!r.code)throw new Error('Informe o código.'); if(!editing)data.coupons.push(r); }
      else if(page==='banners') { const r=editing?data.banners.find(x=>x.id===editing):{id:AtleticStore.uid('banner')}; for(const key of ['type','partner','eyebrow','title','description','button','href','whatsapp','message','image','mobileImage','startsAt','expiresAt'])r[key]=String(fd.get(key)||'').trim(); r.whatsapp=r.whatsapp.replace(/\D/g,''); r.position=Number(fd.get('position')||0); r.active=fd.has('active'); r.imageAlt=r.title.replace(/\n/g,' '); r.accent=r.type==='partner'?'dark':'gold'; if(!r.title)throw new Error('Informe o título.'); if(r.image&&!/^https:\/\//i.test(r.image))throw new Error('A imagem desktop deve usar HTTPS.'); if(!editing)data.banners.push(r); }
      persist(); $('#editor').close(); render();
    } catch(error) { $('#formError').textContent=error.message; }
  };

  document.addEventListener('click', event => {
    const nav=event.target.closest('[data-page]'); if(nav){page=nav.dataset.page;render();return;}
    const edit=event.target.closest('[data-edit]'); if(edit){openEditor(edit.dataset.edit);return;}
    const del=event.target.closest('[data-delete]'); if(del){const id=del.dataset.delete;if(!confirm('Excluir este cadastro de demonstração?'))return;
      if(page==='products'){const variantIds=data.variants.filter(v=>v.productId===id).map(v=>v.id); if(data.stock.some(m=>variantIds.includes(m.variantId))){notify('Este produto tem histórico de estoque. Desative-o em vez de excluir.');return;} data.products=data.products.filter(x=>x.id!==id);data.variants=data.variants.filter(x=>x.productId!==id);}
      else if(page==='categories'&&data.products.some(x=>x.categoryId===id)){notify('Categoria em uso. Mova os produtos ou desative a categoria.');return;}
      else if(page==='brands'&&data.products.some(x=>x.brandId===id)){notify('Marca em uso. Mova os produtos ou desative a marca.');return;}
      else data[page]=data[page].filter(x=>x.id!==id); persist(); render(); return;
    }
    const image=event.target.closest('[data-image]'); if(image){
      selectedImage=image.dataset.image;
      selectedImageSource=image.dataset.source||'';
      document.querySelectorAll('.image-option').forEach(x=>x.classList.toggle('selected',x===image));

      const nameField=$('#editForm [name=name]');
      const imageTitle=String(image.dataset.title||'').trim();
      const previousName=String(nameField?.value||'').trim();
      let nameChanged=false;

      if(nameField && imageTitle && imageTitle!==previousName){
        nameField.value=imageTitle;
        nameField.dispatchEvent(new Event('input',{bubbles:true}));
        nameChanged=true;
        notify(previousName
          ? `Nome do produto alterado para “${imageTitle}” de acordo com a imagem selecionada.`
          : `Nome do produto preenchido automaticamente como “${imageTitle}”.`
        );
      }

      const baseStatus=image.dataset.origin==='library'
        ? 'Imagem da biblioteca selecionada. Ela será vinculada ao produto ao salvar.'
        : 'Imagem da internet selecionada e adicionada à biblioteca para reutilização futura.';
      $('#imageSearchStatus').textContent=nameChanged
        ? `${baseStatus} O nome do produto também foi atualizado para “${imageTitle}”.`
        : baseStatus;

      if(image.dataset.origin==='serper')saveImageToLibrary({
        title:imageTitle||nameField?.value.trim()||'Produto',
        imageUrl:image.dataset.image,
        thumbnailUrl:image.querySelector('img')?.src||image.dataset.image,
        sourceUrl:image.dataset.source||''
      });
    }
  });

  $('#searchLibrary').onclick=searchLibrary;
  $('#libraryFilter').oninput=renderLibraryBrowse;
  $('#searchImages').onclick=searchImages;
  $('#importLegacyImages').onclick=importLegacyImages;
  $('#closeEditor').onclick=()=>$('#editor').close();
  $('#adminTheme').onclick=()=>document.body.classList.toggle('dark');
  $('#adminNav').innerHTML=Object.entries(modules).map(([id,label])=>`<button data-page="${id}">${label}</button>`).join('');
  window.addEventListener('storage', event=>{if(event.key===AtleticStore.KEY)render();});
  if (window.AtleticAdminAuth) window.AtleticAdminAuth.guard(render); else render();
})();
