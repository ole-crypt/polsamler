export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const debug = {};

  // Test Systembolaget JSON
  try {
    const r = await fetch('https://cdn.jsdelivr.net/gh/AlexGustafsson/systembolaget-api-data@main/data/assortment.json', {
      signal: AbortSignal.timeout(8000)
    });
    debug.sb_status = r.status;
    if (r.ok) {
      const data = await r.json();
      debug.sb_count = data.length;
      debug.sb_sample = data.find(p => (p.productNameBold||'').toLowerCase().includes('mack'));
    }
  } catch(e) {
    debug.sb_error = e.message;
  }

  res.status(200).json(debug);
}
