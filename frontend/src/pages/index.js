import Head from 'next/head'
import Link from 'next/link'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import dynamic from 'next/dynamic'

const DarkVeil = dynamic(() => import('../components/DarkVeil'), { ssr: false });

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function Home() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [sourceConfig, setSourceConfig] = useState({});
  const [selectedSources, setSelectedSources] = useState([]);
  const [highlightedCitation, setHighlightedCitation] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [copyFeedback, setCopyFeedback] = useState({});
  const inputRef = useRef(null);
  const router = useRouter();

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/settings`);
        if (res.ok) {
          const data = await res.json();
          const configs = {};
          const enabled = [];
          if (data.sources) {
            Object.entries(data.sources).forEach(([name, info]) => {
              configs[name] = info.configured;
              if (info.configured) enabled.push(name);
            });
          }
          setSourceConfig(configs);
          setSelectedSources(enabled);
        }
      } catch (err) {
        console.error('Failed to load scraper configurations:', err);
      }
    };
    fetchConfig();
  }, []);

  const handleToggleSource = (sourceName) => {
    if (!sourceConfig[sourceName]) return;
    setSelectedSources(prev =>
      prev.includes(sourceName)
        ? prev.filter(s => s !== sourceName)
        : [...prev, sourceName]
    );
  };

  const handleSearchSubmit = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setHighlightedCitation(null);
    setDrawerOpen(false);

    const steps = [
      'Initializing parallel request workers...',
      'Scraping developer platforms in parallel...',
      'Filtering noise and duplicate threads...',
      'Applying quality scores and recency decay...',
      'Ingesting top-8 chunks into Gemini model...',
      'Validating inline citation indices...',
    ];
    let stepIdx = 0;
    setLoadingStep(steps[0]);
    const stepInterval = setInterval(() => {
      if (stepIdx < steps.length - 1) {
        stepIdx++;
        setLoadingStep(steps[stepIdx]);
      }
    }, 1800);

    try {
      const res = await fetch(`${API_BASE}/api/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim(), sources: selectedSources }),
      });
      clearInterval(stepInterval);
      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.detail || 'Search query failed');
      }
      const data = await res.json();
      setResult(data);
    } catch (err) {
      console.error(err);
      setError(err.message || 'An error occurred while connecting to the RAG backend.');
      clearInterval(stepInterval);
    } finally {
      setLoading(false);
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
  const getSourceBadgeColor  = (name) => SOURCE_META[name]?.color || 'var(--accent)';

  const copyToClipboard = async (code, key) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopyFeedback(prev => ({ ...prev, [key]: true }));
      setTimeout(() => setCopyFeedback(prev => ({ ...prev, [key]: false })), 2000);
    } catch {}
  };

  const renderAnswerText = (text, citations) => {
    if (!text) return null;
    const parts = [];
    const codeRegex = /```([\s\S]*?)```/g;
    let lastIndex = 0;
    let match;
    let codeIdx = 0;

    while ((match = codeRegex.exec(text)) !== null) {
      if (lastIndex < match.index) parts.push({ type: 'text', content: text.substring(lastIndex, match.index) });
      parts.push({ type: 'code', content: match[1], key: `code-${codeIdx++}` });
      lastIndex = codeRegex.lastIndex;
    }
    if (lastIndex < text.length) parts.push({ type: 'text', content: text.substring(lastIndex) });

    return parts.map((part) => {
      if (part.type === 'code') {
        const nlIdx = part.content.indexOf('\n');
        let lang = 'code', code = part.content;
        if (nlIdx !== -1) {
          const potLang = part.content.substring(0, nlIdx).trim();
          if (potLang.length < 15 && /^[a-zA-Z0-9_+-]+$/.test(potLang)) {
            lang = potLang;
            code = part.content.substring(nlIdx + 1);
          }
        }
        const isCopied = copyFeedback[part.key];
        return (
          <pre key={part.key} style={{ position: 'relative' }}>
            <button className="copy-btn" onClick={() => copyToClipboard(code, part.key)}>
              {isCopied ? 'Copied!' : 'Copy'}
            </button>
            <code>{code}</code>
          </pre>
        );
      } else {
        return part.content.split('\n').map((line, lIdx) => {
          const key = `${part.content.slice(0, 8)}-${lIdx}`;
          const trimmed = line.trim();
          if (!trimmed) return <div key={key} style={{ height: '0.5rem' }} />;
          if (trimmed.startsWith('### ')) return <h3 key={key}>{renderInline(trimmed.slice(4), citations)}</h3>;
          if (trimmed.startsWith('## '))  return <h2 key={key}>{renderInline(trimmed.slice(3), citations)}</h2>;
          if (trimmed.startsWith('# '))   return <h1 key={key}>{renderInline(trimmed.slice(2), citations)}</h1>;
          if (line.startsWith('- ') || line.startsWith('* ')) {
            return <ul key={key}><li>{renderInline(line.slice(2), citations)}</li></ul>;
          }
          return <p key={key}>{renderInline(line, citations)}</p>;
        });
      }
    });
  };

  const renderInline = (text, citations) => {
    const regex = /(\*\*.*?\*\*|\[\d+\]|`.*?`)/g;
    return text.split(regex).map((part, idx) => {
      if (part.startsWith('**') && part.endsWith('**'))
        return <strong key={idx}>{part.slice(2, -2)}</strong>;
      if (part.startsWith('`') && part.endsWith('`'))
        return (
          <code key={idx} style={{ fontFamily: 'var(--font-mono)', background: 'rgba(216,185,120,0.08)', padding: '0.1rem 0.4rem', borderRadius: '4px', color: 'var(--accent)', border: '1px solid rgba(216,185,120,0.12)', fontSize: '0.85em' }}>
            {part.slice(1, -1)}
          </code>
        );
      if (part.startsWith('[') && part.endsWith(']')) {
        const num = parseInt(part.slice(1, -1));
        const exists = citations?.some(c => c.index === num);
        if (exists) {
          const scrollTo = () => {
            setHighlightedCitation(num);
            document.getElementById(`citation-${num}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          };
          return (
            <button
              key={idx}
              className="citation-badge"
              onClick={scrollTo}
              title={citations.find(c => c.index === num)?.title || `Source ${num}`}
              style={highlightedCitation === num ? { background: 'var(--accent)', color: 'var(--text-dark)' } : {}}
            >
              {num}
            </button>
          );
        }
      }
      return part;
    });
  };

  const sourcesList = Object.keys(SOURCE_META);
  const hasResult = result && !loading;

  return (
    <div className="animate-fade-in" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Head>
        <title>Cited — Multi-Source Developer Answer Engine</title>
        <meta name="description" content="Self-hosted, privacy-first developer search powered by multi-source scraping and Google Gemini RAG." />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      {/* Ambient background orbs */}
      <div className="ambient-orb ambient-orb-1" />
      <div className="ambient-orb ambient-orb-2" />

      {/* Sticky header */}
      <header className="site-header">
        <div className="site-header-inner">
          <Link href="/" legacyBehavior>
            <a className="logo">Scr<span className="logo-accent">AI</span></a>
          </Link>
          <nav className="nav-links">
            <Link href="/" legacyBehavior><a className="nav-link active">Search</a></Link>
            <Link href="/setup" legacyBehavior><a className="nav-link">Setup</a></Link>
            <Link href="/settings" legacyBehavior><a className="nav-link">Settings</a></Link>
          </nav>
        </div>
      </header>

      <main style={{ flex: 1, position: 'relative', zIndex: 1 }}>
        {/* DarkVeil WebGL background — full viewport width, only on landing */}
        {!hasResult && (
          <>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '100%', zIndex: 0, overflow: 'hidden' }}>
              <DarkVeil
                hueShift={208}
                noiseIntensity={0.02}
                speed={0.8}
                scanlineFrequency={1.4}
                warpAmount={0.3}
                resolutionScale={1}
              />
            </div>
            {/* Gradient overlay to keep text legible */}
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '100%',
              zIndex: 1,
              background: 'linear-gradient(to bottom, rgba(5,5,7,0.4) 0%, rgba(5,5,7,0.7) 55%, rgba(5,5,7,1) 100%)',
              pointerEvents: 'none'
            }} />
          </>
        )}

        <div className="container" style={{ paddingTop: '1rem', paddingBottom: '5rem', position: 'relative', zIndex: 2 }}>

          {/* Hero / Search section */}
          <div className={`search-hero ${hasResult ? 'compact' : ''}`}>
            {!hasResult && (
              <>
                <h1 className="hero-wordmark">
                  Scr<span className="accent">AI</span>
                </h1>
                <p className="hero-tagline">Multi-Source Developer Answer Engine</p>
              </>
            )}

            <form onSubmit={handleSearchSubmit} className="search-bar-wrapper">
              <input
                ref={inputRef}
                type="text"
                className="input search-input-field"
                placeholder="Ask a technical question (e.g. 'explain CORS in FastAPI')..."
                value={query}
                onChange={e => setQuery(e.target.value)}
                disabled={loading}
                id="search-input"
                autoComplete="off"
              />
              <button
                type="submit"
                className="btn btn-primary search-submit-btn"
                disabled={loading || !query.trim()}
                id="search-btn"
              >
                {loading ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span className="spinner" style={{ width: '14px', height: '14px', borderWidth: '2px' }} />
                    Wait
                  </span>
                ) : 'Search'}
              </button>
            </form>

            {/* Source Pills */}
            <div className="pill-row">
              {sourcesList.map(source => {
                const isConfigured = sourceConfig[source];
                const isActive = selectedSources.includes(source);
                return (
                  <button
                    key={source}
                    type="button"
                    className={`pill-btn ${isActive ? 'pill-active' : ''} ${!isConfigured ? 'pill-disabled' : ''}`}
                    onClick={() => handleToggleSource(source)}
                    title={isConfigured
                      ? `Toggle ${getSourceDisplayName(source)}`
                      : `${getSourceDisplayName(source)} — not configured`}
                  >
                    <span
                      className="pill-dot"
                      style={{ backgroundColor: isConfigured ? getSourceBadgeColor(source) : 'var(--text-muted)' }}
                    />
                    {getSourceDisplayName(source)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Loading */}
          {loading && (
            <div className="loading-state animate-fade-in">
              <div className="spinner" style={{ width: '40px', height: '40px' }} />
              <div>
                <p className="loading-step-text" key={loadingStep}>{loadingStep}</p>
                <p className="loading-sub-text" style={{ marginTop: '0.5rem' }}>
                  Gathering and evaluating context threads across multiple sources. This may take up to 10 seconds.
                </p>
              </div>
            </div>
          )}

          {/* Error */}
          {error && !loading && (
            <div className="alert alert-error animate-slide-up" style={{ maxWidth: '720px', margin: '0 auto 1.5rem' }}>
              <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>⚠</span>
              <div>
                <strong style={{ display: 'block', marginBottom: '0.25rem' }}>Execution Failed</strong>
                {error}
              </div>
            </div>
          )}

          {/* Results */}
          {hasResult && (
            <div className="animate-slide-up">

              {/* Degraded warning */}
              {result.source_errors && Object.keys(result.source_errors).length > 0 && (
                <div className="alert alert-warning" style={{ marginBottom: '1.25rem' }}>
                  <span>⚡</span>
                  <span>
                    <strong>Degraded response:</strong> Some sources failed — {' '}
                    {Object.keys(result.source_errors).map(k => getSourceDisplayName(k)).join(', ')}
                  </span>
                </div>
              )}

              <div className="results-layout">

                {/* Left — Answer */}
                <div className="panel-answer card" style={{ padding: '1.75rem' }}>
                  <div className="answer-header">
                    <h2 className="answer-title">Synthesized Answer</h2>
                    {result.cached && <span className="cache-badge">Cached</span>}
                  </div>
                  <div className="rag-content">
                    {renderAnswerText(result.answer, result.citations)}
                  </div>
                </div>

                {/* Right — Citations */}
                <div className="panel-citations">
                  <p className="citations-header">
                    Citations & References
                    {result.citations?.length ? ` (${result.citations.length})` : ''}
                  </p>
                  {result.citations?.length > 0 ? (
                    result.citations.map(cit => (
                      <div
                        key={cit.index}
                        id={`citation-${cit.index}`}
                        className={`citation-card ${highlightedCitation === cit.index ? 'highlighted' : ''}`}
                        onClick={() => setHighlightedCitation(cit.index)}
                      >
                        <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'flex-start' }}>
                          <span className={`citation-num ${highlightedCitation === cit.index ? 'active' : ''}`}>
                            {cit.index}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p className="citation-title">
                              <a href={cit.url} target="_blank" rel="noopener noreferrer"
                                style={{ color: 'inherit', textDecoration: 'none' }}>
                                {cit.title || 'Source Thread'}
                              </a>
                            </p>
                            <div className="citation-meta">
                              <span className="citation-source-label" style={{ color: getSourceBadgeColor(cit.source) }}>
                                {getSourceDisplayName(cit.source)}
                              </span>
                              <span>·</span>
                              <span>Score {cit.score ? parseFloat(cit.score).toFixed(1) : '0'}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No citations referenced.</p>
                  )}
                </div>
              </div>

              {/* Raw results drawer */}
              <div className="drawer-bar">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setDrawerOpen(!drawerOpen)}
                  id="drawer-toggle-btn"
                >
                  {drawerOpen ? '▲ Hide Raw Ranked Scrapes' : '▼ Show Raw Ranked Scrapes'}
                </button>
              </div>

              {drawerOpen && result.raw_results && (
                <div className="drawer-container animate-slide-down">
                  <h3 className="drawer-title">
                    Raw Ranked Results — {result.raw_results.length} sources
                  </h3>
                  {result.raw_results.map((raw, idx) => (
                    <div key={idx} className="raw-result-item">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.4rem', gap: '1rem' }}>
                        <h4 style={{ fontSize: '0.95rem', fontWeight: 600, flex: 1, minWidth: 0 }}>
                          <a href={raw.url} target="_blank" rel="noopener noreferrer"
                            style={{ color: 'var(--accent)', textDecoration: 'none' }}>
                            {raw.title}
                          </a>
                        </h4>
                        <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 700, flexShrink: 0 }}>
                          <span style={{ color: getSourceBadgeColor(raw.source_name) }}>
                            {getSourceDisplayName(raw.source_name)}
                          </span>
                          <span style={{ color: 'var(--text-muted)' }}>·</span>
                          <span className="mono" style={{ color: 'var(--text-secondary)' }}>
                            {raw.score ? parseFloat(raw.score).toFixed(3) : '0.000'}
                          </span>
                        </div>
                      </div>
                      <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', lineHeight: '1.55', margin: '0.4rem 0' }}>
                        {raw.body?.length > 320 ? raw.body.substring(0, 320) + '…' : raw.body}
                      </p>
                      <div style={{ fontSize: '0.72rem', color: 'rgba(246, 233, 199, 0.3)', marginTop: '0.5rem' }}>
                        {raw.author && <>By <strong style={{ color: 'rgba(246,233,199,0.45)' }}>{raw.author}</strong> · </>}
                        {raw.created_at ? new Date(raw.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'Date unknown'}
                      </div>
                    </div>
                  ))}
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
