# OVERBOOKED! — Sopravvivi al DevFest

Il gioco cooperativo per chi organizza eventi tech. Una stagione di sei
eventi, dal meetup del giovedì al DevFest: prima il **Countdown** (poche sere
libere, troppe cose da fare), poi **la giornata** in tempo reale (speaker
dispersi, portatili muti, la chat dello staff che non dorme mai, un cane in
sala e un certo Murphy), infine **la retro**, come dopo un evento vero. Ogni
evento ha tre obiettivi; le stelle si spendono nel kit del chapter.

Un progetto di Nicola Guglielmi (GDE), organizer GDG, sulla scia di
[Last Mile Hero](../LastMileHero). Si gioca
da un link: da soli, in due sulla stessa tastiera o online tra lead di città
diverse. In italiano, inglese, francese, spagnolo e tedesco.

> Progetto della community, non è un prodotto ufficiale Google.

## Come si gioca

| | Cosa | Durata |
|---|---|---|
| 🃏 **Countdown** | Round a turni con dilemmi veri (sede, sponsor, volontari, catering, la Scatola del GDG). Ogni pallino è una sera libera. Quello che nessuno prende in carico succede comunque. Ogni scelta ha la sua lezione e la fonte. | 2-4 min |
| 🏃 **La giornata** | *Tocca* un problema: il tuo organizzatore ci va e lo risolve (da tastiera: WASD + Spazio). Problemi con un anello che si svuota, triangoli gialli da prevenire, la chat dello staff da gestire con Q/E, gente che ti ferma in corridoio. Tre obiettivi in alto. | 3-5 min |
| 📰 **La retro** | La Gazzetta locale, i numeri, i momenti chiave, tre lezioni con fonti, domande per la retro di gruppo, un impegno da copiare nella chat dei lead. | 2 min |

**La stagione**: Meetup (45 persone, 1 aula) → Build with AI Study Jam (aula +
Lab) → Women Techmakers IWD (spazio bimbi, consenso alle foto, percorso
accessibile) → Google I/O Extended (diretta del keynote, VIP, stampa) →
Hackathon notturno (dalle 18 alle 10: team bloccati, notte, pizza a mezzanotte,
demo e giuria) → DevFest (tre sale, 15 sessioni, tutto il caos). Ogni evento ha
tre obiettivi (una stella ciascuno); una stella sblocca il successivo.

**Si impara giocando**: la prima volta che succede qualcosa di nuovo il gioco si
ferma, illumina il punto della mappa e spiega in due righe cosa fare; il primo
Countdown e la prima vigilia hanno una guida passo passo. I primi livelli sono
più lenti e c'è una *modalità tranquilla* (più tempo per ogni problema e per la
chat). I consigli si spengono dalla pausa e si riattivano da «Come si gioca».

**Il kit del chapter**: le stelle della stagione comprano potenziamenti che
valgono per tutti gli eventi (walkie-talkie, lettore QR, kit AV, cartelli, moka
gigante, scarpe comode, squadra storica, co-organizzatore). Si cambiano quando
si vuole.

**Il caos**: 24 tipi di problema, tra cui la diretta muta, il blackout in
un'aula, la quota API finita durante il codelab, la flame war tabs vs spaces,
la prova di evacuazione, il cane, il VIP a sorpresa, il giornalista locale. La
chat dello staff porta messaggi con una scadenza: rispondi bene e ti eviti un
problema, ignora e lo paghi. Con quattro problemi aperti scatta il **CAOS!**.

## Gemini durante il gioco

L'AI è un extra, **spenta di default**: il gioco è completo senza. Si accende
in due modi:

- **con la propria chiave** (sito su Firebase Hosting): dal titolo, «Attiva
  Gemini». La chiave resta nel browser di chi gioca (solo per la sessione, o
  sul dispositivo se lo sceglie) e va solo a Google: non passa da nessun nostro
  server e non la conserviamo;
- **con il server** di questo repository (`server/server.mjs`): chi ospita il
  gioco mette la propria chiave nel server e la offre a tutti.

In entrambi i casi i compiti sono gli stessi, definiti una volta sola in
`js/ai-tasks.js`, e toccano cinque punti, tutti legati al chapter e alla città
scelti:

| Cosa | Modello | Quando |
|---|---|---|
| La chat dello staff della giornata (messaggi, risposte, battute di corridoio) | `gemini-3.5-flash-lite` | durante il Countdown, in anticipo |
| Una carta del Countdown "dalla tua zona" per round | `gemini-3.8-flash` | a ogni round |
| La Gazzetta locale e il consiglio del coach | `gemini-3.8-flash` | a fine giornata |
| La chat che reagisce a quello che succede | `gemini-3.5-flash-lite` | ogni ~45 secondi |
| La crisi del tuo chapter: da una storia vera a una carta | `gemini-3.8-flash` | su richiesta |

Senza AI il gioco è identico ma usa i testi scritti a mano. L'unica differenza
di gioco è la carta «dal tuo territorio» in più nel Countdown.

**Sicurezza della chiave del giocatore**:
- la chiave non lascia il browser se non verso `generativelanguage.googleapis.com`
  (il gate verifica che `js/ai.js` sia l'unico file che la tocca e che parli solo
  con Google);
- di default vive in `sessionStorage` (sparisce chiudendo la scheda);
  `localStorage` solo se il giocatore spunta «ricordala»;
- la build per Hosting ha una Content Security Policy rigida: niente script
  inline, script solo dal sito e dall'SDK Firebase, connessioni solo verso Gemini
  e il database del progetto. È la difesa contro il furto via XSS;
- la schermata spiega come creare una chiave dedicata, limitata all'API Gemini e
  al dominio del gioco, con un budget basso (in Europa le app usano il piano a
  pagamento: una partita costa pochi centesimi);
- dopo tre errori di fila (chiave revocata, quota finita) il gioco smette di
  chiamare per quella sessione.

**Sicurezza della chiave del server**: resta nel server (`.env` in locale,
Secret Manager in produzione) e non arriva mai al browser. Il client non manda
prompt: chiama cinque compiti fissi con un contesto piccolo e validato; il server
costruisce il prompt, chiede JSON strutturato (`responseSchema`), ripulisce e
limita la risposta. Limiti per IP (40 richieste ogni 10 minuti) e per giorno
(`AI_DAILY_CAP`, 3000), solo stessa origine, corpo massimo 16 KB.

In tutti i casi le carte generate o importate passano da `sanitizeCard` (campi
noti, effetti limitati).

## Avvio in locale

Metti la chiave in `.env` (non va mai committata):

```
GEMINI_API_KEY=...
```

Poi:

```bash
node server/server.mjs 8765
```

Apri http://localhost:8765. Senza chiave il gioco parte lo stesso, con l'AI
spenta. Parametri utili: `?day=solo&event=devfest` (salta alla giornata),
`?dev` (in console: `__df.advance(sec, "medio")`, `__df.tick(n)`,
`__df.attract(sec)`), `?emu` (stanze online sull'emulatore Firebase).

## Verifica prima di pubblicare

```bash
node tools/check.mjs
```

Controlla la sintassi di tutti i file, che le cinque lingue abbiano le stesse
chiavi e gli stessi segnaposto, che nessuna chiave API sia finita nei file
pubblici, e fa giocare il bot di playtest su tutti e quattro gli eventi con
strategie di Countdown diverse. Si pubblica solo con *Tutto OK*. Le tabelle
complete:

```bash
node tools/playtest.mjs 10 --e2e
```

```bash
node tools/playtest.mjs 10 --event=devfest
```

## Build e pubblicazione

```bash
node tools/build.mjs
```

Produce `dist/index.html` (un unico file: script, lingue e sprite WebP
inclusi, ~780 KB) e `dist/artifact.html` (la versione senza AI per gli
Artifact).

**Su Firebase Hosting** (AI spenta di default, ognuno può usare la propria
chiave): la build crea `dist/web/`, con file separati, sprite WebP e la Content
Security Policy calcolata da `firebase-config.js`.

### Il tuo progetto Firebase

Nel repository non c'è nessuna configurazione vera: `firebase-config.example.js`
e `.firebaserc.example` contengono solo segnaposto, e i file veri restano sul
tuo computer (li esclude `.gitignore`, insieme a `functions/.env.*`). Senza
configurazione il gioco funziona lo stesso: le stanze online girano tra le
schede di un browser e statistiche, account e classifiche restano spenti.

1. **Il progetto.** Crea un progetto Firebase con un'app web. Attiva Realtime
   Database (per esempio in `europe-west1`), Authentication con l'accesso
   anonimo e Hosting.
2. **La configurazione del gioco.** Copia `firebase-config.example.js` in
   `firebase-config.js` e metti i valori dell'app web (Impostazioni progetto →
   Le tue app), più `privacyContact`, il contatto che compare nell'informativa.
3. **Progetto e siti per la CLI.** Copia `.firebaserc.example` in `.firebaserc`
   con l'ID del tuo progetto, poi collega il sito del gioco al target `game`:
   `firebase target:apply hosting game <tuo-sito>`. Il target `redirect`
   serve solo a rimandare il sito predefinito del progetto a quello del gioco:
   se non ti serve, togli quel blocco da `firebase.json`.
4. **App Check.** Crea una chiave reCAPTCHA Enterprise per i tuoi domini,
   registrala in App Check per l'app web, scrivila in `appCheckSiteKey` e rendi
   App Check obbligatorio su Realtime Database e Authentication.
5. **La chiave del browser.** In Google Cloud → API e servizi → Credenziali
   limitala ai tuoi domini (più `localhost` per lo sviluppo) e a quattro API:
   Identity Toolkit, Token Service, Firebase App Check e Firebase
   Installations. Nessun'altra API, Gemini compresa.
6. **Le funzioni.** Crea due account di servizio: `stats-writer` (ruoli
   Firebase Realtime Database Admin ed Eventarc Event Receiver, più Cloud Run
   Invoker sul servizio `board`) e `billing-guard` (Project Billing Manager,
   Eventarc Event Receiver, Cloud Run Invoker). Nel codice compaiono solo come
   `stats-writer@` e `billing-guard@`: il resto dell'indirizzo lo aggiunge
   Firebase. In `functions/.env.<id-progetto>` scrivi `SITES=<tuo-sito>`, i
   siti Hosting da cui arrivano le statistiche (più di uno, separati da
   virgole).
7. **La spesa.** Crea un budget mensile che pubblica sul topic Pub/Sub
   `billing-cap`: quando la spesa lo raggiunge, `billingGuard` scollega la
   fatturazione e il progetto torna nei limiti gratuiti.

Poi, a ogni pubblicazione:

```bash
node tools/build.mjs
```

```bash
node tools/check.mjs
```

```bash
firebase deploy --only hosting,database,functions --project <id-progetto>
```

Cosa fa il progetto, una volta configurato:

| Cosa | Come |
|---|---|
| Sito | Firebase Hosting, cartella `dist/web/` (target `game`) |
| Stanze online | Realtime Database, regole in `database.rules.json` |
| Accesso | Anonimo per le stanze online (gli account anonimi si cancellano dopo 30 giorni); Google facoltativo per il proprio account |
| Statistiche e diario | Conteggi anonimi e diario delle partite su `/api/stat` (funzione `api`): nessun cookie né identificativo, solo valori da una lista chiusa; il diario tiene la sola data e si svuota dopo 12 mesi. Si leggono con `node tools/stats.mjs` |
| Log | Cloud Logging tiene 30 giorni le richieste del sito e delle funzioni, con gli IP, per sicurezza e per i problemi |
| Login e classifica | Google facoltativo: progressi in `users/<uid>` (solo il proprietario), classifica dei chapter da `lb/u/<uid>` (funzione `board`) servita da `/api/board` |
| Anti-bot | App Check con reCAPTCHA Enterprise invisibile, obbligatorio sul database e sull'accesso anonimo. reCAPTCHA si carica solo quando si apre una stanza |
| Spesa | Il budget mensile e `billingGuard`, che scollega la fatturazione al limite |
| AI | Nessuna sul progetto: chi la vuole usa la propria chiave nel proprio browser |

**Con l'AI**, su Cloud Run (il `Dockerfile` costruisce il file singolo e avvia
il server; `.env` è escluso da `.dockerignore` e `.gcloudignore`). La chiave
va in Secret Manager:

```bash
grep GEMINI_API_KEY .env | cut -d= -f2- | tr -d '\n' | gcloud secrets create gemini-api-key --data-file=-
```

```bash
gcloud run deploy overbooked --source . --region europe-west1 --allow-unauthenticated --set-secrets GEMINI_API_KEY=gemini-api-key:latest --set-env-vars AI_DAILY_CAP=3000 --max-instances 2
```

L'account di servizio di Cloud Run deve avere il ruolo *Secret Manager Secret
Accessor* sul segreto. Conviene anche un limite di spesa sul progetto.

## Statistiche, account e classifica

**Conteggi anonimi.** Il gioco conta visite e giornate (iniziate, finite,
stelle) senza cookie e senza identificativi: ogni conteggio porta pochi valori
da una lista chiusa (`functions/stats.js`) e il server aggiunge 1 a dei totali.
Il nome del chapter si conta solo se inizia con GDG, GDSC o WTM, così il nome
di una persona non finisce mai nei dati. Niente conteggi con Do Not Track o
Global Privacy Control, fuori dal sito e per chi li spegne nella schermata
Privacy. Per leggerli:

```bash
node tools/stats.mjs
```

Nei link dei post aggiungi `?s=li` (LinkedIn), `?s=md` (Medium), `?s=x`,
`?s=tg`, `?s=wa`, `?s=qr` e così via: la provenienza si conta anche quando
l'app non passa il referrer, e il parametro sparisce dalla barra degli
indirizzi.

**Diario delle partite.** Per affinare il gioco, ogni giornata finita lascia un
riepilogo anonimo (evento, stelle, obiettivi, problemi nati e sfuggiti per
tipo, chat, scelte del Countdown, kit, tempo giocato); si registrano anche le
giornate lasciate a metà (a che punto) e gli errori del gioco. Solo la data,
chiavi casuali, niente identificativi; mai per marketing. Dopo 12 mesi la
funzione `api` cancella i giorni più vecchi. Per analizzarlo in un foglio:

```bash
node tools/stats.mjs --diary=d --days=30 > giornate.csv
```

`--diary=q` dà gli abbandoni, `--diary=x` gli errori.

**Sfida della settimana e Chapter Cup.** Dal titolo: la stessa giornata per
tutti fino a domenica. Alla fine il gioco invia i comandi registrati a
`/api/weekly`; il server rigioca la giornata (`functions/game/`, copiati dalla
build) e tiene il punteggio verificato in `cup/<settimana>/u/<uid>` (accesso
anonimo o Google, App Check obbligatorio). `/api/cup` somma i tre migliori di
ogni chapter (solo nomi GDG, GDSC, WTM o approvati con `--approve`).

**Login Google facoltativo.** Si gioca senza. Chi accede ritrova stelle, kit,
carte della forgia e chapter su ogni dispositivo, può portare il chapter in
classifica e, solo se spunta la casella, accetta di essere contattato.
L'account si elimina dal gioco (dati online compresi). Per accenderlo:

1. Console Firebase → Authentication → Sign-in method → **Google** → Abilita,
   con l'email di supporto.
2. In `firebase-config.js` metti `googleSignIn: true`, poi build e deploy.

**Classifica dei chapter.** Somma le stelle della stagione di chi ha scelto di
comparire (massimo 18 a testa). I nomi che iniziano con GDG, GDSC o WTM
compaiono subito, gli altri dopo un controllo:

```bash
node tools/stats.mjs --board
```

```bash
node tools/stats.mjs --approve=<slug>
```

`--hide=<slug>` toglie un nome, `--reset=<slug>` torna alla regola
automatica, `--contacts` elenca chi ha chiesto di essere contattato.

## Stanze online tra città (Firebase)

1. Crea un progetto Firebase (piano gratuito Spark).
2. Attiva **Authentication → Anonymous** e **Realtime Database**.
3. Copia la configurazione web in `firebase-config.js` (non è un segreto:
   l'accesso è regolato da `database.rules.json`).
4. Pubblica regole e sito con il comando di deploy qui sopra.

L'host gioca la simulazione nel proprio browser; gli altri inviano i comandi e
ricevono lo stato circa otto volte al secondo, chat e Gazzetta comprese. Se un
ospite si disconnette, il suo organizzatore passa a un bot. Le regole
consentono di scrivere lo stato solo all'host e il proprio input solo a
ciascun giocatore.

Per provarlo in locale con l'emulatore (serve Java; con Java 17 si avvia il jar
del database direttamente):

```bash
firebase setup:emulators:database
```

```bash
java -jar ~/.cache/firebase/emulators/firebase-database-emulator-v4.11.2.jar --port 9000
```

```bash
FIREBASE_DATABASE_EMULATOR_HOST=127.0.0.1:9000 firebase emulators:start --only auth,functions --project demo-lmh
```

```bash
curl -X PUT -H "Authorization: Bearer owner" --data @database.rules.json "http://127.0.0.1:9000/.settings/rules.json?ns=demo-lmh"
```

Poi apri due schede su `http://localhost:8765/?emu`. Con `?emu` anche
statistiche, account e classifica usano gli emulatori (namespace `demo-lmh`);
`node tools/stats.mjs --emu` legge i conteggi locali. Con Java 17 l'emulatore
del database gira a parte, quindi la funzione `board` non scatta da sola.

## Strumenti

| Comando | Cosa fa |
|---|---|
| `node tools/translate.mjs` | Rigenera francese, spagnolo e tedesco dall'inglese con Gemini (`--only=cards,chat` per rifare solo alcune sezioni). Quello che non torna resta in inglese. |
| `python3 tools/gen_sprites.py` | Disegna gli sprite mancanti con Gemini (una tantum, mai durante il gioco); `--webp` prepara le copie per la build. |
| `node tools/playtest.mjs` | Tabelle di bilanciamento. |
| `node tools/check.mjs` | Il gate prima di pubblicare. |
| `node tools/stats.mjs` | Statistiche anonime, classifica (`--board`, `--approve`, `--hide`) e contatti (`--contacts`). |

## Struttura

```
index.html            la pagina (script classici: si apre anche da file://)
css/game.css          brand e schermate
js/core.js            namespace, costanti, RNG deterministico
js/i18n.js            lingue: DF.t(), fallback, formato dei numeri
js/lang/*.js          testi: it, en (scritti a mano), fr, es, de (generati)
js/content.js         eventi della stagione, problemi, ruoli, attrezzi, chat
js/chat.js            il copione della chat dello staff
js/prep.js            il Countdown: carte, regole, fonti, loadout
js/venue.js           la sede: mappa a tile, stanze, postazioni, A*
js/sim.js             la giornata come simulazione pura e deterministica
js/bot.js             organizzatore automatico (co-lead e playtest)
js/render.js          canvas: sede, sprite, problemi, HUD, radio e chat
js/coach.js           il tutorial: schede con pausa e guide passo passo
js/audio.js           effetti e musica sintetizzati (Web Audio)
js/input.js           tocco/tieni premuto, tastiera per due, gamepad
js/ai-tasks.js        i cinque compiti Gemini: prompt, schemi, validazione (browser e server)
js/ai.js              Gemini a runtime: chiave del giocatore o server, spento di default
js/fb.js              carica l'SDK Firebase solo quando serve (stanze, account)
js/net.js, online.js  stanze online: trasporti, snapshot, lobby
js/stats.js           conteggi anonimi (beacon verso /api/stat)
js/account.js         login Google facoltativo: sincronizzazione, classifica, consenso
js/ui.js              schermate: titolo, stagione, Countdown, retro, forgia
js/main.js            loop, eventi, sede animata dietro i menu
server/server.mjs     server statico + compiti Gemini (nessuna dipendenza)
functions/            Cloud Functions: billingGuard, api (/api/stat, /api/board), board
assets/sprites/       personaggi (PNG + WebP), generati una tantum
tools/                playtest, gate, build, traduzioni, sprite
docs/                 design, ricerca, kit per facilitatori, proposta
```

## Documenti

- [docs/DESIGN.md](docs/DESIGN.md): perché è fatto così.
- [docs/RICERCA.md](docs/RICERCA.md): la ricerca, con le fonti.
- [docs/FACILITATORE.md](docs/FACILITATORE.md): come usarlo a un incontro tra lead.
- [docs/PROPOSTA.md](docs/PROPOSTA.md): il progetto come contenuto GDG/GDE.
- [docs/STUDIO.md](docs/STUDIO.md): come ampliare sfide, mappa e gioco (priorità per 0.8-1.0).
- [BACKLOG.md](BACKLOG.md): cosa manca.

## Personalizzalo

Il gioco parte neutro: chapter e città li sceglie chi gioca. Per farne la
versione della tua community bastano pochi punti: i crediti in `DF.CREDITS`
(`js/core.js`), il progetto Firebase e il contatto privacy in
`firebase-config.js`, i testi nei pacchetti `js/lang/*.js`. Prima di
pubblicare, `node tools/check.mjs` deve essere verde.

## Licenza

Codice sotto [Apache 2.0](LICENSE). Il logo Google Developer Groups, i marchi
Google e i caratteri caricati da Google Fonts restano dei rispettivi
proprietari e non sono coperti dalla licenza (vedi [NOTICE](NOTICE)).
