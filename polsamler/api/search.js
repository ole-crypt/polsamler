const SB_JSON_URL = 'https://raw.githubusercontent.com/AlexGustafsson/systembolaget-api-data/main/data/assortment.json';
const CACHE_TTL = 5 * 60 * 1000;

let _sbCache = null, _sbCacheTime = 0;

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
// Steg 1: finn produkt-IDer via offisielt API
// Steg 2: hent pris+detaljer ved å scrape produktsiden (JSON embedded i HTML)

const VMP_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html',
  'Accept-Language': 'no-NO,no;q=0.9',
};

async function fetchVinmonopolet(q) {
  try {
    // Steg 1: søk etter produkt-IDer
    const key = process.env.VMP_API_KEY || '';
    const searchUrl = `https://apis.vinmonopolet.no/products/v0/details-normal?productShortNameContains=${encodeURIComponent(q)}&maxResults=15`;
    const searchRes = await fetch(searchUrl, { headers: { 'Ocp-Apim-Subscription-Key': key } });
    if (!searchRes.ok) return [];
    const searchData = await searchRes.json();
    if (!searchData?.length) return [];

    // Steg 2: hent detaljer for hvert produkt parallelt (maks 10)
    const products = await Promise.all(
      searchData.slice(0, 10).map(p => scrapeVmpProduct(p.basic.productId, p.basic.productShortName))
    );

    return products.filter(Boolean);
  } catch (e) { return []; }
}

async function scrapeVmpProduct(id, fallbackName) {
  try {
    const url = `https://www.vinmonopolet.no/p/${id}`;
    const r = await fetch(url, { headers: VMP_HEADERS });
    if (!r.ok) return null;
    const html = await r.text();

    // Finn den store JSON-blokken med produktdata – ser slik ut:
    // {"name":"Mack Porter","packageType":"Glass","price":{"formattedValue":"Kr 39,90","value":39.9},...}
    const jsonMatch = html.match(/\{"name":"[^"]+","packageType"[^§]+?"price"\s*:\s*\{"formattedValue":"[^"]+","readableValue":"[^"]+","value"\s*:\s*([\d.]+)\}/);

    // Pris
    const priceMatch = html.match(/"price"\s*:\s*\{[^}]*"value"\s*:\s*([\d.]+)/);
    const price = priceMatch ? parseFloat(priceMatch[1]) : 0;

    // Navn – finn strengen etter "productShortName":"
    const nameMatch = html.match(/"productShortName"\s*:\s*"([^"]+)"/) ||
                      html.match(/"productName"\s*:\s*"([^"]+)"/);
    const name = nameMatch ? nameMatch[1] : fallbackName;

    // Volum – format er f.eks. "formattedValue":"33 cl" eller "75 cl"
    const volClMatch = html.match(/"volume"\s*:\s*\{[^}]*"formattedValue"\s*:\s*"([\d.,]+)\s*cl"/);
    const volMlMatch = html.match(/"volume"\s*:\s*\{[^}]*"formattedValue"\s*:\s*"([\d.,]+)\s*ml"/);
    const vol = volClMatch
      ? parseFloat(volClMatch[1].replace(',', '.')) * 10
      : volMlMatch
        ? parseFloat(volMlMatch[1].replace(',', '.'))
        : 750;

    // Alkohol – format er f.eks. "formattedValue":"4,7 %"
    const alcMatch = html.match(/"alc"\s*:\s*\{[^}]*"formattedValue"\s*:\s*"([\d.,]+)\s*%"/) ||
                     html.match(/"alcohol"\s*:\s*\{[^}]*"formattedValue"\s*:\s*"([\d.,]+)\s*%"/);
    const alc = alcMatch ? parseFloat(alcMatch[1].replace(',', '.')) : 0;

    // Kategori
    const catMatch = html.match(/"mainCategory"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]+)"/);
    const category = catMatch ? mapVmpCat(catMatch[1]) : 'brennevin';

    // Underkategori
    const subCatMatch = html.match(/"subCategory"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]+)"/);
    const subCat = subCatMatch ? subCatMatch[1] : '';

    // Land
    const countryMatch = html.match(/"main_country"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]+)"/);
    const country = countryMatch ? countryMatch[1] : '';

    return {
      id:       'no-' + id,
      source:   'no',
      name,
      sub:      [subCat, alc ? alc + '%' : '', vol ? vol + 'ml' : '', country].filter(Boolean).join(' · '),
      category,
      price,
      vol,
      alc,
      country,
    };
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

// ─── Systembolaget – GitHub-datasett ─────────────────────────────────────────

async function fetchSystembolaget(q) {
  try {
    if (!_sbCache || Date.now() - _sbCacheTime > CACHE_TTL) {
      const r = await fetch(SB_JSON_URL);
      if (!r.ok) return [];
      _sbCache = await r.json();
      _sbCacheTime = Date.now();
    }
    const lq = q.toLowerCase();
    return _sbCache
      .filter(p => ((p.productNameBold || '') + ' ' + (p.productNameThin || '')).toLowerCase().includes(lq))
      .slice(0, 30)
      .map(p => ({
        id:       'se-' + p.productId,
        source:   'se',
        name:     ((p.productNameBold || '') + (p.productNameThin ? ' ' + p.productNameThin : '')).trim(),
        sub:      [p.categoryLevel1, p.alcoholPercentage ? p.alcoholPercentage + '%' : '', p.volume ? p.volume + 'ml' : '', p.country || ''].filter(Boolean).join(' · '),
        category: mapSeCat(p.categoryLevel1 || ''),
        price:    p.price || 0,
        vol:      p.volume || 750,
        alc:      p.alcoholPercentage || 0,
        country:  p.country || '',
      }));
  } catch (e) { return []; }
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
