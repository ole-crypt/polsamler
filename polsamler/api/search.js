export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { q = 'mack' } = req.query;
  const debug = {};

  const tests = [
    {
      label: 'sb_api_extern',
      url: `https://api-extern.systembolaget.se/sb-api-ecommerce/v1/productsearch/search?q=${encodeURIComponent(q)}&size=5`,
      headers: { 'Accept': 'application/json', 'Ocp-Apim-Subscription-Key': '7f5a6b8d3e2c4a1f9b0d8e7c6a5f4e3d', 'Origin': 'https://www.systembolaget.se', 'Referer': 'https://www.systembolaget.se/', 'User-Agent': 'Mozilla/5.0' },
    },
    {
      label: 'sb_www_api',
      url: `https://www.systembolaget.se/api/productsearch/search?q=${encodeURIComponent(q)}&size=5`,
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.systembolaget.se/' },
    },
    {
      label: 'sb_www_nextjs',
      url: `https://www.systembolaget.se/_next/data/search?q=${encodeURIComponent(q)}`,
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.systembolaget.se/' },
    },
  ];

  for (const t of tests) {
    try {
      const r = await fetch(t.url, { headers: t.headers, signal: AbortSignal.timeout(8000) });
      debug[t.label] = { status: r.status, preview: (await r.text()).slice(0, 300) };
    } catch(e) {
      debug[t.label] = { error: e.message };
    }
  }

  res.status(200).json(debug);
}
