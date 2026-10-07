(() => {
  const $=s=>document.querySelector(s);
  const money=v=>(Number(v||0)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  function read(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}}
  function save(key,value){try{localStorage.setItem(key,JSON.stringify(value))}catch{}}

  let products=AtleticStore.catalog();
  let categories=['Todos',...new Set(products.map(p=>p.category))];
  let category='Todos';
  let stored=read('atletic.cart.v2',{}), cart={};
  for(const p of products){const qty=stored[p.id];if(Number.isInteger(qty)&&qty>0)cart[p.id]=Math.min(qty,99)}
  let activeCoupon=read('atletic.coupon.v2',null);
  let toastTimer;

  const preferred=read('atletic.theme',null);
  document.body.classList.toggle('dark',preferred==='dark'||(!preferred&&matchMedia('(prefers-color-scheme: dark)').matches));
  function updateTheme(){const dark=document.body.classList.contains('dark');$('#theme').setAttribute('aria-label',dark?'Ativar modo claro':'Ativar modo escuro');$('#theme').setAttribute('aria-pressed',String(dark))}updateTheme();
  $('#theme').onclick=()=>{document.body.classList.toggle('dark');save('atletic.theme',document.body.classList.contains('dark')?'dark':'light');updateTheme()};

  const colors={'Proteínas':'#faa21a','Creatinas':'#e7e5d9','Pré-treinos':'#bfbdc9','Vitaminas':'#c4ce9e','Acessórios':'#a3aaa4'};
  function bottle(p){const size=(p.detail||'').split('·')[0].trim()||'ATLETIC'; const words=p.name.toUpperCase().split(' '); const label=(words.slice(0,2).join('<br>')||'ATLETIC'); return `<div class="bottle" style="--pack:${colors[p.category]||'#d7d1c3'}"><div class="lid"></div><div class="label"><small>ATLETIC</small><strong>${label}</strong><span>ILUSTRAÇÃO</span><b>${escape(size)}</b></div></div>`}
  function visual(p){return p.image?`<img src="${escape(p.image)}" alt="${escape(p.name)}" loading="lazy" style="width:100%;height:100%;object-fit:contain;padding:28px;background:#fff">`:`<div aria-hidden="true">${bottle(p)}</div>`}

  function renderCategories(){
    products=AtleticStore.catalog(); categories=['Todos',...new Set(products.map(p=>p.category))]; if(!categories.includes(category))category='Todos';
    $('#categories').innerHTML=categories.map((c,i)=>`<button class="cat" data-category="${escape(c)}"><div class="cat-image" aria-hidden="true">${i===0?'<span>↗</span>':bottle(products.find(p=>p.category===c)||products[0]||{name:c,category:c,detail:''})}</div>${c==='Todos'?'Ver tudo':escape(c)}</button>`).join('');
    $('#filters').innerHTML=categories.map(c=>`<button data-category="${escape(c)}" class="${c===category?'active':''}">${escape(c)}</button>`).join('');
  }

  function renderProducts(){
    const term=normalize($('#search').value.trim()); let list=products.filter(p=>(category==='Todos'||p.category===category)&&normalize(`${p.name} ${p.detail} ${p.category} ${p.brand} ${p.sku}`).includes(term));
    const sort=$('#sort').value; if(sort==='asc')list.sort((a,b)=>a.price-b.price);if(sort==='desc')list.sort((a,b)=>b.price-a.price);if(sort==='featured')list.sort((a,b)=>Number(b.featured)-Number(a.featured));
    $('#resultCount').textContent=`${list.length} produtos`;$('#empty').hidden=!!list.length;
    $('#products').innerHTML=list.map(p=>`<article class="product"><div class="product-art"><span class="tag">${p.stock<=0?'Indisponível':p.featured?'Em destaque':escape(p.brand||p.category)}</span>${visual(p)}</div><p class="type">${escape(p.category)}</p><h3>${escape(p.name)}</h3><p class="detail">${escape(p.detail)}</p><div class="buy-row"><div>${p.comparePrice>p.price?`<small style="display:block;text-decoration:line-through;color:var(--muted)">${money(p.comparePrice)}</small>`:''}<span class="price">${money(p.price)}</span></div><button class="add" data-add="${escape(p.id)}" ${p.stock<=0?'disabled':''} aria-label="Adicionar ${escape(p.name)} ${escape(p.detail)} ao carrinho">+</button></div></article>`).join('');
    document.querySelectorAll('#filters button').forEach(b=>{b.classList.toggle('active',b.dataset.category===category);b.setAttribute('aria-pressed',String(b.dataset.category===category))});
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
    $('#count').textContent=count;$('#drawerCount').textContent=`(${count})`;
    $('#cartItems').innerHTML=items.length?items.map(p=>`<div class="cart-line"><div class="mini" aria-hidden="true">${p.image?`<img src="${escape(p.image)}" alt="" style="width:100%;height:100%;object-fit:contain;background:#fff">`:bottle(p)}</div><div><h3>${escape(p.name)}</h3><p>${escape(p.detail)}</p><div class="qty"><button data-qty="${p.id}" data-change="-1" aria-label="Diminuir ${escape(p.name)}">−</button><span>${cart[p.id]}</span><button data-qty="${p.id}" data-change="1" aria-label="Aumentar ${escape(p.name)}">+</button></div></div><div><strong>${money(p.price*cart[p.id])}</strong><br><button class="remove" data-remove="${p.id}">Remover</button></div></div>`).join(''):'<p class="empty-cart">Sua sacola está esperando suas escolhas.<br>Explore o catálogo e adicione seus essenciais.</p>';
    $('#subtotal').textContent=money(subtotal);$('#discount').textContent='− '+money(discount);$('#total').textContent=money(subtotal-discount);$('#checkout').disabled=!count;$('#removeCoupon').hidden=!coupon;
    $('#couponMessage').textContent=coupon?`${coupon.code} aplicado${subtotal<Number(coupon.minimum||0)?` — mínimo ${money(coupon.minimum)} ainda não atingido.`:'.'}`:'Digite um cupom válido cadastrado pela loja.';$('#checkoutMessage').textContent='';
  }

  document.addEventListener('click',e=>{
    const c=e.target.closest('[data-category]');if(c){category=c.dataset.category;renderProducts();if(c.closest('#categories'))$('#catalog').scrollIntoView({behavior:'smooth'})}
    const a=e.target.closest('[data-add]');if(a&&!a.disabled){const p=cartProduct(a.dataset.add);if(!p||p.stock<=0)return;cart[p.id]=Math.min((cart[p.id]||0)+1,p.stock,99);renderCart();toast('Produto adicionado à sacola')}
    const q=e.target.closest('[data-qty]');if(q){const p=cartProduct(q.dataset.qty);if(!p)return;const next=Math.min((cart[p.id]||0)+Number(q.dataset.change),p.stock,99);if(next<=0)delete cart[p.id];else cart[p.id]=next;renderCart()}
    const r=e.target.closest('[data-remove]');if(r){delete cart[r.dataset.remove];renderCart()}
  });

  $('#search').addEventListener('input',renderProducts);$('#searchForm').onsubmit=e=>{e.preventDefault();$('#catalog').scrollIntoView({behavior:'smooth'})};$('#sort').onchange=renderProducts;
  $('#cartOpen').onclick=()=>{$('#cart').showModal();document.body.style.overflow='hidden'};function closeCart(){$('#cart').close()}$('#cartClose').onclick=closeCart;$('#cart').addEventListener('close',()=>{document.body.style.overflow='';$('#cartOpen').focus()});
  $('#couponForm').onsubmit=e=>{e.preventDefault();const code=$('#coupon').value.trim().toUpperCase();const found=AtleticStore.load().coupons.find(c=>c.code===code&&c.active);if(found){activeCoupon=found.code;renderCart()}else $('#couponMessage').textContent='Cupom não encontrado ou inativo.'};
  $('#removeCoupon').onclick=()=>{activeCoupon=null;renderCart()};
  $('#checkout').onclick=()=>{$('#checkoutMessage').textContent='Checkout ainda bloqueado. A próxima integração validará preço, frete, cupom, estoque e pagamento no servidor antes de criar o pedido.'};
  $('#year').textContent=new Date().getFullYear();
  renderCategories();renderProducts();renderCart();
  window.addEventListener('storage',event=>{if(event.key===AtleticStore.KEY){products=AtleticStore.catalog();renderCategories();renderProducts();renderCart()}});
})();
