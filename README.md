# DropVault Bot — Railway

Bot liczy dropy osobno z kanału Pawła albo Ryzena. Po wpisaniu `/drop` najpierw wybierasz kanał, potem rodzaj peta, konto oraz zakres dat i godzin. Opcja **Oba kanały** jest dostępna tylko wtedy, gdy celowo chcesz połączyć wyniki.

## Zmienne Railway

Dodaj w zakładce **Variables**:

- `TOKEN` — token bota
- `CLIENT_ID` — Application ID bota
- `GUILD_ID` — ID serwera Discord
- `TIME_ZONE=Europe/Warsaw`
- `MAX_MESSAGES=25000`

Kanały są już wpisane w `index.js`:

- Dropy Paweł: `1515437409653756005`
- Dropy Ryzen: `1524841513606189178`

Opcjonalnie możesz nadpisać je zmiennymi:

- `PAWEL_DROP_CHANNEL_ID`
- `RYZEN_DROP_CHANNEL_ID`

## Uprawnienia Discord

Włącz `Message Content Intent`. Na obu kanałach bot potrzebuje:

- View Channel
- Read Message History
- Send Messages
- Embed Links
- Use Application Commands

## Railway

Wgraj zawartość ZIP-a do głównego katalogu repozytorium. Railway wykryje `Dockerfile`. Nie ustawiaj ręcznie komendy `npm ci`.
