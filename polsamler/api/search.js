// Bruker Vinmonopolets åpne CSV-fil og AlexGustafssons Systembolaget-datasett.
// Ingen API-nøkler nødvendig!

const VMP_CSV_URL = 'https://www.vinmonopolet.no/medias/sys_master/products/products/hbc/hf0/8834253127710/produkter.csv';
const SB_JSON_URL = 'https://raw.githubusercontent.com/AlexGustafsson/systembolaget-api-data/main/data/assortment.json';
const CACHE_TTL   = 5 * 60 * 1000; // 5 min

let _vmpCache = null, _vmpCacheTime = 0;
let _sbCache  = null, _sbCacheTime  = 0;

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

// ─── Vinmonopolet CSV ─────────────────────────────────────────────────────────

async function fetchVinmonopolet(q) {
  try {
    if (!_vmpCache || Date.now() - _vmpCacheTime > CACHE_TTL) {
      const r = await fetch(VMP_CSV_URL);
      if (!r.ok) return [];
      const text = await r.text();
      _vmpCache = parseVmpCsv(text);
      _vmpCacheTime = Date.now();
    }

    const lq = q.toLowerCase();
    return _vmpCache
      .filter(p => p.name.toLowerCase().includes(lq))
      .slice(0, 30);
  } catch (e) { return []; }
}

function parseVmpCsv(text) {
  const lines = text.split('\n');
  if (lines.length < 2) return [];

  // Finn kolonneindekser fra header
  const sep = ';';
  const headers = lines[0].split(sep).map(h => h.trim().replace(/^"|"$/g, ''));

  const idx = {
    id:    headers.indexOf('Varenummer'),
    name:  headers.indexOf('Varenavn'),
    type:  headers.indexOf('Varetype'),
    vol:   headers.indexOf('Volum'),
    alc:   headers.indexOf('Alkohol'),
    price: headers.indexOf('Pris'),
    country: headers.indexOf('Land'),
  };

  const products = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(sep).map(c => c.trim().replace(/^"|"$/g, ''));
    if (cols.length < 5) continue;

    const name  = cols[idx.name]  || '';
    const type  = cols[idx.type]  || '';
    const volRaw   = parseFloat((cols[idx.vol]   || '0').replace(',', '.')) || 0;
    const alcRaw   = parseFloat((cols[idx.alc]   || '0').replace(',', '.')) || 0;
    const priceRaw = parseFloat((cols[idx.price] || '0').replace(',', '.')) || 0;

    products.push({
      id:       'no-' + (cols[idx.id] || i),
      source:   'no',
      name,
      sub:      [type, alcRaw ? alcRaw + '%' : '', volRaw ? volRaw + 'ml' : '', cols[idx.country] || ''].filter(Boolean).join(' · '),
      category: mapVmpCat(type),
      price:    priceRaw,
      vol:      volRaw,
      alc:      alcRaw,
      country:  cols[idx.country] || '',
    });
  }
  return products;
}

function mapVmpCat(c) {
  c = c.toLowerCase();
  if (c.includes('øl'))                                    return 'øl';
  if (c.includes('rød'))                                   return 'rødvin';
  if (c.includes('hvit'))                                  return 'hvitvin';
  if (c.includes('musserende') || c.includes('champagne')) return 'musserende';
  if (c.includes('rosé'))                                  return 'rosévin';
  return 'brennevin';
}

// ─── Systembolaget JSON ───────────────────────────────────────────────────────

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
