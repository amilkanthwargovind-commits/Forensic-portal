# AI Forensic Due Diligence Engine

Professional internal OSINT screening platform for partner due diligence.

## Local run

```bash
vercel dev
```

or serve static + API with your preferred Node/Vercel runtime.

## Environment variables

- `OPENSANCTIONS_API_KEY`
- `OPENCORPORATES_API_KEY`
- `NEWS_API_KEY`
- `PERPLEXITY_API_KEY`

## Pipeline summary

1. Normalize company name
2. Gather intelligence from sanctions, corporate, media, offshore, cyber, and public profile sources
3. Aggregate and cache response
4. Score risk signals
5. Generate narrative report sections
6. Render report and allow export via print-to-PDF

## Notes

Some data providers do not expose stable anonymous APIs; the app gracefully falls back and highlights analyst follow-up requirements.
