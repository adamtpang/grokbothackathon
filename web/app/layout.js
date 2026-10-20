import './globals.css';
export const metadata = {
  title: 'Garage Sale Town · AI agents that buy and sell on Marketplace',
  description: 'Snap a photo to sell, or tell us what you want to buy. Grok Bot agents research real prices, write the listing, and find under-market deals on Facebook Marketplace.',
  icons: { icon: [{ url: '/favicon.ico', sizes: 'any' }, { url: '/icon.svg', type: 'image/svg+xml' }], apple: '/apple-touch-icon.png' },
};
export const viewport = { themeColor: '#000000', width: 'device-width', initialScale: 1, viewportFit: 'cover' };
export default function RootLayout({ children }) {
  return (
    <html lang="en"><body>
      <nav className="nav"><div className="wrap navin">
        <a href="/" className="brand"><span className="logo">S</span>Garage Sale Town</a>
        <div className="navlinks"><a href="/#sell">Sell</a><a href="/#buy">Buy</a><a href="/#how">How it works</a></div>
      </div></nav>
      {children}
      <footer className="foot"><div className="wrap footin">
        <span>Built with Grok Bot · Austin · Oct 2026</span>
        <a href="https://github.com/adamtpang/grokbothackathon" target="_blank" rel="noopener">GitHub</a>
      </div></footer>
    </body></html>
  );
}
