import archiver from 'archiver';

export const config = { maxDuration: 60 };

const images = [
  ['100% Whey Concentrate (840g) Evolve','Evolve','Proteínas','https://cdn.awsli.com.br/800x800/1361/1361851/produto/93289184/39-21kkx9jcvb.png'],
  ['Barra de proteína Crisp Bar 45g - Sabor Ovomaltine - Integralmedica','Integralmédica','Proteínas','https://cdn.awsli.com.br/800x800/1361/1361851/produto/353752094/d_nq_np_2x_697324-mla96155280493_102025-f-d5a4cx9zl3.webp'],
  ['Colágeno Tipo II (60 cápsulas) - Evolve','Evolve','Vitaminas','https://cdn.awsli.com.br/800x800/1361/1361851/produto/149937717/5e0a69df4a.jpg'],
  ['Coqueteleira Transparente (600ml) Integralmédica','Integralmédica','Acessórios','https://cdn.awsli.com.br/800x800/1361/1361851/produto/229218979/8-qhfqvibhgb.png'],
  ['Creatina (300g) - Max Titanium','Max Titanium','Creatinas','https://cdn.awsli.com.br/800x800/1361/1361851/produto/93310863/3-nv15p3rp0o.png'],
  ['Creatina Hardcore (150g) - Integralmédica','Integralmédica','Creatinas','https://cdn.awsli.com.br/800x800/1361/1361851/produto/93312928/1-4--eja1tvphdk.png'],
  ['Creatina Hardcore (300g) - Integralmédica','Integralmédica','Creatinas','https://cdn.awsli.com.br/800x800/1361/1361851/produto/93313624/2-4--7h7w2kcibs.png'],
  ['Creatina Monohidratada (300g) DUX Nutrition','DUX Nutrition','Creatinas','https://cdn.awsli.com.br/800x800/1361/1361851/produto/203243364/111-86b80iu4d2.png'],
  ['Creatina Monohidratada (300g) Probiótica','Probiótica','Creatinas','https://cdn.awsli.com.br/800x800/1361/1361851/produto/101602454/2-5vopiogu41.png'],
  ['CREATINA SHARK PRO 300G','Shark Pro','Creatinas','https://cdn.awsli.com.br/800x800/1361/1361851/produto/343299218/shark-divwyr75sy.png'],
  ['Creatine (300g) Black Skull','Black Skull','Creatinas','https://cdn.awsli.com.br/800x800/1361/1361851/produto/129165198/design-sem-nome-pcdh5l85u8.png'],
  ['Iso Whey Collagen + (840g) Evolve','Evolve','Proteínas','https://cdn.awsli.com.br/800x800/1361/1361851/produto/93290466/1-fjcss2asxg.png'],
  ['L- GLUTAMINA (250g) - EVOLVE','Evolve','Aminoácidos','https://cdn.awsli.com.br/800x800/1361/1361851/produto/298700361/1-ugo6sj16yc.png'],
  ['Multivitamínico (60 cápsulas) - Evolve','Evolve','Vitaminas','https://cdn.awsli.com.br/800x800/1361/1361851/produto/214409068/3-yeeorxhtyq.png'],
  ['Ômega 3 1000mg (60 cápsulas) - Evolve','Evolve','Vitaminas','https://cdn.awsli.com.br/800x800/1361/1361851/produto/92796142/acfa06e6cf.jpg'],
  ['Pre Workout (150g) Evolve','Evolve','Pré-treinos','https://cdn.awsli.com.br/800x800/1361/1361851/produto/231959625/1-ojjc2l2hrt.png'],
  ['Vitamina C (60 cápsulas) - Evolve','Evolve','Vitaminas','https://cdn.awsli.com.br/800x800/1361/1361851/produto/92775690/23a3862a64.jpg'],
  ['Vitamina D (60 cápsulas) Evolve','Evolve','Vitaminas','https://cdn.awsli.com.br/800x800/1361/1361851/produto/92809684/9c0ec54281.jpg'],
  ['Whey 100% HD (900g) Black Skull','Black Skull','Proteínas','https://cdn.awsli.com.br/800x800/1361/1361851/produto/129166224/1-239clctleg.png'],
  ['Whey 100% Pure (900g) Integralmédica','Integralmédica','Proteínas','https://cdn.awsli.com.br/800x800/1361/1361851/produto/92601117/1-q6ujxwv8d7.png'],
  ['Whey Grego Bar Havanna Nutrata Sabor Doce de Leite com Morango','Nutrata','Proteínas','https://cdn.awsli.com.br/800x800/1361/1361851/produto/364056309/d_nq_np_980385-mla82052236924_022025-o-oi0ehko4wb.webp'],
  ['Whey Protein Concentrado (900g) DUX Nutrition','DUX Nutrition','Proteínas','https://cdn.awsli.com.br/800x800/1361/1361851/produto/92616996/dux-novo-ks7qr9zwhy.jpg'],
  ['Whey Protein Isolado (900g) DUX Nutrition','DUX Nutrition','Proteínas','https://cdn.awsli.com.br/800x800/1361/1361851/produto/92618811/design-sem-nome--1--9h5t6kbq8v.png']
];

function safeName(value='') {
  return String(value)
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-zA-Z0-9]+/g,'_')
    .replace(/^_+|_+$/g,'')
    .slice(0,90) || 'produto';
}

function extFromUrl(url) {
  const path = new URL(url).pathname.toLowerCase();
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return '.jpg';
  if (path.endsWith('.webp')) return '.webp';
  return '.png';
}

function csvCell(value='') {
  return '"' + String(value).replace(/"/g,'""') + '"';
}

export default async function handler(req,res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow','GET');
    return res.status(405).send('Método não permitido.');
  }

  res.setHeader('Content-Type','application/zip');
  res.setHeader('Content-Disposition','attachment; filename="atletic-imagens-originais-800x800.zip"');
  res.setHeader('Cache-Control','private, no-store');

  const archive = archiver('zip',{zlib:{level:9}});
  archive.on('error',error=>{
    if (!res.headersSent) res.status(500);
    res.end(String(error?.message||'Falha ao compactar imagens.'));
  });
  archive.pipe(res);

  const manifest = [['arquivo','produto','marca','categoria','url_origem']];
  let index=1;

  for (const [title,brand,category,url] of images) {
    try {
      const response = await fetch(url,{headers:{'User-Agent':'AtleticSuplementosExport/1.0'}});
      if (!response.ok) continue;
      const buffer = Buffer.from(await response.arrayBuffer());
      const fileName = String(index).padStart(2,'0') + '_' + safeName(title) + extFromUrl(url);
      archive.append(buffer,{name:'imagens/'+fileName});
      manifest.push([fileName,title,brand,category,url]);
      index++;
    } catch {}
  }

  const csv = manifest.map(row=>row.map(csvCell).join(',')).join('\n');
  archive.append(Buffer.from('\uFEFF'+csv,'utf8'),{name:'manifesto.csv'});
  archive.append(Buffer.from(
    'Imagens originais em 800x800 para remoção manual de fundo.\n' +
    'Não redimensionar o produto. Exporte preferencialmente em PNG transparente, mantendo 800x800.\n',
    'utf8'
  ),{name:'LEIA-ME.txt'});

  await archive.finalize();
}
