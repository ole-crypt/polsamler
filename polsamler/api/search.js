const CACHE_TTL = 10 * 60 * 1000;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { q = '' } = req.query;
  if (!q) return res.status(400).json({ error: 'Mangler søkeord' });

  const [noRes, seRes] = await Promise.allSettled([
    fetchVinmonopolet(q),
    fetchSystembolaget(q),
  ]);

  res.status(200).json({
    no: noRes.status === 'fulfilled' ? noRes.value : [],
    se: seRes.status === 'fulfilled' ? seRes.value : [],
  });
}

// ─── Vinmonopolet ─────────────────────────────────────────────────────────────

async function fetchVinmonopolet(q) {
  try {
    const key = process.env.VMP_API_KEY || '';
    const searchUrl = `https://apis.vinmonopolet.no/products/v0/details-normal?productShortNameContains=${encodeURIComponent(q)}&maxResults=15`;
    const searchRes = await fetch(searchUrl, {
      headers: { 'Ocp-Apim-Subscription-Key': key },
      signal: AbortSignal.timeout(8000),
    });
    if (!searchRes.ok) return [];
    const searchData = await searchRes.json();
    if (!searchData?.length) return [];

    const products = await Promise.all(
      searchData.slice(0, 10).map(p => scrapeVmpProduct(p.basic.productId, p.basic.productShortName))
    );
    return products.filter(Boolean);
  } catch (e) { return []; }
}

async function scrapeVmpProduct(id, fallbackName) {
  try {
    const r = await fetch(`https://www.vinmonopolet.no/p/${id}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html',
        'Accept-Language': 'no-NO,no;q=0.9',
      },
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) return null;
    const html = await r.text();

    const nameMatch = html.match(/"productShortName"\s*:\s*"([^"]+)"/) ||
                      html.match(/"productName"\s*:\s*"([^"]+)"/);
    const name = nameMatch ? nameMatch[1] : fallbackName;

    const priceMatch = html.match(/"price"\s*:\s*\{[^}]*"value"\s*:\s*([\d.]+)/);
    const price = priceMatch ? parseFloat(priceMatch[1]) : 0;

    const volClMatch = html.match(/"volume"\s*:\s*\{[^}]*"formattedValue"\s*:\s*"([\d.,]+)\s*cl"/);
    const volMlMatch = html.match(/"volume"\s*:\s*\{[^}]*"formattedValue"\s*:\s*"([\d.,]+)\s*ml"/);
    const vol = volClMatch
      ? parseFloat(volClMatch[1].replace(',', '.')) * 10
      : volMlMatch ? parseFloat(volMlMatch[1].replace(',', '.')) : 750;

    const catMatch = html.match(/"mainCategory"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]+)"/);
    const category = catMatch ? mapVmpCat(catMatch[1]) : 'brennevin';

    const subCatMatch = html.match(/"subCategory"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]+)"/);
    const subCat = subCatMatch ? subCatMatch[1] : '';

    const countryMatch = html.match(/"main_country"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]+)"/);
    const country = countryMatch ? countryMatch[1] : '';

    return { id: 'no-' + id, source: 'no', name, sub: [subCat, vol ? vol + 'ml' : '', country].filter(Boolean).join(' · '), category, price, vol, alc: 0, country };
  } catch (e) { return null; }
}

function mapVmpCat(c) {
  if (!c) return 'brennevin';
  c = c.toLowerCase();
  if (c.includes('øl'))                                    return 'øl';
  if (c.includes('rød'))                                   return 'rødvin';
  if (c.includes('hvit'))                                  return 'hvitvin';
  if (c.includes('musserende') || c.includes('champagne')) return 'musserende';
  if (c.includes('rosé'))                                  return 'rosévin';
  return 'brennevin';
}

// ─── Systembolaget ────────────────────────────────────────────────────────────
// Bruker Systembolagets egen søke-API via en åpen proxy

async function fetchSystembolaget(q) {
  try {
    // Systembolaget har et åpent søke-API på deres nettside
    const url = `https://api-extern.systembolaget.se/sb-api-ecommerce/v1/productsearch/search?q=${encodeURIComponent(q)}&size=30`;
    const r = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Ocp-Apim-Subscription-Key': '7f5a6b8d3e2c4a1f9b0d8e7c6a5f4e3d',
        'Origin': 'https://www.systembolaget.se',
        'Referer': 'https://www.systembolaget.se/',
        'User-Agent': 'Mozilla/5.0',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return await fetchSystembolagetScrape(q);
    const data = await r.json();
    const items = data?.products || data?.result || [];
    if (!items.length) return await fetchSystembolagetScrape(q);
    return mapSeItems(items);
  } catch (e) {
    return await fetchSystembolagetScrape(q);
  }
}

async function fetchSystembolagetScrape(q) {
  try {
    // Scrape Systembolagets nettside direkte
    const url = `https://www.systembolaget.se/api/productsearch/search?q=${encodeURIComponent(q)}&categoryLevel1=&size=30`;
    const r = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.systembolaget.se/',
        'Origin': 'https://www.systembolaget.se',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return [];
    const data = await r.json();
    const items = data?.products || data?.result || data || [];
    return mapSeItems(Array.isArray(items) ? items : []);
  } catch (e) { return []; }
}

function mapSeItems(items) {
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
}

function mapSeCat(c) {
  c = c.toLowerCase();
  if (c.includes('öl') || c.includes('oel'))            return 'øl';
  if (c.includes('rött') || c.includes('röd'))          return 'rødvin';
  if (c.includes('vitt') || c.includes('vit'))          return 'hvitvin';
  if (c.includes('mousser') || c.includes('champagne')) return 'musserende';
  if (c.includes('rosé'))                               return 'rosévin';
  return 'brennevin';
}
