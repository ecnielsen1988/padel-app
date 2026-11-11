# Makkerranglisten

Tilmeldingen til Makkerliga 2027 Vinter findes på `/makkerrangliste` og fra appens startside.
Fristen gælder til dagens udgang i dansk tid. Begge spillere skal have en
spillerprofil. Mix og Kvinder bruger profilernes registrerede køn.

## Sæt Supabase og MobilePay op

1. Kør [databaseændringen](../database/partner_tournaments.sql) én gang i
   Supabase SQL Editor i det miljø, hvor tilmeldingen skal bruges. Kør derefter
   [tilmelding pr. række](../database/partner_tournaments_per_division.sql) og
   [opsætningen af Makkerliga 2027 Vinter](../database/partner_tournaments_winter_2027.sql).
   Kør til sidst [puljer og kampe](../database/partner_league.sql).
   Puljeændringen bruger de eksisterende funktioner til kamptråde og booking.
2. Brug firmaets salgsenhed med [Integreret betaling (ePayment)](https://vippsmobilepay.com/da-DK/online/payment-integration).
   Brug en test-salgsenhed og en separat testdatabase til prøvebetalinger.
3. Registrér én webhook via [Vipps MobilePay Webhooks API](https://developer.vippsmobilepay.com/docs/APIs/webhooks-api/api-guide/)
   på samme salgsenhed. Sæt URL'en til
   `https://APPENS-DOMÆNE/api/makkerrangliste/webhook` og vælg
   `epayments.payment.authorized.v1`, `epayments.payment.aborted.v1`,
   `epayments.payment.expired.v1`, `epayments.payment.terminated.v1`,
   `epayments.payment.cancelled.v1` og `epayments.payment.captured.v1`.
   Gem den returnerede hemmelighed som `MOBILEPAY_WEBHOOK_SECRET`.
4. Sæt følgende servervariabler i hostingmiljøet og genudrul appen.

| Variabel | Værdi |
| --- | --- |
| `MOBILEPAY_EPAYMENT_MODE` | `test` til prøvebetalinger eller `production` til rigtige betalinger |
| `MOBILEPAY_APP_URL` | Appens offentlige HTTPS-adresse, samme domæne som webhooken |
| `MOBILEPAY_MSN` | Salgsenhedens Merchant Serial Number |
| `MOBILEPAY_CLIENT_ID` | Salgsenhedens Client ID |
| `MOBILEPAY_CLIENT_SECRET` | Salgsenhedens Client Secret |
| `MOBILEPAY_SUBSCRIPTION_KEY` | Salgsenhedens Subscription Key |
| `MOBILEPAY_WEBHOOK_SECRET` | Hemmelighed fra webhookregistreringen |

## Test før åbning

- Tilmeld to testspillere. Bekræft i MobilePay, at beløbet er **200 DKK** til
  den valgte salgsenhed. Når beløbet er trukket, skal begge konti se
  **Tilmeldt og betalt** i appen. Kontrollér også betalingen i erhvervsportalen.
- Prøv at tilmelde en af spillerne igen i samme række.
  En ny tilmelding i samme række skal blive afvist. En anden række har egne pladser.
- Afbryd en betaling eller lad den udløbe. Begge spillere skal kunne tilmelde
  sig igen, mens fristen stadig er åben.

## Admin, puljer og kampe

- Se tilmeldte par og betalingsstatus under **Admin → Makkerliga**.
- Efter tilmeldingsfristen kan admin danne og offentliggøre puljerne.
  Appen bruger de betalte pars samlede Elo på tidspunktet for offentliggørelsen.
  Hvert par møder de andre par i sin pulje én gang.
- Fra **Puljer og stillinger** åbner deltagerne deres kamptråd med alle fire
  spillere. Når tiden er aftalt og banen booket, kan en deltager bekræfte
  bookingen. Ved ændringer skal den bekræftes igen.
- Bekræftede kampe vises i [den offentlige kalender](https://padelhuset-app.netlify.app/makkerrangliste/kalender).
  Indberet resultatet fra kampaftalen. Appen opdaterer puljestillingen og bruger
  samme dobbelte Elo-vægt som for eventkampe.
