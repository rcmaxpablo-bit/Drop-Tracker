# DropVault Bot 2.4 — `/today` i webhook relay

Bot Discord do analizowania dropów Huge, Titanic i Gargantuan z dwóch oddzielnych kanałów. Aktualny RAP oraz historia cen są pobierane z PS99RAP.

## Nowość: `/today`

Przykład:

```text
/today kanal:Dropy Paweł konto:wszystkie typ:Wszystkie wariant:Wszystkie warianty
```

Komenda liczy dropy od `00:00` do chwili użycia komendy w strefie `Europe/Warsaw`. Można filtrować kanał, konto, typ i wariant. Wynik ma podział petów, łączny RAP i najlepsze dropy sortowane według RAP.

## Nowość: webhook relay Roblox → bot Discord

Zamiast wklejać do skryptu bezpośredni Discord webhook, wklejasz adres DropVault. Relay przyjmuje standardowy payload webhooka Discord, odczytuje `Item`, `In Account` oraz RAP, pobiera bieżący RAP z PS99RAP i publikuje embed jako zwykła wiadomość bota.

Dzięki temu nad wiadomością widnieje bot DropVault, a nie nazwa webhooka ZapHub.

### Konfiguracja

Na Railway dodaj:

```env
PAWEL_INGEST_SECRET=DLUGIE_LOSOWE_HASLO_PAWEL
RYZEN_INGEST_SECRET=INNE_DLUGIE_LOSOWE_HASLO_RYZEN
```

Potem:

1. Railway → **Settings → Networking → Generate Domain**.
2. Wykonaj **Redeploy**.
3. Na Discordzie użyj `/webhookurl` i wybierz Pawła albo Ryzena.
4. Skopiowany URL wklej w istniejącym skrypcie w miejsce Discord webhooka.

Adres jest osobny dla każdej osoby i kieruje wiadomość na właściwy kanał:

- 🟢 Paweł: `1515437409653756005`
- 🔵 Ryzen: `1524841513606189178`

`/webhookurl` jest domyślnie dostępne tylko dla osób z uprawnieniem **Manage Server**. URL zawiera sekret. Po wycieku zmień sekret na Railway i zrób Redeploy.

### Wymagany format payloadu

Relay obsługuje zwykły JSON webhooka Discord:

```json
{
  "embeds": [
    {
      "title": "You have obtained a new Huge pet!",
      "fields": [
        {
          "name": "Obtained Huge Pet Info",
          "value": "Item: `Huge Referee Dalmatian`\nRAP: `23700000`"
        },
        {
          "name": "User Info",
          "value": "In Account: `konto123`"
        }
      ]
    }
  ]
}
```

Jeżeli używany skrypt sprawdza, czy URL zaczyna się dokładnie od domeny Discorda, trzeba zmienić tę walidację w skrypcie. Nie należy umieszczać tokenu bota w Robloxie.

## Pozostałe funkcje

- `/drop` — zakres dat i godzin, osobny kanał, konto, typ i wariant,
- `/pet` — historia dropów konkretnego peta,
- `/petvalue` — historia RAP wyłącznie z PS99RAP,
- raport dzienny o 23:59 osobno dla Pawła i Ryzena,
- alerty dla Titanic, Gargantuan, Shiny Rainbow, 4B ±100M i rekordów,
- automatyczny aktualny RAP z PS99RAP z fallbackiem na kanał,
- autocomplete nazw petów i kont,
- przyciski poprzednia/następna,
- ochrona relay przed identycznym ponownym payloadem przez 30 sekund.

## Railway

Najważniejsze zmienne znajdują się w `.env.example`. Dodaj Volume z mount path:

```text
/app/data
```

Bot uruchamia jednocześnie klienta Discord i serwer HTTP. Railway przekazuje port przez zmienną `PORT`; kod nasłuchuje na `0.0.0.0`.

## Uprawnienia Discord

Włącz `Message Content Intent`. Bot potrzebuje:

- View Channel,
- Read Message History,
- Send Messages,
- Embed Links,
- Use Application Commands.

## Kontrola działania relay

Po wygenerowaniu domeny otwórz w przeglądarce:

```text
https://TWOJA-DOMENA/health
```

Powinien pojawić się JSON z `ok: true` i `discordReady: true`.
