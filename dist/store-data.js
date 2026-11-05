(() => {
  const KEY = 'atletic.store.demo.v2';
  const clone = value => JSON.parse(JSON.stringify(value));
  const uid = prefix => `${prefix}-${crypto.randomUUID()}`;
  const initial = {
    brands: [
      { id: 'brand-atletic', name: 'DUX Nutrition', active: true },
      { id: 'brand-demo', name: 'Evolve', active: true }
    ],
    categories: [
      { id: 'cat-proteinas', name: 'Proteínas', slug: 'proteinas', active: true },
      { id: 'cat-creatinas', name: 'Creatinas', slug: 'creatinas', active: true },
      { id: 'cat-pre', name: 'Pré-treinos', slug: 'pre-treinos', active: true },
      { id: 'cat-vitaminas', name: 'Vitaminas', slug: 'vitaminas', active: true },
      { id: 'cat-acessorios', name: 'Acessórios', slug: 'acessorios', active: true }
    ],
    products: [
      { id: 'prod-whey', name: 'Whey Protein Concentrado', brandId: 'brand-atletic', categoryId: 'cat-proteinas', description: 'Produto demonstrativo para validação da plataforma.', active: true, featured: true, images: [{ url: '/assets/products/22_Whey_Protein_Concentrado_900g_DUX_Nutrition.png?v=20261008-1' }] },
      { id: 'prod-creatina', name: 'Creatina Monohidratada', brandId: 'brand-atletic', categoryId: 'cat-creatinas', description: 'Produto demonstrativo para validação da plataforma.', active: true, featured: true, images: [{ url: '/assets/products/08_Creatina_Monohidratada_300g_DUX_Nutrition.png?v=20261008-1' }] },
      { id: 'prod-pre', name: 'Pré-treino Energy', brandId: 'brand-demo', categoryId: 'cat-pre', description: 'Produto demonstrativo para validação da plataforma.', active: true, featured: false, images: [{ url: '/assets/products/16_Pre_Workout_150g_Evolve.png?v=20261008-1' }] }
    ],
    variants: [
      { id: 'var-whey-choc', productId: 'prod-whey', sku: 'ATL-WHEY-900-CHO', barcode: '', flavor: 'Chocolate', size: '900 g', price: 12990, comparePrice: 14990, cost: 7600, minStock: 5, active: true },
      { id: 'var-creatina-300', productId: 'prod-creatina', sku: 'ATL-CREA-300', barcode: '', flavor: 'Sem sabor', size: '300 g', price: 7990, comparePrice: 0, cost: 4100, minStock: 5, active: true },
      { id: 'var-pre-300', productId: 'prod-pre', sku: 'ATL-PRE-300-FV', barcode: '', flavor: 'Frutas vermelhas', size: '300 g', price: 9990, comparePrice: 0, cost: 5500, minStock: 4, active: true }
    ],
    stock: [
      { id: 'mov-1', variantId: 'var-whey-choc', lot: 'DEMO-WHEY-01', expires: '', delta: 18, reason: 'Estoque inicial demonstrativo', createdAt: new Date().toISOString() },
      { id: 'mov-2', variantId: 'var-creatina-300', lot: 'DEMO-CREA-01', expires: '', delta: 24, reason: 'Estoque inicial demonstrativo', createdAt: new Date().toISOString() }
    ],
    coupons: [
      { id: 'cup-atletic10', code: 'ATLETIC10', kind: 'percent', amount: 10, minimum: 0, startsAt: '', expiresAt: '', active: true }
    ],
    banners: [
      { id: 'banner-essenciais', type: 'campaign', eyebrow: 'ESCOLHAS QUE ACOMPANHAM VOCÊ', title: 'SUA ROTINA.\nSEUS ESSENCIAIS.', description: 'Explore proteínas, creatinas e acessórios para o seu dia a dia.', partner: '', button: 'Explorar o catálogo', href: '#catalog', whatsapp: '', message: '', image: '', mobileImage: '', imageAlt: '', active: true, startsAt: '', expiresAt: '', position: 1, accent: 'gold' },
      { id: 'banner-parceiro', type: 'partner', eyebrow: 'ESPAÇO PARA PARCEIROS', title: 'CONEXÕES QUE\nVÃO ALÉM\nDO TREINO.', description: 'Destaque parceiros e leve o visitante direto para o WhatsApp.', partner: 'Parceiro demonstrativo', button: 'Falar com o parceiro', href: '', whatsapp: '', message: 'Olá! Vi seu anúncio no site da Atletic Suplementos e gostaria de saber mais.', image: '', mobileImage: '', imageAlt: '', active: true, startsAt: '', expiresAt: '', position: 2, accent: 'dark' }
    ],
    customers: [],
    orders: []
  };

  const legacyProductImages = {
    'prod-whey': '/assets/products/22_Whey_Protein_Concentrado_900g_DUX_Nutrition.png?v=20261008-1',
    'prod-creatina': '/assets/products/08_Creatina_Monohidratada_300g_DUX_Nutrition.png?v=20261008-1',
    'prod-pre': '/assets/products/16_Pre_Workout_150g_Evolve.png?v=20261008-1'
  };

  function refreshLegacyDemo(data) {
    const productIds = new Set((data.products || []).map(item => item.id));
    const isLegacyDemo = ['prod-whey','prod-creatina','prod-pre'].every(id => productIds.has(id));
    if (!isLegacyDemo) return data;

    data.products = data.products.map(product => {
      const image = legacyProductImages[product.id];
      if (!image) return product;
      return { ...product, images: [{ url: image }] };
    });

    data.brands = data.brands.map(brand => {
      if (brand.id === 'brand-atletic' && (brand.name === 'Atletic' || !brand.name)) return { ...brand, name: 'DUX Nutrition' };
      if (brand.id === 'brand-demo' && (brand.name === 'Marca demonstrativa' || !brand.name)) return { ...brand, name: 'Evolve' };
      return brand;
    });

    return data;
  }

  function normalize(data) {
    const base = clone(initial);
    if (!data || typeof data !== 'object') return base;
    for (const key of Object.keys(base)) if (Array.isArray(data[key])) base[key] = data[key];
    return refreshLegacyDemo(base);
  }


  // Homologação Neon explicitamente ativada na URL; não modifica a loja normal.
  // A base PostgreSQL é a fonte de leitura: nunca usar dados demo como fallback silencioso.
  const neonPreview = new URLSearchParams(window.location.search).get('neonPreview') === '1';
  let neonSnapshot = null;
  let neonStatus = neonPreview ? 'loading' : 'off';
  function emptyNeon() {
    return Object.fromEntries(Object.keys(initial).map(key => [key, []]));
  }
  const cents = value => {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) : 0;
  };
  function convertNeonCatalog(payload) {
    if (!payload || payload.source !== 'neon_preview') throw new Error('invalid_neon_catalog');
    const data = emptyNeon();
    data.brands = (payload.brands || []).map(b => ({id:b.id,name:b.name,active:true}));
    data.categories = (payload.categories || []).map(c => ({id:c.id,name:c.name,slug:c.slug,active:true}));
    const imageMap = new Map();
    const variantImages = new Map();
    for (const im of payload.images || []) {
      const target = im.variant_id ? variantImages : imageMap;
      const id = im.variant_id || im.product_id;
      if (!target.has(id)) target.set(id, []);
      target.get(id).push({url:im.image_url,alt:im.alt_text || ''});
    }
    data.products = (payload.products || []).map(p => ({
      id:p.id,name:p.name,brandId:p.brand_id,categoryId:p.category_id,
      active:true,featured:Boolean(p.featured),description:p.short_description || '',
      images:imageMap.get(p.id) || [],
    }));
    data.variants = (payload.variants || []).map(v => {
      const attributes = v.attributes && typeof v.attributes === 'object' ? v.attributes : {};
      const normal = cents(v.price);
      const promo = cents(v.promotional_price);
      const hasPromo = promo > 0 && promo < normal;
      return {
        id:v.id,productId:v.product_id,sku:v.sku,active:true,
        flavor:String(attributes.flavor || attributes.sabor || v.name || ''),
        size:String(attributes.size || attributes.tamanho || (v.weight_g ? String(v.weight_g)+'g' : '')),
        price:hasPromo ? promo : normal,comparePrice:hasPromo ? normal : 0,
        cost:0,barcode:'',image:variantImages.get(v.id)?.[0]?.url || '',
      };
    });
    data.stock = (payload.inventory || []).map(i => ({
      id:'neon-inventory-'+i.variant_id,variantId:i.variant_id,
      delta:Math.max(0,Number(i.quantity_available || 0)),
      reason:'Disponível no Neon',createdAt:'',
    }));
    const minimumStock = new Map((payload.inventory || []).map(i => [i.variant_id, Number(i.minimum_stock || 0)]));
    for (const variant of data.variants) variant.minStock = minimumStock.get(variant.id) || 0;
    return data;
  }
  async function loadNeonCatalog() {
    if (!neonPreview) return;
    try {
      const response=await fetch('/api/admin-dashboard?neonApi=publicCatalog',{cache:'no-store'});
      if (!response.ok) throw new Error('neon_catalog_http_error');
      const payload=await response.json();
      neonSnapshot=convertNeonCatalog(payload);
      neonStatus='ready';
    } catch {
      neonSnapshot=emptyNeon();
      neonStatus='error';
    }
    window.dispatchEvent(new CustomEvent('atletic:store-changed',{detail:{source:'neon_preview',status:neonStatus}}));
  }

  function load() {
    if (neonPreview) return clone(neonSnapshot || emptyNeon());
    try {
      const normalized = normalize(JSON.parse(localStorage.getItem(KEY)));
      localStorage.setItem(KEY, JSON.stringify(normalized));
      return normalized;
    } catch {
      return clone(initial);
    }
  }

  function save(data) {
    if (neonPreview) throw new Error('Neon Preview é somente leitura nesta vitrine. Use o painel autenticado.');
    localStorage.setItem(KEY, JSON.stringify(normalize(data)));
    window.dispatchEvent(new CustomEvent('atletic:store-changed'));
  }

  function stockBalance(data, variantId) {
    return data.stock.filter(item => item.variantId === variantId).reduce((total, item) => total + Number(item.delta || 0), 0);
  }

  function catalog(data = load()) {
    const brands = Object.fromEntries(data.brands.map(x => [x.id, x]));
    const categories = Object.fromEntries(data.categories.map(x => [x.id, x]));
    return data.products.filter(p => p.active).flatMap(product => {
      const variants = data.variants.filter(v => v.productId === product.id && v.active);
      return variants.map(variant => {
        const mainImage = product.images?.[0]?.url || '';
        const selectedImage = variant.image || mainImage;
        const images = [];
        if (variant.image) images.push({ url: variant.image, alt: [product.name, variant.flavor].filter(Boolean).join(' - ') });
        for (const image of product.images || []) {
          const url = typeof image === 'string' ? image : image?.url;
          if (!url || images.some(item => item.url === url)) continue;
          images.push(typeof image === 'string' ? { url: image } : image);
        }
        return {
          id: variant.id,
          productId: product.id,
          name: product.name,
          brand: brands[product.brandId]?.name || '',
          category: categories[product.categoryId]?.name || 'Outros',
          detail: [variant.size, variant.flavor].filter(Boolean).join(' · '),
          flavor: variant.flavor || '',
          size: variant.size || '',
          price: Number(variant.price || 0),
          comparePrice: Number(variant.comparePrice || 0),
          cost: Number(variant.cost || 0),
          minStock: Number(variant.minStock || 0),
          stock: stockBalance(data, variant.id),
          sku: variant.sku,
          barcode: variant.barcode || '',
          image: selectedImage,
          images,
          featured: Boolean(product.featured)
        };
      });
    });
  }

  function activeBanners(data = load()) {
    const now = Date.now();
    return data.banners.filter(item => {
      if (!item.active) return false;
      if (item.startsAt && Date.parse(item.startsAt) > now) return false;
      if (item.expiresAt && Date.parse(item.expiresAt) <= now) return false;
      return true;
    }).sort((a, b) => Number(a.position || 0) - Number(b.position || 0));
  }

  function reset() { save(clone(initial)); }

  window.AtleticStore = { KEY, uid, load, save, reset, catalog, stockBalance, activeBanners,
    neonPreview, neonStatus: () => neonStatus, initial: clone(initial) };
  if (neonPreview) loadNeonCatalog();
})();
