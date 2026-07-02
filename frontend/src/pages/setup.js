import Head from 'next/head'
import Link from 'next/link'
import { useState, useEffect } from 'react'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const SOURCE_META = {
  stackoverflow: {
    label: 'Stack Overflow',
    color: '#F48024',
    desc: 'Queries public StackExchange APIs for top developer answers.',
    icon: 'SO',
  },
  devto: {
    label: 'Dev.to',
    color: '#7B5EA7',
    desc: 'Fetches tech articles, tutorials, and community discussions.',
    icon: 'DV',
  },
  hn: {
    label: 'Hacker News',
    color: '#FF6600',
    desc: 'Aggregates stories via Algolia Search + Firebase HN comments.',
    icon: 'HN',
  },
  reddit: {
    label: 'Reddit',
    color: '#FF4500',
    desc: 'Scrapes dev subreddits for discussions and high-scoring comments.',
    icon: 'RE',
  },
  medium: {
    label: 'Medium',
    color: '#00AB6C',
    desc: 'Uses headless Playwright to fetch articles (JavaScript-heavy).',
    icon: 'ME',
  },
  twitter: {
    label: 'Twitter / X',
    color: '#1DA1F2',
    desc: 'Searches developer tweets using X API v2 or Playwright fallback.',
    icon: 'TX',
  },
};

export default function Setup() {
  const [statusReport, setStatusReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [testing, setTesting] = useState(false);

  const checkStatus = async () => {
    setTesting(true);
    try {
      const res = await fetch(`${API_BASE}/api/status`);
      if (!res.ok) throw new Error('Failed to fetch backend configuration status.');
      const data = await res.json();
      setStatusReport(data);
      setError(null);
    } catch (err) {
      console.error(err);
      setError('Could not connect to the Cited backend. Make sure the server is running on port 8000.');
    } finally {
      setLoading(false);
      setTesting(false);
    }
  };

  useEffect(() => { checkStatus(); }, []);

  const getStatusInfo = (configured, authenticated) => {
    if (configured && authenticated) return { text: 'Connected',       cls: 'status-badge-connected', dot: 'var(--success)' };
    if (configured)                  return { text: 'Auth Failed',     cls: 'status-badge-failed',    dot: 'var(--warning)' };
    return                                  { text: 'Not Configured',  cls: 'status-badge-disabled',  dot: 'var(--text-muted)' };
  };

  const sources = statusReport ? Object.entries(statusReport) : [];
  const connected = sources.filter(([, i]) => i.configured && i.authenticated).length;
  const total     = sources.length;

  return (
    <div className="animate-fade-in" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Head>
        <title>Cited — Setup Wizard</title>
        <meta name="description" content="Validate credentials and set up sources for Cited." />
      </Head>

      <div className="ambient-orb ambient-orb-1" />
      <div className="ambient-orb ambient-orb-2" />

      {/* Header */}
      <header className="site-header">
        <div className="site-header-inner">
          <Link href="/" legacyBehavior>
            <a className="logo">Scr<span className="logo-accent">AI</span></a>
          </Link>
          <nav className="nav-links">
            <Link href="/" legacyBehavior><a className="nav-link">Search</a></Link>
            <Link href="/setup" legacyBehavior><a className="nav-link active">Setup</a></Link>
            <Link href="/settings" legacyBehavior><a className="nav-link">Settings</a></Link>
          </nav>
        </div>
      </header>

      <main style={{ flex: 1, position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem 1.5rem' }}>
        <div style={{ maxWidth: '700px', width: '100%' }}>

          {/* Centered wordmark */}
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <h1 className="logo" style={{ fontSize: '2.8rem', justifyContent: 'center', marginBottom: '0.6rem', letterSpacing: '0.22em' }}>
              Scr<span className="logo-accent">AI</span>
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.2em', fontWeight: 500 }}>
              System Setup & Connection Wizard
            </p>
          </div>

          {/* Summary pill (if loaded) */}
          {statusReport && !loading && !error && (
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.75rem' }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.6rem',
                padding: '0.45rem 1.1rem',
                borderRadius: 'var(--radius-pill)',
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)',
              }}>
                <span style={{
                  width: '8px', height: '8px', borderRadius: '50%',
                  background: connected > 0 ? 'var(--success)' : 'var(--danger)',
                  boxShadow: connected > 0 ? '0 0 6px var(--success)' : '0 0 6px var(--danger)',
                }} />
                {connected} of {total} sources connected
              </div>
            </div>
          )}

          <div className="card" style={{ padding: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border)' }}>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Source Verification
              </h2>
              {!loading && !error && (
                <button
                  className="btn btn-secondary"
                  onClick={checkStatus}
                  disabled={testing}
                  style={{ fontSize: '0.72rem', padding: '0.4rem 0.9rem' }}
                  id="retest-btn"
                >
                  {testing ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span className="spinner" style={{ width: '12px', height: '12px', borderWidth: '2px' }} />
                      Testing
                    </span>
                  ) : '↻ Retest All'}
                </button>
              )}
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.5rem', lineHeight: 1.6 }}>
              Configure API keys in your{' '}
              <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85em', color: 'var(--accent)' }}>.env</code>{' '}
              file. Below is the live connectivity status of each source adapter:
            </p>

            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '3rem 0', gap: '1rem' }}>
                <div className="spinner" style={{ width: '36px', height: '36px' }} />
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Querying backend configuration…</p>
              </div>
            ) : error ? (
              <div>
                <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
                  <span>⚠</span> {error}
                </div>
                <button className="btn btn-secondary" onClick={checkStatus} style={{ fontSize: '0.8rem' }}>
                  Retry Connection
                </button>
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', marginBottom: '2rem' }}>
                  {statusReport && Object.entries(statusReport).map(([source, info]) => {
                    const meta   = SOURCE_META[source] || { label: source, color: 'var(--accent)', desc: '', icon: '?' };
                    const status = getStatusInfo(info.configured, info.authenticated);
                    return (
                      <div key={source} className="setup-source-row">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                          {/* Source icon */}
                          <div style={{
                            width: '36px', height: '36px', borderRadius: 'var(--radius-sm)',
                            background: info.configured ? `${meta.color}18` : 'rgba(246,233,199,0.04)',
                            border: `1px solid ${info.configured ? `${meta.color}40` : 'var(--border)'}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '0.6rem', fontWeight: 800, color: info.configured ? meta.color : 'var(--text-muted)',
                            fontFamily: 'var(--font-mono)', flexShrink: 0,
                          }}>
                            {meta.icon}
                          </div>
                          <div>
                            <p style={{ fontSize: '0.92rem', fontWeight: 700, marginBottom: '0.1rem', color: 'var(--text-primary)' }}>
                              {meta.label}
                            </p>
                            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                              {meta.desc}
                            </p>
                          </div>
                        </div>
                        <span className={`status-badge ${status.cls}`} style={{ flexShrink: 0, marginLeft: '1rem' }}>
                          {status.text}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                  <Link href="/" legacyBehavior>
                    <a className="btn btn-primary" id="proceed-btn">
                      Proceed to Search →
                    </a>
                  </Link>
                </div>
              </div>
            )}
          </div>

          <p style={{ textAlign: 'center', marginTop: '1.25rem', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
            Using credentials stored in local environment files. Data privacy guaranteed by design.
          </p>
        </div>
      </main>

      <footer className="site-footer">
        <p>Cited Answer Engine © 2026 — Self-hosted · Private by design</p>
      </footer>
    </div>
  );
}
