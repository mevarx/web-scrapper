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

  const [geminiModel, setGeminiModel] = useState('gemini-1.5-flash');
  const [rawCacheTtl, setRawCacheTtl] = useState(21600);
  const [answerCacheTtl, setAnswerCacheTtl] = useState(3600);

  const fetchData = async () => {
    setLoading(true);
    try {
      const settingsRes = await fetch(`${API_BASE}/api/settings`);
      if (!settingsRes.ok) throw new Error('Failed to fetch settings from backend');
      const settingsJson = await settingsRes.json();
      setSettingsData(settingsJson);
      setGeminiModel(settingsJson.gemini_model || 'gemini-1.5-flash');
      setRawCacheTtl(settingsJson.raw_cache_ttl || 21600);
      setAnswerCacheTtl(settingsJson.answer_cache_ttl || 3600);

      const statusRes = await fetch(`${API_BASE}/api/status`);
      if (statusRes.ok) setStatusData(await statusRes.json());

      const limitsRes = await fetch(`${API_BASE}/api/rate-limits`);
      if (limitsRes.ok) setRateLimitData(await limitsRes.json());

      setError(null);
    } catch (err) {
      console.error(err);
      setError('Could not connect to the backend settings service.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

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
      setSuccessMsg('Settings updated successfully (in-memory only; restart to persist).');
      setSettingsData(prev => ({
        ...prev,
        gemini_model: geminiModel,
        raw_cache_ttl: parseInt(rawCacheTtl),
        answer_cache_ttl: parseInt(answerCacheTtl),
      }));
    } catch (err) {
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
      const res = await fetch(`${API_BASE}/api/cache/clear`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to clear cache');
      const data = await res.json();
      setSuccessMsg(`Cache eviction complete — ${data.evicted || 0} rows removed.`);
    } catch (err) {
      setError('Failed to trigger cache eviction.');
    } finally {
      setClearing(false);
    }
  };

  const handleTestConnection = async (sourceName) => {
    setTestingSource(prev => ({ ...prev, [sourceName]: true }));
    setError(null);
    try {
      const statusRes = await fetch(`${API_BASE}/api/status`);
      if (!statusRes.ok) throw new Error('Failed to test connection');
      setStatusData(await statusRes.json());
      const limitsRes = await fetch(`${API_BASE}/api/rate-limits`);
      if (limitsRes.ok) setRateLimitData(await limitsRes.json());
    } catch (err) {
      setError(`Connection test failed for ${getSourceDisplayName(sourceName)}.`);
    } finally {
      setTestingSource(prev => ({ ...prev, [sourceName]: false }));
    }
  };

  const SOURCE_META = {
    stackoverflow: { label: 'Stack Overflow', color: '#F48024' },
    devto:         { label: 'Dev.to',          color: '#7B5EA7' },
    hn:            { label: 'Hacker News',     color: '#FF6600' },
    reddit:        { label: 'Reddit',          color: '#FF4500' },
    medium:        { label: 'Medium',          color: '#00AB6C' },
    twitter:       { label: 'Twitter/X',       color: '#1DA1F2' },
  };

  const getSourceDisplayName = (name) => SOURCE_META[name]?.label || name;

  const getStatusBadge = (sourceName, sourceInfo) => {
    const isConfig = sourceInfo?.configured;
    const isAuth   = statusData[sourceName]?.authenticated;
    if (isConfig && isAuth) return { text: 'Connected',    cls: 'status-badge-connected' };
    if (isConfig)           return { text: 'Auth Failed',  cls: 'status-badge-failed'    };
    return                         { text: 'Disabled',     cls: 'status-badge-disabled'  };
  };

  const changeTab = (tab) => {
    setActiveTab(tab);
    setSuccessMsg(null);
    setError(null);
  };

  return (
    <div className="animate-fade-in" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Head>
        <title>Cited — Settings</title>
        <meta name="description" content="Configure runtime settings and monitor source health for Cited." />
      </Head>

      <div className="ambient-orb ambient-orb-1" />
      <div className="ambient-orb ambient-orb-2" />

      <header className="site-header">
        <div className="site-header-inner">
          <Link href="/" legacyBehavior>
            <a className="logo">Scr<span className="logo-accent">AI</span></a>
          </Link>
          <nav className="nav-links">
            <Link href="/" legacyBehavior><a className="nav-link">Search</a></Link>
            <Link href="/setup" legacyBehavior><a className="nav-link">Setup</a></Link>
            <Link href="/settings" legacyBehavior><a className="nav-link active">Settings</a></Link>
          </nav>
        </div>
      </header>

      <main style={{ flex: 1, position: 'relative', zIndex: 1, paddingBottom: '5rem' }}>
        <div className="container" style={{ paddingTop: '2.5rem' }}>

          {/* Page heading */}
          <div style={{ marginBottom: '2.5rem' }}>
            <h1 className="page-title">Settings <span className="accent">Dashboard</span></h1>
            <p className="page-subtitle">
              Manage runtime variables, scraper rate limits, cache TTLs, and credential health checks.
            </p>
          </div>

          {/* Alerts */}
          {error && (
            <div className="alert alert-error animate-slide-down">
              <span>⚠</span> {error}
            </div>
          )}
          {successMsg && (
            <div className="alert alert-success animate-slide-down">
              <span>✓</span> {successMsg}
            </div>
          )}

          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '6rem 0', gap: '1rem' }}>
              <div className="spinner" style={{ width: '36px', height: '36px' }} />
              <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>Fetching environment status…</p>
            </div>
          ) : (
            <div>
              {/* Tab nav */}
              <div className="tabs-nav">
                {[
                  { key: 'sources', label: 'Sources & Rate Limits' },
                  { key: 'llm',     label: 'LLM & Cache TTL'       },
                  { key: 'cache',   label: 'Cache Actions'          },
                ].map(tab => (
                  <button
                    key={tab.key}
                    className={`tab-btn ${activeTab === tab.key ? 'active' : ''}`}
                    onClick={() => changeTab(tab.key)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Sources Tab */}
              {activeTab === 'sources' && (
                <div className="animate-slide-up">
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                    Live connectivity status and token-bucket rate limiting details for each scraper adapter.
                  </p>
                  <div className="source-grid">
                    {settingsData?.sources && Object.keys(settingsData.sources).map(sourceName => {
                      const sourceInfo = settingsData.sources[sourceName] || {};
                      const badge      = getStatusBadge(sourceName, sourceInfo);
                      const rLimit     = rateLimitData[sourceName] || {};
                      const srcColor   = SOURCE_META[sourceName]?.color || 'var(--accent)';

                      return (
                        <div key={sourceName} className="card" style={{ display: 'flex', flexDirection: 'column' }}>
                          {/* Color stripe */}
                          <div style={{
                            position: 'absolute', top: 0, left: 0, right: 0, height: '3px',
                            background: sourceInfo.configured ? srcColor : 'var(--border)',
                            borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
                          }} />

                          <div style={{ paddingTop: '0.25rem', flex: 1 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                               <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>
                                 {getSourceDisplayName(sourceName)}
                               </h3>
                               <span className={`status-badge ${badge.cls}`}>{badge.text}</span>
                            </div>

                            <div className="rate-limit-table">
                              {[
                                { label: 'Tokens Available', val: rLimit.tokens !== undefined ? Math.floor(rLimit.tokens) : 'N/A' },
                                { label: 'Max Capacity',     val: rLimit.capacity  || 'N/A'                                      },
                                { label: 'Refill Rate',      val: rLimit.fill_rate ? `${rLimit.fill_rate}/s` : 'N/A'             },
                              ].map(row => (
                                <div key={row.label} className="rate-limit-row">
                                  <span>{row.label}</span>
                                  <span className="rate-limit-val">{row.val}</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {sourceInfo.configured && (
                            <button
                              className="btn btn-secondary"
                              style={{ fontSize: '0.75rem', padding: '0.5rem 0', width: '100%' }}
                              onClick={() => handleTestConnection(sourceName)}
                              disabled={testingSource[sourceName]}
                            >
                              {testingSource[sourceName] ? (
                                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                  <span className="spinner" style={{ width: '12px', height: '12px', borderWidth: '2px' }} />
                                  Testing…
                                </span>
                              ) : 'Test Connection'}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* LLM & Cache parameters Tab */}
              {activeTab === 'llm' && (
                <form onSubmit={handleSaveSettings} className="animate-slide-up" style={{ maxWidth: '580px' }}>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '2rem', color: 'var(--text-primary)' }}>
                    Model & Cache Parameters
                  </h3>

                  <div className="form-group">
                    <label className="form-label" htmlFor="gemini-model-select">Gemini Model</label>
                    <select
                      id="gemini-model-select"
                      className="input"
                      value={geminiModel}
                      onChange={e => setGeminiModel(e.target.value)}
                      style={{ backgroundColor: 'var(--surface)', cursor: 'pointer' }}
                    >
                      <option value="gemini-1.5-flash">Gemini 1.5 Flash — Fast & Economical</option>
                      <option value="gemini-1.5-pro">Gemini 1.5 Pro — Thorough Synthesis</option>
                      <option value="gemini-2.0-flash-exp">Gemini 2.0 Flash Experimental</option>
                    </select>
                    <p className="form-hint">Select which model drives the RAG generation step. Requires <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85em' }}>GEMINI_API_KEY</code> in .env.</p>
                  </div>

                  <div className="form-group">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label className="form-label" htmlFor="raw-cache-ttl-slider">Raw Scrapes Cache TTL</label>
                      <span className="slider-val">{(rawCacheTtl / 3600).toFixed(1)} hrs</span>
                    </div>
                    <input
                      id="raw-cache-ttl-slider"
                      type="range" min="3600" max="86400" step="3600"
                      className="slider"
                      value={rawCacheTtl}
                      onChange={e => setRawCacheTtl(parseInt(e.target.value))}
                    />
                    <p className="form-hint">How long raw platform responses are cached before re-scraping.</p>
                  </div>

                  <div className="form-group" style={{ marginBottom: '2rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label className="form-label" htmlFor="answer-cache-ttl-slider">Synthesized Answer Cache TTL</label>
                      <span className="slider-val">{(answerCacheTtl / 60).toFixed(0)} min</span>
                    </div>
                    <input
                      id="answer-cache-ttl-slider"
                      type="range" min="300" max="14400" step="300"
                      className="slider"
                      value={answerCacheTtl}
                      onChange={e => setAnswerCacheTtl(parseInt(e.target.value))}
                    />
                    <p className="form-hint">How long generated answers with citations are cached for identical query hashes.</p>
                  </div>

                  <button type="submit" className="btn btn-primary" disabled={saving} id="save-settings-btn">
                    {saving ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span className="spinner" style={{ width: '14px', height: '14px', borderWidth: '2px' }} />
                        Saving…
                      </span>
                    ) : 'Save Settings'}
                  </button>
                </form>
              )}

              {/* Cache maintenance Tab */}
              {activeTab === 'cache' && (
                <div className="animate-slide-up" style={{ maxWidth: '560px' }}>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.75rem', color: 'var(--text-primary)' }}>
                    Database Maintenance
                  </h3>
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '2rem', lineHeight: 1.7 }}>
                    Cited caches scrapes and synthesized answers locally in an SQLite database to manage API rate limits.
                    Use the eviction trigger below to explicitly remove all rows that exceed their active TTL configurations.
                  </p>

                  <div className="card" style={{ borderStyle: 'dashed', background: 'rgba(229, 115, 115, 0.02)', borderColor: 'rgba(229,115,115,0.15)' }}>
                    <h4 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.4rem', color: 'var(--text-primary)' }}>
                      Evict Expired Rows
                    </h4>
                    <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginBottom: '1.5rem', lineHeight: 1.6 }}>
                      Executes a <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85em', color: 'var(--danger)' }}>DELETE</code> query on all cached items older than the active TTL configurations.
                      This does not affect permanent data.
                    </p>
                    <button
                      className="btn btn-danger"
                      onClick={handleClearCache}
                      disabled={clearing}
                      id="cache-evict-btn"
                    >
                      {clearing ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span className="spinner" style={{ width: '14px', height: '14px', borderWidth: '2px', borderTopColor: 'var(--danger)' }} />
                          Clearing…
                        </span>
                      ) : 'Trigger Eviction'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      <footer className="site-footer">
        <p>Cited Answer Engine © 2026 — Self-hosted · Private by design</p>
      </footer>
    </div>
  );
}
