# DropVault Bot 2.7 — wybór kont Roblox z listy

Bot analizuje dropy Huge, Titanic i Gargantuan z dwóch oddzielnych kanałów oraz pobiera aktualny RAP z PS99RAP.

## Najważniejsza zmiana

Przy komendach `/drop`, `/today` i `/pet` nie trzeba już ręcznie wpisywać nicku konta Roblox. Najpierw ustawiasz filtry w formularzu, a po zatwierdzeniu bot automatycznie pokazuje listę nicków wykrytych na wybranym kanale.

- lista kont jest pobierana oddzielnie z kanału Pawła, Ryzena albo z obu kanałów,
- zawsze dostępna jest opcja **Wszystkie konta**,
- przy ponad 24 kontach pojawiają się przyciski **Poprzednie konta** i **Następne konta**,
- wybrany nick jest używany jako filtr bez ręcznego wpisywania.

### `/drop`

Formularz zawiera:

- kanał: 🟢 Dropy Paweł / 🔵 Dropy Ryzen / oba,
- rodzaj: Huge / Titanic / Gargantuan / wszystkie,
- wariant: Normal / Golden / Rainbow / Shiny / Shiny Golden / Shiny Rainbow,
- po zatwierdzeniu formularza: lista wykrytych kont Roblox,
- zakres dat i godzin w formacie `DD.MM.RRRR GG:MM - DD.MM.RRRR GG:MM`.

### `/today`

Formularz zawiera kanał, rodzaj i wariant. Po zatwierdzeniu wybierasz konto z automatycznej listy. Bot liczy od dzisiejszej godziny `00:00` do chwili użycia komendy.

### `/pet`

Formularz zawiera nazwę peta, kanał, wariant oraz opcjonalny zakres dat `DD.MM.RRRR - DD.MM.RRRR`. Po zatwierdzeniu wybierasz konto z automatycznej listy.

### `/petvalue`

Formularz zawiera nazwę peta, rodzaj, wariant, okres historii oraz opcjonalny własny zakres dat. Historia pochodzi wyłącznie z PS99RAP.

### `/webhookurl`

Administrator wybiera w oknie Pawła albo Ryzena i dostaje osobny adres relay do wklejenia w skrypcie Roblox.

## Kanały i pingi

- 🟢 Dropy Paweł: `1515437409653756005`
- 🔵 Dropy Ryzen: `1524841513606189178`
- Ping Paweł: `1265797244074852576`
- Ping Ryzen: `1330652001075335300`

Wszystkie ID można zmienić przez Railway Variables.

## Pozostałe funkcje

- raport dzienny o `23:59` osobno dla Pawła i Ryzena,
- aktualny RAP z PS99RAP z awaryjną ceną z kanału,
- alerty dla Titanic, Gargantuan, Shiny Rainbow i RAP `4B ±100M`,
- rekordy RAP,
- przyciski następnej i poprzedniej strony,
- relay webhooka Roblox, dzięki któremu drop wysyła bot DropVault.

## Railway Variables

Najważniejsze zmienne:

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

PAWEL_INGEST_SECRET=DŁUGIE_LOSOWE_HASŁO
RYZEN_INGEST_SECRET=INNE_DŁUGIE_LOSOWE_HASŁO

ALERT_RAP_CENTER=4000000000
ALERT_RAP_TOLERANCE=100000000
PS99RAP_ENABLED=true
STATE_DIR=/app/data
```

## Railway Volume

Dodaj Volume z mount path:

```text
/app/data
```

## Discord Developer Portal

Włącz `Message Content Intent`.

Bot potrzebuje:

- View Channel,
- Read Message History,
- Send Messages,
- Embed Links,
- Use Application Commands.

## Wgranie aktualizacji

Podmień wszystkie pliki projektu zawartością ZIP-a i wykonaj pełny `Redeploy`. Komendy serwerowe z `GUILD_ID` odświeżają się po uruchomieniu bota.

## Panele prywatnych serwerów Roblox

Po każdym uruchomieniu bot publikuje albo aktualizuje jeden embed z linkami:

- Paweł: kanał `1525508811039969480` — 5 serwerów,
- Ryzen: kanał `1525508845324075179` — 4 serwery.

Każdy serwer ma przycisk **Serwer 1/2/...** oraz osobny blok kodu z ikoną kopiowania po prawej stronie, dzięki czemu cały link można skopiować jednym kliknięciem. Bot zapamiętuje ID wiadomości i edytuje istniejący panel zamiast wysyłać duplikat przy każdym restarcie.

Bot potrzebuje na obu kanałach uprawnień: **View Channel**, **Send Messages**, **Embed Links** i **Read Message History**.
