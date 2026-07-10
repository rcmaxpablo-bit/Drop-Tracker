# DropVault Bot

Discord bot do analizowania dropów Huge, Titanic i Gargantuan z dwóch osobnych kanałów.

## Funkcje

- `/drop` — wybór kanału, typu peta, konta oraz zakresu dat i godzin.
- `/pet` — historia konkretnego peta, liczba dropów, konta, daty i najnowszy RAP.
- Osobny wybór kanału: Dropy Paweł, Dropy Ryzen albo oba kanały.
- Najnowszy RAP dla danego peta jest pobierany z jego ostatniego znalezionego dropu.
- Sortowanie według hierarchii:
  1. Shiny Rainbow
  2. Shiny Golden
  3. Shiny
  4. Normal

  Następnie według typu:
  1. Gargantuan
  2. Titanic
  3. Huge

## Railway Variables

Ustaw w Railway → Variables:

```env
TOKEN=TOKEN_BOTA
CLIENT_ID=ID_APLIKACJI_BOTA
GUILD_ID=ID_SERWERA
TIME_ZONE=Europe/Warsaw
MAX_MESSAGES=25000
PAWEL_DROP_CHANNEL_ID=1515437409653756005
RYZEN_DROP_CHANNEL_ID=1524841513606189178
```

## Discord Developer Portal

Włącz `Message Content Intent`.

Bot potrzebuje na obu kanałach:

- View Channel
- Read Message History
- Send Messages
- Embed Links
- Use Application Commands

## Uruchomienie

```bash
npm install
npm start
```

Na Railway projekt użyje dołączonego `Dockerfile`.
