(() => {
  const root=document.querySelector('.hero-carousel');if(!root)return;
  const escape=value=>String(value||'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const safeImage=value=>{if(!value)return'';try{const url=new URL(value,location.href);return url.protocol==='https:'||url.origin===location.origin?url.href:''}catch{return''}};
  const manualProductAssets=new Map([["93289184","/assets/products/01_100_Whey_Concentrate_840g_Evolve.png"],["353752094","/assets/products/02_Barra_de_proteina_Crisp_Bar_45g_Sabor_Ovomaltine_Integralmedica.png"],["149937717","/assets/products/03_Colageno_Tipo_II_60_capsulas_Evolve.png"],["229218979","/assets/products/04_Coqueteleira_Transparente_600ml_Integralmedica.png"],["93310863","/assets/products/05_Creatina_300g_Max_Titanium.png"],["93312928","/assets/products/06_Creatina_Hardcore_150g_Integralmedica.png"],["93313624","/assets/products/07_Creatina_Hardcore_300g_Integralmedica.png"],["203243364","/assets/products/08_Creatina_Monohidratada_300g_DUX_Nutrition.png"],["101602454","/assets/products/09_Creatina_Monohidratada_300g_Probiotica.png"],["343299218","/assets/products/10_CREATINA_SHARK_PRO_300G.png"],["129165198","/assets/products/11_Creatine_300g_Black_Skull.png"],["93290466","/assets/products/12_Iso_Whey_Collagen_840g_Evolve.png"],["298700361","/assets/products/13_L_GLUTAMINA_250g_EVOLVE.png"],["214409068","/assets/products/14_Multivitaminico_60_capsulas_Evolve.png"],["92796142","/assets/products/15_Omega_3_1000mg_60_capsulas_Evolve.png"],["231959625","/assets/products/16_Pre_Workout_150g_Evolve.png"],["92775690","/assets/products/17_Vitamina_C_60_capsulas_Evolve.png"],["92809684","/assets/products/18_Vitamina_D_60_capsulas_Evolve.png"],["129166224","/assets/products/19_Whey_100_HD_900g_Black_Skull.png"],["92601117","/assets/products/20_Whey_100_Pure_900g_Integralmedica.png"],["364056309","/assets/products/21_Whey_Grego_Bar_Havanna_Nutrata_Sabor_Doce_de_Leite_com_Morango.png"],["92616996","/assets/products/22_Whey_Protein_Concentrado_900g_DUX_Nutrition.png"],["92618811","/assets/products/23_Whey_Protein_Isolado_900g_DUX_Nutrition.png"]]);
  const resolveManualAsset=value=>{
    const raw=String(value||'');
    for(const [productId,path] of manualProductAssets){if(raw.includes(`/produto/${productId}/`))return path}
    return raw;
  };
  const heroImage=value=>{
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
  const whatsappUrl=(number,message)=>{const digits=String(number||'').replace(/\D/g,'');return /^[1-9]\d{9,14}$/.test(digits)?`https://wa.me/${digits}?text=${encodeURIComponent(message||'')}`:''};
  async function renderHeroProducts(){
    const heroArt=document.querySelector('.hero-art');
    if(!heroArt)return;

    const transparentCandidate=url=>/\.(png|webp)(?:\?|$)/i.test(String(url||''));

    const catalog=(window.AtleticStore?AtleticStore.catalog():[])
      .filter(product=>safeImage(product.image)&&transparentCandidate(product.image))
      .map(product=>({name:product.name,brand:product.brand||product.category||'Atletic',image:heroImage(product.image)}));

    const fallback=[
      {name:'Creatina (300g) - Max Titanium',brand:'Max Titanium',image:heroImage('https://cdn.awsli.com.br/800x800/1361/1361851/produto/93310863/3-nv15p3rp0o.png')},
      {name:'Creatina Monohidratada (300g) DUX Nutrition',brand:'DUX Nutrition',image:heroImage('https://cdn.awsli.com.br/800x800/1361/1361851/produto/203243364/111-86b80iu4d2.png')},
      {name:'Pre Workout (150g) Evolve',brand:'Evolve',image:heroImage('https://cdn.awsli.com.br/800x800/1361/1361851/produto/231959625/1-ojjc2l2hrt.png')}
    ];

    let configured=[];
    try{
      const response=await fetch('/api/site-visuals');
      const payload=await response.json().catch(()=>({}));
      if(response.ok&&Array.isArray(payload.visuals?.hero)){
        configured=payload.visuals.hero
          .filter(item=>safeImage(item?.image_url))
          .slice(0,3)
          .map(item=>({
            name:item.title||'Produto Atletic',
            brand:item.brand||item.category||'Atletic',
            image:(()=>{
              const safe=safeImage(item.image_url);
              if(!safe)return'';
              try{
                const url=new URL(safe,location.href);
                return url.hostname==='cdn.awsli.com.br'
                  ? `/api/product-cutout?url=${encodeURIComponent(url.href)}&mode=white-only&v=12`
                  : safe;
              }catch{return safe}
            })(),
            original:true
          }));
      }
    }catch{}

    const picked=[];
    const used=new Set();
    const source=configured.length===3?configured:[...catalog,...fallback];
    source.forEach(product=>{
      if(picked.length>=3)return;
      const key=String(product.image||'').toLowerCase();
      if(!key||used.has(key))return;
      used.add(key);
      picked.push(product);
    });

    heroArt.innerHTML=`
      <span class="outline-word">ATLETIC</span>
      <div class="orbit"></div>
      <div class="hero-product-stack">
        ${picked.map((product,index)=>`
          <a class="hero-real-product hero-real-product-${index+1}" href="#catalog" title="${escape(product.name)}">
            <span class="hero-real-product-image ${product.original?'original-selected':''}"><img src="${escape(product.image)}" alt="${escape(product.name)}" loading="${index===0?'eager':'lazy'}" decoding="async"></span>
            <span class="hero-real-product-meta"><b>${escape(product.brand)}</b><small>${escape(product.name)}</small></span>
          </a>
        `).join('')}
      </div>
      <span class="art-note">PRODUTOS REAIS DA ATLETIC</span>
      <div class="round-stamp">SEU FOCO.<br><b>SUA EVOLUÇÃO.</b>↗</div>
    `;

    heroArt.querySelectorAll('img').forEach(img=>img.addEventListener('error',()=>{
      const card=img.closest('.hero-real-product');
      if(card)card.remove();
    }));
  }

  renderHeroProducts();
  const banners=window.AtleticStore?AtleticStore.activeBanners():[];
  const extra=document.querySelector('#extraSlides');
  extra.innerHTML=banners.map((banner,index)=>{const partner=banner.type==='partner';const href=partner?whatsappUrl(banner.whatsapp,banner.message):(banner.href||'#catalog');const image=safeImage(banner.image),mobile=safeImage(banner.mobileImage);const visual=image?`<picture>${mobile?`<source media="(max-width:620px)" srcset="${escape(mobile)}">`:''}<img src="${escape(image)}" alt="${escape(banner.imageAlt||banner.title)}" loading="lazy"></picture>`:'<div class="banner-graphic" aria-hidden="true"><span>ATLETIC</span><b>↗</b><span>JUNTOS, ALÉM.</span></div>';return `<div class="hero-slide partner-slide ${banner.accent==='gold'?'gold-slide':''}" hidden inert role="group" aria-roledescription="slide" aria-label="${index+2}: ${escape(banner.eyebrow||banner.title)}"><div class="banner-copy"><p class="eyebrow">${escape(banner.eyebrow||'ATLETIC')}</p>${partner&&banner.partner?`<p class="partner-badge">${escape(banner.partner)}</p>`:''}<h2>${escape(banner.title).replace(/\n/g,'<br>')}</h2><p class="banner-description">${escape(banner.description)}</p>${href?`<a class="button" href="${escape(href)}" ${partner?'target="_blank" rel="noopener noreferrer"':''}>${escape(banner.button||'Saiba mais')} ↗</a>`:`<button class="button" disabled>${escape(banner.button||'Saiba mais')} ↗</button>`}</div><div class="banner-visual">${visual}</div></div>`}).join('');
  const slides=[...root.querySelectorAll('.hero-slide')];slides[0].setAttribute('aria-label',`1 de ${slides.length}: Atletic Suplementos`);
  const dots=document.querySelector('#slideDots');dots.innerHTML=slides.map((_,i)=>`<button aria-label="Ir para banner ${i+1}" data-slide="${i}" aria-current="${i===0?'true':'false'}"></button>`).join('');
  let current=0,timer,hovered=false,focused=false;const reduced=matchMedia('(prefers-reduced-motion: reduce)');let paused=reduced.matches;const pause=document.querySelector('#slidePause');
  function syncTimer(){clearInterval(timer);if(!paused&&!hovered&&!focused&&!document.hidden&&slides.length>1)timer=setInterval(()=>show(current+1,false),6500);pause.textContent=paused?'Reproduzir':'Pausar';pause.setAttribute('aria-label',paused?'Reproduzir troca automática':'Pausar troca automática')}
  function show(index,announce=true){current=(index+slides.length)%slides.length;slides.forEach((slide,i)=>{slide.hidden=i!==current;slide.inert=i!==current});[...dots.children].forEach((dot,i)=>dot.setAttribute('aria-current',String(i===current)));document.querySelector('#slideCounter').textContent=`${String(current+1).padStart(2,'0')} / ${String(slides.length).padStart(2,'0')}`;if(announce)document.querySelector('#slideStatus').textContent=slides[current].getAttribute('aria-label');syncTimer()}
  document.querySelector('#slidePrev').onclick=()=>show(current-1);document.querySelector('#slideNext').onclick=()=>show(current+1);dots.onclick=e=>{const b=e.target.closest('[data-slide]');if(b)show(Number(b.dataset.slide))};pause.onclick=()=>{paused=!paused;syncTimer()};
  root.addEventListener('mouseenter',()=>{hovered=true;syncTimer()});root.addEventListener('mouseleave',()=>{hovered=false;syncTimer()});root.addEventListener('focusin',()=>{focused=true;syncTimer()});root.addEventListener('focusout',e=>{focused=root.contains(e.relatedTarget);syncTimer()});root.addEventListener('keydown',e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();show(current+(e.key==='ArrowRight'?1:-1))}});document.addEventListener('visibilitychange',syncTimer);reduced.addEventListener('change',e=>{if(e.matches)paused=true;syncTimer()});
  let touch;root.addEventListener('touchstart',e=>{touch={x:e.changedTouches[0].clientX,y:e.changedTouches[0].clientY}},{passive:true});root.addEventListener('touchend',e=>{if(!touch)return;const dx=e.changedTouches[0].clientX-touch.x,dy=e.changedTouches[0].clientY-touch.y;if(Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy)*1.5)show(current+(dx<0?1:-1));touch=null},{passive:true});
  root.querySelectorAll('.banner-visual img').forEach(img=>img.addEventListener('error',()=>{img.closest('.banner-visual').textContent='ATLETIC'}));show(0,false);
  window.addEventListener('storage',event=>{if(event.key===AtleticStore.KEY)location.reload()});
})();
