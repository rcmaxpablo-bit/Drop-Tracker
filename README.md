# DropVault Bot 2.0

Bot Discord do analizowania dropów Huge, Titanic i Gargantuan z dwóch oddzielnych kanałów.

## Kanały i osoby

- 🟢 Dropy Paweł: `1515437409653756005`
- 🔵 Dropy Ryzen: `1524841513606189178`
- Ping Paweł: `1265797244074852576`
- Ping Ryzen: `1330652001075335300`

Wszystkie ID można zmienić przez Railway Variables bez edytowania kodu.

## Funkcje

### `/drop`

- wybór kanału Paweł / Ryzen / oba,
- wybór Huge / Titanic / Gargantuan / wszystkie,
- filtr wariantu: Normal, Golden, Rainbow, Shiny, Shiny Golden, Shiny Rainbow,
- konto wybierane z listy, także gdy kont jest więcej niż 24,
- zakres dat i godzin,
- najnowszy RAP tego samego peta,
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
- historia na stronach.

### `/petvalue`

Pokazuje:

- pierwszy i najnowszy RAP,
- zmianę kwotową i procentową,
- najniższy oraz najwyższy RAP,
- historię zmian ceny z datami, kontami i kanałami,
- przyciski Poprzednia / Następna.

### Raport dzienny

Codziennie o `23:59` w strefie `Europe/Warsaw` bot wysyła osobny raport na kanał Pawła i Ryzena:

- liczbę dropów,
- łączny RAP,
- najlepszy drop,
- najlepsze konto,
- podział Huge / Titanic / Gargantuan,
- RAP oddzielnie dla każdego konta,
- RAP oddzielnie dla każdego peta.

### Alerty i rekordy

Bot pinguje odpowiednią osobę na kanale, gdy pojawi się:

- Titanic,
- Gargantuan,
- Shiny Rainbow,
- RAP w przedziale `4B ±100M`,
- nowy rekord RAP na kanale,
- nowy rekord RAP dla typu Huge, Titanic lub Gargantuan.

Przedział i dodatkowy minimalny RAP można zmienić w Variables.

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
STATE_DIR=/app/data
```

## Railway Volume — ważne dla rekordów

Dodaj Volume i ustaw mount path:

```text
/app/data
```

Dzięki temu bot zapamięta rekordy i wysłane raporty po restarcie lub redeployu. Bez Volume bot nadal działa, ale plik stanu może zniknąć po nowym deployu.

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
