export const metadata = { title: 'About · Garage Sale' };
export default function About() {
  return <main>
      <section className="sec"><div className="wrap">
        <h2>How it works</h2>
        <div className="steps">
          <div className="card"><div className="n">1</div><h4>Identify</h4><p>What is it?</p></div>
          <div className="card"><div className="n">2</div><h4>Price</h4><p>What is it worth?</p></div>
          <div className="card"><div className="n">3</div><h4>Write</h4><p>Title, price, details.</p></div>
          <div className="card"><div className="n">4</div><h4>Approve</h4><p>You say yes.</p></div>
          <div className="card"><div className="n">5</div><h4>Live</h4><p>On Marketplace.</p></div>
        </div>
        <div className="steps" style={{ marginTop: 14 }}>
          <div className="card"><span className="tag">Buy</span><h4>Scouts find deals</h4><p>Cheap finds near you.</p></div>
        </div>
        <div className="about">
          <h3>About</h3>
          <p className="aboutline">Snap it. Grok Bot sells it.</p>
          <div className="feats">
            <div className="card"><h4>Photo to listing</h4></div>
            <div className="card"><h4>Honest item ID</h4></div>
            <div className="card"><h4>Real prices</h4></div>
            <div className="card"><h4>24/7 deal scout</h4></div>
            <div className="card"><h4>Profit dashboard</h4></div>
            <div className="card"><h4>Buyer replies drafted</h4></div>
            <div className="card"><h4>You approve everything</h4></div>
          </div>
          <div className="card credits">
            <p><b>Built in 2.5 hours with Grok Bot.</b></p>
            <p><b>Built at</b> <a href="https://luma.com/x0qss5av?tk=Mdaf1N" target="_blank" rel="noreferrer">Grok Bot Hackathon</a>, Austin, TX, Oct 19, 2026</p>
            <p><b>Team</b> <a href="https://adampang.com" target="_blank" rel="noreferrer">Adam Pang</a> (<a href="https://github.com/adamtpang" target="_blank" rel="noreferrer">GitHub</a>), Pranav, Isaac</p>
            <p><b>Code</b> <a href="https://github.com/adamtpang/grokbothackathon" target="_blank" rel="noreferrer">github.com/adamtpang/grokbothackathon</a></p>
          </div>
        </div>
      </div></section>
  </main>;
}
