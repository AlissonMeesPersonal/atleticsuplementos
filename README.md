# Atletic Suplementos

Prévia de design em HTML, CSS e JavaScript. Logo oficial fornecida em PDF, convertida em SVG. Catálogo e embalagens ilustrativos, preços fictícios: substituir antes do lançamento.

## Recursos
- Layout responsivo, temas claro/escuro persistidos.
- Busca normalizada, categorias, ordenação de preços.
- Carrinho persistido localmente, quantidades de 1 a 99, exclusão de itens.
- Cupom de demonstração ATLETIC10 (10%), removível e sem acumulação.
- Valores calculados em centavos. Não há checkout ativo nem envio de pedidos.

## Executar
Sirva `dist/` com qualquer servidor estático, por exemplo `python3 -m http.server 8080 --directory dist`.

## Integração futura
Conectar a plataforma já utilizada pela loja para catálogo, estoque, frete, validação de cupons e checkout. Os preços e descontos do navegador são apenas demonstrativos e nunca devem ser usados como fonte de verdade para cobrança. Validação definitiva deve ocorrer na plataforma/servidor. Substituir ilustrações pelas fotos reais dos produtos.

## Carrossel de campanhas e parceiros
Edite `dist/banners.js` para cadastrar banners. Cada parceiro possui `partner`, `title`, `description`, `whatsapp` (DDI + DDD + número), `message`, `image`, `mobileImage` e `imageAlt`. O botão abre `wa.me` em nova aba com texto pré-preenchido; nenhuma mensagem é enviada automaticamente. Sem número válido, o botão permanece desabilitado. O exemplo não representa um parceiro real.

Troca a cada 6,5 segundos; controles anterior/próximo, indicadores, pausa, teclado e deslize. A troca pausa durante foco, hover ou aba oculta, e inicia pausada se o dispositivo pedir movimento reduzido.

## Plataforma própria: estado atual
A decisão passou a ser implementar a operação própria com Vercel e Supabase. Nenhuma assinatura paga foi contratada.

`/admin.html` contém uma demonstração navegável do administrativo: cadastro/edição/exclusão de produtos, movimentos imutáveis de estoque por lote, cupons e banners de parceiros. Esses dados ficam apenas no navegador, não sincronizam com a vitrine e não são autenticação nem banco online. Clientes e pedidos estão bloqueados para evitar uso acidental com dados reais.

`database/schema.sql` é uma proposta transacional de estrutura ainda não aplicada. Inclui perfis, endereços, produtos, variantes, imagens, lotes, movimentos, cupons, pedidos, itens, pagamentos, deduplicação de eventos e banners, com RLS. Não é uma migração validada nem uma implementação completa do checkout.

Bloqueio confirmado: criar projeto `atletic-suplementos` em São Paulo retornou limite de dois projetos gratuitos ativos. Nenhum projeto existente foi pausado, excluído ou alterado.

Pendências para ativação real:
1. Disponibilizar um projeto exclusivo Supabase, aplicar estrutura via migração e testar políticas com usuário anônimo, cliente e administrador.
2. Integrar Supabase Auth (cadastro, confirmação, recuperação, revogação) e vincular primeiro administrador por operação confiável.
3. Substituir armazenamento local por banco e Storage com políticas de acesso; validar arquivos e imagens.
4. Implementar checkout no servidor com preços consultados no banco, cupom validado atomicamente, reserva/expiração de estoque e frete.
5. Integrar provedor e webhooks assinados/idempotentes; somente confirmação confiável pode marcar pedido como pago.
6. Validar fluxo de cancelamento, estorno, devolução de estoque, auditoria, backups e exportação.
7. Ativar os planos adequados antes de vendas comerciais.
