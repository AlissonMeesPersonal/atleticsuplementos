(() => {
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const money = value => (Number(value || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const slugify = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  const skuNormalize = value => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g,' ')
    .trim();

  function generateInternalSku(name, brand='') {
    const normalized = skuNormalize(name);
    const brandNormalized = skuNormalize(brand);
    const tokens = normalized.split(/\s+/).filter(Boolean);
    const stop = new Set(['DE','DA','DO','DAS','DOS','E','COM','SEM','SABOR','NUTRITION','SUPLEMENTO','SUPLEMENTOS']);
    const words = tokens.filter(token => /^[A-Z]+$/.test(token) && !stop.has(token));
    const productCode = (words[0] || 'PRO').slice(0,3);
    const measure = tokens.find(token => /^\d+(?:MG|G|KG|ML|L|CAP|CAPS|UN|UNID)$/.test(token)) || '';
    const brandWords = brandNormalized.split(/\s+/).filter(token => /^[A-Z]+$/.test(token) && !stop.has(token));
    let brandCode = '';
    if (brandWords.length >= 2) brandCode = brandWords[0].slice(0,3) + brandWords[1].slice(0,1);
    else if (brandWords.length === 1) brandCode = brandWords[0].slice(0,4);
    else if (words.length >= 2) brandCode = words[words.length - 1].slice(0,4);
    else brandCode = 'ATL';

    const stem = ['ATL', productCode, measure, brandCode].filter(Boolean).join('-');
    const currentVariantId = editing ? activeVariant(editing)?.id : null;
    const used = new Set(
      data.variants
        .filter(v => v.id !== currentVariantId)
        .map(v => String(v.sku || '').toUpperCase())
    );

    for (let index = 1; index <= 999; index++) {
      const candidate = `${stem}-${String(index).padStart(3,'0')}`;
      if (!used.has(candidate)) return candidate;
    }
    return `${stem}-${Date.now().toString().slice(-6)}`;
  }

  const THEME_KEY = 'atletic.theme';
  function readTheme() {
    try {
      const raw = localStorage.getItem(THEME_KEY);
      if (!raw) return 'dark';
      try {
        const parsed = JSON.parse(raw);
        if (parsed === 'dark' || parsed === 'light') return parsed;
      } catch {}
      return raw === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  }
  function saveTheme(theme) {
    try { localStorage.setItem(THEME_KEY, theme); } catch {}
  }
  function applyTheme(theme) {
    const dark = theme !== 'light';
    document.body.classList.toggle('dark', dark);
    document.documentElement.classList.toggle('theme-dark', dark);
    const button = $('#adminTheme');
    if (button) {
      button.setAttribute('aria-label', dark ? 'Ativar modo claro' : 'Ativar modo escuro');
      button.setAttribute('aria-pressed', String(dark));
      button.title = dark ? 'Ativar modo claro' : 'Ativar modo escuro';
    }
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#151515' : '#faf9f6');
  }
  const modules = {
    overview: 'Dashboard', products: 'Produtos', categories: 'Categorias', brands: 'Marcas', stock: 'Estoque',
    customers: 'Clientes', orders: 'Pedidos', coupons: 'Cupons', banners: 'Banners / Parceiros', showcase: 'Vitrine do site', images: 'Biblioteca de imagens', integrations: 'Integrações', settings: 'Configurações'
  };
  let page = 'overview';
  let editing = null;
  let selectedImage = '';
  let selectedImageSource = '';
  let variantImageTarget = null;
  let libraryImageCache = [];
  let data = AtleticStore.load();

  function refresh() { data = AtleticStore.load(); }
  function notify(text) { $('#adminStatus').textContent = text; $('#adminStatus').classList.add('visible'); clearTimeout(notify.timer); notify.timer = setTimeout(() => $('#adminStatus').classList.remove('visible'), 3200); }
  function brandName(id) { return data.brands.find(x => x.id === id)?.name || 'Sem marca'; }
  function categoryName(id) { return data.categories.find(x => x.id === id)?.name || 'Sem categoria'; }
  function sameText(a,b) {
    const normalizeText = value => String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'')
      .toLowerCase()
      .trim();
    return normalizeText(a) === normalizeText(b);
  }

  function ensureBrand(name) {
    const clean = String(name || '').trim();
    if (!clean) return null;
    let brand = data.brands.find(item => sameText(item.name, clean));
    if (!brand) {
      brand = { id: AtleticStore.uid('brand'), name: clean, active: true, source: 'image-library' };
      data.brands.push(brand);
    }
    return brand;
  }

  function ensureCategory(name) {
    const clean = String(name || '').trim();
    if (!clean) return null;
    let category = data.categories.find(item => sameText(item.name, clean));
    if (!category) {
      category = { id: AtleticStore.uid('cat'), name: clean, slug: slugify(clean), active: true, source: 'image-library' };
      data.categories.push(category);
    }
    return category;
  }

  async function syncLibraryTaxonomy({ renderAfter = false, silent = true } = {}) {
    try {
      const token = adminToken();
      const response = await fetch('/api/image-library?limit=500', {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Não foi possível sincronizar marcas da biblioteca.');

      let createdBrands = 0;
      let createdCategories = 0;
      const beforeBrandIds = new Set(data.brands.map(item => item.id));
      const beforeCategoryIds = new Set(data.categories.map(item => item.id));

      for (const image of payload.images || []) {
        const brand = ensureBrand(image.brand);
        const category = ensureCategory(image.category);
        if (brand && !beforeBrandIds.has(brand.id)) {
          beforeBrandIds.add(brand.id);
          createdBrands++;
        }
        if (category && !beforeCategoryIds.has(category.id)) {
          beforeCategoryIds.add(category.id);
          createdCategories++;
        }
      }

      if (createdBrands || createdCategories) {
        AtleticStore.save(data);
        if (!silent) notify(`${createdBrands} marca(s) e ${createdCategories} categoria(s) criadas a partir da biblioteca.`);
        if (renderAfter) render();
      }
      return { createdBrands, createdCategories };
    } catch (error) {
      if (!silent) notify(error.message);
      return { createdBrands: 0, createdCategories: 0 };
    }
  }

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
      head = ['Produto','Marca / categoria','Sabores / variações','Preço','Estoque total','Status','Ações'];
      body = rows.map(p => {
        const vars=productVariants(p.id);
        const activeVars=vars.filter(v=>v.active);
        const qty=activeVars.reduce((sum,v)=>sum+Math.max(0,balance(v.id)),0);
        const prices=activeVars.map(v=>Number(v.price||0)).filter(Boolean);
        const minPrice=prices.length?Math.min(...prices):0;
        const maxPrice=prices.length?Math.max(...prices):0;
        const low=activeVars.some(v=>balance(v.id)<=Number(v.minStock||0));
        const flavors=activeVars.map(v=>v.flavor||v.size||'Padrão').slice(0,3);
        const flavorText=flavors.join(' · ')+(activeVars.length>3?` +${activeVars.length-3}`:'');
        return `<tr><td><div class="product-cell">${imageFor(p)?`<img class="product-thumb" src="${esc(imageFor(p))}" alt="">`:'<span class="product-thumb"></span>'}<div><strong>${esc(p.name)}</strong><br><small>${esc(p.description||'')}</small></div></div></td><td>${esc(brandName(p.brandId))}<br><small>${esc(categoryName(p.categoryId))}</small></td><td><strong>${activeVars.length} ${activeVars.length===1?'variação':'variações'}</strong><br><small>${esc(flavorText||'Sem variação ativa')}</small></td><td>${minPrice?money(minPrice):'—'}${maxPrice>minPrice?`<br><small>até ${money(maxPrice)}</small>`:''}</td><td class="${low?'stock-low':'stock-ok'}">${qty}<br><small>saldo somado dos sabores</small></td><td><span class="badge">${p.active?'Ativo':'Inativo'}</span></td><td><button data-edit="${p.id}">Editar</button><button data-delete="${p.id}">Excluir</button></td></tr>`;
      }).join('');
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
        <div class="library-actions">
          <a class="button secondary" href="/api/export-original-images" download="atletic-imagens-originais-800x800.zip">Baixar originais (ZIP)</a>
          <button id="libraryImport" class="button">Importar / atualizar site atual</button>
        </div>
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

  async function renderShowcase() {
    const highlightCategories=['Proteínas','Creatinas','Pré-treinos','Vitaminas','Acessórios'];
    let visuals={hero:[],highlights:{}};
    let images=[];
    let activeSlot='hero:0';

    $('#adminContent').innerHTML=`
      <div class="showcase-head">
        <div>
          <h2>Vitrine do site</h2>
          <p class="muted">Escolha diretamente da biblioteca as 3 imagens do hero e a imagem exibida em cada destaque de categoria.</p>
        </div>
        <button id="saveShowcase" class="button">Salvar vitrine</button>
      </div>

      <section class="panel showcase-section">
        <div class="showcase-section-title">
          <div><p class="eyebrow">HERO PRINCIPAL</p><h2>3 produtos do topo</h2></div>
          <span class="status-chip">Selecione exatamente 3</span>
        </div>
        <div id="heroSlots" class="showcase-slots"></div>
      </section>

      <section class="panel showcase-section">
        <div class="showcase-section-title">
          <div><p class="eyebrow">DESTAQUES</p><h2>Imagem por categoria</h2></div>
          <span class="status-chip">1 imagem por categoria</span>
        </div>
        <div id="highlightSlots" class="showcase-slots showcase-slots-categories"></div>
      </section>

      <section class="panel showcase-library-panel">
        <div class="showcase-library-head">
          <div>
            <h2>Biblioteca de imagens</h2>
            <p class="muted" id="showcaseInstruction">Escolha um espaço acima e depois clique na imagem desejada.</p>
          </div>
          <input id="showcaseSearch" type="search" placeholder="Filtrar produto, marca ou categoria">
        </div>
        <div id="showcaseLibrary" class="showcase-library-grid"><div class="empty-panel">Carregando biblioteca…</div></div>
      </section>
    `;

    const token=adminToken();
    const [visualResponse,imageResponse]=await Promise.all([
      fetch('/api/site-visuals'),
      fetch('/api/image-library?limit=500',{headers:token?{Authorization:`Bearer ${token}`}:{}})
    ]);

    const visualPayload=await visualResponse.json().catch(()=>({}));
    const imagePayload=await imageResponse.json().catch(()=>({}));
    if(visualResponse.ok&&visualPayload.visuals) visuals=visualPayload.visuals;
    if(!imageResponse.ok){
      $('#showcaseLibrary').innerHTML=`<div class="empty-panel">${esc(imagePayload.error||'Não foi possível carregar a biblioteca.')}</div>`;
      return;
    }
    images=imagePayload.images||[];

    const visualCard=(item,label,slot)=>`
      <button type="button" class="showcase-slot ${activeSlot===slot?'active':''}" data-visual-slot="${esc(slot)}">
        <span class="showcase-slot-label">${esc(label)}</span>
        ${item?.image_url
          ? `<span class="showcase-slot-image"><img src="${esc(item.image_url)}" alt=""></span>
             <strong>${esc(item.title||'Imagem selecionada')}</strong>
             <small>${esc(item.brand||item.category||'Biblioteca')}</small>`
          : `<span class="showcase-slot-empty">+ Escolher imagem</span>`
        }
      </button>
    `;

    function renderSlots(){
      const hero=[0,1,2].map(index=>visualCard(visuals.hero?.[index],`Hero ${index+1}`,`hero:${index}`)).join('');
      $('#heroSlots').innerHTML=hero;
      $('#highlightSlots').innerHTML=highlightCategories.map(category=>
        visualCard(visuals.highlights?.[category],category,`highlight:${category}`)
      ).join('');
      document.querySelectorAll('[data-visual-slot]').forEach(button=>{
        button.onclick=()=>{
          activeSlot=button.dataset.visualSlot;
          renderSlots();
          renderLibrary();
          const [kind,key]=activeSlot.split(':');
          $('#showcaseInstruction').textContent=kind==='hero'
            ? `Escolhendo a imagem do Hero ${Number(key)+1}. Clique em uma imagem abaixo.`
            : `Escolhendo a imagem do destaque “${key}”. Clique em uma imagem abaixo.`;
        };
      });
    }

    function matches(image,term){
      if(!term)return true;
      return [image.title,image.brand,image.category,image.sku]
        .filter(Boolean).join(' ')
        .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
        .toLowerCase().includes(term);
    }

    function renderLibrary(){
      const term=String($('#showcaseSearch')?.value||'')
        .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
        .toLowerCase().trim();
      const list=images.filter(image=>matches(image,term));
      $('#showcaseLibrary').innerHTML=list.length?list.map(image=>`
        <button type="button" class="showcase-library-item" data-library-id="${esc(image.id)}">
          <span><img src="${esc(image.thumbnail_url||image.image_url)}" alt="${esc(image.title)}" loading="lazy"></span>
          <strong>${esc(image.title)}</strong>
          <small>${esc([image.brand,image.category].filter(Boolean).join(' · ')||'Sem classificação')}</small>
        </button>
      `).join(''):'<div class="empty-panel">Nenhuma imagem encontrada.</div>';

      document.querySelectorAll('[data-library-id]').forEach(button=>{
        button.onclick=()=>{
          const image=images.find(item=>String(item.id)===String(button.dataset.libraryId));
          if(!image)return;
          const selected={
            id:image.id,
            title:image.title||'',
            brand:image.brand||'',
            category:image.category||'',
            image_url:image.image_url,
            source_product_url:image.source_product_url||''
          };
          const [kind,key]=activeSlot.split(':');
          if(kind==='hero'){
            const hero=Array.isArray(visuals.hero)?[...visuals.hero]:[];
            hero[Number(key)]=selected;
            visuals.hero=hero;
            notify(`Hero ${Number(key)+1} atualizado para “${selected.title}”.`);
          }else{
            visuals.highlights={...(visuals.highlights||{}),[key]:selected};
            notify(`Destaque “${key}” atualizado para “${selected.title}”.`);
          }
          renderSlots();
        };
      });
    }

    $('#showcaseSearch').oninput=renderLibrary;
    $('#saveShowcase').onclick=async()=>{
      const button=$('#saveShowcase');
      const selectedHero=(visuals.hero||[]).filter(item=>item?.image_url);
      if(selectedHero.length!==3){
        notify('Selecione as 3 imagens do hero antes de salvar.');
        return;
      }
      button.disabled=true;
      button.textContent='Salvando…';
      try{
        const response=await fetch('/api/site-visuals',{
          method:'POST',
          headers:{'Content-Type':'application/json',Authorization:`Bearer ${adminToken()}`},
          body:JSON.stringify(visuals)
        });
        const payload=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(payload.error||'Não foi possível salvar a vitrine.');
        visuals=payload.visuals||visuals;
        notify('Vitrine salva. Hero e destaques já foram atualizados no site.');
      }catch(error){
        notify(error.message);
      }finally{
        button.disabled=false;
        button.textContent='Salvar vitrine';
      }
    };

    renderSlots();
    renderLibrary();
  }

  function olistCatalogItems() {
    return data.variants
      .filter(variant=>variant.active&&String(variant.sku||'').trim())
      .map(variant=>{
        const product=data.products.find(item=>item.id===variant.productId);
        const image=variant.image||product?.images?.[0]?.url||'';
        let absoluteImage=image;
        try{absoluteImage=image?new URL(image,location.origin).href:''}catch{}
        return {
          productKey:variant.productId,
          sku:String(variant.sku||'').trim(),
          name:product?.name||variantLabel(variant.id),
          brand:brandName(product?.brandId),
          category:categoryName(product?.categoryId),
          description:String(product?.description||'').trim(),
          imageUrl:absoluteImage,
          flavor:String(variant.flavor||'').trim(),
          size:String(variant.size||'').trim(),
          barcode:String(variant.barcode||'').trim(),
          price:Number(variant.price||0),
          cost:Number(variant.cost||0),
          minStock:Number(variant.minStock||0),
          stock:balance(variant.id)
        };
      });
  }

  function olistStatusMarkup(status={}) {
    const configured=Boolean(status.configured);
    const account=status.metadata?.account;
    const health=status.lastHealthcheckStatus;
    return `
      <div class="integration-status-line">
        <span class="integration-dot ${configured?'ready':'waiting'}"></span>
        <div>
          <strong>${configured?'Credencial instalada na Vercel':'Aguardando Token API'}</strong>
          <small>${configured?'A chave permanece somente no servidor e não é enviada ao navegador.':'Adicione OLIST_ERP_TOKEN como variável sensível na Vercel para ativar a conexão.'}</small>
        </div>
      </div>
      ${account?`<div class="integration-account"><small>Conta validada</small><strong>${esc(account.company||account.legalName||'ERP da Olist')}</strong><span>${esc([account.city,account.state].filter(Boolean).join(' / '))}</span></div>`:''}
      <div class="status-row integration-chips">
        <span class="status-chip">API: Token V2</span>
        <span class="status-chip">Pedidos: preparado</span>
        <span class="status-chip">SKU / sabores: preparado</span>
        <span class="status-chip">NF-e: estrutura preparada</span>
        <span class="status-chip">Estoque: próxima ativação</span>
        ${health?`<span class="status-chip">Último teste: ${esc(health)}</span>`:''}
      </div>
    `;
  }

  async function loadOlistStatus() {
    const target=$('#olistStatus');
    if(!target)return;
    try{
      const response=await fetch('/api/olist-erp',{headers:{Authorization:`Bearer ${adminToken()}`}});
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(payload.error||'Não foi possível consultar a integração.');
      target.innerHTML=olistStatusMarkup(payload);
      const disabled=!payload.configured;
      if($('#olistTest'))$('#olistTest').disabled=disabled;
      if($('#olistMatch'))$('#olistMatch').disabled=disabled;
      if($('#olistCreate'))$('#olistCreate').disabled=disabled;
      if($('#olistImport'))$('#olistImport').disabled=disabled;
    }catch(error){
      target.innerHTML=`<p class="integration-error">${esc(error.message)}</p>`;
    }
  }

  async function testOlistConnection() {
    const button=$('#olistTest');
    const output=$('#olistOutput');
    if(!button||!output)return;
    button.disabled=true;
    button.textContent='Testando…';
    output.textContent='';
    try{
      const response=await fetch('/api/olist-erp',{
        method:'POST',
        headers:{'Content-Type':'application/json',Authorization:`Bearer ${adminToken()}`},
        body:JSON.stringify({action:'test'})
      });
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(payload.error||'Falha ao testar a conexão.');
      output.className='integration-output success';
      output.textContent=`Conectado com sucesso: ${payload.account?.company||'ERP da Olist'}.`;
      await loadOlistStatus();
    }catch(error){
      output.className='integration-output error';
      output.textContent=error.message;
    }finally{
      button.disabled=false;
      button.textContent='Testar conexão';
    }
  }

  async function matchOlistCatalog() {
    const button=$('#olistMatch');
    const output=$('#olistOutput');
    if(!button||!output)return;
    const items=olistCatalogItems();
    if(!items.length){
      output.className='integration-output error';
      output.textContent='Nenhuma variação ativa com SKU para mapear.';
      return;
    }
    button.disabled=true;
    button.textContent='Mapeando SKUs…';
    output.className='integration-output';
    output.textContent=`Consultando ${items.length} SKU(s) no ERP…`;
    try{
      const response=await fetch('/api/olist-erp',{
        method:'POST',
        headers:{'Content-Type':'application/json',Authorization:`Bearer ${adminToken()}`},
        body:JSON.stringify({action:'match_catalog',items})
      });
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(payload.error||'Falha ao mapear catálogo.');
      const summary=payload.summary||{};
      const errors=(payload.results||[]).filter(item=>item.status==='error');
      output.className=summary.errors?'integration-output error':'integration-output success';
      output.textContent=`${summary.matched||0} SKU(s) vinculados · ${summary.notFound||0} ainda não encontrados no ERP · ${summary.errors||0} erro(s).${errors.length?' '+errors.slice(0,2).map(item=>item.message).filter(Boolean).join(' · '):''}`;
    }catch(error){
      output.className='integration-output error';
      output.textContent=error.message;
    }finally{
      button.disabled=false;
      button.textContent='Mapear catálogo por SKU';
    }
  }

  async function createMissingOlistCatalog() {
    const button=$('#olistCreate');
    const output=$('#olistOutput');
    if(!button||!output)return;

    const items=olistCatalogItems();
    if(!items.length){
      output.className='integration-output error';
      output.textContent='Nenhuma variação ativa com SKU para cadastrar.';
      return;
    }

    const origin=$('#olistOrigin')?.value||'';
    const unit=$('#olistUnit')?.value||'UN';
    if(!origin){
      output.className='integration-output error';
      output.textContent='Selecione a origem fiscal.';
      return;
    }

    const products=new Set(items.map(item=>item.productKey||item.name));
    if(!confirm(`Cadastrar na Olist até ${products.size} produto(s), agrupando ${items.length} sabor(es)/SKU(s)?\n\nOrigem fiscal: ${origin}\nUnidade: ${unit}\n\nO sistema verifica cada SKU antes de criar para evitar duplicidades.`))return;

    button.disabled=true;
    button.textContent='Cadastrando…';
    output.className='integration-output';
    output.textContent='Validando SKUs e criando os produtos ausentes na Olist…';

    try{
      const response=await fetch('/api/olist-erp',{
        method:'POST',
        headers:{'Content-Type':'application/json',Authorization:`Bearer ${adminToken()}`},
        body:JSON.stringify({action:'create_missing_catalog',items,origin,unit})
      });
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(payload.error||'Falha ao cadastrar produtos na Olist.');
      const summary=payload.summary||{};
      const failures=(payload.results||[]).filter(item=>item.status==='error'||item.status==='partial_existing');
      output.className=summary.errors||summary.partial?'integration-output error':'integration-output success';
      output.textContent=`${summary.createdProducts||0} produto(s) criado(s) · ${summary.createdVariants||0} sabor(es) cadastrados · ${summary.alreadyExists||0} já existentes · ${summary.partial||0} parcialmente existentes · ${summary.errors||0} erro(s).${failures.length?' '+failures.slice(0,2).map(item=>item.message).filter(Boolean).join(' · '):''}`;
      await loadOlistStatus();
    }catch(error){
      output.className='integration-output error';
      output.textContent=error.message;
    }finally{
      button.disabled=false;
      button.textContent='Cadastrar produtos ausentes';
    }
  }

  async function olistImportRequest(action,extra={}) {
    const response=await fetch('/api/olist-import',{
      method:'POST',
      headers:{'Content-Type':'application/json',Authorization:`Bearer ${adminToken()}`},
      body:JSON.stringify({action,...extra})
    });
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(payload.error||'Falha na importação da Olist.');
    return payload;
  }

  const importPause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

  async function runOlistImportStage({listAction,importAction,label,listExtra={}}) {
    let page=1;
    let totalPages=1;
    let imported=0;
    let skipped=0;
    let errors=0;
    do{
      const listing=await olistImportRequest(listAction,{page,...listExtra});
      totalPages=Math.max(1,Number(listing.totalPages||1));
      const items=Array.isArray(listing.items)?listing.items:[];
      for(let index=0;index<items.length;index++){
        const item=items[index];
        const output=$('#olistImportOutput');
        if(output)output.textContent=`${label}: página ${page}/${totalPages} · ${index+1}/${items.length} · ${imported} importados · ${errors} erros`;
        try{
          const result=await olistImportRequest(importAction,{id:item.id});
          if(result?.result?.skipped)skipped++;
          else imported++;
        }catch(error){
          errors++;
          const errorsBox=$('#olistImportErrors');
          if(errorsBox&&errorsBox.children.length<8){
            errorsBox.insertAdjacentHTML('beforeend',`<li>${esc(item.name||item.number||item.id)}: ${esc(error.message)}</li>`);
          }
        }
        await importPause(120);
      }
      page++;
    }while(page<=totalPages);
    return {label,imported,skipped,errors};
  }

  async function importExistingOlistData() {
    const button=$('#olistImport');
    const output=$('#olistImportOutput');
    const errorsBox=$('#olistImportErrors');
    if(!button||!output)return;
    if(!confirm('Importar os dados existentes da Olist para o novo banco da Atletic?\n\nSerão importados produtos, sabores/variações, imagens, estoque, clientes, endereços e pedidos históricos.\n\nA importação é incremental e pode ser executada novamente sem duplicar os registros vinculados à Olist.'))return;

    button.disabled=true;
    button.textContent='Importando…';
    if(errorsBox)errorsBox.innerHTML='';
    output.className='integration-output';
    output.textContent='Preparando a migração da Olist…';

    const summaries=[];
    try{
      summaries.push(await runOlistImportStage({
        listAction:'list_products',
        importAction:'import_product',
        label:'Produtos / sabores / imagens / estoque'
      }));
      summaries.push(await runOlistImportStage({
        listAction:'list_contacts',
        importAction:'import_contact',
        label:'Clientes / endereços'
      }));
      summaries.push(await runOlistImportStage({
        listAction:'list_orders',
        importAction:'import_order',
        label:'Pedidos históricos',
        listExtra:{from:'01/01/2000'}
      }));

      const counts=await olistImportRequest('counts');
      const summaryText=summaries.map(s=>`${s.label}: ${s.imported} importados, ${s.skipped} ignorados, ${s.errors} erros`).join(' · ');
      output.className=summaries.some(s=>s.errors)?'integration-output error':'integration-output success';
      output.textContent=`Migração concluída. ${summaryText}. Banco: ${counts.counts?.products||0} produtos, ${counts.counts?.product_variants||0} variações, ${counts.counts?.customers||0} clientes e ${counts.counts?.orders||0} pedidos.`;
    }catch(error){
      output.className='integration-output error';
      output.textContent=`Importação interrompida: ${error.message}. Você pode executar novamente; registros já vinculados não serão duplicados.`;
    }finally{
      button.disabled=false;
      button.textContent='Importar dados da loja antiga';
    }
  }

  function renderIntegrations() {
    $('#adminContent').innerHTML=`
      <div class="integration-page">
        <section class="panel integration-hero">
          <div class="integration-brand">
            <div class="integration-logo">O</div>
            <div>
              <p class="eyebrow">ERP / FISCAL / ESTOQUE</p>
              <h2>ERP da Olist</h2>
              <p class="muted">A ponte do e-commerce Atletic com pedidos, clientes, SKUs por sabor, estoque, NF-e e rastreamento.</p>
            </div>
          </div>
          <div id="olistStatus" class="integration-status"><p class="muted">Verificando configuração…</p></div>
          <div class="integration-fiscal">
            <label>Origem fiscal padrão
              <select id="olistOrigin">
                <option value="0">0 — Nacional</option>
                <option value="1">1 — Estrangeira, importação direta</option>
                <option value="2">2 — Estrangeira, adquirida no mercado interno</option>
                <option value="3">3 — Nacional com conteúdo de importação &gt; 40% e ≤ 70%</option>
                <option value="4">4 — Nacional conforme processos produtivos básicos</option>
                <option value="5">5 — Nacional com conteúdo de importação ≤ 40%</option>
                <option value="6">6 — Estrangeira, importação direta sem similar nacional</option>
                <option value="7">7 — Estrangeira, adquirida no mercado interno sem similar nacional</option>
                <option value="8">8 — Nacional com conteúdo de importação &gt; 70%</option>
              </select>
            </label>
            <label>Unidade
              <select id="olistUnit"><option value="UN">UN — Unidade</option></select>
            </label>
            <p>Revise a origem fiscal antes do primeiro cadastro. A Olist exige esse campo para incluir produtos.</p>
          </div>
          <div class="integration-actions">
            <button id="olistTest" class="button" disabled>Testar conexão</button>
            <button id="olistMatch" class="button secondary" disabled>Mapear catálogo por SKU</button>
            <button id="olistCreate" class="button secondary" disabled>Cadastrar produtos ausentes</button>
          </div>
          <p id="olistOutput" class="integration-output" role="status"></p>
        </section>

        <section class="panel olist-migration-panel">
          <div class="olist-migration-head">
            <div>
              <p class="eyebrow">MIGRAÇÃO DA LOJA ANTIGA</p>
              <h2>Importar tudo que já existe na Olist</h2>
              <p class="muted">A Olist passa a ser nossa fonte de migração. O processo importa produtos, variações/sabores, imagens, estoque, clientes, endereços e pedidos históricos em lotes, sem exigir recadastro manual.</p>
            </div>
            <button id="olistImport" class="button" disabled>Importar dados da loja antiga</button>
          </div>
          <div class="integration-chips status-row">
            <span class="status-chip">Produtos + variações</span>
            <span class="status-chip">Imagens</span>
            <span class="status-chip">Estoque</span>
            <span class="status-chip">Clientes</span>
            <span class="status-chip">Endereços</span>
            <span class="status-chip">Pedidos históricos</span>
          </div>
          <p id="olistImportOutput" class="integration-output" role="status">A importação é incremental: se for interrompida, pode ser executada novamente.</p>
          <ul id="olistImportErrors" class="olist-import-errors"></ul>
        </section>

        <div class="admin-grid integration-grid">
          <section class="panel">
            <h2>Fluxo preparado</h2>
            <ol class="integration-steps">
              <li><b>01</b><div><strong>Pagamento aprovado</strong><span>O pedido será enviado ao ERP somente após confirmação do pagamento.</span></div></li>
              <li><b>02</b><div><strong>Pedido + cliente + sabor/SKU</strong><span>Cada variação usa o SKU próprio, preservando o controle de estoque por sabor.</span></div></li>
              <li><b>03</b><div><strong>Fiscal</strong><span>O pedido poderá gerar NF-e no ERP e os dados da nota serão salvos no pedido da Atletic.</span></div></li>
              <li><b>04</b><div><strong>Minha Conta</strong><span>Status, nota e rastreamento voltarão para a área do cliente.</span></div></li>
            </ol>
          </section>
          <section class="panel">
            <h2>Ativação</h2>
            <p class="muted">No ERP da Olist, instale a extensão <strong>Token API</strong> e gere o token em Configurações → E-commerce → Token API.</p>
            <div class="integration-secret-note"><strong>Segurança</strong><span>Não salvamos o token no navegador ou no Supabase. Ele deve ficar como variável sensível <code>OLIST_ERP_TOKEN</code> na Vercel.</span></div>
            <p class="muted integration-version-note">A integração inicial usa a API V2 por Token para ativação rápida. A arquitetura foi isolada para podermos migrar para Aplicativo API V3 depois sem alterar a loja.</p>
          </section>
        </div>
      </div>
    `;
    $('#olistTest').onclick=testOlistConnection;
    $('#olistMatch').onclick=matchOlistCatalog;
    $('#olistCreate').onclick=createMissingOlistCatalog;
    $('#olistImport').onclick=importExistingOlistData;
    loadOlistStatus();
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
    if(page==='showcase') return renderShowcase();
    if(page==='images') return renderImageLibrary();
    if(page==='integrations') return renderIntegrations();
    if(page==='settings') return renderSettings();
    if(page==='brands' || page==='categories') {
      syncLibraryTaxonomy({ renderAfter: true, silent: true });
    }
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

  function productVariants(productId) {
    return data.variants.filter(v => v.productId === productId);
  }

  function variantImage(variant, product) {
    return String(variant?.image || product?.images?.[0]?.url || '');
  }

  function generatedVariantSku(name, brand, flavor, size, used = new Set()) {
    const rawBase = generateInternalSku(name, brand).replace(/-\d{3}$/,'');
    const flavorCode = skuNormalize(flavor).split(/\s+/).filter(Boolean).map(x=>x.slice(0,3)).join('').slice(0,6);
    const sizeCode = skuNormalize(size).replace(/\s+/g,'').slice(0,6);
    const stem = [rawBase, flavorCode || sizeCode].filter(Boolean).join('-');
    for (let index = 1; index <= 999; index++) {
      const candidate = `${stem}-${String(index).padStart(3,'0')}`;
      if (!used.has(candidate.toUpperCase())) return candidate;
    }
    return `${stem}-${Date.now().toString().slice(-6)}`;
  }

  function variantRowHtml(variant = {}, product = {}) {
    const id = variant.id || '';
    const image = variantImage(variant, product);
    const current = id ? balance(id) : 0;
    const active = variant.active ?? true;
    const stockLabel = id ? `Saldo atual: ${current}` : 'Novo sabor';
    return `
      <article class="variant-row" data-variant-id="${esc(id)}" data-auto-sku="${id?'false':'true'}">
        <div class="variant-row-head">
          <div class="variant-row-title">
            <img data-variant-preview src="${esc(image || 'assets/logo.svg')}" alt="">
            <div>
              <strong data-variant-title>${esc(variant.flavor || 'Nova variação')}</strong>
              <small data-variant-subtitle>${esc([variant.size,variant.sku].filter(Boolean).join(' · ') || 'Defina sabor, tamanho e SKU')}</small>
              <span class="variant-stock-chip ${current<=0?'zero':''}">${stockLabel}</span>
            </div>
          </div>
          <button type="button" class="variant-remove" data-remove-variant>Remover</button>
        </div>
        <div class="variant-grid">
          <label>Sabor
            <input data-vfield="flavor" value="${esc(variant.flavor || '')}" placeholder="Ex.: Chocolate">
          </label>
          <label>Peso / tamanho
            <input data-vfield="size" value="${esc(variant.size || '')}" placeholder="Ex.: 900 g">
          </label>
          <label>SKU
            <input data-vfield="sku" value="${esc(variant.sku || '')}" placeholder="Gerado automaticamente">
          </label>
          <label>Código de barras
            <input data-vfield="barcode" value="${esc(variant.barcode || '')}">
          </label>
          <label>Preço de venda
            <input data-vfield="price" type="number" min="0" step="0.01" value="${(Number(variant.price||0)/100).toFixed(2)}">
          </label>
          <label>Preço anterior
            <input data-vfield="comparePrice" type="number" min="0" step="0.01" value="${(Number(variant.comparePrice||0)/100).toFixed(2)}">
          </label>
          <label>Custo
            <input data-vfield="cost" type="number" min="0" step="0.01" value="${(Number(variant.cost||0)/100).toFixed(2)}">
          </label>
          <label>Estoque mínimo
            <input data-vfield="minStock" type="number" step="1" min="0" value="${Number(variant.minStock||0)}">
          </label>
          <label class="span-4">Imagem específica do sabor
            <div class="variant-image-row">
              <input data-vfield="image" value="${esc(variant.image || '')}" placeholder="Se vazio, usa a imagem principal do produto">
              <div class="variant-image-actions">
                <button type="button" data-variant-main-image>Usar imagem principal</button>
                <button type="button" data-variant-library>Escolher da biblioteca</button>
              </div>
            </div>
          </label>
          ${id
            ? '<label>Variação ativa<input data-vfield="active" type="checkbox" '+(active?'checked':'')+'></label>'
            : '<label>Estoque inicial<input data-vfield="initialStock" type="number" step="1" min="0" value="0"></label><label>Variação ativa<input data-vfield="active" type="checkbox" checked></label>'
          }
        </div>
        <p class="variant-help">${id?'Movimente entradas e saídas pela aba Estoque. O saldo é independente para este sabor.':'Ao salvar, o estoque inicial informado será criado somente para este sabor.'}</p>
      </article>
    `;
  }

  function renderVariantEditor(productId, product = {}) {
    const section = $('#variantEditor');
    const rows = $('#variantRows');
    if (!section || !rows) return;
    section.hidden = page !== 'products';
    if (page !== 'products') return;
    const variants = productId ? productVariants(productId) : [];
    rows.innerHTML = (variants.length ? variants : [{}]).map(v => variantRowHtml(v, product)).join('');
  }

  function refreshVariantRow(row) {
    const flavor = row.querySelector('[data-vfield="flavor"]')?.value.trim() || 'Nova variação';
    const size = row.querySelector('[data-vfield="size"]')?.value.trim() || '';
    const sku = row.querySelector('[data-vfield="sku"]')?.value.trim() || '';
    const image = row.querySelector('[data-vfield="image"]')?.value.trim() || selectedImage || 'assets/logo.svg';
    const title = row.querySelector('[data-variant-title]');
    const subtitle = row.querySelector('[data-variant-subtitle]');
    const preview = row.querySelector('[data-variant-preview]');
    if (title) title.textContent = flavor;
    if (subtitle) subtitle.textContent = [size,sku].filter(Boolean).join(' · ') || 'Defina sabor, tamanho e SKU';
    if (preview) preview.src = image;
  }

  function usedVariantSkus(exceptRow=null) {
    const used=new Set(
      data.variants
        .map(v=>String(v.sku||'').trim().toUpperCase())
        .filter(Boolean)
    );
    document.querySelectorAll('#variantRows .variant-row').forEach(row=>{
      if(row===exceptRow)return;
      const sku=String(row.querySelector('[data-vfield="sku"]')?.value||'').trim().toUpperCase();
      if(sku)used.add(sku);
    });
    return used;
  }

  function updateAutoVariantSku(row) {
    if(!row || row.dataset.variantId || row.dataset.autoSku==='false')return;
    const name=String($('#editForm [name="name"]')?.value||'Produto').trim();
    const brandId=String($('#editForm [name="brandId"]')?.value||'');
    const brand=brandName(brandId);
    const flavor=String(row.querySelector('[data-vfield="flavor"]')?.value||'').trim();
    const size=String(row.querySelector('[data-vfield="size"]')?.value||'').trim();
    const skuInput=row.querySelector('[data-vfield="sku"]');
    if(!skuInput)return;
    if(!flavor){
      skuInput.value='';
      refreshVariantRow(row);
      return;
    }
    skuInput.value=generatedVariantSku(name,brand,flavor,size,usedVariantSkus(row));
    refreshVariantRow(row);
  }

  function cloneVariantFromRow(sourceRow, product={}) {
    if(!sourceRow)return {};
    const value=field=>String(sourceRow.querySelector(`[data-vfield="${field}"]`)?.value||'').trim();
    const numberValue=field=>Math.round(Number(sourceRow.querySelector(`[data-vfield="${field}"]`)?.value||0)*100);
    return {
      id:'',
      productId:product.id||'',
      flavor:'',
      size:value('size'),
      sku:'',
      barcode:'',
      price:numberValue('price'),
      comparePrice:numberValue('comparePrice'),
      cost:numberValue('cost'),
      minStock:Math.max(0,Number(value('minStock')||0)),
      image:value('image'),
      active:Boolean(sourceRow.querySelector('[data-vfield="active"]')?.checked ?? true)
    };
  }

  function openEditor(id=null) {
    editing=id; selectedImage=''; selectedImageSource=''; variantImageTarget=null; $('#formError').textContent=''; $('#imageResults').innerHTML=''; $('#imageSearchStatus').textContent=''; $('#imageSearchBox').hidden=page!=='products';
    let html='';
    if(page==='products'){
      const p=data.products.find(x=>x.id===id)||{}; selectedImage=imageFor(p); selectedImageSource=p.images?.[0]?.sourceUrl||'';
      html += input('name','Nome do produto','text',p.name||'',[],true,true);
      html += input('brandId','Marca','select',p.brandId||data.brands[0]?.id||'',data.brands.map(x=>[x.id,x.name]),false,true);
      html += input('categoryId','Categoria','select',p.categoryId||data.categories[0]?.id||'',data.categories.map(x=>[x.id,x.name]),false,true);
      html += input('description','Descrição','textarea',p.description||'',[],true);
      html += input('featured','Em destaque','checkbox',Boolean(p.featured));
      html += input('active','Produto ativo','checkbox',p.active??true);
      if(selectedImage) $('#imageSearchStatus').innerHTML=`<div class="selected-image"><img src="${esc(selectedImage)}" alt=""><div><strong>Imagem principal do produto</strong><br><small>Os sabores sem imagem própria usarão esta imagem.</small></div></div>`;
      setTimeout(()=>renderVariantEditor(id,p),0);
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
    $('#editor').classList.toggle('product-editor',page==='products');
    if(page!=='products'&&$('#variantEditor'))$('#variantEditor').hidden=true;
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
      const brand = img.brand || '';
      const category = img.category || '';
      return `<button type="button" class="image-option" data-image="${esc(imageUrl)}" data-source="${esc(sourceUrl)}" data-origin="${esc(origin)}" data-title="${esc(title)}" data-brand="${esc(brand)}" data-category="${esc(category)}" title="${esc(title)}"><img src="${esc(thumb)}" alt=""><span>${esc(source)}</span></button>`;
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
    variantImageTarget=null;
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
    variantImageTarget=null;
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
      const taxonomy = await syncLibraryTaxonomy({ silent: true });
      $('#imageSearchStatus').textContent = `Importação concluída: ${payload.importedImages || 0} imagens encontradas em ${payload.pagesRead || 0} página(s). ${taxonomy.createdBrands || 0} marca(s) e ${taxonomy.createdCategories || 0} categoria(s) novas criadas.`;
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
        const name=String(fd.get('name')||'').trim();
        if(!name) throw new Error('Nome do produto é obrigatório.');
        const brandId=String(fd.get('brandId')||'');
        const categoryId=String(fd.get('categoryId')||'');
        const selectedBrandName=brandName(brandId);
        Object.assign(product,{name,brandId,categoryId,description:String(fd.get('description')||'').trim(),featured:fd.has('featured'),active:fd.has('active')});
        if(selectedImage) product.images=[{url:selectedImage,sourceUrl:selectedImageSource,alt:name}];

        const rows=[...document.querySelectorAll('#variantRows .variant-row')];
        if(!rows.length) throw new Error('Cadastre pelo menos um sabor / variação.');
        const existing=productVariants(product.id);
        const existingIds=new Set(existing.map(v=>v.id));
        const keptIds=new Set();
        const usedSkus=new Set(data.variants.filter(v=>v.productId!==product.id).map(v=>String(v.sku||'').toUpperCase()).filter(Boolean));
        const nextVariants=[];

        for(const row of rows){
          const id=row.dataset.variantId||AtleticStore.uid('var');
          const get=field=>row.querySelector(`[data-vfield="${field}"]`);
          const flavor=String(get('flavor')?.value||'').trim();
          const size=String(get('size')?.value||'').trim();
          if(!flavor && rows.length>1) throw new Error('Informe o sabor de todas as variações.');
          let sku=String(get('sku')?.value||'').trim();
          if(!sku) sku=generatedVariantSku(name,selectedBrandName,flavor,size,usedSkus);
          if(usedSkus.has(sku.toUpperCase())) throw new Error(`SKU duplicado: ${sku}`);
          usedSkus.add(sku.toUpperCase());
          const variant={
            id,
            productId:product.id,
            sku,
            barcode:String(get('barcode')?.value||'').trim(),
            flavor,
            size,
            price:Math.round(Number(get('price')?.value||0)*100),
            comparePrice:Math.round(Number(get('comparePrice')?.value||0)*100),
            cost:Math.round(Number(get('cost')?.value||0)*100),
            minStock:Math.max(0,Number(get('minStock')?.value||0)),
            image:String(get('image')?.value||'').trim(),
            active:Boolean(get('active')?.checked)
          };
          nextVariants.push(variant);
          keptIds.add(id);

          if(!existingIds.has(id)){
            const initialStock=Math.max(0,Math.floor(Number(get('initialStock')?.value||0)));
            if(initialStock>0)data.stock.push({id:AtleticStore.uid('mov'),variantId:id,lot:'',expires:'',delta:initialStock,reason:'Estoque inicial da variação',createdAt:new Date().toISOString()});
          }
        }

        const removed=existing.filter(v=>!keptIds.has(v.id));
        const preservedRemoved=[];
        for(const variant of removed){
          if(data.stock.some(m=>m.variantId===variant.id))preservedRemoved.push({...variant,active:false});
        }

        data.variants=data.variants.filter(v=>v.productId!==product.id);
        data.variants.push(...nextVariants,...preservedRemoved);
        if(!editing)data.products.push(product);
      } else if(page==='categories') { const r=editing?data.categories.find(x=>x.id===editing):{id:AtleticStore.uid('cat')}; r.name=String(fd.get('name')||'').trim(); r.slug=slugify(fd.get('slug')||r.name); r.active=fd.has('active'); if(!r.name)throw new Error('Informe a categoria.'); if(!editing)data.categories.push(r); }
      else if(page==='brands') { const r=editing?data.brands.find(x=>x.id===editing):{id:AtleticStore.uid('brand')}; r.name=String(fd.get('name')||'').trim(); r.active=fd.has('active'); if(!r.name)throw new Error('Informe a marca.'); if(!editing)data.brands.push(r); }
      else if(page==='stock') { const variantId=String(fd.get('variantId')); const delta=Number(fd.get('delta')); if(!Number.isInteger(delta)||delta===0)throw new Error('Informe uma quantidade inteira diferente de zero.'); if(balance(variantId)+delta<0)throw new Error('Saída maior que o saldo atual.'); data.stock.push({id:AtleticStore.uid('mov'),variantId,lot:String(fd.get('lot')||'').trim(),expires:String(fd.get('expires')||''),delta,reason:String(fd.get('reason')||'').trim(),createdAt:new Date().toISOString()}); }
      else if(page==='coupons') { const r=editing?data.coupons.find(x=>x.id===editing):{id:AtleticStore.uid('cup')}; r.code=String(fd.get('code')||'').trim().toUpperCase(); r.kind=String(fd.get('kind')); r.amount=r.kind==='fixed'?Math.round(Number(fd.get('amount')||0)*100):Number(fd.get('amount')||0); r.minimum=Math.round(Number(fd.get('minimum')||0)*100); r.startsAt=String(fd.get('startsAt')||''); r.expiresAt=String(fd.get('expiresAt')||''); r.active=fd.has('active'); if(!r.code)throw new Error('Informe o código.'); if(!editing)data.coupons.push(r); }
      else if(page==='banners') { const r=editing?data.banners.find(x=>x.id===editing):{id:AtleticStore.uid('banner')}; for(const key of ['type','partner','eyebrow','title','description','button','href','whatsapp','message','image','mobileImage','startsAt','expiresAt'])r[key]=String(fd.get(key)||'').trim(); r.whatsapp=r.whatsapp.replace(/\D/g,''); r.position=Number(fd.get('position')||0); r.active=fd.has('active'); r.imageAlt=r.title.replace(/\n/g,' '); r.accent=r.type==='partner'?'dark':'gold'; if(!r.title)throw new Error('Informe o título.'); if(r.image&&!/^https:\/\//i.test(r.image))throw new Error('A imagem desktop deve usar HTTPS.'); if(!editing)data.banners.push(r); }
      persist(); $('#editor').close(); render();
    } catch(error) { $('#formError').textContent=error.message; }
  };

  document.addEventListener('input', event => {
    const row=event.target.closest?.('.variant-row');
    if(!row||!event.target.matches('[data-vfield]'))return;
    if(event.target.matches('[data-vfield="sku"]')&&event.isTrusted){
      row.dataset.autoSku=event.target.value.trim()?'false':'true';
    }
    if(event.target.matches('[data-vfield="flavor"],[data-vfield="size"]')){
      updateAutoVariantSku(row);
    } else {
      refreshVariantRow(row);
    }
  });

  $('#editForm').addEventListener('input', event => {
    if(page!=='products')return;
    if(event.target.matches('[name="name"],[name="brandId"]')){
      document.querySelectorAll('#variantRows .variant-row').forEach(updateAutoVariantSku);
    }
  });

  document.addEventListener('click', event => {
    const nav=event.target.closest('[data-page]'); if(nav){page=nav.dataset.page;render();return;}
    const edit=event.target.closest('[data-edit]'); if(edit){openEditor(edit.dataset.edit);return;}
    const del=event.target.closest('[data-delete]'); if(del){const id=del.dataset.delete;if(!confirm('Excluir este cadastro de demonstração?'))return;
      if(page==='products'){const variantIds=data.variants.filter(v=>v.productId===id).map(v=>v.id); if(data.stock.some(m=>variantIds.includes(m.variantId))){notify('Este produto tem histórico de estoque. Desative-o em vez de excluir.');return;} data.products=data.products.filter(x=>x.id!==id);data.variants=data.variants.filter(x=>x.productId!==id);}
      else if(page==='categories'&&data.products.some(x=>x.categoryId===id)){notify('Categoria em uso. Mova os produtos ou desative a categoria.');return;}
      else if(page==='brands'&&data.products.some(x=>x.brandId===id)){notify('Marca em uso. Mova os produtos ou desative a marca.');return;}
      else data[page]=data[page].filter(x=>x.id!==id); persist(); render(); return;
    }
    const addVariant=event.target.closest('#addVariant'); if(addVariant){
      const p=data.products.find(x=>x.id===editing)||{};
      const rows=[...document.querySelectorAll('#variantRows .variant-row')];
      const source=rows[rows.length-1]||null;
      const clone=cloneVariantFromRow(source,p);
      $('#variantRows').insertAdjacentHTML('beforeend',variantRowHtml(clone,p));
      const created=$('#variantRows .variant-row:last-child');
      if(created){
        created.dataset.autoSku='true';
        refreshVariantRow(created);
        created.scrollIntoView({behavior:'smooth',block:'center'});
        setTimeout(()=>created.querySelector('[data-vfield="flavor"]')?.focus(),250);
      }
      notify('Novo sabor criado copiando tamanho, preços, custo, estoque mínimo e imagem. Informe o sabor para gerar o SKU automaticamente.');
      return;
    }
    const removeVariant=event.target.closest('[data-remove-variant]'); if(removeVariant){
      const row=removeVariant.closest('.variant-row');
      if(document.querySelectorAll('#variantRows .variant-row').length<=1){notify('O produto precisa ter pelo menos uma variação.');return;}
      row?.remove();
      return;
    }
    const useMain=event.target.closest('[data-variant-main-image]'); if(useMain){
      const row=useMain.closest('.variant-row');
      const input=row?.querySelector('[data-vfield="image"]');
      if(input){input.value='';refreshVariantRow(row);}
      return;
    }
    const pickVariantImage=event.target.closest('[data-variant-library]'); if(pickVariantImage){
      variantImageTarget=pickVariantImage.closest('.variant-row');
      searchLibrary().then(()=>{$('#imageSearchStatus').textContent='Selecione abaixo a imagem que corresponde a este sabor.';});
      return;
    }
    const image=event.target.closest('[data-image]'); if(image){
      if(variantImageTarget){
        const input=variantImageTarget.querySelector('[data-vfield="image"]');
        if(input)input.value=image.dataset.image||'';
        refreshVariantRow(variantImageTarget);
        document.querySelectorAll('.image-option').forEach(x=>x.classList.toggle('selected',x===image));
        notify('Imagem vinculada somente a este sabor.');
        variantImageTarget=null;
        return;
      }
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

      let linkedBrandName='';
      let linkedCategoryName='';
      const brandFromImage=String(image.dataset.brand||'').trim();
      const categoryFromImage=String(image.dataset.category||'').trim();

      if(brandFromImage){
        const brand=ensureBrand(brandFromImage);
        const brandSelect=$('#editForm [name=brandId]');
        if(brand && brandSelect){
          if(![...brandSelect.options].some(option=>option.value===brand.id)){
            brandSelect.add(new Option(brand.name,brand.id));
          }
          brandSelect.value=brand.id;
          linkedBrandName=brand.name;
        }
      }

      if(categoryFromImage){
        const category=ensureCategory(categoryFromImage);
        const categorySelect=$('#editForm [name=categoryId]');
        if(category && categorySelect){
          if(![...categorySelect.options].some(option=>option.value===category.id)){
            categorySelect.add(new Option(category.name,category.id));
          }
          categorySelect.value=category.id;
          linkedCategoryName=category.name;
        }
      }

      if(linkedBrandName || linkedCategoryName){
        AtleticStore.save(data);
      }

      const skuField=$('#editForm [name=sku]');
      let generatedSku='';
      if(skuField && (!editing || !skuField.value.trim() || /^ATL-/i.test(skuField.value.trim()))){
        generatedSku=generateInternalSku(imageTitle || nameField?.value.trim() || 'Produto', image.dataset.brand || '');
        skuField.value=generatedSku;
        skuField.dispatchEvent(new Event('input',{bubbles:true}));
      }

      const baseStatus=image.dataset.origin==='library'
        ? 'Imagem da biblioteca selecionada. Ela será vinculada ao produto ao salvar.'
        : 'Imagem da internet selecionada e adicionada à biblioteca para reutilização futura.';
      const changes=[];
      if(nameChanged) changes.push(`nome atualizado para “${imageTitle}”`);
      if(linkedBrandName) changes.push(`marca vinculada: ${linkedBrandName}`);
      if(linkedCategoryName) changes.push(`categoria vinculada: ${linkedCategoryName}`);
      if(generatedSku) changes.push(`SKU interno criado: ${generatedSku}`);
      $('#imageSearchStatus').textContent=changes.length
        ? `${baseStatus} ${changes.join(' · ')}.`
        : baseStatus;

      if(generatedSku || linkedBrandName || linkedCategoryName){
        const notificationParts=[];
        if(nameChanged) notificationParts.push('nome atualizado');
        if(linkedBrandName) notificationParts.push(`marca ${linkedBrandName} vinculada`);
        if(linkedCategoryName) notificationParts.push(`categoria ${linkedCategoryName} vinculada`);
        if(generatedSku) notificationParts.push(`SKU ${generatedSku} criado`);
        notify(notificationParts.join(' · '));
      }

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
  applyTheme(readTheme());
  $('#adminTheme').onclick=()=>{
    const next=document.body.classList.contains('dark')?'light':'dark';
    saveTheme(next);
    applyTheme(next);
    notify(next==='dark'?'Modo escuro salvo como preferência.':'Modo claro salvo como preferência.');
  };
  $('#adminNav').innerHTML=Object.entries(modules).map(([id,label])=>`<button data-page="${id}">${label}</button>`).join('');
  window.addEventListener('storage', event=>{if(event.key===AtleticStore.KEY)render();if(event.key===THEME_KEY)applyTheme(readTheme());});
  if (window.AtleticAdminAuth) {
    window.AtleticAdminAuth.guard(async () => {
      await syncLibraryTaxonomy({ silent: true });
      render();
    });
  } else {
    syncLibraryTaxonomy({ silent: true }).finally(render);
  }
})();
