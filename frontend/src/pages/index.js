import Head from 'next/head'
import Link from 'next/link'
import { useState, useEffect } from 'react'

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

  // Fetch source configurations on load
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/settings`);
        if (res.ok) {
          const data = await res.json();
          // Extract sources configuration
          const configs = {};
          const enabled = [];
          if (data.sources) {
            Object.entries(data.sources).forEach(([name, info]) => {
              configs[name] = info.configured;
              if (info.configured) {
                enabled.push(name);
              }
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
    if (!sourceConfig[sourceName]) return; // Disabled

    setSelectedSources(prev => {
      if (prev.includes(sourceName)) {
        return prev.filter(s => s !== sourceName);
      } else {
        return [...prev, sourceName];
      }
    });
  };

  const handleSearchSubmit = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setHighlightedCitation(null);
    
    // Animate loading messages
    const steps = [
      'Initializing parallel request workers...',
      'Scraping developer platforms in parallel...',
      'Filtering out noise and duplicate code threads...',
      'Applying quality normalizations and age decay weights...',
      'Ingesting top-8 chunks into Google Gemini model...',
      'Performing post-generation inline citation index validation...',
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
        body: JSON.stringify({
          query: query.trim(),
          sources: selectedSources
        }),
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

  const getSourceBadgeColor = (name) => {
    const colors = {
      stackoverflow: '#F48024',
      devto: '#0A0A0A',
      hn: '#FF6600',
      reddit: '#FF4500',
      medium: '#00AB6C',
      twitter: '#1DA1F2'
    };
    return colors[name] || 'var(--accent)';
  };

  // Parser helper function for markdown & citation tags [n]
  const renderAnswerText = (text, citations) => {
    if (!text) return null;

    const parts = [];
    const regex = /```([\s\S]*?)```/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
      const textBefore = text.substring(lastIndex, match.index);
      const codeContent = match[1];

      if (textBefore) {
        parts.push({ type: 'text', content: textBefore });
      }

      parts.push({ type: 'code', content: codeContent });
      lastIndex = regex.lastIndex;
    }

    const remainingText = text.substring(lastIndex);
    if (remainingText) {
      parts.push({ type: 'text', content: remainingText });
    }

    return parts.map((part, pIdx) => {
      if (part.type === 'code') {
        const firstLineBreak = part.content.indexOf('\n');
        let lang = 'code';
        let code = part.content;
        if (firstLineBreak !== -1) {
          const potentialLang = part.content.substring(0, firstLineBreak).trim();
          if (potentialLang.length < 15 && /^[a-zA-Z0-9_-]+$/.test(potentialLang)) {
            lang = potentialLang;
            code = part.content.substring(firstLineBreak + 1);
          }
        }
        
        const copyToClipboard = () => {
          navigator.clipboard.writeText(code);
        };

        return (
          <pre key={pIdx} style={{ position: 'relative' }}>
            <button className="copy-btn" onClick={copyToClipboard}>Copy</button>
            <code>{code}</code>
          </pre>
        );
      } else {
        const lines = part.content.split('\n');
        return lines.map((line, lIdx) => {
          const trimmed = line.trim();
          if (!trimmed) return <div key={lIdx} style={{ height: '0.5rem' }} />;

          if (trimmed.startsWith('###')) {
            return <h3 key={lIdx} style={{ color: 'var(--accent)', marginTop: '1.25rem', marginBottom: '0.5rem' }}>{renderInlineMarkdownAndCitations(trimmed.substring(3).trim(), citations)}</h3>;
          }
          if (trimmed.startsWith('##')) {
            return <h2 key={lIdx} style={{ color: 'var(--accent)', marginTop: '1.5rem', marginBottom: '0.75rem' }}>{renderInlineMarkdownAndCitations(trimmed.substring(2).trim(), citations)}</h2>;
          }
          if (trimmed.startsWith('#')) {
            return <h1 key={lIdx} style={{ color: 'var(--accent)', marginTop: '1.75rem', marginBottom: '1rem' }}>{renderInlineMarkdownAndCitations(trimmed.substring(1).trim(), citations)}</h1>;
          }

          if (line.startsWith('- ') || line.startsWith('* ')) {
            return (
              <ul key={lIdx} style={{ marginLeft: '1.5rem', marginBottom: '0.75rem' }}>
                <li style={{ marginBottom: '0.25rem' }}>{renderInlineMarkdownAndCitations(line.substring(2), citations)}</li>
              </ul>
            );
          }

          return <p key={lIdx} style={{ marginBottom: '1rem', lineHeight: '1.6' }}>{renderInlineMarkdownAndCitations(line, citations)}</p>;
        });
      }
    });
  };

  const renderInlineMarkdownAndCitations = (text, citations) => {
    const regex = /(\*\*.*?\*\*|\[\d+\]|`.*?`)/g;
    const parts = text.split(regex);

    return parts.map((part, idx) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={idx}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return <code key={idx} style={{ fontFamily: 'monospace', backgroundColor: 'rgba(246, 233, 199, 0.05)', padding: '0.2rem 0.4rem', borderRadius: '4px', color: 'var(--accent)' }}>{part.slice(1, -1)}</code>;
      }
      if (part.startsWith('[') && part.endsWith(']')) {
        const numStr = part.slice(1, -1);
        const num = parseInt(numStr);
        const citationExists = citations && citations.some(c => c.index === num);
        if (citationExists) {
          const scrollToCitation = () => {
            setHighlightedCitation(num);
            const el = document.getElementById(`citation-${num}`);
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          };
          return (
            <button 
              key={idx} 
              className={`citation-badge ${highlightedCitation === num ? 'active' : ''}`}
              onClick={scrollToCitation}
              title={citations.find(c => c.index === num)?.title || `Citation ${num}`}
              style={{
                verticalAlign: 'super',
                fontSize: '0.7rem',
                border: '1px solid var(--accent)',
                background: highlightedCitation === num ? 'var(--accent)' : 'rgba(216, 185, 120, 0.1)',
                color: highlightedCitation === num ? 'var(--text-dark)' : 'var(--accent)',
                cursor: 'pointer',
                borderRadius: '4px',
                width: '18px',
                height: '18px',
                margin: '0 2px',
                lineHeight: '1',
                padding: '0'
              }}
            >
              {num}
            </button>
          );
        }
      }
      return part;
    });
  };

  const sourcesList = ['stackoverflow', 'devto', 'hn', 'reddit', 'medium', 'twitter'];

  return (
    <div className="animate-fade-in" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Head>
        <title>Cited — Multi-Source Answer Aggregator</title>
        <meta name="description" content="Self-hosted developer-focused search and answer aggregator." />
      </Head>

      {/* Main header */}
      <header className="header" style={{ maxWidth: '1100px', width: '100%', margin: '0 auto', padding: '1.5rem' }}>
        <Link href="/" legacyBehavior>
          <a className="logo">Scr<span>AI</span></a>
        </Link>
        <nav className="nav-links">
          <Link href="/" legacyBehavior>
            <a className="nav-link active">Search</a>
          </Link>
          <Link href="/setup" legacyBehavior>
            <a className="nav-link">Setup</a>
          </Link>
          <Link href="/settings" legacyBehavior>
            <a className="nav-link">Settings</a>
          </Link>
        </nav>
      </header>

      <main className="container" style={{ flex: 1, display: 'flex', flexDirection: 'column', paddingBottom: '4rem' }}>
        
        {/* Search header container */}
        <div className="search-container" style={{ marginTop: result ? '1.5rem' : '5rem' }}>
          {!result && (
            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
              <h1 className="logo" style={{ fontSize: '4.5rem', letterSpacing: '0.15em', marginBottom: '0.5rem' }}>
                Scr<span>AI</span>
              </h1>
              <p style={{ color: 'var(--text-muted)', fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '0.15em' }}>
                Multi-Source Developer Answer Aggregator
              </p>
            </div>
          )}

          <form onSubmit={handleSearchSubmit} className="search-bar-wrapper">
            <input 
              type="text" 
              className="input search-input-field" 
              placeholder="Ask a technical question (e.g. 'explain CORS configurations in FastAPI')..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={loading}
            />
            <button 
              type="submit" 
              className="btn btn-primary search-submit-btn" 
              disabled={loading || !query.trim()}
            >
              {loading ? 'Searching' : 'Search'}
            </button>
          </form>

          {/* Pill Toggles */}
          <div className="pill-container">
            {sourcesList.map(source => {
              const isConfigured = sourceConfig[source];
              const isActive = selectedSources.includes(source);
              return (
                <button
                  key={source}
                  type="button"
                  className={`pill-btn ${isActive ? 'active' : ''} ${!isConfigured ? 'disabled' : ''}`}
                  onClick={() => handleToggleSource(source)}
                  title={isConfigured ? `Toggle ${getSourceDisplayName(source)}` : `${getSourceDisplayName(source)} is not configured in .env`}
                >
                  <span style={{ 
                    width: '6px', 
                    height: '6px', 
                    borderRadius: '50%', 
                    backgroundColor: isConfigured ? getSourceBadgeColor(source) : 'var(--text-muted)',
                    display: 'inline-block'
                  }}></span>
                  {getSourceDisplayName(source)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Loading Spinner and States */}
        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '4rem 0', gap: '1.5rem' }}>
            <div className="spinner" style={{ width: '48px', height: '48px' }}></div>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontWeight: 600, color: 'var(--accent)', fontSize: '1.1rem', letterSpacing: '0.05em' }}>{loadingStep}</p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.25rem' }}>Gathering and evaluating context threads, this might take up to 10 seconds.</p>
            </div>
          </div>
        )}

        {/* Errors display */}
        {error && (
          <div className="card" style={{ borderLeft: '4px solid var(--danger)', background: 'rgba(229,115,115,0.05)', margin: '2rem auto', maxWidth: '720px', width: '100%' }}>
            <h3 style={{ color: 'var(--danger)', fontSize: '1.1rem', marginBottom: '0.5rem', fontWeight: 600 }}>Execution Failed</h3>
            <p style={{ color: 'var(--text-primary)', fontSize: '0.95rem' }}>{error}</p>
          </div>
        )}

        {/* Results layout */}
        {result && !loading && (
          <div className="animate-slide-up">
            
            {/* Source Errors warning indicator if any source failed */}
            {result.source_errors && Object.keys(result.source_errors).length > 0 && (
              <div style={{ padding: '0.8rem 1.2rem', backgroundColor: 'rgba(255, 183, 77, 0.05)', borderLeft: '3px solid var(--warning)', borderRadius: '4px', marginBottom: '1.5rem', fontSize: '0.85rem', color: 'var(--warning)' }}>
                <strong>Degraded responses:</strong> Some scraping targets could not resolve. ({Object.keys(result.source_errors).map(k => getSourceDisplayName(k)).join(', ')})
              </div>
            )}

            <div className="dual-panel">
              
              {/* Left panel: Gemini answer */}
              <div className="panel-left card" style={{ padding: '2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-cream)', paddingBottom: '0.75rem' }}>
                  <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--accent)' }}>Synthesized Answer</h2>
                  {result.cached && (
                    <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', backgroundColor: 'rgba(216, 185, 120, 0.1)', color: 'var(--accent)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontWeight: 700 }}>
                      Cached Response
                    </span>
                  )}
                </div>
                <div className="rag-content text-primary">
                  {renderAnswerText(result.answer, result.citations)}
                </div>
              </div>

              {/* Right panel: Citations */}
              <div className="panel-right">
                <h3 style={{ fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '1rem' }}>Citations & References</h3>
                {result.citations && result.citations.length > 0 ? (
                  result.citations.map((cit) => (
                    <div 
                      key={cit.index}
                      id={`citation-${cit.index}`}
                      className={`citation-card ${highlightedCitation === cit.index ? 'highlighted' : ''}`}
                      onClick={() => setHighlightedCitation(cit.index)}
                    >
                      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                        <span style={{ 
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: highlightedCitation === cit.index ? 'var(--accent)' : 'rgba(216, 185, 120, 0.12)',
                          color: highlightedCitation === cit.index ? 'var(--text-dark)' : 'var(--accent)',
                          border: '1px solid var(--accent)',
                          fontWeight: 700,
                          fontSize: '0.8rem',
                          borderRadius: '4px',
                          minWidth: '22px',
                          height: '22px',
                          marginTop: '0.1rem'
                        }}>
                          {cit.index}
                        </span>
                        <div style={{ flex: 1 }}>
                          <h4 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--text-primary)', lineBreak: 'anywhere' }}>
                            <a href={cit.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: 'inherit' }}>
                              {cit.title || 'Source Thread'}
                            </a>
                          </h4>
                          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            <span style={{ 
                              textTransform: 'uppercase', 
                              fontWeight: 700, 
                              color: getSourceBadgeColor(cit.source) 
                            }}>
                              {getSourceDisplayName(cit.source)}
                            </span>
                            <span>Score: {cit.score ? parseFloat(cit.score).toFixed(1) : '0'}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>No source citations referenced in the response.</p>
                )}
              </div>
            </div>

            {/* Collapsible raw ranked drawer */}
            <div className="drawer-toggle-bar">
              <button 
                type="button" 
                className="btn btn-secondary"
                onClick={() => setDrawerOpen(!drawerOpen)}
              >
                {drawerOpen ? 'Hide Raw Ranked Scrapes ▲' : 'Show Raw Ranked Scrapes ▼'}
              </button>
            </div>

            {drawerOpen && result.raw_results && (
              <div className="drawer-container card animate-slide-up">
                <h3 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', color: 'var(--accent)', borderBottom: '1px solid var(--border-cream)', paddingBottom: '0.5rem' }}>
                  Raw Ranked Results ({result.raw_results.length})
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {result.raw_results.map((raw, idx) => (
                    <div key={idx} className="raw-result-item">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                        <h4 style={{ fontSize: '1.05rem', fontWeight: 600 }}>
                          <a href={raw.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
                            {raw.title}
                          </a>
                        </h4>
                        <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 700 }}>
                          <span style={{ color: getSourceBadgeColor(raw.source_name) }}>
                            {getSourceDisplayName(raw.source_name)}
                          </span>
                          <span style={{ color: 'var(--text-muted)' }}>|</span>
                          <span style={{ color: 'var(--text-primary)' }}>Rank Score: {raw.score ? parseFloat(raw.score).toFixed(2) : '0.00'}</span>
                        </div>
                      </div>
                      <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: '1.5', margin: '0.5rem 0', whiteSpace: 'pre-wrap' }}>
                        {raw.body && raw.body.length > 300 ? raw.body.substring(0, 300) + '...' : raw.body}
                      </p>
                      <div style={{ fontSize: '0.75rem', color: 'rgba(246, 233, 199, 0.4)' }}>
                        Author: {raw.author || 'unknown'} • Created: {raw.created_at ? new Date(raw.created_at).toLocaleDateString() : 'N/A'}
                      </div>
                    </div>
                  ))}
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
