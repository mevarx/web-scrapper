# Guide to Obtaining API Keys and Credentials

This guide provides step-by-step instructions on how to obtain the API keys and credentials required to run **Cited** with all its features and integrations.

---

## Table of Contents
1. [Google Gemini API (Required)](#1-google-gemini-api-required)
2. [Reddit API (Optional)](#2-reddit-api-optional)
3. [Dev.to API (Optional)](#3-dev.to-api-optional)
4. [StackOverflow / StackExchange API (Optional)](#4-stackoverflow--stackexchange-api-optional)
5. [Twitter / X API (Optional)](#5-twitter--x-api-optional)

---

## 1. Google Gemini API (Required)
The Google Gemini API is used for the Retrieval-Augmented Generation (RAG) pipeline to synthesize the aggregated answers.

1. Go to [Google AI Studio](https://aistudio.google.com/).
2. Log in with your Google Account.
3. Click the **"Get API key"** button in the top left or top right corner.
4. Click **"Create API key"**.
5. Select a Google Cloud project (or create a new one) and click **"Create API key in existing project"**.
6. Copy the generated key and assign it to `GEMINI_API_KEY` in your `.env` file.

---

## 2. Reddit API (Optional)
To scrape posts and comments from Reddit, you must register a script-type application.

1. Log in to your Reddit account.
2. Navigate to [Reddit App Preferences](https://www.reddit.com/prefs/apps).
3. Scroll to the bottom and click the **"are you a developer? create an app..."** or **"create another app..."** button.
4. Fill in the fields as follows:
   - **Name**: `Cited Scraper` (or any name you prefer)
   - **App Type**: Select the **script** radio button (this is critical for backend script access).
   - **Description**: Optional description, e.g., `Scraper for Cited answers aggregator`.
   - **about url**: Leave blank.
   - **redirect uri**: Enter `http://localhost:8000` or `http://localhost:3000`.
5. Click **"create app"**.
6. Retrieve your credentials:
   - **Client ID**: The alphanumeric string displayed right under the app name and "personal use script" (e.g., `aBcDeFgHiJkLmN`).
   - **Client Secret**: The string labeled **"secret"** (e.g., `xYz1234567890abcdefg`).
   - **User Agent**: A unique string describing your app (e.g., `python:answerai:v1.0.0 (by /u/yourusername)`). Replace `yourusername` with your Reddit username.
7. Add these values to `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, and `REDDIT_USER_AGENT` in your `.env` file.

---

## 3. Dev.to API (Optional)
Dev.to provides public search, but generating an API key helps avoid rate-limiting.

1. Go to [Dev.to](https://dev.to) and log in to your account.
2. Go to your **Settings** (click your profile picture -> Settings, or go directly to [Dev.to Account Settings](https://dev.to/settings/pages)).
3. Scroll down to the **"DEV Community API Keys"** section.
4. Enter a description in the **"Description"** field (e.g., `Cited Scraper`) and click **"Generate API Key"**.
5. Copy the generated key and assign it to `DEVTO_API_KEY` in your `.env` file.

---

## 4. StackOverflow / StackExchange API (Optional)
An API key is optional for StackOverflow, but registering one increases your daily request quota (up to 10,000 requests per day).

1. Go to [Stack Apps](https://stackapps.com/).
2. Click on [Register for an App Key](https://stackapps.com/apps/register).
3. Log in to your Stack Exchange account if prompted.
4. Fill out the registration form:
   - **Application Name**: `Cited Scraper`
   - **Description**: `Aggregator API client`
   - **OAuth Domain**: `localhost`
   - **Application Website**: `http://localhost:8000`
5. Click **"Register"**.
6. Copy the **Key** value shown (do not confuse it with Client ID or Client Secret).
7. Assign this value to `STACKOVERFLOW_KEY` in your `.env` file.

---

## 5. Twitter / X API (Optional)
To query the Twitter/X API v2, you need a Bearer Token.

1. Go to the [Twitter Developer Portal](https://developer.twitter.com/).
2. Sign up or log in to a developer account.
3. Create a new **Project** and click **"Add App"** inside it (or use the default app created for your project).
4. Go to the **"Keys and Tokens"** section of your App settings.
5. Under **"Authentication Tokens"**, click **"Generate"** (or **"Regenerate"**) next to **Bearer Token**.
6. Copy the token and assign it to `TWITTER_BEARER_TOKEN` in your `.env` file.
