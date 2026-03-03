export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { q = '' } = req.query;
  if (!q) return res.status(400).json({ error: 'Mangler søkeord' });

  const VMP_KEY = process.env.VMP_API_KEY;

  const [noRes, seRes] = await Promise.allSettled([
    fetchVinmonopolet(q, VMP_KEY),
    fetchSystembolaget(q),
  ]);

  res.status(200).json({
    no: noRes.status === 'fulfilled' ? noRes.value : [],
    se: seRes.status === 'fulfilled' ? seRes.value : [],
  });
}

async function fetchVinmonopolet(q, key) {
  if (!key) return [];
  try {
    const url = `https://apis.vinmonopolet.no/products/v0/details-normal?productShortNameContains=${encodeURIComponent(q)}&maxResults=30`;
    const r = await fetch(url, { headers: { 'Ocp-Apim-Subscription-Key': key } });
    if (!r.ok) return [];
    const data = await r.json();
    return (data || []).map(p => ({
      id:       'no-' + p.basic?.productId,
      source:   'no',
      name:     p.basic?.productShortName || p.basic?.productLongName || '',
      sub:      [p.main?.subCategory?.name, p.basic?.alcoholContent ? p.basic.alcoholContent + '%' : '', p.basic?.volume ? p.basic.volume + 'ml' : '', p.origins?.country?.name || ''].filter(Boolean).join(' · '),
      category: mapVmpCat(p.main?.mainCategory?.name || ''),
      price:    p.prices?.[0]?.salesPrice || 0,
      vol:      p.basic?.volume || 750,
      alc:      p.basic?.alcoholContent || 0,
      country:  p.origins?.country?.name || '',
    }));
  } catch(e) { return []; }
}

function mapVmpCat(c) {
  c = c.toLowerCase();
  if (c.includes('øl'))                                     return 'øl';
  if (c.includes('rød'))                                    return 'rødvin';
  if (c.includes('hvit'))                                   return 'hvitvin';
  if (c.includes('musserende') || c.includes('champagne'))  return 'musserende';
  if (c.includes('rosé'))                                   return 'rosévin';
  return 'brennevin';
}

async function fetchSystembolaget(q) {
  try {
    const url = `https://api-extern.systembolaget.se/sb-api-ecommerce/v1/productsearch/search?q=${encodeURIComponent(q)}&size=30`;
    const r = await fetch(url, {
      headers: {
        'Ocp-Apim-Subscription-Key': 'cfc702aed3094c86b92d6d4ff7a54c84',
        'Accept': 'application/json',
      },
    });
    if (!r.ok) return [];
    const data = await r.json();
    const items = data?.products || data?.result || [];
    return items.map(p => ({
      id:       'se-' + (p.productId || p.productNumber),
      source:   'se',
      name:     ((p.productNameBold || '') + (p.productNameThin ? ' ' + p.productNameThin : '')).trim(),
      sub:      [p.categoryLevel1, p.alcoholPercentage ? p.alcoholPercentage + '%' : '', p.volume ? Math.round(p.volume * 1000) + 'ml' : '', p.country || ''].filter(Boolean).join(' · '),
      category: mapSeCat(p.categoryLevel1 || ''),
      price:    p.price || 0,
      vol:      p.volume ? Math.round(p.volume * 1000) : 750,
      alc:      p.alcoholPercentage || 0,
      country:  p.country || '',
    }));
  } catch(e) { return []; }
}

function mapSeCat(c) {
  c = c.toLowerCase();
  if (c.includes('öl') || c.includes('oel'))             return 'øl';
  if (c.includes('rött') || c.includes('röd'))           return 'rødvin';
  if (c.includes('vitt') || c.includes('vit'))           return 'hvitvin';
  if (c.includes('mousser') || c.includes('champagne'))  return 'musserende';
  if (c.includes('rosé'))                                return 'rosévin';
  return 'brennevin';
}
