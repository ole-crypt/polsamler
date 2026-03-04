import { createClient } from 'redis';

const SB_URL = 'https://raw.githubusercontent.com/AlexGustafsson/systembolaget-api-data/main/data/assortment.json';
const SB_REDIS_KEY = 'sb:assortment';
const SB_TTL = 60 * 60 * 6; // 6 timer

let _redis = null;

async function getRedis() {
  if (!_redis) {
    _redis = createClient({ url: process.env.REDIS_URL });
    _redis.on('error', () => { _redis = null; });
    await _redis.connect();
  }
  return _redis;
}

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
    const r = await fetch(
      `https://apis.vinmonopolet.no/products/v0/details-normal?productShortNameContains=${encodeURIComponent(q)}&maxResults=15`,
      { headers: { 'Ocp-Apim-Subscription-Key': key }, signal: AbortSignal.timeout(8000) }
    );
    if (!r.ok) return [];
    const data = await r.json();
    if (!data?.length) return [];
    const products = await Promise.all(data.slice(0, 10).map(p => scrapeVmpProduct(p.basic.productId, p.basic.productShortName)));
    return products.filter(Boolean);
  } catch (e) { return []; }
}

async function scrapeVmpProduct(id, fallbackName) {
  try {
    const r = await fetch(`https://www.vinmonopolet.no/p/${id}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept': 'text/html', 'Accept-Language': 'no-NO,no;q=0.9' },
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) return null;
    const html = await r.text();

    const name    = extract(html, /"productShortName"\s*:\s*"([^"]+)"/) || fallbackName;
    const price   = parseFloat(extract(html, /"price"\s*:\s*\{[^}]*"value"\s*:\s*([\d.]+)/) || '0');
    const volCl   = extract(html, /"volume"\s*:\s*\{[^}]*"formattedValue"\s*:\s*"([\d.,]+)\s*cl"/);
    const volMl   = extract(html, /"volume"\s*:\s*\{[^}]*"formattedValue"\s*:\s*"([\d.,]+)\s*ml"/);
    const vol     = volCl ? parseFloat(volCl.replace(',', '.')) * 10 : volMl ? parseFloat(volMl.replace(',', '.')) : 750;
    const cat     = extract(html, /"mainCategory"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]+)"/);
    const sub     = extract(html, /"subCategory"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]+)"/);
    const country = extract(html, /"main_country"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]+)"/);
    const alc     = parseFloat(extract(html, /"alcoholContent"\s*:\s*([\d.]+)/) || '0');

    return {
      id: 'no-' + id, source: 'no', name,
      sub: [sub, alc ? alc + '%' : '', vol ? vol + 'ml' : '', country].filter(Boolean).join(' · '),
      category: mapVmpCat(cat || ''), price, vol, alc, country: country || '',
    };
  } catch (e) { return null; }
}

function extract(html, regex) {
  const m = html.match(regex);
  return m ? m[1] : null;
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

// ─── Systembolaget via Redis ──────────────────────────────────────────────────

async function fetchSystembolaget(q) {
  try {
    const redis = await getRedis();

    // Sjekk om data finnes i Redis
    let raw = await redis.get(SB_REDIS_KEY);

    // Hvis ikke, last fra GitHub og lagre i Redis
    if (!raw) {
      const r = await fetch(SB_URL, { signal: AbortSignal.timeout(25000) });
      if (!r.ok) return [];
      const data = await r.json();
      raw = JSON.stringify(data);
      await redis.set(SB_REDIS_KEY, raw, { EX: SB_TTL });
    }

    const data = JSON.parse(raw);
    const lq = q.toLowerCase();
    return data
      .filter(p => ((p.productNameBold || '') + ' ' + (p.productNameThin || '')).toLowerCase().includes(lq))
      .slice(0, 30)
      .map(p => ({
        id: 'se-' + p.productId, source: 'se',
        name: ((p.productNameBold || '') + (p.productNameThin ? ' ' + p.productNameThin : '')).trim(),
        sub: [p.categoryLevel1, p.alcoholPercentage ? p.alcoholPercentage + '%' : '', p.volume ? p.volume + 'ml' : '', p.country || ''].filter(Boolean).join(' · '),
        category: mapSeCat(p.categoryLevel1 || ''),
        price: p.price || 0, vol: p.volume || 750, alc: p.alcoholPercentage || 0, country: p.country || '',
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
