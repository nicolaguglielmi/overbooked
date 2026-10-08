# Studio: più sfide, più mappa, più gioco

Versione di partenza: **0.7.0** (ottobre 2026). Questo studio propone come
ampliare OVERBOOKED! senza perdere quello che funziona: partite brevi,
due gesti, lezioni vere con le fonti, gioco leggibile anche dal telefono.

> **Aggiornamento 0.8.0:** fatti la sfida della settimana con Chapter Cup
> (§3.1), le abilità per ruolo (§5.1), le medaglie (§3.4) e il coworking con
> il contratto delle postazioni (§4.1).

## 1. Dove siamo

| Cosa | Oggi |
|---|---|
| Stagione | 6 eventi, dal meetup (45 persone, 3 minuti) al DevFest (140 persone, 5 minuti) |
| Preparazione | 48 carte del Countdown, 33 fonti citate, 8 potenziamenti del kit |
| Giornata | 29 tipi di problema, 12 messaggi di chat con conseguenze, 3 obiettivi per evento |
| Sfide | Ore di punta ⚡ (1-3 per giornata, in crescendo), modalità sold-out 🔥 |
| Squadra | Co-org che prende ordini, volontari che servono alle postazioni |
| Mappa | Una sola sede: griglia 40×18, 22 postazioni, 3 sale (Aula Magna, Aula B, Lab) |
| Dati | Diario anonimo: riepilogo di ogni giornata, abbandoni, errori (dalla 0.5) |

Il limite più evidente è la **sede unica**: dopo due o tre eventi la mappa
non sorprende più. Il secondo è che **le scelte durante la giornata sono
quasi tutte "dove vado"**. Il terzo è che **manca un motivo per tornare**
quando la stagione è finita.

## 2. Prima di decidere: cosa dirà il diario

Il diario delle partite raccoglie già i dati per scegliere con i fatti. Dopo
due o tre settimane di stagione DevFest conviene guardare:

| Domanda | Dove si legge | Se il numero è… |
|---|---|---|
| Dove si molla? | abbandoni (`--diary=q`), percentuale di giornata | alto nei primi 20%: il tutorial pesa; alto al DevFest: troppo difficile |
| Le ore di punta piacciono o frustrano? | `s.rw` / `s.rt` nel diario | vinte meno del 30%: troppo dure; più del 80%: decorative |
| La chat viene usata? | `s.ca` / `s.ci` | ignorata più della metà: la chat è troppo nascosta, va portata sulla mappa |
| La stagione si chiude? | giornate per evento e stelle | crollo dopo l'I/O Extended: il salto di difficoltà è troppo alto |
| Si torna a giocare? | visite `ret` (nuovi o di ritorno) | pochi ritorni: servono sfide ricorrenti (§3.1) |

```bash
node tools/stats.mjs --diary=d --days=21 > giornate.csv
```

## 3. Sfide

### 3.1 La sfida della settimana (priorità alta)

Ogni lunedì una giornata con **lo stesso seme per tutti**: stessa sede, stessi
guai, stesse ore di punta. Si gioca quante volte si vuole; conta il miglior
risultato. La classifica dei chapter (pronta, si accende con il login Google) diventa la **Chapter Cup**
della stagione DevFest.

- *Perché:* dà un motivo per tornare ogni settimana e mette in gara i chapter, cioè quello che chiedi alla community.
- *Come:* la simulazione è già deterministica (stesso seme = stessa giornata) e le ore di punta hanno il loro generatore. Serve un seme settimanale, un percorso `lb/week/<settimana>` e una pagina nella classifica.
- *Anti-trucco:* il server può ricevere il seme e i comandi del giocatore e rigiocare la giornata in Node (la simulazione ci gira già per il playtest): così il punteggio non si può inventare.

### 3.2 Imprevisti della giornata (modificatori)

Carte speciali nel Countdown che **si accettano in cambio di un premio**, come
le carte di PlateUp!: rendono la giornata più dura e danno più budget o più
stelle del kit.

| Imprevisto | Cosa cambia | Lezione vera |
|---|---|---|
| Sciopero dei treni | speaker in ritardo, più chat «sono in ritardo» | il piano B per gli speaker |
| Pioggia | coda all'ingresso, ombrelli, pavimento bagnato | l'accoglienza al coperto |
| Diretta YouTube | ogni guaio sul palco vale doppio | la prova tecnica dello streaming |
| Sponsor esigente | stand che chiede attenzione ogni 20 minuti | gli accordi scritti prima |
| Ondata di caldo | il caffè diventa acqua, l'energia cala più in fretta | l'ospitalità |

Tecnicamente sono moltiplicatori sullo `spawn` dell'evento, come il sold-out:
il gate li misura come già fa per il sold-out.

### 3.3 Murphy come «boss» del DevFest

Oggi Murphy sabota e scappa. Al DevFest può diventare l'avversario finale:
tre sabotaggi in fila annunciati in chat, ognuno più difficile. Catturarlo tre
volte vale la stella «murphy». È un momento memorabile e si racconta bene nei
post.

### 3.4 Medaglie

Obiettivi trasversali che restano nel profilo (e nell'account Google):
nessuna chat ignorata, nessuno speaker perso, tutte le ore di punta vinte,
stagione senza burnout, sold-out a tre stelle. Costano poco (i numeri sono già
nel riepilogo della giornata) e danno un motivo per rigiocare un evento.

### 3.5 Le crisi della community

La forgia trasforma già una crisi vera in una carta. Il passo successivo è una
**raccolta moderata** di carte scritte dai lead: ogni settimana una carta della
community entra nella sfida della settimana, con il nome del chapter che l'ha
scritta. È contenuto che si genera da solo e coinvolge gli altri organizzatori.

## 4. Mappa

### 4.1 Più sedi, scelte nel Countdown (priorità alta)

La scelta della sede diventa la **prima carta** del Countdown, con
compromessi veri:

| Sede | Forza | Debolezza | Eventi adatti |
|---|---|---|---|
| Università (quella di oggi) | tre sale, gratis | Wi-Fi fragile, segnaletica | Study Jam, DevFest |
| Coworking | Wi-Fi ottimo, cucina | una sala sola, pochi posti | meetup, Build with AI |
| Centro congressi | quattro sale ed expo grande | costoso, distanze lunghe | DevFest grande |
| Spazio all'aperto | capienza, atmosfera | meteo, corrente, rumore | picnic, community day |
| Open space notturno | tavoli ovunque | rumore, sicurezza | hackathon |

**Come renderlo possibile senza riscrivere il gioco:** oggi la sede è scritta
nel codice (`js/venue.js`), ma il resto del gioco parla di *postazioni*
(`checkin`, `coffee`, `stageA`, `doorA`, `box`…), non di coordinate. Basta un
**contratto delle postazioni**: ogni sede è una griglia più le stesse 22
postazioni in posti diversi (quelle che non ci sono restano chiuse, come oggi
l'Aula Magna al meetup). Simulazione, bot e problemi restano uguali; il gate
misura la curva per ogni sede.

### 4.2 Sedi più grandi della schermata

La telecamera della 0.6 (pensata per il telefono) permette mappe più grandi
dello schermo anche al computer: un centro congressi da 60×24 caselle con
quattro sale. Le frecce sui bordi mostrano già i guai fuori vista.

### 4.3 Una mappa che cambia durante il giorno

- La sala del pranzo è chiusa per l'allestimento e il percorso si allunga.
- L'ascensore si blocca: chi è in carrozzina deve fare un altro giro, e serve qualcuno che lo accompagni.
- L'expo si allarga nel pomeriggio e la folla si sposta.

Sono cambi di caselle percorribili durante la giornata: il pathfinding li
supporta già.

### 4.4 Piani e accessibilità

Una sede su due piani con scale e ascensore rende concreta la lezione
dell'accessibilità: l'ascensore diventa una risorsa (occupato, rotto, da
presidiare con un volontario). È più costosa da disegnare, quindi va dopo §4.1.

## 5. Gioco

### 5.1 Un'abilità per ruolo (priorità alta)

Un pulsante nella barra in alto, con ricarica, diverso per ruolo:

| Ruolo | Abilità | Effetto |
|---|---|---|
| Lead | Megafono | annuncio in sala: la folla si sposta, la coda si dimezza per 20 secondi |
| Tech | Hotfix | risolve all'istante un guasto tecnico |
| Host | Riempi il buco | il ritardo di un talk non fa perdere gradimento |
| Care | Pausa respiro | ricarica l'energia della squadra vicina, calma una flame |

Aggiunge una scelta («la uso adesso o la tengo per l'ora di punta?») senza un
terzo gesto sulla mappa: è un tasto nella barra. Rende anche diversi i ruoli,
che oggi cambiano poco.

### 5.2 Volontari con nome e specialità

Nel Countdown si reclutano volontari con una specialità (accoglienza,
tecnica, foto, bimbi). Alla postazione giusta servono il doppio; stancandosi
rallentano e chiedono il cambio in chat. È la lezione «i volontari si formano
e si fanno ruotare».

### 5.3 Partecipanti con bisogni diversi

Studenti, professionisti, speaker, sponsor e famiglie (al WTM) hanno bisogni
diversi: Wi-Fi, networking, caffè, spazio bimbi. Il gradimento finale si
divide per gruppo e la retro dice chi è uscito scontento e perché. È la
lezione del questionario post-evento, e dà una ragione in più per mettere i
volontari al posto giusto.

### 5.4 Il budget del giorno

Una piccola cassa per le emergenze: pizza in più, taxi per lo speaker,
adattatore comprato al volo. Ogni spesa è una scelta, non un tasto magico, e
quello che avanza torna nel Countdown dell'evento dopo.

### 5.5 La stagione come campagna

Tra un evento e l'altro il chapter cresce: membri, reputazione, un team
organizzativo con caratteri diversi (chi è bravo con gli sponsor, chi si
brucia prima). Il burnout di un evento pesa sul successivo. È la lezione più
importante per un lead, «la community è una maratona», e oggi il gioco non la
racconta.

### 5.6 Online con ruoli diversi

Le stanze online oggi danno a tutti la stessa vista. Una variante asimmetrica:
uno **in regia** (vede chat, telecamere e frecce di tutta la sede, manda
ordini) e gli altri **sul campo**. È la co-op più fedele alla realtà di un
evento e funziona bene in una call tra lead.

## 6. Contenuti

- **Nuovi eventi:** Build with AI, Cloud Study Jam, giornata di orientamento GDG on Campus, DevFest su due giorni.
- **Nuovi guai:** fila ai bagni, la demo con l'AI che risponde male sul palco, badge con il nome sbagliato, parcheggio pieno, il fotografo che non arriva.
- **Nuovi messaggi di chat:** ognuno con le sue tre conseguenze (risposta buona, altra risposta, silenzio), come quelli della 0.7.

Ogni contenuto nuovo segue la regola di sempre: una lezione vera e una fonte.

## 7. Priorità

Impatto stimato sul coinvolgimento e sul riconoscimento della community,
contro lo sforzo.

| Proposta | Impatto | Sforzo | Quando |
|---|---|---|---|
| Sfida della settimana + Chapter Cup (§3.1) | alto | medio | 0.8 |
| Abilità per ruolo (§5.1) | alto | basso | 0.8 |
| Medaglie (§3.4) | medio | basso | 0.8 |
| Contratto delle postazioni + coworking (§4.1) | alto | medio | 0.8-0.9 |
| Imprevisti nel Countdown (§3.2) | medio | basso | 0.9 |
| Murphy boss del DevFest (§3.3) | medio | basso | 0.9 |
| Centro congressi e mappe grandi (§4.1-4.2) | alto | alto | 0.9 |
| Volontari con specialità (§5.2) | medio | medio | 0.9 |
| Partecipanti con bisogni (§5.3) | medio | medio | 1.0 |
| Campagna del chapter (§5.5) | alto | alto | 1.0 |
| Online asimmetrico (§5.6) | alto | alto | 1.0 |
| Raccolta delle crisi della community (§3.5) | medio | medio | 1.0 |

**Proposta per la 0.8 (circa due settimane):** sfida della settimana con
Chapter Cup, abilità per ruolo, medaglie e una seconda sede (coworking) con il
contratto delle postazioni. È il pacchetto che fa tornare chi ha già giocato e
dà ai chapter un motivo per sfidarsi durante la stagione DevFest.

## 8. Rischi

- **Leggibilità:** ogni meccanica nuova ha bisogno della sua scheda del tutorial e deve stare in due righe. Un'abilità per ruolo sì, tre no.
- **Telefono:** mappe più grandi vanno provate prima sul telefono; le frecce sui bordi diventano essenziali.
- **Bilanciamento:** ogni sede e ogni imprevisto entrano nel gate con le stesse soglie di oggi.
- **Contenuti della community:** carte e nomi di chapter visibili a tutti vanno moderati (la classifica ha già il controllo dei nomi).
- **Costi:** la sfida della settimana rigioca le partite sul server. Con mille utenti resta nei limiti gratuiti; la stima va rifatta prima di lanciarla.
