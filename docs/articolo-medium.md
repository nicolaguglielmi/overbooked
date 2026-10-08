# Articolo Medium

Il link porta `?s=md` per contare le visite da Medium. Immagini in `img/` (didascalie in `img/README.md`): la schermata del titolo come copertina, poi la giornata, la retro con la Gazzetta e la Chapter Cup.

## Versione italiana

# Se pensavi che organizzare un DevFest fosse una passeggiata, eccoti una demo

**Ho trasformato le crisi di chi organizza eventi tech in un gioco cooperativo.**

### Le 9:52

Lo speaker del keynote mi scrive che il navigatore lo ha portato in un campo. Il suo portatile ha solo USB-C e gli adattatori sono nella scatola del chapter, in regia, dall'altra parte dell'edificio. Il Wi-Fi del Lab è appena caduto, al check-in la coda arriva a 49 persone e la stampante dei badge ha deciso che oggi non è giornata. Nella chat dello staff ci sono 47 messaggi non letti. Uno è di mia mamma: «Hai mangiato? Ti ho visto su Instagram, hai la faccia stanca».

Chi organizza eventi tech, che sia un GDG, un meetup o una conferenza, riconosce ogni riga. Chi partecipa, di solito, non ne vede nessuna e si gode un talk che parte in orario.

### Perché un gioco

Le lezioni di chi organizza si tramandano a voce, in una call tra organizzatori o davanti a una birra dopo l'evento. Oppure si imparano sbagliando, il giorno stesso. Dopo anni di eventi GDG mi è venuta voglia di renderle giocabili, per provarle prima, sbagliare senza conseguenze e poi parlarne insieme.

Non ho trovato nessun gioco che simulasse l'organizzazione di un evento tech, dal meetup del giovedì al DevFest. Così l'ho costruito: **OVERBOOKED! Sopravvivi al DevFest**.

### Come funziona

Ogni evento ha tre atti.

- **Il Countdown.** Round a turni con dilemmi veri: la sede, lo sponsor che chiede la lista email dei partecipanti, i volontari, il catering, la scatola con gli adattatori. Ogni pallino è una sera libera e le sere non bastano mai. Quello che nessuno prende in carico succede comunque.
- **La giornata.** In tempo reale, nella sede dell'evento. Tocchi un problema e il tuo organizzatore ci va e lo risolve. Ogni problema ha un anello che si svuota; il triangolo giallo è un guaio che sta per arrivare e si può prevenire. Intanto la chat dello staff non dorme mai e chi attraversa la folla viene fermato ogni tre passi.
- **La retro.** Il giornale locale, i numeri, i momenti chiave, tre lezioni con le fonti e le domande per la retro di gruppo.

La stagione ha sei eventi: il meetup del giovedì, lo Study Jam, una giornata Women Techmakers (spazio bimbi, consenso alle foto, percorso accessibile), Google I/O Extended, un hackathon notturno e infine il DevFest. Ogni evento ha tre obiettivi, che valgono una stella ciascuno, e le stelle comprano il kit del chapter: walkie-talkie, lettore QR, una squadra storica di volontari.

Non giochi da solo. Il co-organizzatore e i volontari prendono ordini: tocchi loro, poi il punto in cui servono. Metti un volontario al coffee desk e vedi le persone girare con la tazza in mano, mentre la soddisfazione risale. Ogni ruolo ha un'abilità, ci sono le ore di punta e, per chi ha già tre stelle, la versione sold-out, con più gente e più guai. Le sedi sono due, un'università e un coworking, ognuna con le sue trappole.

Ogni consiglio nel gioco cita una fonte: guide per organizzatori GDG, retrospettive di DevFest, linee guida su accessibilità e consenso alle foto, la guida MLH per gli hackathon.

### Il caos, ma leggibile

Il caos degli eventi veri è fatto di venti problemi piccoli che arrivano insieme, mentre qualcuno ti chiede dov'è il bagno. Lo rendono tre meccaniche: la chat dello staff (ogni messaggio ha una scadenza e due risposte), le persone che ti fermano in corridoio e la modalità CAOS!, quando i problemi aperti sono quattro.

Il rischio era un gioco illeggibile. Così, la prima volta che succede qualcosa di nuovo, il gioco si ferma, scurisce la mappa tranne quel punto e spiega in due righe cosa fare. I primi eventi sono più lenti e c'è una modalità tranquilla. Dare tempo a chi gioca di capire è stata la modifica che ha cambiato di più l'esperienza.

### Gemini dentro un recinto

Il gioco funziona benissimo senza AI, e infatti di default è spenta. Chi vuole attiva Gemini con la propria chiave. A quel punto il gioco scrive contenuti per la tua community e la tua città: per la mia, Campobasso, è comparsa una carta sul freddo nelle aule dell'Unimol e un giornale chiamato «La Gazzetta del Molise Nerd».

L'AI però non decide mai niente della partita. Regole, punteggi e bilanciamento vivono in una simulazione deterministica. Gemini lavora dentro cinque compiti fissi:

1. la chat dello staff della giornata;
2. una carta «dal tuo territorio» per ogni round del Countdown;
3. il giornale e il consiglio del coach a fine giornata;
4. la chat che reagisce a quello che succede;
5. la forgia, che trasforma la crisi raccontata da chi organizza in una carta giocabile.

Per ogni compito scrivo io il prompt, il contesto è piccolo e validato e la risposta arriva come JSON strutturato (`responseSchema`). Viene poi ripulita e limitata: una carta generata non può regalare diecimila euro di budget.

Sulla chiave ho preso la decisione più delicata. Non la conservo e non passa dai server del gioco. Resta nel browser di chi gioca, solo per la sessione salvo diversa scelta, e va soltanto verso l'API di Gemini. La pagina su Firebase Hosting ha una Content Security Policy rigida, senza script inline e con connessioni ammesse solo verso Gemini e i servizi Firebase del gioco (stanze online e classifica). Dentro il gioco una guida spiega come creare una chiave dedicata, limitata all'API Gemini e al dominio del gioco, con un budget basso. Un controllo automatico prima di ogni pubblicazione verifica che un solo file tocchi la chiave e che parli solo con Google.

Anche le statistiche sono anonime: niente cookie e nessun identificativo, solo contatori che mi dicono dove il gioco si inceppa.

### Un bot che gioca prima di me

Ogni modifica a tempi, carte o obiettivi passa da un bot che gioca la stagione con profili umani: novizio, medio, esperto. Le soglie sono severe: chi salta il Countdown deve soffrire, chi si prepara bene deve vedere la differenza e il DevFest non può mai essere una passeggiata. Se una soglia salta, non pubblico. È la regola che mi porto dietro da Last Mile Hero, il mio gioco precedente, e più volte mi ha evitato un bilanciamento «a sensazione».

### La stessa giornata per tutti

Ogni settimana c'è una sfida uguale per tutti: stesso evento, stessi guai alla stessa ora, preparazione standard e niente kit, così conta solo come giochi. I tre punteggi migliori di ogni chapter entrano nella Chapter Cup.

Una classifica online di solito invita a barare. Qui il determinismo mi ha fatto un regalo: il browser registra solo i comandi di chi gioca, e a fine giornata il server rigioca la partita con lo stesso codice della simulazione. Se il punteggio non torna, non entra. Nessun account obbligatorio: basta il nome del chapter.

### Cosa ho imparato

Il tutorial conta quanto il gioco: un gioco bello e incomprensibile si chiude dopo un minuto. E le lezioni vere sono le più divertenti. Murphy è inventato, ma il portatile senza adattatore è successo a tutti.

L'AI rende meglio dentro un recinto, dove porta contenuti locali e sorprendenti mentre le regole restano nel codice. Il determinismo, invece, ripaga due volte: serve al bilanciamento e rende verificabile ogni punteggio della classifica.

### Provalo

Si gioca dal browser, gratis, in italiano, inglese, francese, spagnolo e tedesco: https://overbooked.web.app/?s=md

Ogni lunedì parte una nuova sfida della settimana: porta il tuo chapter nella Chapter Cup.

Il codice è aperto, con licenza Apache 2.0: https://github.com/nicolaguglielmi/overbooked. Chapter e città li sceglie chi gioca, così ogni community può farne la propria versione.

Se organizzi eventi, usalo alla prossima riunione dello staff: dieci minuti di partita e mezz'ora di retro valgono più di molte slide. E raccontami la tua crisi peggiore: nella forgia diventa una carta da scambiare con altre community.

*Un progetto di Nicola Guglielmi (GDE), organizer di GDG Campobasso. Progetto della community, non è un prodotto ufficiale Google.*

## English version

# If you thought running a DevFest was a walk in the park, here's a demo

**I turned the crises of running tech events into a co-op game.**

### 9:52am

The keynote speaker texts me that their GPS took them to a field. Their laptop only has USB-C, and the adapters are in the chapter's box, in the control room, on the other side of the building. The Lab Wi-Fi just went down, the check-in queue hits 49 people and the badge printer has decided today is not its day. The staff chat has 47 unread messages. One is from my mom: "Did you eat? I saw you on Instagram, you look tired."

Anyone who runs tech events, a GDG, a meetup or a conference, recognizes every line. Attendees usually see none of it and just enjoy a talk that starts on time.

### Why a game

Organizer lessons travel by word of mouth, on a call between organizers or over a beer after the event. Or they are learned the hard way, on the day. After years of GDG events I wanted to make them playable, so you can try them first, fail without consequences and then talk about it together.

I couldn't find a game that simulates running a tech event, from a Thursday meetup to a DevFest. So I built one: **OVERBOOKED! Survive the DevFest**.

### How it works

Every event has three acts.

- **The Countdown.** Turn-based rounds of real dilemmas: the venue, the sponsor asking for the attendees' emails, volunteers, catering, the box of adapters. Each dot is a free evening, and there are never enough. Whatever nobody takes on happens anyway.
- **The day.** Real time, in the venue. Tap a problem and your organizer walks there and fixes it. Every problem has a ring running out; the yellow triangle is trouble about to happen, and it can be prevented. Meanwhile the staff chat never sleeps, and walking through the crowd means being stopped every three steps.
- **The retro.** The local newspaper, the numbers, the key moments, three lessons with sources and questions for the group retro.

The season has six events: a Thursday meetup, a Study Jam, a Women Techmakers day (kids' corner, photo consent, an accessible route), Google I/O Extended, a night hackathon and finally the DevFest. Each event has three goals worth a star each, and stars buy the chapter's kit: walkie-talkies, a QR reader, a veteran crew of volunteers.

You're not playing alone. The co-organizer and the volunteers take orders: tap them, then the spot where they're needed. Put a volunteer at the coffee desk and you see people walking around with a cup in hand while satisfaction climbs back. Every role has an ability, there are rush hours and, once you have three stars, a sold-out version with more people and more trouble. There are two venues, a university and a coworking space, each with its own traps.

Every tip in the game cites a source: GDG organizer guides, DevFest retrospectives, guidelines on accessibility and photo consent, the MLH hackathon guide.

### Chaos you can read

The chaos of real events is twenty small problems arriving together while someone asks you where the restroom is. Three mechanics build it: the staff chat (every message has a deadline and two replies), the people who stop you in the hallway, and CHAOS! mode when four problems are open.

The risk was an unreadable game. So the first time something new happens, the game pauses, dims the map except that spot and explains what to do in two lines. Early events are slower and there's a relaxed mode. Giving players time to understand was the change that improved the experience most.

### Gemini behind a fence

The game works great without AI, and that's the default. Anyone can turn Gemini on with their own key. From then on the game writes content for your community and your city: for mine, Campobasso, it produced a card about freezing classrooms at the local university and a paper called "La Gazzetta del Molise Nerd".

The AI never decides anything about the game, though. Rules, scores and balance live in a deterministic simulation. Gemini works inside five fixed tasks:

1. the day's staff chat;
2. a card "from your area" in each Countdown round;
3. the newspaper and the coach's tip at the end of the day;
4. the chat reacting to what just happened;
5. the forge, which turns a crisis told by an organizer into a playable card.

For every task I write the prompt, the context is small and validated, and the answer comes back as structured JSON (`responseSchema`). It is then cleaned and clamped: a generated card can't hand out ten thousand euros of budget.

Handling the key was the most delicate decision. I don't keep it, and it never touches the game's servers. It stays in the player's browser, for the session unless they choose otherwise, and goes only to the Gemini API. The page on Firebase Hosting has a strict Content Security Policy, with no inline scripts and connections allowed only to Gemini and the game's Firebase services (online rooms and leaderboard). Inside the game, a guide explains how to create a dedicated key restricted to the Gemini API and the game's domain, with a low budget. An automatic check before every release verifies that a single file touches the key and that it only talks to Google.

The stats are anonymous too: no cookies and no identifiers, just counters that tell me where the game gets stuck.

### A bot that plays before I do

Every change to timings, cards or goals goes through a bot that plays the season with human-like profiles: novice, average, expert. The thresholds are strict: skipping the Countdown must hurt, preparing well must show, and the DevFest can never be a walk in the park. If one fails, I don't ship. It's the rule I brought over from Last Mile Hero, my previous game, and it saved me many times from balancing by gut feeling.

### The same day for everyone

Every week there's a challenge that's the same for everyone: same event, same trouble at the same time, standard preparation and no kit, so only how you play counts. Each chapter's three best scores go into the Chapter Cup.

An online leaderboard usually invites cheating. Here determinism gave me a gift: the browser records only the player's commands, and at the end of the day the server replays the game with the same simulation code. If the score doesn't match, it doesn't count. No account required: your chapter's name is enough.

### What I learned

The tutorial matters as much as the game: a beautiful game nobody understands gets closed after a minute. And real lessons are the most fun. Murphy is made up, but the laptop without an adapter has happened to everyone.

AI works best behind a fence, where it brings local, surprising content while the rules stay in the code. Determinism pays twice: it keeps the balance measurable and makes every leaderboard score verifiable.

### Try it

It runs in the browser, for free, in Italian, English, French, Spanish and German: https://overbooked.web.app/?s=md

A new weekly challenge starts every Monday: take your chapter into the Chapter Cup.

The code is open, under the Apache 2.0 license: https://github.com/nicolaguglielmi/overbooked. Players pick their own chapter and city, so any community can make its own version.

If you run events, bring it to your next organizers' meeting: ten minutes of play and half an hour of retro beat a lot of slides. And tell me your worst crisis: in the forge it becomes a card to share with other communities.

*A project by Nicola Guglielmi (GDE), organizer at GDG Campobasso. A community project, not an official Google product.*
