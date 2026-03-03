export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { q = '' } = req.query;
  if (!q) return res.status(400).json({ error: 'Mangler søkeord' });

  const VMP_KEY = process.env.VMP_API_KEY;
  const debug = {};

  // --- Vinmonopolet ---
  debug.vmp_key_present = !!VMP_KEY;
  try {
    const url = `https://apis.vinmonopolet.no/products/v0/details-normal?productShortNameContains=${encodeURIComponent(q)}&maxResults=5`;
    const r = await fetch(url, { headers: { 'Ocp-Apim-Subscription-Key': VMP_KEY || '' } });
    debug.vmp_status = r.status;
    const text = await r.text();
    debug.vmp_raw = text.slice(0, 300);
  } catch(e) {
    debug.vmp_error = e.message;
  }

  // --- Systembolaget ---
  try {
    const r = await fetch('https://raw.githubusercontent.com/AlexGustafsson/systembolaget-api-data/main/data/assortment.json');
    debug.sb_status = r.status;
    if (r.ok) {
      const data = await r.json();
      debug.sb_total = data.length;
      debug.sb_first = data[0]?.productNameBold;
      const lq = q.toLowerCase();
      const hits = data.filter(p => ((p.productNameBold||'')+' '+(p.productNameThin||'')).toLowerCase().includes(lq));
      debug.sb_hits = hits.length;
      debug.sb_example = hits[0]?.productNameBold;
    } else {
      const text = await r.text();
      debug.sb_error = text.slice(0, 200);
    }
  } catch(e) {
    debug.sb_error = e.message;
  }

  res.status(200).json({ debug });
}
