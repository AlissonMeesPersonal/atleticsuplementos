(() => {
  const $=s=>document.querySelector(s);
  const money=v=>(Number(v||0)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const safeImage=value=>{if(!value)return'';try{const url=new URL(value,location.href);return url.protocol==='https:'||url.origin===location.origin?url.href:''}catch{return''}};
  const manualProductAssets=new Map([["93289184","/assets/products/01_100_Whey_Concentrate_840g_Evolve.png"],["353752094","/assets/products/02_Barra_de_proteina_Crisp_Bar_45g_Sabor_Ovomaltine_Integralmedica.png"],["149937717","/assets/products/03_Colageno_Tipo_II_60_capsulas_Evolve.png"],["229218979","/assets/products/04_Coqueteleira_Transparente_600ml_Integralmedica.png"],["93310863","/assets/products/05_Creatina_300g_Max_Titanium.png"],["93312928","/assets/products/06_Creatina_Hardcore_150g_Integralmedica.png"],["93313624","/assets/products/07_Creatina_Hardcore_300g_Integralmedica.png"],["203243364","/assets/products/08_Creatina_Monohidratada_300g_DUX_Nutrition.png"],["101602454","/assets/products/09_Creatina_Monohidratada_300g_Probiotica.png"],["343299218","/assets/products/10_CREATINA_SHARK_PRO_300G.png"],["129165198","/assets/products/11_Creatine_300g_Black_Skull.png"],["93290466","/assets/products/12_Iso_Whey_Collagen_840g_Evolve.png"],["298700361","/assets/products/13_L_GLUTAMINA_250g_EVOLVE.png"],["214409068","/assets/products/14_Multivitaminico_60_capsulas_Evolve.png"],["92796142","/assets/products/15_Omega_3_1000mg_60_capsulas_Evolve.png"],["231959625","/assets/products/16_Pre_Workout_150g_Evolve.png"],["92775690","/assets/products/17_Vitamina_C_60_capsulas_Evolve.png"],["92809684","/assets/products/18_Vitamina_D_60_capsulas_Evolve.png"],["129166224","/assets/products/19_Whey_100_HD_900g_Black_Skull.png"],["92601117","/assets/products/20_Whey_100_Pure_900g_Integralmedica.png"],["364056309","/assets/products/21_Whey_Grego_Bar_Havanna_Nutrata_Sabor_Doce_de_Leite_com_Morango.png"],["92616996","/assets/products/22_Whey_Protein_Concentrado_900g_DUX_Nutrition.png"],["92618811","/assets/products/23_Whey_Protein_Isolado_900g_DUX_Nutrition.png"]]);
  const resolveManualAsset=value=>{
    const raw=String(value||'');
    for(const [productId,path] of manualProductAssets){if(raw.includes(`/produto/${productId}/`))return path}
    return raw;
  };
  const transparentProductImage=value=>{
    const manual=resolveManualAsset(value);
    if(manual!==String(value||''))return manual;
    const safe=safeImage(value);
    if(!safe)return'';
    try{
      const url=new URL(safe,location.href);
      if(url.origin===location.origin)return url.pathname+url.search;
      return `/api/product-cutout?url=${encodeURIComponent(url.href)}&mode=white-only&v=13`;
    }catch{return safe}
  };
  const cutoutImage=transparentProductImage;
  const categoryFallbackImages = {
    'Proteínas': '/assets/products/20_Whey_100_Pure_900g_Integralmedica.png',
    'Creatinas': '/assets/products/05_Creatina_300g_Max_Titanium.png',
    'Pré-treinos': '/assets/products/16_Pre_Workout_150g_Evolve.png',
    'Vitaminas': '/assets/products/14_Multivitaminico_60_capsulas_Evolve.png',
    'Acessórios': '/assets/products/04_Coqueteleira_Transparente_600ml_Integralmedica.png'
  };

  const blockedCategoryImages = new Set([
    // bloqueie aqui imagens que ficaram feias nessa área
    'https://cdn.awsli.com.br/800x800/1361/1361851/produto/343299218/shark-divwyr75sy.png',
    'https://cdn.awsli.com.br/800x800/1361/1361851/produto/214409068/3-yeeorxhtyq.png?bad',
  ]);

  function isGoodCategoryImage(value = '') {
    const url = safeImage(value);
    if (!url) return false;
    if (blockedCategoryImages.has(url)) return false;
    return true;
  }

  function pickCategoryProduct(categoryName) {
    const candidates = products
      .filter(p => p.category === categoryName && safeImage(p.image))
      .filter(p => isGoodCategoryImage(p.image));

    if (!candidates.length) return null;

    const score = product => {
      const img = String(product.image || '');
      let points = 0;

      if (/\.(png|webp)(\?|$)/i.test(img)) points += 4;
      if (/max titanium|integralmedica|dux|evolve/i.test(product.name || '')) points += 2;
      if (/barra|capsulas/i.test(product.name || '')) points -= 1;

      return points;
    };

    return [...candidates].sort((a, b) => score(b) - score(a))[0];
  }
  function read(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}}
  function save(key,value){try{localStorage.setItem(key,JSON.stringify(value))}catch{}}

  let products=AtleticStore.catalog();
  let siteVisuals={hero:[],highlights:{}};
  let categories=['Todos',...new Set(products.map(p=>p.category))];
  let category='Todos';
  let stored=read('atletic.cart.v2',{}), cart={};
  for(const p of products){const qty=stored[p.id];if(Number.isInteger(qty)&&qty>0)cart[p.id]=Math.min(qty,99)}
  let activeCoupon=read('atletic.coupon.v2',null);
  let toastTimer;

  const THEME_KEY='atletic.theme';
  function readTheme(){
    try{
      const raw=localStorage.getItem(THEME_KEY);
      if(!raw)return 'dark';
      try{const parsed=JSON.parse(raw);if(parsed==='dark'||parsed==='light')return parsed}catch{}
      return raw==='light'?'light':'dark';
    }catch{return 'dark'}
  }
  function saveTheme(theme){try{localStorage.setItem(THEME_KEY,theme)}catch{}}
  function applyTheme(theme){
    const dark=theme!=='light';
    document.body.classList.toggle('dark',dark);
    document.documentElement.classList.toggle('theme-dark',dark);
    $('#theme').setAttribute('aria-label',dark?'Ativar modo claro':'Ativar modo escuro');
    $('#theme').setAttribute('aria-pressed',String(dark));
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',dark?'#121212':'#faf9f6');
  }
  applyTheme(readTheme());
  $('#theme').onclick=()=>{const next=document.body.classList.contains('dark')?'light':'dark';saveTheme(next);applyTheme(next)};

  const colors={'Proteínas':'#faa21a','Creatinas':'#e7e5d9','Pré-treinos':'#bfbdc9','Vitaminas':'#c4ce9e','Acessórios':'#a3aaa4'};
  function bottle(p){const size=(p.detail||'').split('·')[0].trim()||'ATLETIC'; const words=p.name.toUpperCase().split(' '); const label=(words.slice(0,2).join('<br>')||'ATLETIC'); return `<div class="bottle" style="--pack:${colors[p.category]||'#d7d1c3'}"><div class="lid"></div><div class="label"><small>ATLETIC</small><strong>${label}</strong><span>ILUSTRAÇÃO</span><b>${escape(size)}</b></div></div>`}
  function visual(p){return p.image?`<img src="${escape(transparentProductImage(p.image))}" alt="${escape(p.name)}" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:contain;padding:28px;background:transparent">`:`<div aria-hidden="true">${bottle(p)}</div>`}

  function renderCategories(){
    products=AtleticStore.catalog();
    const configured=['Proteínas','Creatinas','Pré-treinos','Vitaminas','Acessórios'];
    const available=[...new Set(products.map(p=>p.category).filter(Boolean))];
    const ordered=[...configured.filter(c=>available.includes(c)||categoryFallbackImages[c]),...available.filter(c=>!configured.includes(c))];
    categories=['Todos',...ordered];
    if(!categories.includes(category))category='Todos';

    const categoryVisual = categoryName => {
      const selected=siteVisuals.highlights?.[categoryName];
      const realProduct = pickCategoryProduct(categoryName);
      const source = selected?.image_url || realProduct?.image || categoryFallbackImages[categoryName] || '';

      if (!source) {
        return bottle(
          products.find(p => p.category === categoryName) ||
          products[0] ||
          { name: categoryName, category: categoryName, detail: '' }
        );
      }

      const displaySource=transparentProductImage(source);
      return `<img class="category-product-image ${selected?.image_url?'original-selected':''}" src="${escape(displaySource)}" alt="" loading="lazy" decoding="async">`;
    };

    $('#categories').innerHTML=categories.map((c,i)=>`<button class="cat" data-category="${escape(c)}"><div class="cat-image" aria-hidden="true">${i===0?'<span>↗</span>':categoryVisual(c)}</div>${c==='Todos'?'Ver tudo':escape(c)}</button>`).join('');
    $('#filters').innerHTML=categories.map(c=>`<button data-category="${escape(c)}" class="${c===category?'active':''}">${escape(c)}</button>`).join('');
  }

  function imageUrl(item){
    if(!item)return'';
    return typeof item==='string'?item:String(item.url||item.image_url||'');
  }

  function productImages(product){
    const urls=(product.images||[]).map(imageUrl).filter(Boolean);
    if(product.image&&!urls.includes(product.image))urls.unshift(product.image);
    return [...new Set(urls)];
  }

  function productDescription(product){
    const raw=AtleticStore.load().products.find(item=>item.id===product.productId);
    return String(raw?.description||'').trim();
  }

  function displayPrice(value){
    return Number(value||0)>0?money(value):'Preço a definir';
  }

  function stockLabel(product){
    if(product.stock<=0)return'Indisponível';
    if(product.stock<=Math.max(2,product.minStock||0))return'Últimas unidades';
    return'Em estoque';
  }

  function openProductView(id){
    const product=products.find(item=>item.id===id);
    if(!product)return;

    const images=productImages(product);
    const main=images[0]||'';
    const dialog=$('#productView');

    $('#productViewImage').src=main?transparentProductImage(main):'';
    $('#productViewImage').alt=product.name||'Produto';
    $('#productViewMeta').textContent=[product.brand,product.category].filter(Boolean).join(' · ');
    $('#productViewTitle').textContent=product.name||'Produto';
    $('#productViewDetail').textContent=product.detail||'';
    $('#productViewDescription').textContent=productDescription(product)||'Produto selecionado pela Atletic Suplementos.';
    $('#productViewStock').textContent=stockLabel(product);
    $('#productViewStock').className=`product-view-stock ${product.stock<=0?'out':'in'}`;
    $('#productViewPrice').textContent=displayPrice(product.price);
    $('#productViewCompare').textContent=product.comparePrice>product.price&&product.price>0?money(product.comparePrice):'';
    $('#productViewBrand').textContent=product.brand||'—';
    $('#productViewCategory').textContent=product.category||'—';
    $('#productViewSku').textContent=product.sku||'—';

    const add=$('#productViewAdd');
    add.dataset.add=product.id;
    add.disabled=product.stock<=0;
    add.innerHTML=product.stock<=0?'Indisponível':'Adicionar à sacola <span>+</span>';

    $('#productViewThumbs').innerHTML=images.length>1?images.map((url,index)=>`
      <button type="button" class="product-view-thumb ${index===0?'active':''}" data-view-image="${escape(url)}" aria-label="Ver imagem ${index+1}">
        <img src="${escape(transparentProductImage(url))}" alt="">
      </button>
    `).join(''):'';

    dialog.showModal();
    document.body.style.overflow='hidden';
  }

  function renderProducts(){
    const term=normalize($('#search').value.trim());
    let list=products.filter(p=>(category==='Todos'||p.category===category)&&normalize(`${p.name} ${p.detail} ${p.category} ${p.brand} ${p.sku}`).includes(term));
    const sort=$('#sort').value;
    if(sort==='asc')list.sort((a,b)=>a.price-b.price);
    if(sort==='desc')list.sort((a,b)=>b.price-a.price);
    if(sort==='featured')list.sort((a,b)=>Number(b.featured)-Number(a.featured));

    $('#resultCount').textContent=`${list.length} produtos`;
    $('#empty').hidden=!!list.length;

    $('#products').innerHTML=list.map(p=>`
      <article class="product-card">
        <button type="button" class="product-media" data-view="${escape(p.id)}" aria-label="Ver ${escape(p.name)} em detalhes">
          <div class="product-badges">
            ${p.featured?'<span class="product-badge featured">Destaque</span>':''}
            <span class="product-badge ${p.stock<=0?'soldout':'stock'}">${escape(stockLabel(p))}</span>
          </div>
          ${visual(p)}
          <span class="product-zoom">Ampliar ↗</span>
        </button>
        <div class="product-card-body">
          <div class="product-brand-row">
            <span>${escape(p.brand||p.category)}</span>
            <span>${escape(p.category)}</span>
          </div>
          <button type="button" class="product-title-button" data-view="${escape(p.id)}"><h3>${escape(p.name)}</h3></button>
          <p class="product-detail">${escape(p.detail||'')}</p>
          <div class="product-card-bottom">
            <div class="product-price-block">
              ${p.comparePrice>p.price&&p.price>0?`<small>${money(p.comparePrice)}</small>`:''}
              <strong>${displayPrice(p.price)}</strong>
            </div>
            <button class="add product-add" data-add="${escape(p.id)}" ${p.stock<=0?'disabled':''} aria-label="Adicionar ${escape(p.name)} à sacola">
              <span>Adicionar</span><b>+</b>
            </button>
          </div>
        </div>
      </article>
    `).join('');

    document.querySelectorAll('#filters button').forEach(b=>{
      b.classList.toggle('active',b.dataset.category===category);
      b.setAttribute('aria-pressed',String(b.dataset.category===category));
    });
  }

  function toast(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),2500)}
  function couponRecord(){if(!activeCoupon)return null;const now=Date.now();return AtleticStore.load().coupons.find(c=>c.active&&c.code===activeCoupon&&(!c.startsAt||Date.parse(c.startsAt)<=now)&&(!c.expiresAt||Date.parse(c.expiresAt)>now))||null}
  function cartProduct(id){return products.find(p=>p.id===id)}
  function renderCart(){
    products=AtleticStore.catalog();
    for(const id of Object.keys(cart)){const p=cartProduct(id);if(!p||p.stock<=0){delete cart[id];continue}cart[id]=Math.min(cart[id],Math.max(1,p.stock),99)}
    save('atletic.cart.v2',cart);save('atletic.coupon.v2',activeCoupon);
    const items=Object.keys(cart).map(cartProduct).filter(Boolean);const count=items.reduce((sum,p)=>sum+cart[p.id],0);const subtotal=items.reduce((sum,p)=>sum+p.price*cart[p.id],0);const coupon=couponRecord();let discount=0;
    if(coupon&&subtotal>=Number(coupon.minimum||0))discount=coupon.kind==='fixed'?Math.min(Number(coupon.amount),subtotal):Math.round(subtotal*Number(coupon.amount)/100);
    $('#count').textContent=count;
    $('#drawerCount').textContent=`(${count})`;
    if($('#mobileCount'))$('#mobileCount').textContent=count;
    if($('#floatingCartCount'))$('#floatingCartCount').textContent=count;
    if($('#floatingCartText'))$('#floatingCartText').textContent=`${count} ${count===1?'produto':'produtos'}`;
    const cartOpen=$('#cartOpen');
    if(cartOpen)cartOpen.setAttribute('aria-label',`Abrir sacola, ${count} ${count===1?'produto':'produtos'}`);
    const mobileCart=$('#mobileCart');
    if(mobileCart)mobileCart.setAttribute('aria-label',`Sacola, ${count} ${count===1?'produto':'produtos'}`);
    const floatingCart=$('#floatingCart');
    if(floatingCart){
      floatingCart.hidden=count===0;
      floatingCart.setAttribute('aria-label',`Abrir sacola, ${count} ${count===1?'produto':'produtos'}`);
      floatingCart.classList.remove('cart-pop');
      if(count>0)requestAnimationFrame(()=>floatingCart.classList.add('cart-pop'));
    }
    $('#cartItems').innerHTML=items.length?items.map(p=>`<div class="cart-line"><div class="mini" aria-hidden="true">${p.image?`<img src="${escape(transparentProductImage(p.image))}" alt="" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:contain;background:transparent">`:bottle(p)}</div><div><h3>${escape(p.name)}</h3><p>${escape(p.detail)}</p><div class="qty"><button data-qty="${p.id}" data-change="-1" aria-label="Diminuir ${escape(p.name)}">−</button><span>${cart[p.id]}</span><button data-qty="${p.id}" data-change="1" aria-label="Aumentar ${escape(p.name)}">+</button></div></div><div><strong>${money(p.price*cart[p.id])}</strong><br><button class="remove" data-remove="${p.id}">Remover</button></div></div>`).join(''):'<p class="empty-cart">Sua sacola está esperando suas escolhas.<br>Explore o catálogo e adicione seus essenciais.</p>';
    $('#subtotal').textContent=money(subtotal);$('#discount').textContent='− '+money(discount);$('#total').textContent=money(subtotal-discount);$('#checkout').disabled=!count;$('#removeCoupon').hidden=!coupon;
    $('#couponMessage').textContent=coupon?`${coupon.code} aplicado${subtotal<Number(coupon.minimum||0)?` — mínimo ${money(coupon.minimum)} ainda não atingido.`:'.'}`:'Digite um cupom válido cadastrado pela loja.';$('#checkoutMessage').textContent='';
  }

  const mainNav=$('#mainNav');
  const menuToggle=$('#menuToggle');
  const navClose=$('#navClose');
  const navBackdrop=$('#navBackdrop');

  function setMobileMenu(open){
    if(!mainNav||!menuToggle||!navBackdrop)return;
    mainNav.classList.toggle('open',open);
    navBackdrop.hidden=!open;
    document.body.classList.toggle('menu-open',open);
    menuToggle.setAttribute('aria-expanded',String(open));
    menuToggle.setAttribute('aria-label',open?'Fechar menu':'Abrir menu');
  }

  if(menuToggle)menuToggle.onclick=()=>setMobileMenu(!mainNav.classList.contains('open'));
  if(navClose)navClose.onclick=()=>setMobileMenu(false);
  if(navBackdrop)navBackdrop.onclick=()=>setMobileMenu(false);

  if($('#mobileSearch'))$('#mobileSearch').onclick=()=>{
    setMobileMenu(false);
    $('#searchForm').scrollIntoView({behavior:'smooth',block:'center'});
    setTimeout(()=>$('#search').focus(),280);
  };
  if($('#mobileCart'))$('#mobileCart').onclick=()=>$('#cartOpen').click();
  if($('#floatingCart'))$('#floatingCart').onclick=()=>$('#cartOpen').click();

  window.addEventListener('resize',()=>{
    if(window.innerWidth>700)setMobileMenu(false);
  });

  document.addEventListener('click',e=>{
    const c=e.target.closest('[data-category]');if(c){category=c.dataset.category;renderProducts();if(c.closest('#mainNav'))setMobileMenu(false);if(c.closest('#categories'))$('#catalog').scrollIntoView({behavior:'smooth'})}
    const view=e.target.closest('[data-view]');if(view){openProductView(view.dataset.view)}
    const thumb=e.target.closest('[data-view-image]');if(thumb){
      $('#productViewImage').src=transparentProductImage(thumb.dataset.viewImage);
      document.querySelectorAll('.product-view-thumb').forEach(item=>item.classList.toggle('active',item===thumb));
    }
    const a=e.target.closest('[data-add]');if(a&&!a.disabled){const p=cartProduct(a.dataset.add);if(!p||p.stock<=0)return;cart[p.id]=Math.min((cart[p.id]||0)+1,p.stock,99);renderCart();toast('Produto adicionado à sacola')}
    const q=e.target.closest('[data-qty]');if(q){const p=cartProduct(q.dataset.qty);if(!p)return;const next=Math.min((cart[p.id]||0)+Number(q.dataset.change),p.stock,99);if(next<=0)delete cart[p.id];else cart[p.id]=next;renderCart()}
    const r=e.target.closest('[data-remove]');if(r){delete cart[r.dataset.remove];renderCart()}
  });

  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&mainNav?.classList.contains('open'))setMobileMenu(false)});
  $('#search').addEventListener('input',renderProducts);$('#searchForm').onsubmit=e=>{e.preventDefault();$('#catalog').scrollIntoView({behavior:'smooth'})};$('#sort').onchange=renderProducts;
  $('#productViewClose').onclick=()=>$('#productView').close();
  $('#productView').addEventListener('close',()=>{document.body.style.overflow=''});
  $('#productView').addEventListener('click',e=>{if(e.target===$('#productView'))$('#productView').close()});
  $('#cartOpen').onclick=()=>{$('#cart').showModal();document.body.style.overflow='hidden'};function closeCart(){$('#cart').close()}$('#cartClose').onclick=closeCart;$('#cart').addEventListener('close',()=>{document.body.style.overflow='';$('#cartOpen').focus()});
  $('#couponForm').onsubmit=e=>{e.preventDefault();const code=$('#coupon').value.trim().toUpperCase();const found=AtleticStore.load().coupons.find(c=>c.code===code&&c.active);if(found){activeCoupon=found.code;renderCart()}else $('#couponMessage').textContent='Cupom não encontrado ou inativo.'};
  $('#removeCoupon').onclick=()=>{activeCoupon=null;renderCart()};
  $('#checkout').onclick=()=>{$('#checkoutMessage').textContent='Checkout ainda bloqueado. A próxima integração validará preço, frete, cupom, estoque e pagamento no servidor antes de criar o pedido.'};
  $('#year').textContent=new Date().getFullYear();

  async function loadSiteVisuals(){
    try{
      const response=await fetch('/api/site-visuals');
      const payload=await response.json().catch(()=>({}));
      if(response.ok&&payload.visuals){
        siteVisuals=payload.visuals;
        renderCategories();
      }
    }catch{}
  }

  renderCategories();renderProducts();renderCart();
  loadSiteVisuals();
  window.addEventListener('storage',event=>{if(event.key===AtleticStore.KEY){products=AtleticStore.catalog();renderCategories();renderProducts();renderCart()}if(event.key===THEME_KEY)applyTheme(readTheme())});
})();
