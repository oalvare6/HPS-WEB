# Houston Premier Soccer

Marketing website for Houston Premier Soccer - Houston's home for competitive soccer.

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Open http://localhost:3000
```

## Logo

The logo is already in place at `/public/brand/hps-badge.png`. If you need to replace it, use a transparent PNG of the HPS circular badge.

## Pages

- `/` - Home (hero, facility preview, offerings, past events, location)
- `/about` - About (story, values, local ownership)
- `/facility` - Facility (field specs, amenities, rules, map placeholder)
- `/events` - Events (leagues + tournaments sections)
- `/contact` - Contact form
- `/register` - Registration placeholder

## Deployment

This project is Vercel-ready:

```bash
# Verify build passes
npm run build

# Push to GitHub, connect to Vercel
# Zero configuration needed - no env vars required
```

## Tech Stack

- Next.js 15 (App Router)
- TypeScript
- Tailwind CSS
- Lucide React (icons)

## Phase 1 Scope

This is the foundation website. Phase 2 will add:
- Real registration with database
- Payment processing
- Email notifications
- Admin dashboard
