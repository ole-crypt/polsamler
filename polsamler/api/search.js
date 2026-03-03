export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { q = '' } = req.query;
  if (!q) return res.status(400).json({ error: 'Mangler søkeord' });

  const VMP_KEY = process.env.VMP_API_KEY;
  const headers = { 'Ocp-Apim-Subscription-Key': VMP_KEY || '' };
  const debug = {};

  // Test 1: details-normal (vet vi får bare basic + lastChanged)
  try {
    const r = await fetch(`https://apis.vinmonopolet.no/products/v0/details-normal?productShortNameContains=${encodeURIComponent(q)}&maxResults=1`, { headers });
    const d = await r.json();
    debug.details_normal = d[0];
  } catch(e) { debug.details_normal_err = e.message; }

  // Test 2: details med produktID (henter full info for ett produkt)
  try {
    const r = await fetch(`https://apis.vinmonopolet.no/products/v0/details-normal?productId=1855202`, { headers });
    const d = await r.json();
    debug.details_by_id = d[0];
    debug.details_by_id_keys = Object.keys(d[0] || {});
  } catch(e) { debug.details_by_id_err = e.message; }

  // Test 3: catalogue endepunkt
  try {
    const r = await fetch(`https://apis.vinmonopolet.no/catalogue/v0/products?productShortNameContains=${encodeURIComponent(q)}&maxResults=1`, { headers });
    debug.catalogue_status = r.status;
    if (r.ok) { const d = await r.json(); debug.catalogue = d[0]; }
    else { debug.catalogue_err = await r.text(); }
  } catch(e) { debug.catalogue_err = e.message; }

  // Test 4: products/v1
  try {
    const r = await fetch(`https://apis.vinmonopolet.no/products/v1/details-normal?productShortNameContains=${encodeURIComponent(q)}&maxResults=1`, { headers });
    debug.v1_status = r.status;
    if (r.ok) { const d = await r.json(); debug.v1 = d[0]; }
    else { debug.v1_err = await r.text(); }
  } catch(e) { debug.v1_err = e.message; }

  res.status(200).json({ debug });
}
