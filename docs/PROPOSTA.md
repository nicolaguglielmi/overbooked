# OVERBOOKED! come contenuto GDG/GDE

## In breve

Un gioco cooperativo, aperto e gratuito che insegna a organizzare una
community tech: una stagione di quattro eventi, dal meetup al DevFest. Per
ogni evento la preparazione a turni (il Countdown), la giornata in tempo
reale con il suo caos, una retro guidata. Si gioca da un link, da soli, in due
sulla stessa tastiera o online tra lead di città diverse, in cinque lingue.
Ogni consiglio cita una fonte; Gemini scrive durante la partita la chat dello
staff, le carte e il giornale locale per il chapter e la città di chi gioca.

## Perché può interessare

- **È un problema vero e comune a tutti i chapter.** Le lezioni sugli eventi
  si tramandano a voce o si imparano sbagliando. Qui sono giocabili e
  discutibili in una call di 40 minuti.
- **È nuovo.** Non risulta nessun gioco pubblico che simuli la gestione di un
  GDG o di un DevFest (vedi [RICERCA.md](RICERCA.md)).
- **Usa Gemini come meccanica, non come decorazione.** Il gioco è
  deterministico e bilanciato da un bot di playtest; Gemini aggiunge
  contenuti *localizzati* dentro confini precisi: la chat dello staff della
  giornata, una carta "dalla tua zona" per round (il treno per Termoli, la
  neve nel Borgo), la Gazzetta di fine giornata con il consiglio del coach,
  la chat che reagisce a quello che succede, e la forgia che trasforma una
  crisi raccontata da un lead in una carta giocabile. Output strutturato
  (`responseSchema`), validazione e limiti lato server, chiave mai nel
  browser, ripiego offline sempre disponibile. Due modelli, scelti per costo
  e latenza: `gemini-3.8-flash` per le carte e il giornale,
  `gemini-3.5-flash-lite` per i testi brevi e frequenti.
- **È riusabile.** Codice aperto, nessuna dipendenza, un file HTML per la
  versione offline, un container per quella con l'AI. Eventi, sede, programmi
  e carte sono dati modificabili da ogni chapter.
- **Usa la piattaforma Google dove serve.** Gemini API, Cloud Run con Secret
  Manager, Firebase Realtime Database e Authentication anonima per le stanze
  online, regole di sicurezza pensate per un'app pubblica, Firebase Hosting.
- **Parla la lingua dei chapter.** Italiano e inglese scritti a mano;
  francese, spagnolo e tedesco generati con Gemini da uno script che
  verifica chiavi, lunghezze e segnaposto (e da far rileggere ai lead).
- **Misura qualcosa.** Sessioni, chapter coinvolti, carte nuove, impegni
  presi e mantenuti (vedi [FACILITATORE.md](FACILITATORE.md)).

## Il pacchetto da pubblicare

Il riconoscimento dei contenuti GDE passa da contenuti tecnici pubblicati e
registrati su Advocu. Proposta:

1. **Repository pubblico** con licenza aperta, README e documenti.
2. **Il gioco online** su Cloud Run (con Gemini) e su Firebase Hosting (la
   versione offline), con le stanze tra città attive.
3. **Articolo** sulla pubblicazione Medium dei GDE (italiano e inglese):
   «Gemini dentro un gioco deterministico: come abbiamo messo l'AI in un
   recinto». Compiti fissi invece di prompt liberi, schema JSON, limiti,
   ripiego offline, il bot di playtest che giudica il bilanciamento.
4. **Codelab**: «L'edizione del tuo chapter»: cambiare sede, programma e
   carte, aggiungere una lingua con lo script di traduzione, pubblicare su
   Cloud Run con la chiave in Secret Manager.
5. **Video di 2-3 minuti**: una partita in due, la chat che impazzisce, la
   Gazzetta scritta da Gemini, una carta forgiata da un altro chapter.
6. **Una sessione alla call dei lead italiani** prima della fine della
   stagione DevFest (31 dicembre 2026), con i numeri della sessione.

## Prossimi passi possibili

1. **Mazzo condiviso tra chapter**: le carte forgiate dai lead in una
   collezione Firebase moderata, così ogni nuova crisi arriva a tutti.
2. **Rilettura delle lingue** da parte di lead madrelingua.
3. **Classifica dei chapter**: il miglior DevFest di ogni chapter.
4. **App Check** davanti al server AI per un link pubblico ad alto traffico.
5. **Porting in Flutter**, come per Last Mile Hero.

## English abstract

*OVERBOOKED! Survive the DevFest* is an open, free, cooperative game about
running a tech community. A season of four events, from a weekday meetup to a
full DevFest: players prepare each one in turn-based rounds of real organizer
dilemmas (venue, sponsors asking for attendee emails, volunteers, catering,
the chapter's box of adapters), then live the day in real time (lost
speakers, laptops without HDMI, a silent livestream, the API quota running out
mid-codelab, a dog in the main hall, a staff chat that never sleeps, and a
gremlin named Murphy), and finish with a guided retrospective. Every tip cites
a source. Gemini runs inside strict boundaries: fixed server-side tasks with
structured output write the day's staff chat, a local card per round, the
local newspaper and a coach tip, all for the player's chapter and city, with
an offline fallback. It runs from a single link in five languages, solo, two
players on one keyboard, or online across cities via Firebase. A playtest bot
with human-like profiles gates every release.
