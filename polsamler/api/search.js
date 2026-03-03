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

// ─── Vinmonopolet – nettbutikk-søke-API ───────────────────────────────────────

async function fetchVinmonopolet(q) {
  try {
    const url = `https://www.vinmonopolet.no/vmpws/v2/vmp/search?q=${encodeURIComponent(q)}&searchType=product&currentPage=0&pageSize=30`;
    const r = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0',
      },
    });
    if (!r.ok) return [];
    const data = await r.json();
    const items = data?.productSearchResult?.products || [];
    return items.map(p => ({
      id:       'no-' + p.code,
      source:   'no',
      name:     p.name || '',
      sub:      [
        p.main_category?.name,
        p.content?.volume?.formattedValue,
        p.content?.alc?.formattedValue,
        p.main_country?.name || '',
      ].filter(Boolean).join(' · '),
      category: mapVmpCat(p.main_category?.name || ''),
      price:    p.price?.value || 0,
      vol:      parseVol(p.content?.volume?.formattedValue),
      alc:      parseAlc(p.content?.alc?.formattedValue),
      country:  p.main_country?.name || '',
    }));
  } catch (e) { return []; }
}

function parseVol(s) {
  if (!s) return 750;
  const m = s.match(/([\d.,]+)/);
  return m ? parseFloat(m[1].replace(',', '.')) * (s.includes('cl') ? 10 : s.includes('l') && !s.includes('ml') ? 1000 : 1) : 750;
}

function parseAlc(s) {
  if (!s) return 0;
  const m = s.match(/([\d.,]+)/);
  return m ? parseFloat(m[1].replace(',', '.')) : 0;
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
