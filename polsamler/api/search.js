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

// ─── Vinmonopolet ─────────────────────────────────────────────────────────────
// Bruker to kall: søk for å finne ID-er, deretter detaljer for pris/info

async function fetchVinmonopolet(q, key) {
  if (!key) return [];
  try {
    // Steg 1: Hent produktliste med alle detaljer
    const url = `https://apis.vinmonopolet.no/products/v0/details-normal?productShortNameContains=${encodeURIComponent(q)}&maxResults=30`;
    const r = await fetch(url, { headers: { 'Ocp-Apim-Subscription-Key': key } });
    if (!r.ok) return [];
    const data = await r.json();

    return (data || []).map(p => {
      const basic = p.basic || {};
      const main = p.main || {};
      const origins = p.origins || {};
      const prices = p.prices || [];

      return {
        id:       'no-' + basic.productId,
        source:   'no',
        name:     basic.productShortName || basic.productLongName || '',
        sub:      [
          main.subCategory?.name,
          basic.alcoholContent != null ? basic.alcoholContent + '%' : '',
          basic.volume != null ? basic.volume + 'ml' : '',
          origins.country?.name || ''
        ].filter(Boolean).join(' · '),
        category: mapVmpCat(main.mainCategory?.name || ''),
        price:    prices[0]?.salesPrice ?? 0,
        vol:      basic.volume ?? 750,
        alc:      basic.alcoholContent ?? 0,
        country:  origins.country?.name || '',
      };
    });
  } catch (e) { return []; }
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

// ─── Systembolaget via GitHub-datasett ────────────────────────────────────────

const SB_DATA_URL = 'https://raw.githubusercontent.com/AlexGustafsson/systembolaget-api-data/main/data/assortment.json';

let _sbCache = null;
let _sbCacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000;

async function fetchSystembolaget(q) {
  try {
    if (!_sbCache || Date.now() - _sbCacheTime > CACHE_TTL) {
      const r = await fetch(SB_DATA_URL);
      if (!r.ok) return [];
      _sbCache = await r.json();
      _sbCacheTime = Date.now();
    }

    const lq = q.toLowerCase();

    return _sbCache
      .filter(p => {
        // Søk kun i produktnavn – ikke produsentnavn (unngår falske treff)
        const nameStr = [
          p.productNameBold,
          p.productNameThin,
        ].filter(Boolean).join(' ').toLowerCase();
        return nameStr.includes(lq);
      })
      .slice(0, 30)
      .map(p => ({
        id:       'se-' + p.productId,
        source:   'se',
        name:     ((p.productNameBold || '') + (p.productNameThin ? ' ' + p.productNameThin : '')).trim(),
        sub:      [
          p.categoryLevel1,
          p.alcoholPercentage != null ? p.alcoholPercentage + '%' : '',
          p.volume != null ? p.volume + 'ml' : '',
          p.country || ''
        ].filter(Boolean).join(' · '),
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
