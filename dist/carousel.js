(function () {
  const root = document.querySelector('.hero-carousel');
  if (!root) return;
  const escape = value => String(value || '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  function safeImage(value) {
    if (!value) return '';
    try { const url = new URL(value, location.href); return url.protocol === 'https:' || url.origin === location.origin ? url.href : ''; } catch { return ''; }
  }
  function whatsappUrl(number, message) {
    const digits = String(number || '').replace(/\D/g, '');
    return /^[1-9]\d{9,14}$/.test(digits) ? `https://wa.me/${digits}?text=${encodeURIComponent(message || '')}` : '';
  }
  const banners = Array.isArray(window.ATLETIC_BANNERS) ? window.ATLETIC_BANNERS : [];
  document.querySelector('#extraSlides').innerHTML = banners.map((banner, index) => {
    const partner = banner.type === 'partner';
    const href = partner ? whatsappUrl(banner.whatsapp, banner.message) : '#catalog';
    const image = safeImage(banner.image), mobile = safeImage(banner.mobileImage);
    const visual = image ? `<picture>${mobile ? `<source media="(max-width:620px)" srcset="${escape(mobile)}">` : ''}<img src="${escape(image)}" alt="${escape(banner.imageAlt)}" loading="lazy"></picture>` : '<div class="banner-graphic" aria-hidden="true"><span>ATLETIC</span><b>↗</b><span>JUNTOS, ALÉM.</span></div>';
    return `<div class="hero-slide partner-slide ${banner.accent === 'gold' ? 'gold-slide' : ''}" hidden inert role="group" aria-roledescription="slide" aria-label="${index + 2} de ${banners.length + 1}: ${escape(banner.eyebrow)}"><div class="banner-copy"><p class="eyebrow">${escape(banner.eyebrow)}</p>${partner ? `<p class="partner-badge">${escape(banner.partner)}</p>` : ''}<h2>${escape(banner.title).replace(/\n/g,'<br>')}</h2><p class="banner-description">${escape(banner.description)}</p>${href ? `<a class="button" href="${escape(href)}" ${partner ? 'target="_blank" rel="noopener noreferrer"' : ''}>${escape(banner.button)} ↗</a>` : `<button class="button" disabled>${escape(banner.button)} ↗</button><p class="partner-pending">Banner demonstrativo · contato ainda não cadastrado.</p>`}</div><div class="banner-visual">${visual}</div></div>`;
  }).join('');
  const slides = [...root.querySelectorAll('.hero-slide')];
  slides[0].setAttribute('aria-label', `1 de ${slides.length}: Atletic Suplementos`);
  const dots = document.querySelector('#slideDots');
  dots.innerHTML = slides.map((_, i) => `<button aria-label="Ir para banner ${i + 1}" data-slide="${i}" aria-current="${i === 0 ? 'true' : 'false'}"></button>`).join('');
  let current = 0, timer, hovered = false, focused = false;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let paused = reduced.matches;
  const pause = document.querySelector('#slidePause');
  function syncTimer() {
    clearInterval(timer);
    if (!paused && !hovered && !focused && !document.hidden && slides.length > 1) timer = setInterval(() => show(current + 1, false), 6500);
    pause.textContent = paused ? 'Reproduzir' : 'Pausar';
    pause.setAttribute('aria-label', paused ? 'Reproduzir troca automática' : 'Pausar troca automática');
  }
  function show(index, announce = true) {
    current = (index + slides.length) % slides.length;
    slides.forEach((slide, i) => { slide.hidden = i !== current; slide.inert = i !== current; });
    [...dots.children].forEach((dot, i) => dot.setAttribute('aria-current', String(i === current)));
    document.querySelector('#slideCounter').textContent = `${String(current + 1).padStart(2,'0')} / ${String(slides.length).padStart(2,'0')}`;
    if (announce) document.querySelector('#slideStatus').textContent = slides[current].getAttribute('aria-label');
    syncTimer();
  }
  document.querySelector('#slidePrev').onclick = () => show(current - 1);
  document.querySelector('#slideNext').onclick = () => show(current + 1);
  dots.onclick = event => { const button = event.target.closest('[data-slide]'); if (button) show(Number(button.dataset.slide)); };
  pause.onclick = () => { paused = !paused; syncTimer(); };
  root.addEventListener('mouseenter', () => { hovered = true; syncTimer(); });
  root.addEventListener('mouseleave', () => { hovered = false; syncTimer(); });
  root.addEventListener('focusin', () => { focused = true; syncTimer(); });
  root.addEventListener('focusout', event => { focused = root.contains(event.relatedTarget); syncTimer(); });
  root.addEventListener('keydown', event => { if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); show(current + (event.key === 'ArrowRight' ? 1 : -1)); } });
  document.addEventListener('visibilitychange', syncTimer);
  reduced.addEventListener('change', event => { if (event.matches) paused = true; syncTimer(); });
  let touch;
  root.addEventListener('touchstart', event => { touch = { x:event.changedTouches[0].clientX,y:event.changedTouches[0].clientY }; }, {passive:true});
  root.addEventListener('touchend', event => { if (!touch) return;const dx=event.changedTouches[0].clientX-touch.x,dy=event.changedTouches[0].clientY-touch.y;if(Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy)*1.5)show(current+(dx<0?1:-1));touch=null; }, {passive:true});
  root.querySelectorAll('.banner-visual img').forEach(img=>img.addEventListener('error',()=>{img.closest('.banner-visual').textContent='ATLETIC';}));
  show(0, false);
})();
