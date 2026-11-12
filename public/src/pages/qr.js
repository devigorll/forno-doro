import QRCode from 'https://esm.sh/qrcode@1.5.3';
const $ = s => document.querySelector(s);
$('#base').value = location.origin;
async function gen() {
  const base = $('#base').value.replace(/\/$/, ''), n = Math.min(60, Math.max(1, +$('#n').value || 1));
  $('#grid').innerHTML = '';
  for (let i = 1; i <= n; i++) {
    const code = String(i).padStart(2, '0'), url = `${base}/?mesa=${code}`;
    const img = await QRCode.toDataURL(url, { width: 320, margin: 1 });
    $('#grid').insertAdjacentHTML('beforeend', `<figure><img src="${img}" alt="QR Mesa ${code}"><figcaption><b>Mesa ${code}</b><small>${url}</small></figcaption></figure>`);
  }
}
$('#go').onclick = gen; gen();
