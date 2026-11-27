
export default function App() {
  return (
    <main className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-icon">D</span>
          <span>Dukaan AI</span>
        </div>

        <span className="language-label">
          हिंदी / English
        </span>
      </header>

      <section className="welcome-section">
        <p className="eyebrow">YOUR BUSINESS ASSISTANT</p>

        <h1>
          Namaste! 👋
          <br />
          Aaj dukaan kaise chal rahi hai?
        </h1>

        <p className="welcome-description">
          Apni dukaan ka hisaab-kitab bas bolkar manage karein.
        </p>
      </section>

      <section className="voice-section">
        <div className="voice-circle">
          <span>🎙️</span>
        </div>

        <h2>Talk to Dukaan AI</h2>

        <p>
          Apni baat boliye. Main aapki madad karunga.
        </p>

        <button className="voice-button" type="button" disabled>
          Voice assistant coming soon
        </button>
      </section>

      <section className="features-section">
        <h2>Manage your business</h2>

        <div className="feature-list">
          <article className="feature-card">
            <span>💰</span>
            <div>
              <h3>Udhaar Management</h3>
              <p>Customer credit aur payments manage karein.</p>
            </div>
          </article>

          <article className="feature-card">
            <span>📊</span>
            <div>
              <h3>Sales Tracking</h3>
              <p>Daily sales aur business records dekhein.</p>
            </div>
          </article>

          <article className="feature-card">
            <span>📦</span>
            <div>
              <h3>Inventory</h3>
              <p>Products aur stock par nazar rakhein.</p>
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}
