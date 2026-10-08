# OVERBOOKED! — scelte di design

Ottobre 2026 · Nicola Guglielmi (GDE)

## L'idea in una frase

Ogni chapter impara le stesse lezioni a proprie spese. Il gioco le mette in
fila in dieci minuti: prima si prepara il DevFest, poi lo si vive, poi se ne
parla. La forma viene da Last Mile Hero (un mestiere vero trasformato in
arcade, con i colleghi che si riconoscono nei problemi); la struttura viene
da come si organizza davvero un evento.

## Perché questa idea e non altre

Abbiamo valutato tre forme (vedi [RICERCA.md](RICERCA.md)):

| Idea | Pro | Contro |
|---|---|---|
| Gioco da tavolo cooperativo alla *Pandemic*, solo a turni | Discussione, nessun server | Poco "wow", rischio foglio di calcolo, un giocatore decide per tutti |
| Arcade in tempo reale alla *Overcooked* sulla sola giornata | Divertente, immediato | Insegna solo la logistica del giorno X, non la gestione della community |
| **Countdown a turni + giornata in tempo reale + retro** | Copre mesi di preparazione e il giorno X; le scelte hanno conseguenze visibili; la retro trasforma il gioco in formazione | Due giochi in uno: più lavoro |

Abbiamo scelto la terza, che è anche quella suggerita dalla letteratura sui
giochi cooperativi e sui serious game: turni brevi con riflessione, un
momento in tempo reale che impedisce a un solo giocatore di decidere tutto,
e un debriefing strutturato, che è dove avviene l'apprendimento.

## I pilastri

1. **Ci si riconosce.** Problemi, attrezzi e luoghi sono quelli veri:
   l'adattatore USB-C, la stampante dei badge, lo sponsor che vuole le email,
   il co-organizer che si trasferisce a Milano, il DevFest di Napoli nello
   stesso giorno.
2. **Leggibile in un secondo.** Ogni problema ha un'icona, un anello che si
   svuota, un colore che passa dal giallo al rosso.
3. **Da soli non si regge.** Il gioco premia la delega (volontari, co-lead,
   ruoli) e punisce chi fa tutto da sé (burnout, lavori da due persone).
4. **Ogni consiglio ha una fonte.** Le lezioni citano post-mortem di DevFest,
   linee guida GDG, dati sui tassi di assenza.
5. **Si chiude parlando.** La retro è parte del gioco, non un extra.

## Atto 1 — Il Countdown

- Quattro round: −12, −8, −4, −1 settimane. Tre carte per round, dodici in
  tutto, scelte tra 25: alcune sempre presenti (sede, team, sponsor,
  volontari, promozione, catering, la Scatola, i promemoria), altre a
  rotazione, più un imprevisto.
- Ogni organizzatore ha 3-4 **pallini** (sere libere) a round. Ogni carta ha
  due opzioni con costi diversi; il ruolo "di casa" paga un pallino in meno
  (Tech per sede e logistica, Speaker care per gli speaker, Accoglienza per
  volontari e catering, Lead per sponsor e community).
- Si può andare oltre di due pallini: si chiamano straordinari e costano
  energia al team, che arriva più stanco al giorno X.
- **Quello che nessuno prende in carico succede comunque**: ogni carta
  mostra la conseguenza dell'inazione. È il meccanismo che crea il triage.
- I contatori (budget, iscritti, community, partner, energia) e le scelte
  diventano il **loadout** della giornata: quante persone arrivano (iscritti
  × tasso di presenza), quanti volontari, cosa c'è nella Scatola, quali
  preparazioni sono state fatte, con quanta energia si parte.

## Atto 2 — La giornata

- Simulazione deterministica (`js/sim.js`): stesso seme, stessi input, stessa
  giornata. Serve al bot di playtest e all'host delle stanze online.
- Il pubblico è un modello a flussi (coda, hall, aule); le persone che si
  vedono sono animazione. Organizzatori, volontari, speaker e Murphy sono
  entità vere.
- Ogni talk parte solo se lo speaker è sul palco e il portatile proietta. Il
  ritardo pesa sul gradimento; oltre 26 minuti il talk salta.
- 15 tipi di problema, ciascuno legato a un'azione e spesso a un attrezzo
  della Scatola. Senza l'attrezzo si improvvisa, molto più lentamente: il
  costo di una scelta del Countdown si sente nelle mani.

| Problema reale | Meccanica | Preparazione che aiuta |
|---|---|---|
| Portatile senza HDMI | Kit adattatori + tieni premuto sul palco | Kit AV, prova tecnica |
| Speaker che si perde tra caffè e sponsor | Raggiungilo e accompagnalo sul palco | Speaker care, volontario all'info point |
| Speaker che non arriva | Improvvisa tu un talk | Speaker di riserva |
| Coda al check-in | Lavora al banco; i volontari smaltiscono | Check-in QR, volontari |
| Wi-Fi giù | Riavvia l'armadio in Regia o porta l'hotspot nel Lab | Rete verificata, hotspot |
| Caffè finito | Rifallo, o un volontario lo fa | Budget, volontario al caffè |
| Pizza che non arriva | Vai all'ingresso | Catering confermato |
| Sala piena | Apri la diretta | Lista d'attesa |
| Segnalazione al Code of Conduct | Solo lo staff, subito | Referenti formati |
| Lab da riallestire | Serve una seconda persona | Lab allestito la sera prima |
| Murphy | Toccalo prima che saboti | Scaletta staff (premonizioni più lunghe) |

- **Energia e burnout**: lavorare e correre stancano, il caffè e la sala
  speaker ricaricano. Chi arriva a zero si ferma sei secondi e il gradimento
  ne risente.
- **Cooperazione**: ruoli con abilità diverse (2× sui propri problemi, il
  Tech porta due attrezzi), problemi da due persone, bonus "sinergia" quando
  due organizzatori lavorano insieme. Con più giocatori umani i problemi
  aumentano, come in Overcooked.
- **Esito**: il gradimento diventa il feedback medio (1-5). Le stelle
  dipendono dal feedback e sono limitate dalle presenze: una giornata
  perfetta per cinquanta persone non è un DevFest da tre stelle.

## Atto 3 — La retro

Segue le fasi del debriefing di Thiagarajan: come ti senti (una parola),
cosa è successo (i momenti chiave, generati dal registro della giornata),
cosa hai imparato (tre lezioni scelte in base a cosa è andato storto,
ognuna con la fonte), come si applica (domande per la retro di gruppo) e un
impegno concreto, da copiare nella chat dei lead.

## Bilanciamento e gate

`tools/playtest.mjs` fa giocare un bot con profili umani (tempi di reazione,
priorità, delega) e `tools/check.mjs` blocca la pubblicazione se la curva
esce dai binari:

- novizio da solo con preparazione media: almeno 3,0;
- la preparazione vale almeno +0,4;
- una coppia media resta tra 4,0 e 4,8;
- chi salta il Countdown fallisce (al massimo 2,5);
- un novizio con un Countdown curato arriva almeno a 3,7.

## Online

L'host è autoritativo: gioca la simulazione e pubblica uno snapshot
compatto circa otto volte al secondo; gli ospiti inviano lo stato dei
comandi (direzione, tieni premuto) e i tocchi. Sul Countdown l'host applica
le scelte che arrivano dagli altri e le ripubblica. Due trasporti con la
stessa interfaccia: Firebase Realtime Database con login anonimo (stanze tra
città) e BroadcastChannel (stanze tra schede, senza configurazione). Le
regole di sicurezza sono in `database.rules.json`.

## Cosa non fa (per scelta)

- L'AI non decide niente: Gemini scrive testi e carte dentro confini fissi,
  ma regole, effetti e punteggi restano nella simulazione deterministica. Il
  gioco funziona identico senza server (file singolo, Artifact).
- Niente account, niente dati personali: nomi e chapter restano nel browser.

## 0.2: OVERBOOKED!

**Il nome e l'identità.** "Overbooked" è la prima cosa che succede a ogni
evento gratuito: si iscrivono in 150, la sala ne tiene 96, ne arrivano 60. Il
logo è un timbro rosso su un biglietto d'ingresso (lo staff timbra, il
pubblico entra); il nastro giallo e nero da cantiere scorre sotto il titolo con
le emergenze del giorno. Colori: giallo biglietto, rosso timbro, carta del
biglietto, il blu notte del backstage, e i quattro colori Google solo come
cordino del badge. Personaggi in stile chibi disegnati una volta con Gemini da
un unico foglio di stile, così il cast sembra una famiglia; Murphy, il
folletto viola con la chiave inglese, è la mascotte.

**La stagione.** Il DevFest da solo era una montagna: quattro eventi di
difficoltà crescente insegnano un pezzo alla volta (il meetup: pizza, chiavi,
adattatori; lo Study Jam: il Lab, il Wi-Fi, la quota API; l'I/O Extended: la
diretta, i VIP, gli sponsor, la stampa; il DevFest: tutto). Ogni evento ha un
mazzo piccolo con una carta obbligatoria per round, così la lezione chiave non
dipende dal caso.

**Il caos, senza muri di testo.** Il caos degli eventi veri non è un problema
grosso, sono venti piccoli che arrivano insieme mentre qualcuno ti chiede dov'è
il bagno. Tre meccaniche lo rendono: la chat dello staff (messaggi con una
scadenza e due risposte, Q/E; ignorare costa), le persone che ti fermano in
corridoio quando attraversi la folla (la segnaletica e il punto info le
riducono), e la modalità CAOS! quando i problemi aperti sono quattro (bordo da
cantiere, ritmo della musica). I testi sono corti: una riga per carta, una per
messaggio, il resto è nel "Perché?" da aprire.

**Gemini nel gioco.** Cinque compiti fissi sul server (`server/server.mjs`):
il client non può mandare prompt, la chiave non lascia il server, le risposte
sono JSON con schema, ripulite e limitate prima di arrivare al gioco. La chat
della giornata si prepara durante il Countdown (il giocatore non aspetta mai);
se l'AI non risponde, il gioco usa i testi scritti a mano. Le carte generate
passano dallo stesso `sanitizeCard` delle carte importate.

**Le lingue.** Ogni testo è in `js/lang/*.js`; italiano e inglese scritti a
mano, le altre tre generate con Gemini e verificate dal gate (stesse chiavi,
stesse lunghezze, stessi segnaposto). Gemini scrive i contenuti dinamici
direttamente nella lingua del giocatore.

## 0.3: si impara giocando

**Il tempo per capire.** Il gioco ha tante regole (la Scatola, gli attrezzi,
la chat, i volontari, gli speaker da accompagnare): spiegarle tutte prima è un
muro di testo, non spiegarle è frustrante. La soluzione è il coach: la prima
volta che una cosa succede, il gioco si ferma, scurisce la mappa tranne quel
punto e spiega in due righe cosa fare. Ogni consiglio si vede una volta sola;
chi conosce il gioco li spegne. Il Countdown e la vigilia hanno una guida passo
passo sugli elementi della schermata.

**Il ritmo.** I primi eventi sono più lenti (`ev.pace`: più tempo per ogni
problema, per i triangoli e per la chat, meno messaggi), e la modalità
tranquilla aggiunge altro tempo a qualsiasi evento. Toccare un problema basta
a risolverlo: il "tieni premuto" resta per la tastiera e per chi vuole il
controllo, ma su telefono non serve più tenere il dito sullo schermo.

**Obiettivi al posto delle soglie.** Tre obiettivi chiari per evento (un
gradimento minimo più due cose concrete: «la pizza arriva calda», «nessuno
resta indietro», «sblocca 10 team») danno uno scopo leggibile durante la
giornata e un motivo per rigiocare. Le stelle sono obiettivi raggiunti; una
stella sblocca l'evento successivo.

**Profondità.** Due livelli con meccaniche nuove, scelti per quello che
insegnano: Women Techmakers (l'accoglienza: bimbi, consenso alle foto,
accessibilità; le persone da accompagnare sono un problema della sede, mai
della persona) e l'hackathon notturno (team bloccati che servono mentor,
l'energia che cala di notte, la giuria e le demo). Tra un evento e l'altro il
kit del chapter trasforma le stelle in potenziamenti scambiabili: una scelta
strategica in più, senza punizioni per chi cambia idea.
