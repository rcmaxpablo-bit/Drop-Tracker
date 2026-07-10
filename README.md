# Discord Drop Tracker

Bot dodaje komendę `/drop` i analizuje embedy webhooków z kanału ustawionego w `DROP_CHANNEL_ID`.

## Railway

1. Wrzuć folder do repozytorium GitHub.
2. Na Railway utwórz projekt z tego repozytorium.
3. W `Variables` dodaj wartości z `.env.example`.
4. W Discord Developer Portal włącz `Message Content Intent`.
5. Zaproś bota z zakresami `bot` oraz `applications.commands`.
6. Na kanale z webhookami bot potrzebuje: View Channel i Read Message History.

`GUILD_ID` sprawia, że komenda pojawia się od razu tylko na jednym serwerze. Po usunięciu tej zmiennej komenda jest rejestrowana globalnie.
