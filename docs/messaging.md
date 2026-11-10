# Beskeder, notifikationer og kommende udfordringskampe

## Denne ændring

- Private beskeder og ranglistens eksisterende udfordringsknap bruger `/api/messages`.
  Afsenderens id og navn findes på serveren fra den validerede session og profil.
- Beskeden gemmes før push. Et manglende abonnement eller en pushfejl fortryder
  ikke beskeden og får ikke klienten til at sende den igen automatisk.
- Teksten bevares ved afsendelsesfejl. Højst 5.000 tegn, ingen beskeder til sig selv.
- En samtale markeres kun læst, når siden og samtalepanelet er synlige.
- Beskedsiden og forsiden bruger Realtime med genindlæsning ved fokus og hver
  30. sekund, når siden er synlig. Ældre beskeder kan hentes fra beskedsiden.
- Notifikationer kan aktiveres, genaktiveres, testes og deaktiveres på denne enhed.
  Åbn indstillingerne med klokken ved siden af beskeder på forsiden.
  Desktop og Android kræver ikke installation; iPhone/iPad får installationshjælp.
- Klik på push åbner den relevante samtale, også når en appfane allerede er åben.
- Logout fra appens to logoutknapper afmelder enhedens abonnement først.
- Det tidligere åbne push-API kræver admin. Test-API kan kun sende til den
  indloggede bruger. De gamle gruppebesked-API'er kræver også relevant adgang.

- Ved udgivelse af et eventprogram eller et ugeprogram sendes push til spillerne
  i det gemte program. Hver spiller tælles kun én gang, selv om de spiller flere
  sæt. Linket viser spillerens egne kampe. En pushfejl ændrer ikke udgivelsen.

## Ibrugtagning

1. Kør `database/messaging_security.sql` i Supabase SQL Editor.
   Scriptet bevarer beskederne, men erstatter eksisterende RLS-politikker for
   `beskeder` og `push_subscriptions`. Det forudsætter de eksisterende felter
   fra beskedsiden og `profiles.id/visningsnavn`. Det skal gennemgås op imod
   projektets nuværende politikker, herunder eventuelle eksterne integrationer.
   En modtager kan kun opdatere læst-status; en afsender kan slette sin besked.
   Eksisterende Realtime-publication får beskedtabellen tilføjet.
2. Sæt `VAPID_PUBLIC`, `VAPID_PRIVATE` og eventuelt `VAPID_MAILTO` på hosting.
   Offentlig og privat nøgle skal være fra samme VAPID-nøglepar. Serveren kan
   også bruge `NEXT_PUBLIC_VAPID_PUBLIC_KEY` som offentlig nøgle, men
   `VAPID_PUBLIC` prioriteres. Klienten henter den aktuelle offentlige nøgle fra
   serveren. En gammel browsernøgle bliver udskiftet ved genaktivering.
   Supabase kræver `NEXT_PUBLIC_SUPABASE_URL` og
   `SUPABASE_SERVICE_ROLE_KEY` på serveren; sidstnævnte må ikke være offentlig.
3. Deploy appen. Åbn den med rigtig login, aktivér notifikationer, og send en test.
   Sikkerhedskritiske API'er accepterer ikke det lokale login-bypass. Sæt
   `NEXT_PUBLIC_LOCAL_DEV_BYPASS=false` ved lokal afprøvning med rigtige konti.
4. Brug to rigtige testkonti til kontrollen nedenfor, inden løsningen tages i brug.

Lokale miljøvariabler indeholder ikke VAPID-nøgler ved denne ændring. Der er
hverken kørt databaseændringer eller sendt rigtige pushnotifikationer under
udviklingen. SQL-scriptets policies og trigger skal derfor også verificeres i
Supabase. Koden alene bekræfter ikke leveringen på en telefon.

## Kontrol med to brugere

- A sender til B. B modtager kun én besked og ser tælleren stige på forsiden.
- På B's mobil: Åbn kun samtalelisten. Beskeden skal stadig være ulæst. Åbn
  samtalen: Nu markeres den læst, og tælleren opdateres.
- Skjul B's app. En ny besked bliver ikke læst, før B vender tilbage til samtalen.
- Afbryd forbindelsen på A, og prøv at sende. Teksten skal blive stående.
- Aktivér, deaktivér og genaktivér push på samme enhed. Test også tilladelse
  givet i browseren uden en tilsvarende databaserække.
- Modtag og klik på push med appen lukket og med appen åben på en anden side.
- Log B ud på en delt enhed. B's nye beskeder må ikke længere give push der.
- Kontroller på databasen med rigtige JWT'er, at C ikke kan læse A/B's beskeder,
  ændre modtager, afsender eller tekst, sætte en besked læst for andre eller
  hente andres pushnøgler. B kan kvittere læst, A kan slette egne beskeder.
- Kontroller eventuelle eksisterende admin-RPC'er til fællesbeskeder efter
  ændringen af RLS-politikkerne.

Automatiske checks uden eksterne kald: `node scripts/test-messaging.mjs`.

## Næste trin: makkerliga

Private beskeder bruger fortsat `beskeder`. En spilleroprettet kamp har sin
egen tråd med fire deltagere, adskilt fra kampens aftale og resultater.

Almindelige udfordringskampe følger almindelige pointregler. Makkerligaen
kører i tre måneder med herre, dame og mix, som udgangspunkt seks hold pr.
pulje. Seedning fastlåses ved fristen ud fra parrets samlede ranglistepoint.
Makkerligaens resultater skal give dobbelte ranglistepoint som events.
Pointændringen og makkerligaen indgår ikke i denne leverance.

## Spilleroprettede kampe

Før udrulning: kør `database/player_matches.sql` i Supabase SQL Editor. Filen
opretter kamp, gruppetråd og læsestatus. Adgang håndhæves i serverens databasefunktioner.
Efter udrulning er **Mine kampe** indgangen på forsiden. Det gamle resultatflow
findes stadig under **Indberet en spillet kamp uden aftale**.

Kampen og trådens første besked gemmes sammen. Alle fire deltagere kan ændre
dato, tid, sted og bane, indtil resultatet er indberettet. Aftaleændringer
noteres i tråden. Resultatet bruger de fire deltagere fra aftalen; der kan
vælges makker pr. sæt, hvis spillerne har roteret. Det tæller som en almindelig
ranglistekamp. En gentaget indberetning af samme aftale gemmer ikke flere sæt.

Test databasen lokalt med `node scripts/test-player-matches.mjs` og PGlite;
se kommandoerne øverst i testfilen. Test API og push med
`node scripts/test-messaging.mjs`.

Kør derefter `database/player_match_booking.sql` for faste valg af sted og
bane, hele klokkeslæt og bookingstatus. En kamp starter åben. En af de fire
spillere kan bekræfte, at banen er booket, og alle har accepteret aftalen.
Ændringer i dato, tid, sted eller bane gør kampen åben igen.

Kør `database/player_match_delete.sql` før udgivelse af slettefunktionen.
Alle fire deltagere kan slette en kamp og dens tråd, så længe resultatet ikke er
indberettet. De øvrige deltagere får en pushbesked, hvis de har slået push til.
Kampoversigten er sorteret efter dato og starttid. Ved indtastning af et sæt
bytter valg af et andet navn de to spilleres pladser.

Indberettede kampe skjules i **Mine kampe**. En vellykket indberetning
åbner **Egne resultater** direkte. Kamptråden er stadig tilgængelig under Beskeder.
