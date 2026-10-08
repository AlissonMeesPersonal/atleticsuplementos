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
        <button type="button" class="pf-variant-option" data-pf-variant="${item.id}" aria-pressed="${item.id === id ? 'true' : 'false'}">
          ${flavorLabel(item)}
        </button>
      `).join('');
    }

    applyVariant(id);
  }

  function ensureCartShipping() {
    const bottom = $('.cart-bottom');
    if (!bottom || $('#shippingForm')) return;

    bottom.insertAdjacentHTML('afterbegin', `
      <form id="shippingForm" class="pf-shipping-form">
        <label for="shippingCep">Calcular entrega</label>
        <div class="coupon-row">
          <input id="shippingCep" inputmode="numeric" autocomplete="postal-code" placeholder="Digite seu CEP" maxlength="9">
          <button class="button" type="submit">Usar CEP</button>
        </div>
      </form>
      <p id="shippingMessage" class="pf-helper" aria-live="polite">Informe seu CEP para agilizar o checkout.</p>
    `);

    const input = $('#shippingCep');
    if (input) input.value = formatCep(draft.cep || '');

    $('#shippingForm').addEventListener('submit', async event => {
      event.preventDefault();
      const cep = formatCep(input.value);
      if (digits(cep).length !== 8) {
        $('#shippingMessage').textContent = 'Digite um CEP válido com 8 números.';
        return;
      }

      input.value = cep;
      draft.cep = cep;
      save(DRAFT_KEY, draft);
      $('#shippingMessage').textContent = 'CEP salvo. Buscando endereço…';

      const address = await lookupCep(cep);
      if (address) {
        Object.assign(draft, address, { cep });
        save(DRAFT_KEY, draft);
        $('#shippingMessage').textContent = `${address.street || 'Endereço'} · ${address.city}/${address.state}`;
      } else {
        $('#shippingMessage').textContent = 'CEP salvo. Você poderá completar o endereço no checkout.';
      }
    });

    input?.addEventListener('input', event => {
      event.target.value = formatCep(event.target.value);
    });
  }

  function formatCep(value) {
    const valueDigits = digits(value).slice(0, 8);
    return valueDigits.length > 5 ? `${valueDigits.slice(0, 5)}-${valueDigits.slice(5)}` : valueDigits;
  }

  function formatCpf(value) {
    const valueDigits = digits(value).slice(0, 11);
    return valueDigits
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1-$2');
  }

  function formatPhone(value) {
    const valueDigits = digits(value).slice(0, 11);
    if (valueDigits.length <= 10) {
      return valueDigits
        .replace(/^(\d{2})(\d)/, '($1) $2')
        .replace(/(\d{4})(\d)/, '$1-$2');
    }
    return valueDigits
      .replace(/^(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{5})(\d)/, '$1-$2');
  }

  async function lookupCep(value) {
    const cep = digits(value);
    if (cep.length !== 8) return null;

    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const payload = await response.json();
      if (!response.ok || payload.erro) return null;
      return {
        street: payload.logradouro || '',
        district: payload.bairro || '',
        city: payload.localidade || '',
        state: payload.uf || ''
      };
    } catch {
      return null;
    }
  }

  function totals() {
    const currentCart = cart();
    const items = Object.entries(currentCart).map(([id, qty]) => {
      const product = catalog().find(item => item.id === id);
      return product ? { product, qty: Number(qty || 0) } : null;
    }).filter(Boolean);

    const count = items.reduce((sum, item) => sum + item.qty, 0);
    const subtotal = items.reduce((sum, item) => sum + item.product.price * item.qty, 0);
    const couponCode = read(COUPON_KEY, null);
    const coupon = store().coupons.find(item => item.code === couponCode && item.active);
    let discount = 0;

    if (coupon && subtotal >= Number(coupon.minimum || 0)) {
      discount = coupon.kind === 'fixed'
        ? Math.min(Number(coupon.amount || 0), subtotal)
        : Math.round(subtotal * Number(coupon.amount || 0) / 100);
    }

    return { items, count, subtotal, discount, total: subtotal - discount };
  }

  function ensureCheckout() {
    if ($('#checkoutFlow')) return;

    document.body.insertAdjacentHTML('beforeend', `
      <dialog id="checkoutFlow" class="pf-checkout" aria-labelledby="checkoutTitle">
        <div class="pf-checkout-shell">
          <header class="pf-checkout-head">
            <div>
              <p class="eyebrow">CHECKOUT RÁPIDO</p>
              <h2 id="checkoutTitle">Finalize sua compra</h2>
            </div>
            <button id="checkoutClose" type="button" aria-label="Fechar checkout">×</button>
          </header>

          <div class="pf-progress" aria-label="Etapas do checkout">
            <span data-pf-progress="1" class="active"><b>1</b><small>E-mail</small></span>
            <i></i>
            <span data-pf-progress="2"><b>2</b><small>Dados</small></span>
            <i></i>
            <span data-pf-progress="3"><b>3</b><small>Entrega</small></span>
          </div>

          <section class="pf-step active" data-pf-step="1">
            <p class="pf-step-title">Qual é o seu e-mail?</p>
            <form id="pfEmailForm" class="pf-form">
              <label>E-mail
                <input id="pfEmail" data-pf-field="email" type="email" autocomplete="email" placeholder="seuemail@exemplo.com" required>
              </label>
              <button class="button" type="submit">Continuar <span>↗</span></button>
            </form>
          </section>

          <section class="pf-step" data-pf-step="2">
            <p class="pf-step-title">Seus dados</p>
            <form id="pfCustomerForm" class="pf-form">
              <label>Nome completo
                <input id="pfName" data-pf-field="name" autocomplete="name" placeholder="Nome e sobrenome" required>
              </label>
              <div class="pf-grid-two">
                <label>WhatsApp
                  <input id="pfPhone" data-pf-field="phone" inputmode="tel" autocomplete="tel" placeholder="(51) 99999-9999" required>
                </label>
                <label>CPF
                  <input id="pfCpf" data-pf-field="cpf" inputmode="numeric" placeholder="000.000.000-00" maxlength="14" required>
                </label>
              </div>
              <div class="pf-form-actions">
                <button type="button" class="pf-back" data-pf-back="1">Voltar</button>
                <button class="button" type="submit">Continuar <span>↗</span></button>
              </div>
            </form>
          </section>

          <section class="pf-step" data-pf-step="3">
            <p class="pf-step-title">Endereço de entrega</p>
            <form id="pfAddressForm" class="pf-form">
              <div class="pf-grid-two pf-grid-cep">
                <label>CEP
                  <input id="pfCep" data-pf-field="cep" inputmode="numeric" autocomplete="postal-code" placeholder="00000-000" maxlength="9" required>
                </label>
                <label>Número
                  <input id="pfNumber" data-pf-field="number" autocomplete="address-line2" placeholder="123" required>
                </label>
              </div>
              <label>Rua / Avenida
                <input id="pfStreet" data-pf-field="street" autocomplete="address-line1" placeholder="Nome da rua" required>
              </label>
              <div class="pf-grid-two">
                <label>Bairro
                  <input id="pfDistrict" data-pf-field="district" placeholder="Bairro" required>
                </label>
                <label>Cidade
                  <input id="pfCity" data-pf-field="city" autocomplete="address-level2" placeholder="Cidade" required>
                </label>
              </div>
              <div class="pf-grid-two">
                <label>Estado
                  <input id="pfState" data-pf-field="state" autocomplete="address-level1" placeholder="RS" maxlength="2" required>
                </label>
                <label>Complemento
                  <input id="pfComplement" data-pf-field="complement" placeholder="Apto, bloco...">
                </label>
              </div>
              <div class="pf-form-actions">
                <button type="button" class="pf-back" data-pf-back="2">Voltar</button>
                <button class="button" type="submit">Revisar pedido <span>↗</span></button>
              </div>
            </form>
          </section>

          <section class="pf-step pf-review" data-pf-step="4">
            <p class="pf-step-title">Resumo do pedido</p>
            <div id="pfReviewItems" class="pf-review-items"></div>
            <div class="pf-review-totals">
              <div><span>Subtotal</span><strong id="pfReviewSubtotal"></strong></div>
              <div><span>Desconto</span><strong id="pfReviewDiscount"></strong></div>
              <div class="grand"><span>Total dos produtos</span><strong id="pfReviewTotal"></strong></div>
            </div>
            <div class="pf-review-address">
              <small>Entrega para</small>
              <strong id="pfReviewAddress"></strong>
            </div>
            <p class="pf-payment-note">Frete definitivo e pagamento serão conectados na próxima etapa da plataforma.</p>
            <div class="pf-form-actions">
              <button type="button" class="pf-back" data-pf-back="3">Editar endereço</button>
              <button type="button" class="button" id="pfPaymentNext">Ir para pagamento <span>↗</span></button>
            </div>
            <p id="pfCheckoutMessage" class="pf-message" aria-live="polite"></p>
          </section>
        </div>
      </dialog>
    `);

    $('#checkoutClose').addEventListener('click', closeCheckout);
    $('#checkoutFlow').addEventListener('click', event => {
      if (event.target === $('#checkoutFlow')) closeCheckout();
    });

    document.querySelectorAll('[data-pf-back]').forEach(button => {
      button.addEventListener('click', () => showStep(Number(button.dataset.pfBack)));
    });

    document.querySelectorAll('[data-pf-field]').forEach(input => {
      input.addEventListener('input', () => {
        if (input.id === 'pfCep') input.value = formatCep(input.value);
        if (input.id === 'pfCpf') input.value = formatCpf(input.value);
        if (input.id === 'pfPhone') input.value = formatPhone(input.value);
        if (input.id === 'pfState') input.value = input.value.replace(/[^a-z]/gi, '').toUpperCase().slice(0, 2);
        draft[input.dataset.pfField] = input.value;
        save(DRAFT_KEY, draft);
      });
    });

    $('#pfCep').addEventListener('blur', async () => {
      const address = await lookupCep($('#pfCep').value);
      if (!address) return;
      for (const [key, value] of Object.entries(address)) {
        const input = document.querySelector(`[data-pf-field="${key}"]`);
        if (input && !input.value) input.value = value;
        draft[key] = input?.value || value;
      }
      save(DRAFT_KEY, draft);
    });

    $('#pfEmailForm').addEventListener('submit', event => {
      event.preventDefault();
      const input = $('#pfEmail');
      if (!input.checkValidity()) return input.reportValidity();
      draft.email = input.value.trim();
      save(DRAFT_KEY, draft);
      showStep(2);
    });

    $('#pfCustomerForm').addEventListener('submit', event => {
      event.preventDefault();
      const name = $('#pfName').value.trim();
      const phone = digits($('#pfPhone').value);
      const cpf = digits($('#pfCpf').value);

      if (name.length < 3) return $('#pfName').focus();
      if (phone.length < 10) return $('#pfPhone').focus();
      if (cpf.length !== 11) return $('#pfCpf').focus();

      Object.assign(draft, {
        name,
        phone: $('#pfPhone').value,
        cpf: $('#pfCpf').value
      });
      save(DRAFT_KEY, draft);
      showStep(3);
    });

    $('#pfAddressForm').addEventListener('submit', event => {
      event.preventDefault();
      const required = ['pfCep', 'pfNumber', 'pfStree