# Atletic Suplementos — migração Supabase → Neon
## Estado verificado em 05/11/2026

**Produção permanece no Supabase. Não apagar o projeto `swilmjgpivwynosvuuqm`.**

### Dados e arquitetura
- Supabase e Neon contêm 26 tabelas e a cópia inicial conferida possui 99 registros nas mesmas tabelas (a comparação do conteúdo deve ser repetida antes do corte).
- **products, product_variants, inventory, customers, orders e brands estão vazios nos dois bancos.** Não confundir a cópia de 99 registros com inventário comercial migrado.
- O código antigo `dist/store-data.js` lê e grava `localStorage['atletic.store.demo.v2']`: esse estado é **por navegador e por origem**, não está no Supabase e não é visível automaticamente pelo Preview Vercel. Pode conter cadastros, estoque local, cupons e pedidos. É obrigatório avaliar/exportar de cada navegador operacional antes da migração.
- O login Neon do administrador foi validado pelo proprietário e a API confirma papel admin, identidade mapeada e e-mail verificado. Outro usuário precisa concluir ativação.
- Políticas RLS: 34 instaladas, mas não foram concedidos privilégios gerais `SELECT`/`INSERT`/etc. para papéis públicos. Endpoints de homologação usam conexão de servidor e verificação de token + papel de administrador; **não considerar RLS da conexão de proprietário como barreira de acesso**.
- Coluna `inventory.quantity_available` é calculada por trigger e CHECK no Neon. O schema ainda não é idêntico a `GENERATED ALWAYS` da origem.
- Vercel Hobby tem limite de 12 funções; novas rotas de teste são consolidadas em `api/admin-dashboard.js`.

### Recursos concluídos apenas no Preview
- `/admin` e `/neon-gestao`: painel autenticado Neon com marca, categoria, produto, ajuste de estoque, ativação de produto e pedidos rascunho (sem pagamento). **Cadastros realizados no painel são persistentes no banco Neon e deverão ser revisados antes da produção.**
- `/neon-admin-test`: teste de JWT/perfil, resumos e smoke test de cadastro→estoque→pedido com `ROLLBACK`.
- `/?neonPreview=1`: vitrine lê catálogo real do Neon e não usa os dados demonstrativos do navegador como fallback.
- `POST /api/admin-dashboard?neonApi=publicQuote`: confere preços no servidor, estoque disponível e valor em centavos. Não cria pedidos, não cobra, não integra frete nem cupons. Pagamento real permanece bloqueado.
- Teste transacional direto no PostgreSQL passou para marca, categoria, produto, variação, estoque (12−4=8; 12−7=5), cliente, pedido, item e reversão sem persistência.
- `npm run build` executa verificações de sintaxe e gera os bundles do Preview.

### Como preservar os dados locais de um navegador de produção
No **site antigo em que os cadastros foram feitos**, faça download de um backup privado antes do corte. O script abaixo só lê `localStorage` e cria um arquivo local; **não envia conteúdo por rede**. Não compartilhe arquivos com clientes, CPF, endereços ou pedidos em conversas públicas.

```js
(() => {
  const key = 'atletic.store.demo.v2';
  const raw = localStorage.getItem(key);
  if (!raw) { alert('Este navegador não possui dados locais da Atletic.'); return; }
  JSON.parse(raw); // valida formato antes de salvar
  const blob = new Blob([raw], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'atletic-backup-local-' + new Date().toISOString().slice(0,10) + '.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
})();
```

**Esse backup ainda não é uma importação.** Não supor que está no Neon. A importação precisa mapear IDs locais para UUIDs, converter preços em centavos para `numeric` BRL, conferir estoque e validar dados pessoais e pedidos.

### Antes de desligar o Supabase
1. Exportar/preservar os dados locais de todos os navegadores que fizeram cadastros. Implementar importador seguro com prévia e reconciliação no Neon.
2. Migrar a autenticação de clientes, endereços e histórico de pedidos; verificar a segunda conta e o fluxo de recuperação.
3. Migrar todas as APIs legadas de cadastro, gestão comercial, imagens, scanner, Olist e ERP. Testar importação sem duplicação, estoque concorrente, cancelamentos e integração real.
4. Completar checkout de pedidos reais: preço, reserva atômica, idempotência, frete, descontos, pagamento, pós-pagamento, estorno e proteção contra duplicações. O checkout atual está bloqueado, inclusive antes desta migração.
5. Verificar backups restauráveis da origem, do destino e dos objetos; repetir comparação de esquema e conteúdo e registrar plano de rollback.
6. Fazer o cutover em Preview → staging → Production com testes reais. Monitorar produção e verificar que não há dependência de `SUPABASE_*`, endpoints `/auth/v1` e `/rest/v1`.
7. Somente **depois** excluir o projeto antigo do Supabase. A exclusão não cancela automaticamente o plano Pro; conferir o downgrade/cancelamento também no Vercel Marketplace.

*Não eliminar banco em uso nem criar permissões de acesso irrestritas para apressar o processo.*
