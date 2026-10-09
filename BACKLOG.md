# Backlog

Versione: **0.8.2**. Changelog e cose da fare.

## Fatto

- **0.8.2 — La scatola e il telefono.** La Scatola del GDG ha una zona fissa
  sul pavimento della Regia (cerchio tratteggiato: gialla quando un problema
  chiede un attrezzo, verde quando ci sei dentro) e gli attrezzi compaiono
  nella barra in basso, sempre nello stesso posto: niente più riquadro sopra
  i personaggi. Sul telefono la barra è più alta e mostra tutta la sede:
  puntini per i problemi, la cornice di quello che stai guardando, un tocco
  per andarci; risposte della chat più grandi da toccare.

- **0.8.1 — Per chi organizza eventi tech.** Crediti al solo autore
  (Nicola Guglielmi, GDE, organizer GDG) e link «Trova un GDG vicino a te»;
  sottotitolo per chi organizza eventi tech. Chapter e città partono vuoti
  (il biglietto dice «La tua community presenta», la Gazzetta esce senza
  città), così nessuno gioca per un chapter per caso.

- **0.8.0 — Si torna a giocare.** Sfida della settimana: la stessa giornata
  per tutti fino a domenica (seme, evento e preparazione uguali, niente kit),
  ruolo a scelta; il browser registra i comandi e il server rigioca la partita
  con lo stesso codice per verificare il punteggio (gate: replay identico,
  comandi falsi scartati). Chapter Cup: somma dei tre migliori di ogni chapter.
  Abilità per ruolo con ricarica (Megafono, Hotfix, Riempi il buco, Pausa
  respiro), tasto in alto e F da tastiera; i bot le usano a volte, come le
  persone. Tredici medaglie, sincronizzate con l'account. Seconda sede: il
  coworking (Wi-Fi ottimo, cucina, sale piccole) per meetup e Study Jam, grazie
  al contratto delle postazioni: le decorazioni ora sono ancorate alle
  postazioni. Crediti: Nicola Guglielmi (GDE) con GDG Campobasso.

- **0.7.0 — Crescendo.** Ore di punta: più guai insieme (segnati ⚡, con
  banner e conto alla rovescia), risolvili tutti prima che uno peggiori e il
  gradimento vola; più tardi nella giornata sono più grandi e dal terzo evento
  arrivano anche i guai tecnici. Modalità sold-out (si sblocca con tre stelle):
  40% di persone in più, guai più fitti, un'ora di punta in più, record a parte
  (🔥 nella stagione). La chat dice cosa ha cambiato ogni risposta (o silenzio)
  e lo segna sulla mappa. Più gente e più movimento: le persone entrano ed
  escono dalle sale, passano il check-in, arrivano dalla strada. Gate esteso
  (sold-out più difficile ma vincibile); diario e statistiche registrano ore di
  punta e sold-out.

- **0.6.0 — Deleghi e giochi dal telefono.** Ordini alla squadra: tocchi il
  co-org (o un volontario) e poi un problema, e ci va lui; il volontario va
  alla postazione che copre quel punto, o ti dice che non è roba sua. Le
  postazioni si vedono lavorare: al caffè la gente prende la tazza, all'info
  point arrivano risposte, all'ingresso l'accoglienza, al check-in i badge; ogni
  servizio dà un piccolo «+» al gradimento (poco, ma conta se metti la gente
  giusta al posto giusto; gate verde). Telefono: schermo intero in orizzontale
  dove il browser lo consente, barra in alto e chat più grandi, mappa
  ingrandita che segue il tuo organizzatore, frecce sui bordi per i problemi
  fuori schermo, bersagli più grandi al tocco.

- **0.5.0 — Quanti giocano, login facoltativo, classifica.** Statistiche
  anonime senza cookie né identificativi (visite e provenienza, lingue,
  giornate iniziate e finite, stelle, chapter): beacon con valori da una lista
  chiusa, funzione `api` su `/api/stat` che somma soltanto, limiti per IP e
  globali, niente con Do Not Track/GPC, interruttore nella nuova schermata
  Privacy; `tools/stats.mjs` per leggerle. Login Google facoltativo: stelle,
  kit, carte e chapter su tutti i dispositivi, consenso esplicito per essere
  contattati, eliminazione dell'account dal gioco. Classifica dei chapter
  (stelle sommate, al massimo 18 a testa), nomi da chapter automatici e gli
  altri dopo un controllo. Regole del database per account e classifica, COOP
  adatta al popup di Google, gate esteso (beacon, regole, CSP del login).
  Diario delle partite anonimo (riepilogo di ogni giornata, abbandoni, errori
  del gioco; solo la data, 12 mesi) con export CSV. Il gioco si sposta su
  `overbooked.web.app`; il vecchio indirizzo rimanda lì. Log delle richieste
  (con IP) tenuti 30 giorni in Cloud Logging per i problemi.

- **0.4.0 — AI con la propria chiave, pronto per Firebase.** AI spenta di
  default; dal titolo ognuno può attivarla con la propria chiave Gemini, che
  resta nel browser (sessione o dispositivo) e va solo a Google. I cinque
  compiti Gemini vivono in un solo modulo (`js/ai-tasks.js`) usato dal browser
  e dal server. Build `dist/web/` per Firebase Hosting con Content Security
  Policy rigida e intestazioni di sicurezza; gate esteso (la chiave vive solo in
  `js/ai.js`, nessuno script inline, nessuna chiave nei file pubblici).
  Progetto Firebase: database in Europa, accesso anonimo, App
  Check obbligatorio (reCAPTCHA Enterprise) su database e accesso, chiave
  pubblica limitata a domini e servizi, regole del database più strette (il
  canale della Gazzetta per gli ospiti era bloccato: corretto), budget 50 €/mese
  con blocco automatico della fatturazione. Avviso grande: la chiave Gemini
  resta nel browser; tetto di 150 richieste al giorno per la chiave del
  giocatore.

- **0.3.0 — Si impara giocando.** Tutorial: la prima volta che succede
  qualcosa di nuovo (un problema, la chat, la Scatola, Murphy, la notte…) il
  gioco si ferma, illumina il punto e spiega; guide passo passo su stagione,
  Countdown e vigilia; consigli spegnibili e riattivabili. Più tempo per
  capire: primi livelli più lenti, modalità tranquilla, tocchi un problema e ci
  lavori senza tenere premuto. Tre obiettivi per evento (stelle = obiettivi,
  visibili nell'HUD e timbrati nella retro). Due livelli nuovi: Women
  Techmakers (spazio bimbi, consenso alle foto, percorso accessibile) e
  Hackathon notturno (team bloccati e mentor, notte che stanca, vicini, demo e
  giuria), con carte, fonti e quattro personaggi nuovi. Il kit del chapter:
  otto potenziamenti comprati con le stelle. Gate esteso a sei eventi.

- **0.2.0 — OVERBOOKED!** Nuovo nome e identità (biglietto + timbro, nastro
  da cantiere, Murphy mascotte), 22 personaggi disegnati con Gemini. Stagione
  di quattro eventi (meetup, Study Jam, I/O Extended, DevFest) con mazzi e
  programmi propri. Il caos: chat dello staff con scadenze e risposte Q/E,
  persone che ti fermano in corridoio, modalità CAOS!, 24 tipi di problema
  (nuovi: sforamento, VIP, cane, stampa, flame war, blackout, quota API,
  diretta muta, badge finiti, prova di evacuazione, porta chiusa al meetup).
  Gemini durante il gioco tramite server (chat della giornata, carta "dalla
  tua zona", Gazzetta e coach, chat che reagisce, forgia da una storia vera),
  con ripiego offline. Cinque lingue (it, en scritte; fr, es, de generate e
  verificate). Testi più corti. Gate per evento, controllo lingue e chiavi.
  Build a file singolo con sprite WebP. Dockerfile per Cloud Run.
- **0.1.0** — Demo: Countdown, giornata del DevFest, retro guidata, modalità
  da solo / in due / online, la crisi del tuo chapter, bot di playtest.

## Da fare

### Da provare con persone vere
- [ ] Playtest con 3-4 lead (una call): tempi, leggibilità su telefono,
      quanto la chat distrae (deve stressare, non frustrare). Ritarare i
      profili del bot sui tempi reali, poi la curva con `tools/check.mjs`.
- [ ] Rileggere fr/es/de con un madrelingua organizzatore (sono generate).
- [ ] Verificare le stanze online su un progetto Firebase vero e tra reti
      diverse, anche con lingue diverse tra host e ospiti (la chat arriva
      nella lingua dell'host).

### Bilanciamento
- [ ] Meetup: il Countdown pesa poco (~4,0 con qualsiasi strategia): è il
      tutorial. Da verificare con persone vere se resta interessante.
- [ ] Con tutto il kit del chapter gli ultimi eventi salgono di ~0,3: va bene
      come premio, da ricontrollare con i playtest.
- [ ] Gli obiettivi sono tarati sul bot: con persone vere potrebbero servire
      soglie più basse nei primi eventi.

### Gioco
- [ ] Testi della chat già programmati restano nella lingua di partenza se la
      si cambia a metà giornata (salvare chiavi invece di testi).
- [ ] Previsione dei movimenti dell'ospite online (~150-250 ms percepiti).
- [ ] Gamepad provato solo nel codice.
- [ ] Musica generata una tantum (Lyria), come in Last Mile Hero.
- [x] Classifica dei chapter (0.5.0).
- [ ] Classifica: provare il login con Google su Safari iOS e Firefox (popup
      con la COOP `same-origin-allow-popups`).

### Contenuti e AI
- [ ] **AI offerta ai membri GDG** (senza chiave personale): codici invito per
      chapter dati ai lead, riscattati con accesso via email (qualsiasi dominio,
      link senza password) o Google; una Cloud Function verifica codice, quota
      giornaliera e App Check, poi chiama Gemini con la chiave del progetto
      (Secret Manager) usando gli stessi compiti di `js/ai-tasks.js`. Budget e
      avvisi sul progetto.
- [ ] Mazzo condiviso tra chapter (collezione moderata su Firebase).
- [ ] Porting in Flutter.
