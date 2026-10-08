(() => {
  'use strict';

  const $ = selector => document.querySelector(selector);
  const money = value => (Number(value || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const read = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
  };
  const save = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch {}
  };
  const digits = value => String(value || '').replace(/\D/g, '');
  const CART_KEY = 'atletic.cart.v2';
  const COUPON_KEY = 'atletic.coupon.v2';
  const DRAFT_KEY = 'atletic.checkout.draft.v1';

  let selectedVariantId = '';
  let selectedQty = 1;
  let draft = read(DRAFT_KEY, {});

  const catalog = () => window.AtleticStore?.catalog?.() || [];
  const store = () => window.AtleticStore?.load?.() || { variants: [], coupons: [] };
  const cart = () => read(CART_KEY, {});

  function rawVariant(id) {
    return store().variants.find(item => item.id === id) || null;
  }

  function currentVariant(id = selectedVariantId) {
    return catalog().find(item => item.id === id) || null;
  }

  function productFamily(id) {
    const selected = currentVariant(id);
    if (!selected) return [];
    return catalog().filter(item => item.productId === selected.productId);
  }

  function flavorLabel(item) {
    const raw = rawVariant(item.id);
    return raw?.flavor || raw?.size || item.detail || item.sku || 'Padrão';
  }

  function stockLabel(item) {
    if (!item || item.stock <= 0) return 'Indisponível';
    if (item.stock <= Math.max(2, Number(item.minStock || 0))) return 'Últimas unidades';
    return 'Em estoque';
  }

  function ensureProductTools() {
    const info = $('.product-view-info');
    const stock = $('#productViewStock');
    const priceRow = $('.product-view-price-row');
    const add = $('#productViewAdd');
    if (!info || !stock || !priceRow || !add) return false;

    if (!$('#productViewVariants')) {
      stock.insertAdjacentHTML('afterend', `
        <section id="productViewVariants" class="pf-variant-block">
          <div class="pf-option-head">
            <strong>Escolha o sabor</strong>
            <small id="productViewFlavorStatus"></small>
          </div>
          <div id="productViewVariantOptions" class="pf-variant-options"></div>
        </section>
      `);
    }

    if (!$('#productQtyControl')) {
      const qty = document.createElement('div');
      qty.id = 'productQtyControl';
      qty.className = 'pf-qty';
      qty.setAttribute('aria-label', 'Quantidade');
      qty.innerHTML = `
        <button id="productQtyMinus" type="button" aria-label="Diminuir quantidade">−</button>
        <span id="productQtyValue">1</span>
        <button id="productQtyPlus" type="button" aria-label="Aumentar quantidade">+</button>
      `;
      priceRow.insertBefore(qty, add);
    }

    if (!$('#productBuyNow')) {
      const buy = document.createElement('button');
      buy.id = 'productBuyNow';
      buy.type = 'button';
      buy.className = 'button pf-buy-now';
      buy.innerHTML = 'Comprar agora <span>↗</span>';
      priceRow.insertAdjacentElement('afterend', buy);
    }

    add.classList.add('pf-add');
    add.textContent = 'Adicionar à sacola';
    return true;
  }

  function applyVariant(id) {
    const item = currentVariant(id);
    if (!item) return;

    selectedVariantId = item.id;
    selectedQty = 1;

    const add = $('#productViewAdd');
    if (add) {
      add.dataset.add = item.id;
      add.dataset.quantity = '1';
      add.disabled = item.stock <= 0;
    }

    const buy = $('#productBuyNow');
    if (buy) buy.disabled = item.stock <= 0;

    const detail = $('#productViewDetail');
    const stockEl = $('#productViewStock');
    const price = $('#productViewPrice');
    const compare = $('#productViewCompare');
    const sku = $('#productViewSku');
    const image = $('#productViewImage');

    if (detail) detail.textContent = item.detail || '';
    if (stockEl) {
      stockEl.textContent = stockLabel(item);
      stockEl.className = `product-view-stock ${item.stock <= 0 ? 'out' : 'in'}`;
    }
    if (price) price.textContent = item.price > 0 ? money(item.price) : 'Preço a definir';
    if (compare) compare.textContent = item.comparePrice > item.price && item.price > 0 ? money(item.comparePrice) : '';
    if (sku) sku.textContent = item.sku || '—';
    if (image && item.image) image.src = item.image;

    const raw = rawVariant(item.id);
    const status = $('#productViewFlavorStatus');
    if (status) status.textContent = [raw?.size, raw?.flavor].filter(Boolean).join(' · ') || item.detail || '';

    document.querySelectorAll('[data-pf-variant]').forEach(button => {
      const active = button.dataset.pfVariant === item.id;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });

    setQty(1);
  }

  function setQty(value) {
    const item = currentVariant();
    const max = Math.max(1, Math.min(99, Number(item?.stock || 1)));
    selectedQty = Math.max(1, Math.min(Number(value) || 1, max));

    const valueEl = $('#productQtyValue');
    const minus = $('#productQtyMinus');
    const plus = $('#productQtyPlus');
    const add = $('#productViewAdd');

    if (valueEl) valueEl.textContent = String(selectedQty);
    if (minus) minus.disabled = selectedQty <= 1;
    if (plus) plus.disabled = selectedQty >= max;
    if (add) add.dataset.quantity = String(selectedQty);
  }

  function refreshProductTools() {
    if (!ensureProductTools()) return;

    const add = $('#productViewAdd');
    const id = add?.dataset.add;
    if (!id) return;

    const family = productFamily(id);
    const panel = $('#productViewVariants');
    const options = $('#productViewVariantOptions');

    if (panel && options) {
      panel.hidden = family.length === 0;
      options.innerHTML = family.map(item => `
        <button type="button" class="pf-variant-option" d