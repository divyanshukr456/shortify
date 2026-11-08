# Shortify

Shortify is a lightweight URL shortener built with Node.js, Express, and EJS. Create shareable short links, manage them from a dashboard, and track click activity.

## Features

- Create short links for HTTP and HTTPS URLs.
- Reuse an existing short link when the same URL is submitted again.
- View, search, and manage links from the dashboard.
- Track total clicks and view click activity over the last seven days.
- Redirect visitors from a short link to its original URL.
- Store link data locally in `files/urls.json`.

## Requirements

- Node.js
- npm

## Getting Started

1. Install the dependencies:

   ```bash
   npm install
   ```

2. Start the server:

   ```bash
   node server.js
   ```

3. Open [http://localhost:3000](http://localhost:3000) in your browser.

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

Link records are stored in `files/urls.json`. The server creates the `files` directory if it does not exist. Back up this file if you need to preserve link data.
