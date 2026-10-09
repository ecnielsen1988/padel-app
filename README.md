This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

### Admin: ændring af spillernavne

Kør `database/rename_player.sql` én gang i Supabase SQL Editor, før den nye
side `/admin/spillernavne` tages i brug. Siden findes fra adminforsiden.
Funktionen kræver en indlogget bruger med `profiles.rolle = 'admin'` og
ændrer profil, alle fire spillerfelter samt `indberettet_af` i `newresults`
og navnene i `elo_day_state` i én transaktion. Scores og Elo-værdier bevares.
Navnekollisioner og ændringer siden siden blev indlæst afvises. Den nye
funktion kræver rigtig login også ved lokal udvikling med login-bypass.

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
