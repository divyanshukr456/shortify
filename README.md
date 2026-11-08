# Shortify

Shortify is a lightweight URL shortener built with Node.js, Express, and EJS. Create shareable short links, manage them from a dashboard, and track click activity.

## Features

- Create short links for HTTP and HTTPS URLs.
- Reuse an existing short link when the same URL is submitted again.
- View, search, and manage links from the dashboard.
- Track total clicks and view click activity over the last seven days.
- Redirect visitors from a short link to its original URL.
- Store links and click analytics persistently in Neon Postgres.

## Requirements

- Node.js
- npm

## Getting Started

1. Create a Neon Postgres project and copy its connection string from the Neon dashboard's **Connect** dialog.

2. Set the connection string in the `DATABASE_URL` environment variable. For local development, add it to `.env`:

   ```env
   DATABASE_URL=your-neon-connection-string
   ```

   The server loads this file automatically. In Vercel, add `DATABASE_URL` under **Project Settings → Environment Variables** for each environment you deploy, then redeploy. Keep the connection string private.

3. Install the dependencies:

   ```bash
   npm install
   ```

4. Start the server:

   ```bash
   node server.js
   ```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

The server uses port `3000` by default. Set the `PORT` environment variable to use a different port.

## Pages

| Page | Path |
| --- | --- |
| Dashboard and link management | `/` |
| Link analytics | `/analytics-view` |
| About Shortify | `/about` |

## API

All API routes return JSON unless noted otherwise.

### Create a short link

`POST /api/urls`

Provide a URL in either the `originalUrl` or `longUrl` field:

```json
{
  "longUrl": "https://example.com/a/long/path"
}
```

The URL must use the `http` or `https` protocol. On success, the response includes the short code, short URL, original URL, creation time, and click count. A new link returns `201 Created`; an existing link for the same URL returns `200 OK`.

### List links

`GET /api/urls`

Returns an array of saved links, including their short codes and click metadata.

### Get link analytics

`GET /api/urls/:shortCode/stats`

Returns the link's total clicks, first and latest click timestamps, and daily click counts for the last seven days. Returns `404 Not Found` if the short code does not exist.

### Delete a link

`DELETE /api/urls/:shortCode`

Deletes the specified link. Returns `404 Not Found` if the short code does not exist.

### Follow a short link

`GET /:shortCode`

Redirects to the original URL and records the click. Unknown short codes return a 404 page.

## Data Storage

Neon Postgres is the source of truth for links and click analytics. The app creates its database tables automatically on the first request. If `files/urls.json` is available on that first request, its existing links are imported once into Neon. Requests that require the database return an error if `DATABASE_URL` is not configured.

To inspect saved records, use the Neon dashboard's **SQL Editor**, or visit your deployed app's `/api/urls` endpoint.
