# DropVault Bot 3.0 — Dropy + Trading Plaza

Bot analizuje dropy Huge/Titanic/Gargantuan oraz zakupy z Booths Sniper na dwóch oddzielnych kanałach. Aktualne ceny pobiera z publicznego API PS99RAP.

## Nowe komendy Trading Plaza

### `/bestbuys`

Otwiera formularz z wyborem:

- kanału: 🟢 Plaza Paweł / 🔵 Plaza Ryzen / obie,
- zakresu dat,
- opcjonalnego przedmiotu i konta,
- sortowania według aktualnego profitu, procentu profitu, liczby sztuk lub różnicy ceny do RAP.

Każdy zakup pokazuje cenę zapłaconą, cenę za sztukę, aktualny RAP z PS99RAP, aktualną wartość całego zakupu i szacowany profit.

### `/plazaitem`

Pokazuje statystyki konkretnego przedmiotu:

- ile razy został kupiony,
- ile sztuk kupiono,
- ile łącznie wydano,
- aktualną łączną wartość według PS99RAP,
- aktualny szacowany profit,
- największy zakup i jego datę,
- najniższą cenę za sztukę,
- historię zakupów z przyciskami stron.

### `/plazatime`

Grupuje zakupy według godziny w strefie `Europe/Warsaw` i pokazuje:

- godzinę z największą liczbą zakupów,
- godzinę z największą liczbą kupionych sztuk,
- godzinę z największym aktualnym profitem,
- rozpisanie wszystkich 24 godzin.

## Automatyczny raport Trading Plaza o 23:59

Bot wysyła osobny raport na kanał Pawła i Ryzena:

- liczbę zakupów,
- liczbę kupionych przedmiotów,
- sumę wydanych diamondów,
- łączny aktualny RAP z PS99RAP,
- szacowany profit,
- najlepszy zakup,
- najczęściej kupowany przedmiot,
- podział według przedmiotów i kont.

Domyślne kanały:

- 🟢 Plaza Paweł: `1524784522154213397`
- 🔵 Plaza Ryzen: `1524841567028903966`

## Komendy dropów

- `/drop` — zakres dat i godzin, typ, wariant, kanał i konto z listy,
- `/today` — dzisiejsze dropy od 00:00,
- `/pet` — historia dropów konkretnego peta,
- `/petvalue` — historia RAP wyłącznie z PS99RAP,
- `/webhookurl` — adres relay dla skryptu Roblox.

## Pozostałe funkcje

- raport dropów o 23:59 osobno dla Pawła i Ryzena,
- alerty dla Titanic, Gargantuan, Shiny Rainbow i RAP `4B ±100M`,
- rekordy RAP,
- aktualny RAP z PS99RAP z fallbackiem z webhooka/kanału,
- przyciski poprzedniej i następnej strony,
- webhook relay,
- panele prywatnych serwerów Roblox z blokami łatwymi do kopiowania.

## Railway Variables

```env
TOKEN=TOKEN_BOTA
CLIENT_ID=ID_APLIKACJI
GUILD_ID=ID_SERWERA
TIME_ZONE=Europe/Warsaw
MAX_MESSAGES=25000

PAWEL_DROP_CHANNEL_ID=1515437409653756005
RYZEN_DROP_CHANNEL_ID=1524841513606189178
PAWEL_REPORT_CHANNEL_ID=1515437409653756005
RYZEN_REPORT_CHANNEL_ID=1524841513606189178

PAWEL_PLAZA_CHANNEL_ID=1524784522154213397
RYZEN_PLAZA_CHANNEL_ID=1524841567028903966
PAWEL_PLAZA_REPORT_CHANNEL_ID=1524784522154213397
RYZEN_PLAZA_REPORT_CHANNEL_ID=1524841567028903966

PAWEL_ALERT_USER_ID=1265797244074852576
RYZEN_ALERT_USER_ID=1330652001075335300
PAWEL_INGEST_SECRET=DŁUGIE_LOSOWE_HASŁO
RYZEN_INGEST_SECRET=INNE_DŁUGIE_LOSOWE_HASŁO

PS99RAP_ENABLED=true
PS99RAP_BASE_URL=https://ps99rap.com
STATE_DIR=/app/data
```

## Railway Volume

Dodaj Volume z mount path:

```text
/app/data
```

## Uprawnienia Discord

Włącz `Message Content Intent`. Bot potrzebuje na kanałach dropów, Plaza, raportów i serwerów:

- View Channel,
- Read Message History,
- Send Messages,
- Embed Links,
- Use Application Commands.

## Aktualizacja

Podmień cały projekt zawartością ZIP-a i wykonaj pełny `Redeploy`. Przy ustawionym `GUILD_ID` nowe komendy pojawiają się po ponownym uruchomieniu bota.

PS99RAP jest źródłem aktualnego RAP; ceny API mogą być buforowane przez serwis.
