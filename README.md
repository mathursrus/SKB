# SKB — Restaurant Waitlist Management

A no-login, mobile-friendly waitlist system for walk-in restaurants. Diners join the queue from their phone (no app needed), and hosts manage the line from a PIN-protected dashboard with real-time ETAs.

## Quick Start

```bash
# Prerequisites: Node.js >= 22, MongoDB running locally
npm install
cp .env.example .env        # edit as needed
npm start                    # http://localhost:3000
```

| Page | URL |
|------|-----|
| Diner queue | `http://localhost:3000/r/skb/queue.html` |
| Host dashboard | `http://localhost:3000/r/skb/host.html` |
| All locations | `http://localhost:3000/` |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGODB_URI` | No | MongoDB connection string (default: `mongodb://localhost:27017`) |
| `MONGODB_DB_NAME` | No | Database name (auto-detected from git branch if not set) |
| `PORT` | No | Server port (auto-assigned if not set) |
| `SKB_HOST_PIN` | No | Host-stand PIN (default: `1234`) |
| `SKB_COOKIE_SECRET` | No | Cookie signing secret for host sessions |
| `TZ` | No | Timezone for service-day partitioning (default: `America/Los_Angeles`) |

## Google Maps Waitlist Integration

SKB queue pages include structured data (JSON-LD) and Open Graph meta tags so they work well when linked from Google Maps, shared on social media, or indexed by search engines.

To make your restaurant's waitlist discoverable on Google Maps, follow these steps:

### Step 1: Verify Your Google Business Profile

1. Go to [Google Business Profile](https://business.google.com/) and sign in with the Google account that manages your restaurant.
2. If you haven't claimed your business yet, search for your restaurant and follow the verification process (Google will mail a postcard or call your business phone).
3. Make sure your business information is accurate: name, address, phone number, hours, and category (should include "Restaurant").

### Step 2: Get Your Queue Page URL

Your queue page URL follows this pattern:

```
https://<your-domain>/r/<location-id>/queue.html
```

For example, if your domain is `skb.azurewebsites.net` and your location ID is `skb`:

```
https://skb.azurewebsites.net/r/skb/queue.html
```

### Step 3: Add the Queue Link to Google Business Profile

1. In Google Business Profile, click **Edit profile**.
2. Find the **Website / Links** section (may also appear under "More" or "Business information").
3. Add your queue URL as one of these link types (in order of preference):
   - **Reservations link** — appears as a "Reserve" or "Join Waitlist" button on your Maps listing
   - **Order ahead link** — appears as an "Order" button
   - **Menu link** — appears alongside your menu
4. Click **Save**.

### Step 4: Wait for Google to Update

Changes to your Google Business Profile can take **24-72 hours** to appear on Google Maps. After that:

- Diners searching for your restaurant on Google Maps will see the link
- Tapping it opens your queue page in their mobile browser
- They can see the current wait time and join the line immediately

### Step 5 (Optional): Set the Public URL in Your Location

For the best search engine and social media experience, set the `publicUrl` field on your location document in MongoDB. This enables canonical URLs, Open Graph tags, and JSON-LD structured data to use the correct absolute URL.

```javascript
// In MongoDB shell:
db.locations.updateOne(
  { _id: "skb" },
  { $set: { publicUrl: "https://skb.azurewebsites.net" } }
)
```

Without `publicUrl` set, the queue page still works but may not show rich link previews when shared on social media.

### Verifying the Integration

After setup, you can verify the structured data is working:

1. **View source**: Open your queue page in a browser, view source, and look for `<script type="application/ld+json">` and `<meta property="og:` tags in the `<head>`.
2. **Google Rich Results Test**: Paste your queue page URL into [Google's Rich Results Test](https://search.google.com/test/rich-results) to verify the structured data is valid.
3. **Social share preview**: Paste the URL into [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/) to see how the link preview looks when shared.

## Multi-Tenant

SKB supports multiple restaurant locations. Each location has its own:
- Queue page at `/r/:loc/queue.html`
- Host dashboard at `/r/:loc/host.html`
- PIN-protected access
- Independent queue and settings

The default location `skb` (Shri Krishna Bhavan) is auto-created on startup.

## Scripts

```bash
npm start              # Start the server
npm test               # Run unit tests
npm run test:integration  # Run integration tests (requires MongoDB)
npm run test:e2e       # Run end-to-end tests
npm run test:all       # Run all tests
npm run typecheck      # TypeScript type checking
```
