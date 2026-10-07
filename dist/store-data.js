(() => {
  const KEY = 'atletic.store.demo.v2';
  const clone = value => JSON.parse(JSON.stringify(value));
  const uid = prefix => `${prefix}-${crypto.randomUUID()}`;
  const initial = {
    brands: [
      { id: 'brand-atletic', name: 'Atletic', active: true },
      { id: 'brand-demo', name: 'Marca demonstrativa', active: true }
    ],
    categories: [
      { id: 'cat-proteinas', name: 'Proteínas', slug: 'proteinas', active: true },
      { id: 'cat-creatinas', name: 'Creatinas', slug: 'creatinas', active: true },
      { id: 'cat-pre', name: 'Pré-treinos', slug: 'pre-treinos', active: true },
      { id: 'cat-vitaminas', name: 'Vitaminas', slug: 'vitaminas', active: true },
      { id: 'cat-acessorios', name: 'Acessórios', slug: 'acessorios', active: true }
    ],
    products: [
      { id: 'prod-whey', name: 'Whey Protein Concentrado', brandId: 'brand-atletic', categoryId: 'cat-proteinas', description: 'Produto demonstrativo para validação da plataforma.', active: true, featured: true, images: [] },
      { id: 'prod-creatina', name: 'Creatina Monohidratada', brandId: 'brand-atletic', categoryId: 'cat-creatinas', description: 'Produto demonstrativo para validação da plataforma.', active: true, featured: true, images: [] },
      { id: 'prod-pre', name: 'Pré-treino Energy', brandId: 'brand-demo', categoryId: 'cat-pre', description: 'Produto demonstrativo para validação da plataforma.', active: true, featured: false, images: [] }
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

  function normalize(data) {
    const base = clone(initial);
    if (!data || typeof data !== 'object') return base;
    for (const key of Object.keys(base)) if (Array.isArray(data[key])) base[key] = data[key];
    return base;
  }

  function load() {
    try { return normalize(JSON.parse(localStorage.getItem(KEY))); }
    catch { return clone(initial); }
  }

  function save(data) {
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
      return variants.map(variant => ({
        id: variant.id,
        productId: product.id,
        name: product.name,
        brand: brands[product.brandId]?.name || '',
        category: categories[product.categoryId]?.name || 'Outros',
        detail: [variant.size, variant.flavor].filter(Boolean).join(' · '),
        price: Number(variant.price || 0),
        comparePrice: Number(variant.comparePrice || 0),
        cost: Number(variant.cost || 0),
        minStock: Number(variant.minStock || 0),
        stock: stockBalance(data, variant.id),
        sku: variant.sku,
        image: product.images?.[0]?.url || '',
        images: product.images || [],
        featured: Boolean(product.featured)
      }));
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

  window.AtleticStore = { KEY, uid, load, save, reset, catalog, stockBalance, activeBanners, initial: clone(initial) };
})();
