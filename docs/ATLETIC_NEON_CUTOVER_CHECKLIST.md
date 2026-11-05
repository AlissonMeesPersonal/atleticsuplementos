# Atletic Suplementos — transição para Neon (homologação)

Atualizado em 2026-11-05. Não excluir o projeto Supabase enquanto houver pendências.

## Base e login: confirmado
- [x] Neon `atletic_db`: 26 tabelas e 99 registros copiados da origem (comparação de contagem + conteúdo no snapshot).
- [x] Conta administrativa Neon: usuário, senha e e-mail verificado; acesso administrativo validado em Preview.
- [x] As 34 políticas RLS foram copiadas, mas GRANT direto para `authenticated`/`anonymous` segue fechado; o gateway server-side valida JWT e perfil antes de usar SQL com papel proprietário.
- [x] Gatilho de `inventory.quantity_available` recalcula `quantity_on_hand - quantity_reserved` e CHECK mantém coerência.
- [x] Smoke PostgreSQL: criação de marca, categoria, produto, variação, estoque, cliente, pedido e item funcionou em subtransação revertida; nenhuma linha artificial permaneceu.

## API do Neon exclusiva de Preview
- [x] `GET /api/admin-dashboard?neonApi=publicCatalog`: catálogo público com campos comerciais, sem dados privados.
- [x] `GET /api/admin-dashboard?neonApi=adminSummary`: totais administrativos com JWT Neon validado.
- [x] `GET /api/admin-dashboard?neonApi=adminInventory`: inventário com JWT verificado.
- [x] `GET /api/admin-dashboard?neonApi=adminOrders`: últimos pedidos com JWT verificado.
- [x] `POST /api/admin-dashboard?neonApi=smoke`: transação PostgreSQL com rollback de catálogo/estoque/pedido.
- [x] Operações de Preview `createBrand`, `createCategory`, `createProduct`, `adjustStock`, `draftOrder`, `cancelDraftOrder` com SQL parametrizado e autorização de admin.
- [x] `/api/site-visuals` no Preview lê/grava `store_settings` via Neon; na produção conserva caminho antigo.
- [ ] Smoke via página `/neon-admin-test` usando token real: executar botões e confirmar HTTP 200, sem resíduos.
- [ ] Testes negativos no gateway: token ausente, expirado, adulterado e usuário sem papel admin; nenhum dado liberado.
- [ ] Testar as operações reais do catálogo com leitura depois de gravação e restauração controlada, sem dados fictícios em produção.
- [ ] Testar duas reservas simultâneas e impedir estoque negativo/dupla venda.
- [ ] Testar criação/cancelamento de pedido rascunho; NENHUM pagamento é feito na API de homologação.

## Pendências de código antes de trocar produção
- [ ] Substituir `dist/admin-auth.js` (Supabase Auth manual) por login Neon Auth mantendo toda a interface antiga.
- [ ] Substituir `dist/customer-account.js` (Supabase Auth/REST) por Neon Auth e serviços próprios.
- [ ] Migrar `api/admin-customers.js`, `api/admin-orders.js`, `api/barcode-stock.js`, `api/olist-erp.js`, `api/olist-import.js` e as demais chamadas Supabase ao backend Neon com RLS validado.
- [ ] Substituir a gravação demonstrativa em `dist/store-data.js` e `dist/admin.js` (`localStorage`) por banco transacional. Exportar/importar os dados que só existam no navegador antes de desligar demo.
- [ ] Substituir checkout local por serviço server-side de pedidos, reserva atômica, validação de cupons, pagamento e confirmação segura via webhook. A API `draftOrder` NÃO processa pagamento.
- [ ] Reconectar Olist e validar movimentações ERP sem duplicar produtos, estoque ou pedidos.
- [ ] Definir regra clara de publicação de produtos e transformação de valores em centavos do demo para BRL no banco.
- [ ] Revalidar acesso do segundo usuário e fluxos de recuperação de conta, email, sessões e permissões.
- [ ] Confirmar controles de RLS e grants antes de expor Neon Data API diretamente.

## Checklist do corte final
1. Efetuar backup restaurável do Supabase (DB, Auth e Storage), registrar contagens e hashes; revisar se há mudanças desde os 99 registros copiados.
2. Exportar os cadastros demo armazenados no navegador de produção: não estão no Supabase nem na cópia Neon.
3. Criar snapshot/branch de recuperação do Neon e documentar plano de rollback.
4. Congelar gravações durante delta sync e fazer reconcilição completa de estoque, pedidos, usuários e imagens.
5. Rodar testes ponta a ponta em Preview: login admin/cliente, catálogo, imagens, carrinho, cupons, estoque, pedido, Olist, pagamentos e segurança.
6. Atualizar variáveis de produção na Vercel só após passar nos testes, e monitorar gravações durante operação assistida.
7. Desabilitar segredos antigos e excluir Supabase SOMENTE após confirmar que nenhuma URL `supabase.co` é acessada por navegador ou APIs.
8. Depois, realizar downgrade Pro -> Free e verificar se a assinatura Vercel Marketplace foi encerrada.

**Status de produção:** NÃO MIGRADA. **Supabase Atletic:** MANTER ATIVO.
