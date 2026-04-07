# Scripts

## `seed-demo.ts` — Generate SKB-Demo synthetic data

Creates a `skb-demo` restaurant location populated with 60 days of realistic waitlist + dining lifecycle data. The data tells a story of operational improvement over time.

### Usage

```bash
# Against local MongoDB
npx tsx scripts/seed-demo.ts

# Against production Cosmos DB
MONGODB_URI="<cosmos-connection-string>" MONGODB_DB_NAME=skb_prod npx tsx scripts/seed-demo.ts
```

### What it creates

- **Location**: `skb-demo` with name "SKB Demo Restaurant" and PIN `demo1234`
- **Settings**: `avgTurnTimeMinutes: 8` for the location
- **~2,100 queue entries** across 60 days, each with full lifecycle timestamps

### Data story arc

| Period | Days | Parties/day | Avg Wait | No-show Rate | Kitchen Time | Order Time |
|--------|------|-------------|----------|--------------|--------------|------------|
| Bad | 1-20 | 25-35 | 25-35m | ~15% | 20-25m | 12-15m |
| Improving | 21-40 | 30-40 | 15-20m | ~10% | 15-18m | 8-10m |
| Optimized | 41-60 | 35-45 | 8-12m | ~5% | 10-14m | 5-8m |

### Data characteristics

- **Party sizes**: 1-8 (uniform random). Larger parties have longer wait/kitchen times (1.3x multiplier for 5+).
- **Arrival times**: Gaussian distribution centered at 12:00 PM PT (120 min after 11 AM open), std 60 min, capped to 11 AM–4 PM.
- **State transitions**: Every non-no-show party has the full lifecycle: `waiting → called → seated → ordered → served → checkout → departed`, with timestamps for each state.
- **No-shows**: Called but never seated. Have `removedAt` + `removedReason: 'no_show'`.
- **Phase durations**: Gaussian with per-period mean/std, clamped to realistic ranges. Large parties get a 1.3x multiplier on wait and kitchen times.

### Idempotency

The script deletes all existing `skb-demo` entries before inserting. It handles Cosmos DB RU throttling (429 errors) with automatic retry and backoff. Duplicate key errors (from partial previous runs) are silently skipped.

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MONGODB_URI` | `mongodb://localhost:27017` | MongoDB connection string |
| `MONGODB_DB_NAME` | `skb_prod` | Database name |

## `generate-qr.ts` — Generate QR code SVG

Generates `public/qr.svg` encoding the production queue URL. Uses the `qrcode` npm package (dev dependency).

```bash
npx tsx scripts/generate-qr.ts
```
