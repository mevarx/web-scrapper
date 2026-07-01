import Head from 'next/head'

export default function Setup() {
  return (
    <div>
      <Head>
        <title>AnswerAI — Setup Wizard</title>
      </Head>
      <main style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
        <h1 style={{ marginBottom: '1rem' }}>Setup Wizard</h1>
        <p style={{ color: 'var(--text-muted)' }}>Validate your credentials and configuration.</p>
      </main>
    </div>
  )
}
