# Officina Documenti · mobile

App web per **iPhone e Android** che comprime, unisce e protegge PDF e foto **direttamente sul telefono**.
I file non vengono mai caricati su un server: l'elaborazione avviene nel browser e la pagina ha una
Content-Security-Policy che vieta qualsiasi invio di dati (`connect-src 'none'`).

**Apri:** https://ares93-spec.github.io/officina-mobile/

## Installazione
- **iPhone (Safari):** Condividi → «Aggiungi alla schermata Home».
- **Android (Chrome/Samsung Internet):** menu ⋮ → «Installa app» / «Aggiungi a schermata Home».

Dopo la prima apertura funziona anche offline: il service worker memorizza l'app sul dispositivo.

## Funzioni
Comprimi PDF · Comprimi foto · Unisci in un PDF · Unisci foto in una · Pagine PDF (estrai, dividi, ruota,
elimina, riordina) · Rimuovi metadati · Password PDF (AES-256).

Versione: `1.0.5306ed3` · librerie e licenze in `libs/LICENZE.txt`.
