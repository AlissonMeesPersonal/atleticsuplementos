import { createAuthClient } from '@neondatabase/auth';

const auth = createAuthClient(__ATLETIC_NEON_AUTH_BASE_URL__, {fetchOptions:{credentials:'include'}});
const $ = id => document.getElementById(id);
const esc = s => String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const fmt = n => Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
let state={products:[],variants:[],brands:[],categories:[],inventory:[],orders:[]};
function status(message,bad=false){$('notice').textContent=message;$('notice').dataset.bad=bad?'1':'0';}
async function token(){
  const r=await auth.token();
  if(r?.error||!r?.data?.token)throw Error('session_unavailable');
  return r.data.token;
}
async function api(op, method='GET',body) {
  const bearer=await token();
  const response=await fetch('/api/admin-dashboard?neonApi='+encodeURIComponent(op),{
    method,cache:'no-store',
    headers:{Authorization:'Bearer '+bearer,...(method==='POST'?{'Content-Type':'application/json'}:{})},
    ...(method==='POST'?{body:JSON.stringify(body||{})}:{})
  });
  const data=await response.json().catch(()=>({error:'invalid_response'}));
  if(!response.ok)throw Error(data.error||('http_'+response.status));
  return data;
}
async function authenticate(){
  try{
    const bearer=await token();
    const res=await fetch('/api/admin-dashboard?neonAuthCheck=1',{
      headers:{Authorization:'Bearer '+bearer},cache:'no-store'});
    const data=await res.json().catch(()=>({}));
    if(!res.ok||!data.authorized)throw Error('not_authorized');
    $('loginPane').hidden=true;$('adminPane').hidden=false;
    $('adminName').textContent=data.profile?.name||'Administrador';
    status('Sessão Neon verificada. Ambiente de homologação: alterações são gravadas somente no banco de migração.');
    await refresh();
  }catch{
    $('loginPane').hidden=false;$('adminPane').hidden=true;
    status('Faça login com sua senha Neon. Se o acesso falhar, confira a sessão na página de teste.',true);
  }
}
async function refresh(){
  try{
    const [catalog,inventory,orders,summary]=await Promise.all([
      api('adminCatalog'),api('adminInventory'),api('adminOrders'),api('adminSummary')
    ]);
    state={...catalog,inventory:inventory.inventory||[],orders:orders.orders||[]};
    $('summary').innerHTML=Object.entries(summary.counts||{}).map(([label,n])=>
      '<div class="metric"><strong>'+esc(n)+'</strong><span>'+esc(label)+'</span></div>').join('');
    const categoryOpts='<option value="">Sem categoria</option>'+(state.categories||[])
      .map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+'</option>').join('');
    const brandOpts='<option value="">Sem marca</option>'+(state.brands||[])
      .map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+'</option>').join('');
    $('productCategory').innerHTML=categoryOpts;
    $('productBrand').innerHTML=brandOpts;
    const allVariants=(state.variants||[]).map(v=>({
      ...v,
      name:(state.products||[]).find(p=>p.id===v.product_id)?.name||v.sku,
      available:Number((state.inventory||[]).find(x=>x.variant_id===v.id)?.quantity_available||0),
      active:(state.products||[]).find(p=>p.id===v.product_id)?.status==='active'
    }));
    $('inventoryVariant').innerHTML=allVariants.map(v=>
      '<option value="'+esc(v.id)+'">'+esc(v.name)+' · '+esc(v.sku)+' · '+v.available+' disponíveis</option>').join('');
    $('orderVariant').innerHTML=allVariants.filter(v=>v.active).map(v=>
      '<option value="'+esc(v.id)+'">'+esc(v.name)+' · '+esc(v.sku)+' · '+fmt(v.price)+' · '+v.available+' disponíveis</option>').join('');
    const brandNames=new Map((state.brands||[]).map(x=>[x.id,x.name]));
    const categories=new Map((state.categories||[]).map(x=>[x.id,x.name]));
    $('productsRows').innerHTML=state.products.length ? state.products.map(p=>{
      const vars=allVariants.filter(v=>v.product_id===p.id);
      const detail=vars.map(v=>esc(v.sku)+' '+fmt(v.price)).join(', ')||'Sem variações';
      const next=p.status==='active'?'draft':'active';
      return '<tr><td><strong>'+esc(p.name)+'</strong><small>'+esc(categories.get(p.category_id)||'Sem categoria')+' / '+esc(brandNames.get(p.brand_id)||'Sem marca')+'</small></td><td>'+detail+'</td><td>'+esc(p.status)+'</td><td><button type="button" class="small" data-product="'+esc(p.id)+'" data-state="'+next+'">'+(next==='active'?'Publicar':'Retirar')+'</button></td></tr>';
    }).join('') : '<tr><td colspan="4">Nenhum produto persistido no Neon. O catálogo demonstrativo local não foi importado.</td></tr>';
    $('inventoryRows').innerHTML=state.inventory.length?state.inventory.map(x=>
      '<tr><td>'+esc(x.product_name)+'<small>'+esc(x.sku)+'</small></td><td>'+esc(x.quantity_on_hand)+'</td><td>'+esc(x.quantity_reserved)+'</td><td><strong>'+esc(x.quantity_available)+'</strong></td></tr>').join(''):'<tr><td colspan="4">Nenhum estoque real cadastrado no Neon.</td></tr>';
    $('ordersRows').innerHTML=state.orders.length?state.orders.map(o=>
      '<tr><td>'+esc(o.order_number)+'</td><td>'+esc(o.status)+'<small>'+esc(o.payment_status)+'</small></td><td>'+fmt(o.total)+'</td><td><button type="button" class="small" data-cancel="'+esc(o.id)+'">Cancelar rascunho</button></td></tr>').join(''):'<tr><td colspan="4">Ainda não há pedidos no banco Neon.</td></tr>';
    status('Dados atualizados diretamente do banco Neon. Nenhum dado da produção Supabase foi alterado.');
  }catch(error){status('Falha ao consultar Neon: '+error.message,true);}
}
async function execute(action,values){
  status('Validando e gravando '+action+' no Neon...');
  try{const r=await api(action,'POST',values);status(action+' executado no Neon. ID: '+String(r.result?.id||r.result?.product?.id||r.result?.order?.id||'ok').slice(0,60));await refresh();return r;}
  catch(error){status('Operação não concluída: '+error.message,true);throw error;}
}
$('loginForm').addEventListener('submit',async event=>{
  event.preventDefault();
  const b=event.currentTarget.querySelector('button');b.disabled=true;
  const form=new FormData(event.currentTarget);
  try{
    const result=await auth.signIn.email({email:String(form.get('email')||'').trim(),password:String(form.get('password')||'')});
    if(result?.error)throw Error(result.error.code||'invalid_credentials');
    await authenticate();
  }catch(error){status('Login não validado ('+error.message+'). Use o teste Neon anterior para conferir a senha e a sessão.',true);}
  finally{b.disabled=false;event.currentTarget.elements.namedItem('password').value='';}
});
$('logout').addEventListener('click',async()=>{await auth.signOut();$('adminPane').hidden=true;$('loginPane').hidden=false;status('Sessão Neon encerrada.');});
$('reload').addEventListener('click',()=>refresh());
$('brandForm').addEventListener('submit',async event=>{
  event.preventDefault();const data=new FormData(event.currentTarget);
  try{await execute('createBrand',{name:data.get('name')});event.currentTarget.reset();}catch{}
});
$('categoryForm').addEventListener('submit',async event=>{
  event.preventDefault();const data=new FormData(event.currentTarget);
  try{await execute('createCategory',{name:data.get('name')});event.currentTarget.reset();}catch{}
});
$('productForm').addEventListener('submit',async event=>{
  event.preventDefault();const data=new FormData(event.currentTarget);
  try{await execute('createProduct',{name:data.get('name'),sku:data.get('sku'),price:data.get('price'),brandId:data.get('brandId'),categoryId:data.get('categoryId')});event.currentTarget.reset();}catch{}
});
$('stockForm').addEventListener('submit',async event=>{
  event.preventDefault();const data=new FormData(event.currentTarget);
  try{await execute('adjustStock',{variantId:data.get('variantId'),delta:Number(data.get('delta')),reason:'Ajuste realizado no painel Neon de homologação'});event.currentTarget.elements.namedItem('delta').value='';}catch{}
});
$('orderForm').addEventListener('submit',async event=>{
  event.preventDefault();const data=new FormData(event.currentTarget);
  try{const res=await execute('draftOrder',{items:[{variantId:data.get('variantId'),quantity:Number(data.get('quantity'))}]});const n=res.result?.order?.order_number||'pedido';status('Rascunho '+n+' criado: reserva de estoque confirmada. Nenhum pagamento realizado.');}catch{}
});
$('productsRows').addEventListener('click',async event=>{
  const b=event.target.closest('[data-product]');if(!b)return;
  b.disabled=true;
  try{await execute('setProductStatus',{productId:b.dataset.product,status:b.dataset.state});}catch{b.disabled=false;}
});
$('ordersRows').addEventListener('click',async event=>{
  const b=event.target.closest('[data-cancel]');if(!b)return;
  if(!confirm('Cancelar apenas um rascunho de homologação e liberar sua reserva de estoque?'))return;
  b.disabled=true;
  try{await execute('cancelDraftOrder',{orderId:b.dataset.cancel});}catch{b.disabled=false;}
});
authenticate().catch(()=>status('Não foi possível verificar a sessão Neon.',true));
