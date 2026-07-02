# Cited

Cited is a self-hosted, multi-source answer aggregator and search engine designed for developers. It executes search queries across multiple platforms in parallel, ranks the results based on source authority and recency, and feeds the top passages into a RAG (Retrieval-Augmented Generation) pipeline using the Google Gemini API. 

This is a self-hosted project. Users supply their own API keys, keeping search histories and credentials entirely local.

## Features

- Parallel scraping across Stack Overflow, Dev.to, Hacker News, Reddit, Medium, and Twitter/X.
- Real-time quality-based ranking utilizing engagement metrics and exponential age decay.
- Local SQLite database cache storing raw scraper outputs and synthesized RAG answers.
- Source status health monitoring for all configured APIs.
- Dynamic post-generation citation validation to ensure all inline citation markers match valid reference URLs.
- Docker-orchestrated deployment.

## Architecture

The project is structured into two main services:

1. **Backend (FastAPI)**: Coordinates concurrent asynchronous search requests, handles caching, implements the ranking algorithm, and manages communication with the Google Gemini API. Headless Playwright drivers are packaged inside the backend container to scrape JavaScript-heavy targets like Medium.
2. **Frontend (Next.js)**: Displays a responsive search page, a setup wizard to diagnose API connectivity, a dual-panel RAG result view showing inline citation references, and a configuration control dashboard.

## Getting Started

### Prerequisites

Ensure you have the following installed on your host machine:

- Docker
- Docker Compose

### Initial Setup

1. Clone this repository:
   ```bash
   git clone https://github.com/mevarx/web-scrapper.git
   cd web-scrapper
   ```

2. Copy the environment variables template:
   ```bash
   cp .env.example .env
   ```

3. Open `.env` and fill in your credentials. Only the `GEMINI_API_KEY` is strictly required to start up the RAG pipeline; other credentials can be added to enable optional sources:
   - `GEMINI_API_KEY`: Your Google AI Studio API key.
   - `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET`: Reddit script-type app credentials.
   - `DEVTO_API_KEY`: Optional key to raise Dev.to rate limits.
   - `STACKOVERFLOW_KEY`: Optional StackExchange app key.
   - `TWITTER_BEARER_TOKEN`: Twitter API v2 token.

4. Start the services:
   ```bash
   docker-compose up --build -d
   ```

5. Open your browser and navigate to `http://localhost:3000` to access the Setup Wizard.

## Development and Extension

### Adding a New Search Source

To add a new platform:

1. Create a new adapter file in `backend/app/scrapers/`.
2. Inherit from the base `SourceAdapter` class defined in `backend/app/scrapers/base.py` and implement the abstract methods:
   - `name`: Returns the unique string ID of your source.
   - `is_configured`: Returns a boolean indicating whether the required keys are present in settings.
   - `test_connection`: Verifies credentials or network reachability.
   - `search`: Executes the query and returns a list of `RawResult` instances.
3. Import and register your adapter in `backend/app/main.py` inside the `ALL_ADAPTERS` list.
4. Add the default source weight to the `DEFAULT_WEIGHTS` dictionary in `backend/app/ranking.py`.

### Running Tests Locally

You can run test suites inside the backend container:
```bash
docker-compose exec backend pytest
```

## License

This project is open-source and licensed under the MIT License. See the LICENSE file for details.
