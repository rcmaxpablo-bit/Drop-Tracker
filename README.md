# DropVault Bot 2.2 — uporządkowane `/petvalue`

Bot Discord do analizowania dropów Huge, Titanic i Gargantuan z dwóch oddzielnych kanałów.
Aktualne ceny oraz historia RAP są pobierane z publicznego API `ps99rap.com`.

## Kanały i osoby

- 🟢 Dropy Paweł: `1515437409653756005`
- 🔵 Dropy Ryzen: `1524841513606189178`
- Ping Paweł: `1265797244074852576`
- Ping Ryzen: `1330652001075335300`

Wszystkie ID można zmienić przez Railway Variables bez edytowania kodu.

## Wycena PS99RAP

Bot pobiera aktualny RAP dla każdego peta przez endpoint zbiorczy PS99RAP.

- `/drop`, `/pet`, raporty dzienne, alerty i rekordy używają aktualnej ceny z PS99RAP,
- `/petvalue` pobiera pełną historię RAP z PS99RAP,
- ceny są trzymane w pamięci przez 2 minuty, żeby nie wysyłać zbędnych zapytań,
- jeśli PS99RAP chwilowo nie odpowiada albo nie posiada ceny, bot używa najnowszego RAP znalezionego na kanale,
- w embedach widnieje źródło ceny i link do strony peta.

## Funkcje

### `/drop`

- wybór kanału Paweł / Ryzen / oba,
- wybór Huge / Titanic / Gargantuan / wszystkie,
- filtr wariantu: Normal, Golden, Rainbow, Shiny, Shiny Golden, Shiny Rainbow,
- konto wybierane z listy, także gdy kont jest więcej niż 24,
- zakres dat i godzin,
- aktualny RAP z PS99RAP,
- awaryjny fallback na najnowszą cenę z kanału,
- przyciski Poprzednia / Następna,
- najlepsze dropy sortowane wyłącznie według RAP,
- podział petów: Gargantuan > Titanic > Huge, potem wariant.

### `/pet`

Przykład:

```text
/pet nazwa:Titanic Goalie Octopus kanal:Dropy Ryzen konto:wszystkie
```

- autouzupełnianie nazw petów,
- autouzupełnianie kont,
- filtr wariantu,
- opcjonalny zakres dat,
- aktualna cena z PS99RAP,
- historia dropów na stronach.

### `/petvalue`

Pokazuje uporządkowaną historię cen **wyłącznie z PS99RAP**. Nie wybiera się już kanału ani konta, więc dane Pawła i Ryzena nie są mieszane.

Przykład:

```text
/petvalue nazwa:Titanic Goalie Octopus okres:Ostatnie 30 dni
```

- okres: 7, 30, 90, 180 dni albo cała historia,
- opcjonalne własne daty `data_od` i `data_do`,
- jedna końcowa cena na każdy dzień,
- pokazywane są tylko faktyczne zmiany RAP,
- najnowsze daty są zawsze na górze,
- daty mają czytelny format `DD.MM.RRRR`,
- pierwszy RAP, aktualny RAP i zmiana procentowa,
- najniższy oraz najwyższy RAP,
- przyciski Poprzednia / Następna,
- link do strony przedmiotu w PS99RAP.

Jeżeli PS99RAP nie odpowiada, bot pokazuje jasny komunikat zamiast mieszać historię z wiadomościami Discord.

### Raport dzienny

Codziennie o `23:59` w strefie `Europe/Warsaw` bot wysyła osobny raport na kanał Pawła i Ryzena:

- liczbę dropów,
- łączny aktualny RAP,
- najlepszy drop,
- najlepsze konto,
- podział Huge / Titanic / Gargantuan,
- RAP oddzielnie dla każdego konta,
- RAP oddzielnie dla każdego peta,
- liczbę cen pobranych z PS99RAP i liczbę fallbacków.

### Alerty i rekordy

Bot pinguje odpowiednią osobę na kanale, gdy pojawi się:

- Titanic,
- Gargantuan,
- Shiny Rainbow,
- RAP w przedziale `4B ±100M`,
- nowy rekord RAP na kanale,
- nowy rekord RAP dla typu Huge, Titanic lub Gargantuan.

Alerty i rekordy używają aktualnej ceny z PS99RAP, jeśli jest dostępna.

## Railway Variables

Skopiuj wartości z `.env.example` do Railway → Variables.

Najważniejsze:

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
PAWEL_ALERT_USER_ID=1265797244074852576
RYZEN_ALERT_USER_ID=1330652001075335300
ALERT_RAP_CENTER=4000000000
ALERT_RAP_TOLERANCE=100000000
ALERT_MIN_RAP=0
PS99RAP_ENABLED=true
PS99RAP_BASE_URL=https://ps99rap.com
PS99RAP_CACHE_TTL_MS=120000
PS99RAP_TIMEOUT_MS=15000
PS99RAP_BULK_CHUNK_SIZE=40
STATE_DIR=/app/data
```

## Railway Volume — ważne dla rekordów

Dodaj Volume i ustaw mount path:

```text
/app/data
```

Dzięki temu bot zapamięta rekordy i wysłane raporty po restarcie lub redeployu.

## Discord Developer Portal

Włącz `Message Content Intent`.

Bot potrzebuje na obu kanałach:

- View Channel,
- Read Message History,
- Send Messages,
- Embed Links,
- Use Application Commands.

## Uruchomienie lokalne

```bash
npm install
npm start
```

Railway automatycznie użyje dołączonego `Dockerfile`.
