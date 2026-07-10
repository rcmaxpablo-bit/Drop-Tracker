# DropVault Bot — Railway

Ta wersja jest przygotowana pod Railway i używa Dockerfile.
Nie zawiera package-lock.json, który powodował błąd `npm ci`.

## Zmienne Railway

Dodaj w zakładce Variables:

- `TOKEN` — token bota
- `CLIENT_ID` — Application ID
- `GUILD_ID` — ID serwera Discord
- `TIME_ZONE=Europe/Warsaw`
- `MAX_MESSAGES=25000`

Kanały są już wpisane w `index.js`:

- dropy-paweł: `1515437409653756005`
- dropy-ryzen: `1524841513606189178`

## Discord

Włącz `Message Content Intent` i nadaj botowi na obu kanałach:

- View Channel
- Read Message History
- Send Messages
- Embed Links
- Use Application Commands

## Railway

Wgraj zawartość tego folderu do głównego katalogu repozytorium.
Railway automatycznie wykryje plik `Dockerfile`.
Nie ustawiaj ręcznie komendy `npm ci`.
