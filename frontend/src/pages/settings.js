import Head from 'next/head'

export default function Settings() {
  return (
    <div>
      <Head>
        <title>AnswerAI — Settings</title>
      </Head>
      <main style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
        <h1 style={{ marginBottom: '1rem' }}>Settings</h1>
        <p style={{ color: 'var(--text-muted)' }}>Configure credentials, ranking, and TTL properties.</p>
      </main>
    </div>
  )
}
