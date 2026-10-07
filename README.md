# Atletic Suplementos

Loja e central administrativa em evolução, hospedadas na Vercel e preparadas para um backend exclusivo em Supabase.

## Estado atual

A vitrine e o administrativo compartilham um único modelo de dados demonstrativo (`dist/store-data.js`). Isso permite validar o fluxo completo de catálogo antes de habilitar dados reais:

- Dashboard administrativo.
- Produtos e variações.
- Categorias e marcas.
- Preço de venda, preço anterior/promocional, custo, SKU, código de barras e estoque mínimo.
- Entradas e saídas de estoque com lote, validade, motivo e histórico.
- Cupons.
- Banners e parceiros com período, imagens e WhatsApp.
- Módulos reservados para clientes e pedidos.
- Vitrine lendo o mesmo catálogo, estoque, cupons e banners.
- Carrinho local demonstrativo; checkout real continua bloqueado.

Os dados atuais continuam locais ao navegador e servem apenas para validação. Não cadastre dados pessoais reais até a conexão com Supabase Auth/RLS.

## Banco definitivo

`database/schema.sql` contém a estrutura v2 para um projeto Supabase exclusivo da Atletic. Inclui:

- `store_staff`, `brands`, `categories`, `products`, `variants`, `product_images`;
- `stock_lots`, `stock_movements`;
- `customers`, `addresses`;
- `coupons`, `orders`, `order_items`, `payments`, `payment_events`;
- `banners`;
- RLS e políticas separando catálogo público, cliente e administrador.

Não aplique esse schema em outro projeto da empresa. Antes de vendas reais, validar Auth, RLS, Storage, checkout, reserva/expiração de estoque, webhooks, cancelamentos, estornos e backups.

## Busca inteligente de imagens

`api/product-images.js` prepara a busca automática de fotos pelo nome do produto. A chave do provedor nunca é exposta no navegador.

Variáveis previstas na Vercel:

- `SERPER_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

A função exige administrador autenticado e consulta a tabela `store_staff` antes de chamar o provedor. O painel já possui o botão **Buscar imagens**, mas ele só fica funcional quando Supabase Auth e essas variáveis estiverem configurados.

## Configuração do frontend

`dist/store-config.js` possui os campos públicos para a futura conexão Supabase. Publishable keys podem ser usadas no navegador; nunca coloque `service_role` ou outra chave secreta nesse arquivo.

## Deploy

O repositório está ligado ao projeto `atleticsuplementos` na Vercel. Pushes no GitHub geram deployments automaticamente. A produção deve receber apenas versões verificadas em preview.

## Próximas ativações

1. Criar/selecionar o projeto Supabase exclusivo e aplicar o schema.
2. Criar o primeiro usuário administrador por operação confiável e adicioná-lo a `store_staff`.
3. Integrar Supabase Auth ao administrativo e à área do cliente.
4. Migrar os cadastros locais para banco e Storage.
5. Configurar `SERPER_API_KEY` e validar a seleção de imagens.
6. Implementar checkout no servidor e integrar o provedor de pagamento utilizado pela empresa.
7. Validar o fluxo completo e só então liberar vendas.
