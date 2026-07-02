import Head from 'next/head'
import Link from 'next/link'
import { useState, useEffect } from 'react'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function Settings() {
  const [activeTab, setActiveTab] = useState('sources');
  const [settingsData, setSettingsData] = useState(null);
  const [statusData, setStatusData] = useState({});
  const [rateLimitData, setRateLimitData] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [testingSource, setTestingSource] = useState({});
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Form states
  const [geminiModel, setGeminiModel] = useState('gemini-1.5-flash');
  const [rawCacheTtl, setRawCacheTtl] = useState(21600);
  const [answerCacheTtl, setAnswerCacheTtl] = useState(3600);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch current settings
      const settingsRes = await fetch(`${API_BASE}/api/settings`);
      if (!settingsRes.ok) throw new Error('Failed to fetch settings from backend');
      const settingsJson = await settingsRes.json();
      setSettingsData(settingsJson);
      setGeminiModel(settingsJson.gemini_model || 'gemini-1.5-flash');
      setRawCacheTtl(settingsJson.raw_cache_ttl || 21600);
      setAnswerCacheTtl(settingsJson.answer_cache_ttl || 3600);

      // 2. Fetch source status
      const statusRes = await fetch(`${API_BASE}/api/status`);
      if (statusRes.ok) {
        const statusJson = await statusRes.json();
        setStatusData(statusJson);
      }

      // 3. Fetch rate limits
      const limitsRes = await fetch(`${API_BASE}/api/rate-limits`);
      if (limitsRes.ok) {
        const limitsJson = await limitsRes.json();
        setRateLimitData(limitsJson);
      }

      setError(null);
    } catch (err) {
      console.error(err);
      setError('Could not connect to the backend settings service.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSuccessMsg(null);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/api/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gemini_model: geminiModel,
          raw_cache_ttl: parseInt(rawCacheTtl),
          answer_cache_ttl: parseInt(answerCacheTtl),
        }),
      });

      if (!res.ok) throw new Error('Failed to save settings');
      const data = await res.json();
      setSuccessMsg('Settings updated successfully (in-memory only).');
      
      // Update local state config
      setSettingsData(prev => ({
        ...prev,
        gemini_model: geminiModel,
        raw_cache_ttl: parseInt(rawCacheTtl),
        answer_cache_ttl: parseInt(answerCacheTtl),
      }));
    } catch (err) {
      console.error(err);
      setError('Failed to save settings to the backend.');
    } finally {
      setSaving(false);
    }
  };

  const handleClearCache = async () => {
    setClearing(true);
    setSuccessMsg(null);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/api/cache/clear`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to clear cache');
      const data = await res.json();
      setSuccessMsg(`Expired cache records cleared successfully. Evicted ${data.evicted || 0} rows.`);
    } catch (err) {
      console.error(err);
      setError('Failed to trigger cache eviction.');
    } finally {
      setClearing(false);
    }
  };

  const handleTestConnection = async (sourceName) => {
    setTestingSource(prev => ({ ...prev, [sourceName]: true }));
    setError(null);
    try {
      // Re-fetch only status to check connection
      const statusRes = await fetch(`${API_BASE}/api/status`);
      if (!statusRes.ok) throw new Error('Failed to test connection');
      const statusJson = await statusRes.json();
      setStatusData(statusJson);
      
      // Also fetch rate limits to update them
      const limitsRes = await fetch(`${API_BASE}/api/rate-limits`);
      if (limitsRes.ok) {
        const limitsJson = await limitsRes.json();
        setRateLimitData(limitsJson);
      }
    } catch (err) {
      console.error(err);
      setError(`Error running connection test for ${sourceName}.`);
    } finally {
      setTestingSource(prev => ({ ...prev, [sourceName]: false }));
    }
  };

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

  return (
    <div className="animate-fade-in" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Head>
        <title>Cited — Settings</title>
        <meta name="description" content="Configure settings and monitor source health for Cited." />
      </Head>

      {/* Main header */}
      <header className="header" style={{ maxWidth: '1100px', width: '100%', margin: '0 auto', padding: '1.5rem' }}>
        <Link href="/" legacyBehavior>
          <a className="logo">Scr<span>AI</span></a>
        </Link>
        <nav className="nav-links">
          <Link href="/" legacyBehavior>
            <a className="nav-link">Search</a>
          </Link>
          <Link href="/setup" legacyBehavior>
            <a className="nav-link">Setup</a>
          </Link>
          <Link href="/settings" legacyBehavior>
            <a className="nav-link active">Settings</a>
          </Link>
        </nav>
      </header>

      <main className="container" style={{ flex: 1, paddingBottom: '4rem' }}>
        <div style={{ marginBottom: '2.5rem' }}>
          <h1 style={{ fontSize: '2.5rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--accent)' }}>Settings Dashboard</h1>
          <p style={{ color: 'var(--text-muted)' }}>Manage runtime variables, scrape rate limits, cache TTLs, and check credentials.</p>
        </div>

        {/* Status Alerts */}
        {error && (
          <div style={{ borderLeft: '3px solid var(--danger)', padding: '1rem', backgroundColor: 'rgba(229, 115, 115, 0.05)', borderRadius: '4px', marginBottom: '1.5rem' }}>
            <p style={{ color: 'var(--danger)', fontSize: '0.95rem', fontWeight: 500 }}>{error}</p>
          </div>
        )}
        {successMsg && (
          <div style={{ borderLeft: '3px solid var(--success)', padding: '1rem', backgroundColor: 'rgba(129, 199, 132, 0.05)', borderRadius: '4px', marginBottom: '1.5rem' }}>
            <p style={{ color: 'var(--success)', fontSize: '0.95rem', fontWeight: 500 }}>{successMsg}</p>
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '5rem 0', gap: '1rem' }}>
            <div className="spinner" style={{ width: '40px', height: '40px' }}></div>
            <p style={{ color: 'var(--text-muted)' }}>Fetching environment status...</p>
          </div>
        ) : (
          <div>
            {/* Tabs navigation */}
            <div className="tabs-nav">
              <button 
                className={`tab-btn ${activeTab === 'sources' ? 'active' : ''}`}
                onClick={() => { setActiveTab('sources'); setSuccessMsg(null); }}
              >
                Sources & Rate Limits
              </button>
              <button 
                className={`tab-btn ${activeTab === 'llm' ? 'active' : ''}`}
                onClick={() => { setActiveTab('llm'); setSuccessMsg(null); }}
              >
                LLM & Cache TTL
              </button>
              <button 
                className={`tab-btn ${activeTab === 'cache' ? 'active' : ''}`}
                onClick={() => { setActiveTab('cache'); setSuccessMsg(null); }}
              >
                Cache Actions
              </button>
            </div>

            {/* Tab Pane 1: Sources */}
            {activeTab === 'sources' && (
              <div className="animate-slide-up">
                <p style={{ fontSize: '0.95rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                  The active connectivity status and local token bucket rate limiting details for each scraper adapter.
                </p>
                <div className="source-grid">
                  {settingsData && settingsData.sources && Object.keys(settingsData.sources).map(sourceName => {
                    const sourceInfo = settingsData.sources[sourceName] || {};
                    const isConfig = sourceInfo.configured;
                    const isAuth = statusData[sourceName]?.authenticated;
                    const rLimit = rateLimitData[sourceName] || {};

                    let badgeText = 'Disabled';
                    let badgeColor = 'var(--text-muted)';
                    let badgeBg = 'rgba(246, 233, 199, 0.05)';
                    let badgeBorder = 'rgba(246, 233, 199, 0.1)';

                    if (isConfig && isAuth) {
                      badgeText = 'Connected';
                      badgeColor = 'var(--success)';
                      badgeBg = 'rgba(129, 199, 132, 0.05)';
                      badgeBorder = 'rgba(129, 199, 132, 0.2)';
                    } else if (isConfig) {
                      badgeText = 'Auth Failed';
                      badgeColor = 'var(--warning)';
                      badgeBg = 'rgba(255, 183, 77, 0.05)';
                      badgeBorder = 'rgba(255, 183, 77, 0.2)';
                    }

                    return (
                      <div key={sourceName} className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h3 style={{ fontSize: '1.2rem', fontWeight: 600 }}>{getSourceDisplayName(sourceName)}</h3>
                            <span style={{
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              padding: '0.3rem 0.6rem',
                              borderRadius: '4px',
                              color: badgeColor,
                              backgroundColor: badgeBg,
                              border: `1px solid ${badgeBorder}`
                            }}>
                              {badgeText}
                            </span>
                          </div>

                          {/* Rate limits block */}
                          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.5rem', padding: '0.75rem', backgroundColor: 'rgba(246, 233, 199, 0.02)', borderRadius: '6px', border: '1px solid rgba(246, 233, 199, 0.05)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                              <span>Tokens Available:</span>
                              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                {rLimit.tokens !== undefined ? Math.floor(rLimit.tokens) : 'N/A'}
                              </span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                              <span>Max Capacity:</span>
                              <span style={{ color: 'var(--text-primary)' }}>{rLimit.capacity || 'N/A'}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span>Refill Rate:</span>
                              <span style={{ color: 'var(--text-primary)' }}>{rLimit.fill_rate ? `${rLimit.fill_rate}/sec` : 'N/A'}</span>
                            </div>
                          </div>
                        </div>

                        {isConfig && (
                          <button 
                            className="btn btn-secondary" 
                            style={{ width: '100%', fontSize: '0.8rem', padding: '0.5rem' }}
                            onClick={() => handleTestConnection(sourceName)}
                            disabled={testingSource[sourceName]}
                          >
                            {testingSource[sourceName] ? 'Testing...' : 'Test Connection'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Tab Pane 2: LLM Config */}
            {activeTab === 'llm' && (
              <form onSubmit={handleSaveSettings} className="animate-slide-up" style={{ maxWidth: '600px' }}>
                <h3 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', color: 'var(--accent)' }}>Model & Cache Parameters</h3>
                
                <div className="form-group">
                  <label className="form-label" htmlFor="gemini-model-select">Gemini Model Selector</label>
                  <select 
                    id="gemini-model-select"
                    className="input" 
                    value={geminiModel} 
                    onChange={(e) => setGeminiModel(e.target.value)}
                    style={{ backgroundColor: 'var(--surface)', cursor: 'pointer' }}
                  >
                    <option value="gemini-1.5-flash">Gemini 1.5 Flash (Default - Fast & Economic)</option>
                    <option value="gemini-1.5-pro">Gemini 1.5 Pro (Thorough Synthesis)</option>
                    <option value="gemini-2.0-flash-exp">Gemini 2.0 Flash Experimental</option>
                  </select>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.3rem', display: 'block' }}>
                    Select which model to trigger for Retrieval Augmented Generation. Requires Gemini API Key in .env.
                  </span>
                </div>

                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label className="form-label" htmlFor="raw-cache-ttl-slider">Raw Scrapes Cache TTL</label>
                    <span className="slider-val">{(rawCacheTtl / 3600).toFixed(1)} Hours</span>
                  </div>
                  <input 
                    id="raw-cache-ttl-slider"
                    type="range" 
                    min="3600" 
                    max="86400" 
                    step="3600"
                    className="slider"
                    value={rawCacheTtl} 
                    onChange={(e) => setRawCacheTtl(parseInt(e.target.value))}
                  />
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block' }}>
                    How long raw scrape outputs are cached before requesting clean queries from Stack Overflow, Reddit, HN, etc.
                  </span>
                </div>

                <div className="form-group" style={{ marginBottom: '2.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label className="form-label" htmlFor="answer-cache-ttl-slider">Synthesized Answer Cache TTL</label>
                    <span className="slider-val">{(answerCacheTtl / 60).toFixed(0)} Minutes</span>
                  </div>
                  <input 
                    id="answer-cache-ttl-slider"
                    type="range" 
                    min="300" 
                    max="14400" 
                    step="300"
                    className="slider"
                    value={answerCacheTtl} 
                    onChange={(e) => setAnswerCacheTtl(parseInt(e.target.value))}
                  />
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block' }}>
                    How long final generated responses with citations remain cached for instant retrieval on equivalent query hashes.
                  </span>
                </div>

                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving Config...' : 'Save Settings'}
                </button>
              </form>
            )}

            {/* Tab Pane 3: Cache Management */}
            {activeTab === 'cache' && (
              <div className="animate-slide-up" style={{ maxWidth: '600px' }}>
                <h3 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: 'var(--accent)' }}>Database Maintenance</h3>
                <p style={{ fontSize: '0.95rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                  Cited caches scrapes and synthesis locally inside an SQLite database to avoid API rate limiting issues.
                  Use the trigger below to explicitly evict all rows that exceed their respective configuration TTL limits.
                </p>

                <div className="card" style={{ padding: '1.5rem', backgroundColor: 'rgba(216, 185, 120, 0.02)', borderStyle: 'dashed' }}>
                  <h4 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>Evict Expired Rows</h4>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                    This calls the backend eviction routine. It executes a DELETE query for all cached items older than the active TTL configurations.
                  </p>
                  <button 
                    className="btn btn-primary" 
                    onClick={handleClearCache}
                    disabled={clearing}
                    style={{ backgroundColor: 'var(--danger)', color: '#000000' }}
                  >
                    {clearing ? 'Clearing...' : 'Trigger Eviction'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid var(--border-cream)', padding: '1.5rem 0', textAlign: 'center', marginTop: 'auto' }}>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          Cited Answer Engine © 2026. Self-hosted database running locally.
        </p>
      </footer>
    </div>
  )
}
