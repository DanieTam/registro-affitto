# Registro Affitto – PWA v2

App web installabile per gestire pagamenti dell'affitto, anche parziali o dilazionati, firme e ricevute PDF.

## Novità della versione 2

- più versamenti per la stessa mensilità
- residuo mensile calcolato automaticamente
- stato mensilità: saldata, parziale, scaduta, non ancora dovuta, fuori contratto
- dashboard alla data corrente con totale da pagare e mensilità aperte
- evidenza delle mensilità saldate in ritardo
- evidenza dei pagamenti dilazionati in più versamenti
- gestione della cauzione/caparra iniziale
- possibilità di imputare una quota della cauzione a una mensilità
- calcolo automatico della cauzione residua
- organizzazione e riepilogo per anno
- numero ricevuta progressivo annuale (es. 2026-0001)
- PDF ridisegnato in formato professionale
- compatibilità automatica con i dati della versione precedente

## Dati del contratto

Per calcolare correttamente ritardi e arretrati, nelle Impostazioni indica:

- canone mensile
- giorno di scadenza del canone
- data di inizio contratto
- eventuale data di fine contratto
- eventuale cauzione iniziale e relativa data

## Pagamenti parziali

Apri una mensilità e usa **Aggiungi versamento**. Ogni versamento conserva:

- importo in contanti
- eventuale quota di cauzione imputata al canone
- data
- note
- firma del conduttore
- firma del locatore
- propria ricevuta PDF

La mensilità viene segnata come saldata solo quando la somma dei versamenti raggiunge il canone mensile.

## Installazione / aggiornamento con GitHub Pages

Se l'app è già pubblicata su GitHub Pages, sostituisci nel repository i file della vecchia versione con quelli di questa cartella e fai commit. I dati già salvati sul telefono restano nello storage locale della PWA e vengono migrati automaticamente.

Dopo l'aggiornamento, apri una volta il sito in Safari/Chrome con connessione internet. Se l'app installata mostra ancora la vecchia versione, chiudila completamente e riaprila. Il service worker v2 elimina la vecchia cache.

## Salvare una ricevuta in OneDrive o Dropbox

Dopo la registrazione del versamento premi **Condividi / salva PDF** e scegli OneDrive o Dropbox dal menu di condivisione di iOS/Android.

## Backup importante

I dati sono locali al dispositivo. Usa periodicamente **Esporta backup** e conserva il file `.json` in OneDrive/Dropbox. Il backup contiene anche le firme registrate e i dati della cauzione.

## Privacy

L'app non invia dati a server esterni. GitHub Pages ospita soltanto il codice dell'app. I dati del contratto, i pagamenti e le firme restano nel browser/PWA del dispositivo, salvo l'esportazione o la condivisione effettuata volontariamente dall'utente.
