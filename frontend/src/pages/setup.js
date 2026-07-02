import Head from 'next/head'
import Link from 'next/link'
import { useState, useEffect } from 'react'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

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
      setError('Could not connect to the Cited backend. Make sure the container/server is running on port 8000.');
    } finally {
      setLoading(false);
      setTesting(false);
    }
  };

  useEffect(() => {
    checkStatus();
  }, []);

  const getSourceDisplayName = (name) => {
    const names = {
      stackoverflow: 'Stack Overflow',
      devto: 'Dev.to',
      hn: 'Hacker News',
      reddit: 'Reddit',
      medium: 'Medium',
      twitter: 'Twitter/X'
    };
    return names[name] || name;
  };

  const getSourceDescription = (name) => {
    const descriptions = {
      stackoverflow: 'Queries public StackExchange APIs for top developer answers.',
      devto: 'Fetches tech articles, developer tutorials, and community discussions.',
      hn: 'Aggregates stories from Hacker News using Algolia Search + Firebase.',
      reddit: 'Scrapes subreddits for developer discussions and high-scoring comments.',
      medium: 'Uses headless Playwright script to fetch articles (JavaScript heavy).',
      twitter: 'Searches developer tweets using X API v2 or Playwright fallback.'
    };
    return descriptions[name] || '';
  };

  return (
    <div className="animate-fade-in" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Head>
        <title>Cited — Setup Wizard</title>
        <meta name="description" content="Validate credentials and setup sources for Cited." />
      </Head>

      <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem' }}>
        <div style={{ maxWidth: '720px', width: '100%' }}>
          
          <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            <h1 className="logo" style={{ fontSize: '3rem', justifyContent: 'center', marginBottom: '0.5rem' }}>
              Scr<span>AI</span>
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              System Setup & Connection Wizard
            </p>
          </div>

          <div className="card" style={{ padding: '2rem' }}>
            <h2 style={{ fontSize: '1.4rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-cream)', paddingBottom: '0.75rem', color: 'var(--accent)' }}>
              Source Verification
            </h2>
            <p style={{ fontSize: '0.95rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
              Cited integrates multiple developer-relevant sources in parallel. Configure API keys in your <code>.env</code> file. Below is the active status of each source adapter:
            </p>

            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '3rem 0', gap: '1rem' }}>
                <div className="spinner" style={{ width: '40px', height: '40px' }}></div>
                <p style={{ color: 'var(--text-muted)' }}>Querying backend configurations...</p>
              </div>
            ) : error ? (
              <div style={{ borderLeft: '3px solid var(--danger)', padding: '1rem', backgroundColor: 'rgba(229, 115, 115, 0.05)', borderRadius: '4px', marginBottom: '1.5rem' }}>
                <p style={{ color: 'var(--danger)', fontSize: '0.95rem', fontWeight: 500 }}>{error}</p>
                <button className="btn btn-secondary" onClick={checkStatus} style={{ marginTop: '1rem', fontSize: '0.8rem', padding: '0.5rem 1rem' }}>
                  Retry Connection
                </button>
              </div>
            ) : (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem', marginBottom: '2rem' }}>
                  {statusReport && Object.entries(statusReport).map(([source, info]) => {
                    const { configured, authenticated } = info;
                    
                    let statusLabel = 'Not Configured';
                    let statusColor = 'var(--text-muted)';
                    let statusBg = 'rgba(246, 233, 199, 0.05)';
                    let statusBorder = 'rgba(246, 233, 199, 0.1)';

                    if (configured && authenticated) {
                      statusLabel = 'Connected';
                      statusColor = 'var(--success)';
                      statusBg = 'rgba(129, 199, 132, 0.05)';
                      statusBorder = 'rgba(129, 199, 132, 0.2)';
                    } else if (configured && !authenticated) {
                      statusLabel = 'Auth Failed';
                      statusColor = 'var(--warning)';
                      statusBg = 'rgba(255, 183, 77, 0.05)';
                      statusBorder = 'rgba(255, 183, 77, 0.2)';
                    }

                    return (
                      <div key={source} style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '1rem',
                        background: 'rgba(246, 233, 199, 0.02)',
                        border: '1px solid var(--border-cream)',
                        borderRadius: '8px',
                        transition: 'border-color 0.2s'
                      }}>
                        <div>
                          <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '0.2rem' }}>
                            {getSourceDisplayName(source)}
                          </h3>
                          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            {getSourceDescription(source)}
                          </p>
                        </div>
                        <div style={{
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          padding: '0.4rem 0.8rem',
                          borderRadius: '4px',
                          color: statusColor,
                          backgroundColor: statusBg,
                          border: `1px solid ${statusBorder}`,
                          whiteSpace: 'nowrap'
                        }}>
                          {statusLabel}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                  <button 
                    className="btn btn-secondary" 
                    onClick={checkStatus} 
                    disabled={testing}
                  >
                    {testing ? 'Testing...' : 'Test Connection'}
                  </button>
                  <Link href="/" legacyBehavior>
                    <a className="btn btn-primary">
                      Proceed to Search
                    </a>
                  </Link>
                </div>
              </div>
            )}
          </div>
          
          <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Using custom API credentials stored in local environments. Data privacy guaranteed by design.
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}

