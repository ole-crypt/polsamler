export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { q = '' } = req.query;
  if (!q) return res.status(400).json({ error: 'Mangler søkeord' });

  const VMP_KEY = process.env.VMP_API_KEY;

  const url = `https://apis.vinmonopolet.no/products/v0/details-normal?productShortNameContains=${encodeURIComponent(q)}&maxResults=2`;
  const r = await fetch(url, { headers: { 'Ocp-Apim-Subscription-Key': VMP_KEY || '' } });
  const data = await r.json();

  // Returner første produkt helt rådt så vi ser alle feltene
  res.status(200).json({ first_product: data[0], keys: Object.keys(data[0] || {}) });
}
