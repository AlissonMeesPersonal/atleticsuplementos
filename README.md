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
