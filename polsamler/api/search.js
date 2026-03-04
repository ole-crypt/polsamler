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

  const errors = [];
  if (noRes.status === 'rejected') errors.push('vinmonopolet: ' + noRes.reason?.message);
  if (seRes.status === 'rejected') errors.push('systembolaget: ' + seRes.reason?.message);

  res.status(200).json({
    no: noRes.status === 'fulfilled' ? noRes.value : [],
    se: seRes.status === 'fulfilled' ? seRes.value : [],
    ...(errors.length ? { errors } : {}),
  });
}

// ─── Vinmonopolet ─────────────────────────────────────────────────────────────

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
  } catch (e) { return []; }
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

// ─── Systembolaget via søke-API ──────────────────────────────────────────────

const SB_SEARCH_URL = 'https://api-extern.systembolaget.se/sb-api-ecommerce/v1/productsearch/search';
const SB_SITE_URL   = 'https://www.systembolaget.se';

let _sbApiKey = null;
let _sbKeyTime = 0;
const KEY_TTL = 60 * 60 * 1000; // 1 time

async function extractSbApiKey() {
  // Bruk miljøvariabel om den finnes
  if (process.env.SB_API_KEY) return process.env.SB_API_KEY;

  // Sjekk cache
  if (_sbApiKey && Date.now() - _sbKeyTime < KEY_TTL) return _sbApiKey;

  // Hent hovedsiden og finn Next.js-bundlen
  const html = await fetch(SB_SITE_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  }).then(r => r.text());

  // Finn _app bundle-stien
  const bundleMatch = html.match(/<script src="([^"]*_app-[^"]*\.js)"/);
  if (!bundleMatch) throw new Error('Fant ikke Systembolaget JS-bundle i HTML');

  const bundleUrl = bundleMatch[1].startsWith('http')
    ? bundleMatch[1]
    : new URL(bundleMatch[1], SB_SITE_URL).href;

  // Hent bundlen og ekstraher API-nøkkel
  const js = await fetch(bundleUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  }).then(r => r.text());

  const keyMatch = js.match(/NEXT_PUBLIC_API_KEY_APIM[:"]+([^"]+)"/);
  if (!keyMatch) throw new Error('Fant ikke API-nøkkel i Systembolaget-bundle');

  _sbApiKey = keyMatch[1];
  _sbKeyTime = Date.now();
  return _sbApiKey;
}

async function fetchSystembolaget(q) {
  const apiKey = await extractSbApiKey();

  const url = `${SB_SEARCH_URL}?textQuery=${encodeURIComponent(q)}&size=30&page=1`;
  const r = await fetch(url, {
    headers: {
      'Ocp-Apim-Subscription-Key': apiKey,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  });

  if (!r.ok) {
    // Nøkkelen kan ha utløpt – nullstill cache og prøv én gang til
    if (r.status === 401 || r.status === 403) {
      _sbApiKey = null;
      _sbKeyTime = 0;
      const freshKey = await extractSbApiKey();
      const r2 = await fetch(url, {
        headers: {
          'Ocp-Apim-Subscription-Key': freshKey,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });
      if (!r2.ok) throw new Error(`Systembolaget API ${r2.status}: ${r2.statusText}`);
      return mapSbResponse(await r2.json());
    }
    throw new Error(`Systembolaget API ${r.status}: ${r.statusText}`);
  }

  return mapSbResponse(await r.json());
}

function mapSbResponse(data) {
  const products = data?.products || [];
  return products.slice(0, 30).map(p => ({
    id:       'se-' + (p.productNumber || p.productId),
    source:   'se',
    name:     ((p.productNameBold || '') + (p.productNameThin ? ' ' + p.productNameThin : '')).trim(),
    sub:      [p.categoryLevel1, p.alcoholPercentage ? p.alcoholPercentage + '%' : '', p.volume ? p.volume + 'ml' : '', p.country || ''].filter(Boolean).join(' · '),
    category: mapSeCat(p.categoryLevel1 || ''),
    price:    p.price || 0,
    vol:      p.volume || 750,
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
