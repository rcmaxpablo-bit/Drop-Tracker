# DropVault Bot 3.2 — Dropy + licznik Hatch Tracker + Trading Plaza

Bot analizuje dropy Huge/Titanic/Gargantuan oraz zakupy z Booths Sniper na dwóch oddzielnych kanałach. Aktualne ceny pobiera z publicznego API PS99RAP.

## Licznik wiadomości Hatch Tracker — v3.2.0

- bot rozpoznaje embedy z polami `Pet`, `Player` i `Eggs Hatched`,
- każda poprawna wiadomość z hatchem zwiększa licznik danego kanału o 1,
- wartość `Eggs Hatched` w wiadomości wysłanej przez relay jest zastępowana aktualną liczbą wiadomości,
- po restarcie bot skanuje starsze wiadomości i odbudowuje licznik,
- standardowy format `Item` / `In Account` / `RAP` nadal działa.

Licznik jest prowadzony osobno dla kanału Pawła i osobno dla kanału Ryzena. Aby bot mógł podmienić `0.0` w embedzie, skrypt Roblox musi wysyłać webhook na adres zwrócony przez `/webhookurl`, a nie bezpośrednio na webhook Discorda.


## Ręczna komenda `/raport` — v3.1.0

Komenda otwiera okienko, w którym wybierasz:

- raport dropów, raport Trading Plaza albo oba,
- Pawła, Ryzena albo obie osoby,
- konkretną datę w formacie `DD.MM.RRRR`.

Bot wysyła gotowe embedy na właściwe kanały raportowe. Dzięki temu można ręcznie wygenerować brakujący raport po restarcie Railway albo sprawdzić dowolny wcześniejszy dzień. Komenda jest dostępna dla osób z uprawnieniem **Zarządzanie serwerem**.

Ręczne wygenerowanie raportu nie wyłącza automatycznego raportu o 23:59, więc raport uruchomiony w ciągu dnia jest tylko bieżącym podsumowaniem.

## Poprawka raportu Plaza Paweł — v3.0.1

- raport Pawła jest zawsze wysyłany na `1524784522154213397`,
- raporty Plaza działają w osobnym schedulerze i nie czekają na raporty dropów,
- jeśli Railway ominie dokładnie 23:59, bot nadrabia raport po północy do 02:00,
- bot sprawdza ostatnie wiadomości, aby po redeployu nie wysłać duplikatu raportu.


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
- `/webhookurl` — adres relay dla skryptu Roblox,
- `/raport` — ręczne wysłanie raportu dropów i/lub Trading Plaza dla wybranej daty.

## Pozostałe funkcje

- raport dropów o 23:59 osobno dla Pawła i Ryzena,
- alerty dla Titanic, Gargantuan, Shiny Rainbow i RAP `4B ±100M`,
- rekordy RAP,
- aktualny RAP z PS99RAP z fallbackiem z webhooka/kanału,
- przyciski poprzedniej i następnej strony,
- webhook relay z licznikiem wiadomości Hatch Tracker,
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

# Kanały Plaza są wpisane bezpośrednio w index.js:
# Paweł: 1524784522154213397
# Ryzen: 1524841567028903966

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
