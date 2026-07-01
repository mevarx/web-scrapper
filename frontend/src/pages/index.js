import Head from 'next/head'

export default function Home() {
  return (
    <div>
      <Head>
        <title>AnswerAI — Multi-Source Answer Aggregator</title>
        <meta name="description" content="Self-hosted developer-focused search and answer aggregator." />
      </Head>
      <main style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
        <h1 style={{ marginBottom: '1rem', color: 'var(--accent)' }}>AnswerAI</h1>
        <p style={{ color: 'var(--text-muted)' }}>Self-hosted answer aggregator setup complete. Backend integration pending.</p>
      </main>
    </div>
  )
}
