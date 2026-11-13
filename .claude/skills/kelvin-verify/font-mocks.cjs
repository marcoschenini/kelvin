// Offline mock for next/font/google (sandbox blocks fonts.googleapis.com).
const css = (fam) => `@font-face { font-family: '${fam}'; font-style: normal; font-weight: 100 900; font-display: swap; src: url(https://fonts.gstatic.com/s/mock/${fam}.woff2) format('woff2'); }`;
module.exports = new Proxy({}, { get: (_, url) => { const m = /family=([^:&]+)/.exec(String(url)); return css(m ? decodeURIComponent(m[1]).replace(/\+/g, ' ') : 'Mock'); } });
