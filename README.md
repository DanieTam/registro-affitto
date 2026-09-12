# Registro Affitto – PWA

Piccola app web installabile per registrare mensilmente i pagamenti dell'affitto in contanti, acquisire due firme con il dito e generare una ricevuta PDF.

## Funzioni

- 12 mensilità per anno con stato pagato/non registrato
- dati di locatore, conduttore, immobile e canone
- importo e data del pagamento
- firma del conduttore e del locatore su touchscreen
- ricevuta PDF numerata `AAAA/MM`
- condivisione del PDF tramite il menu di sistema del telefono
- salvataggio in OneDrive o Dropbox scegliendo l'app dal menu Condividi
- archivio locale sul dispositivo
- backup/esportazione JSON e ripristino
- utilizzo offline dopo la prima apertura
- nessun account e nessun abbonamento

## Installazione su smartphone

Una PWA deve essere aperta da un indirizzo HTTPS per poter essere installata correttamente e per usare al meglio la condivisione dei file.

1. Pubblica il contenuto di questa cartella su un hosting statico HTTPS (per esempio GitHub Pages, Cloudflare Pages, Netlify o un tuo server HTTPS).
2. Apri l'indirizzo dal telefono.
3. iPhone/iPad: Safari > Condividi > **Aggiungi alla schermata Home**.
4. Android: Chrome > menu > **Installa app** / **Aggiungi a schermata Home**.

Dopo l'installazione, l'app continua a funzionare offline. I dati restano nel browser/PWA di quel dispositivo.

## Salvare una ricevuta in OneDrive o Dropbox

Dopo la registrazione del pagamento premi **Condividi / salva PDF**. Nel menu di condivisione di iOS/Android scegli OneDrive o Dropbox. La prima volta può essere necessario abilitare l'app desiderata nelle opzioni del menu di condivisione.

## Backup importante

I dati sono locali al dispositivo. Usa periodicamente **Esporta backup** e conserva il file `.json` in OneDrive/Dropbox. Il backup contiene anche le firme registrate.

## Test su computer

Da questa cartella puoi avviare un server locale con:

```bash
python3 -m http.server 8000
```

Poi apri `http://localhost:8000` nel browser.

## Privacy

L'app non invia dati a server esterni. Il PDF viene creato nel browser. La condivisione verso OneDrive/Dropbox avviene soltanto quando l'utente preme il relativo pulsante e sceglie la destinazione dal menu del sistema operativo.
