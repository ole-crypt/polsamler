export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const key = process.env.VMP_API_KEY || '';
  const headers = { 'Ocp-Apim-Subscription-Key': key };

  // Hent ett produkt med kjent ID og se ALLE feltene
  try {
    const r = await fetch('https://apis.vinmonopolet.no/products/v0/details-normal?productId=1855202', { headers });
    const data = await r.json();
    // Vis hele objektet rått
    res.status(200).json({ full_object: data[0] });
  } catch(e) {
    res.status(200).json({ error: e.message });
  }
}
