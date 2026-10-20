export const metadata = { title: 'About · Garage Sale' };
const STEPS = [['📸', 'Snap', 'Take one photo.'], ['✅', 'Approve', 'Check the listing.'], ['💸', 'Sold', 'Buyers message you.']];
export default function About() {
  return <main className="ab">
    <section className="wrap abhero"><h1>Snap it.<br /><span>Grok Bot sells it.</span></h1></section>
    <section className="wrap absteps">{STEPS.map(([ic, t, p], i) => <div key={t} className="abstep"><i aria-hidden="true">{ic}</i><b>{t}</b><p>{p}</p></div>)}</section>
    <section className="wrap abfoot">
      <p className="abbuilt">Built in 2.5 hours with Grok Bot at the <a href="https://luma.com/x0qss5av?tk=Mdaf1N" target="_blank" rel="noreferrer">Grok Bot Hackathon</a>.</p>
      <div className="abteam"><a href="https://adampang.com" target="_blank" rel="noreferrer">Adam Pang</a><span>Pranav</span><span>Isaac</span></div>
      <a className="pill blue big abgh" href="https://github.com/adamtpang/grokbothackathon" target="_blank" rel="noreferrer">View on GitHub</a>
    </section>
  </main>;
}
