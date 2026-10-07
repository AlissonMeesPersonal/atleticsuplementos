(() => {
  const root=document.querySelector('.hero-carousel');if(!root)return;
  const escape=value=>String(value||'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const safeImage=value=>{if(!value)return'';try{const url=new URL(value,location.href);return url.protocol==='https:'||url.origin===location.origin?url.href:''}catch{return''}};
  const whatsappUrl=(number,message)=>{const digits=String(number||'').replace(/\D/g,'');return /^[1-9]\d{9,14}$/.test(digits)?`https://wa.me/${digits}?text=${encodeURIComponent(message||'')}`:''};
  function renderHeroProducts(){
    const heroArt=document.querySelector('.hero-art');
    if(!heroArt)return;

    const catalog=(window.AtleticStore?AtleticStore.catalog():[])
      .filter(product=>safeImage(product.image))
      .map(product=>({name:product.name,brand:product.brand||product.category||'Atletic',image:safeImage(product.image)}));

    const fallback=[
      {name:'Creatina (300g) - Max Titanium',brand:'Max Titanium',image:'https://cdn.awsli.com.br/800x800/1361/1361851/produto/93310863/3-nv15p3rp0o.png'},
      {name:'Whey Protein Concentrado (900g) DUX Nutrition',brand:'DUX Nutrition',image:'https://cdn.awsli.com.br/800x800/1361/1361851/produto/92616996/dux-novo-ks7qr9zwhy.jpg'},
      {name:'Pre Workout (150g) Evolve',brand:'Evolve',image:'https://cdn.awsli.com.br/800x800/1361/1361851/produto/231959625/1-ojjc2l2hrt.png'}
    ];

    const picked=[];
    const used=new Set();
    [...catalog,...fallback].forEach(product=>{
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
            <span class="hero-real-product-image"><img src="${escape(product.image)}" alt="${escape(product.name)}" loading="${index===0?'eager':'lazy'}"></span>
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
