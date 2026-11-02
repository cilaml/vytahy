# Výtahy DC – servisní aplikace

Interní systém pro správu výtahů, poruch, servisu, prohlídek, plánovaných akcí a nářadí.

## Databázové migrace

Před nasazením spusťte v Supabase SQL Editoru všechny soubory ze složky
`supabase/migrations` podle data v názvu. Poslední migrace pro push notifikace je:

- `supabase/migrations/20260820_harden_push_notifications.sql`

Migrace vytvoří nebo doplní odběry zařízení, odstraní staré duplicitní endpointy
a zabrání opakovanému rozesílání stejné nově založené poruchy.

## Push notifikace

Ve Vercelu musí být pro Production, Preview i Development nastavené proměnné z
`.env.example`: Supabase URL/klíče a trojice VAPID hodnot. Veřejný a soukromý
VAPID klíč musí pocházet ze stejné vygenerované dvojice.

Po nasazení otevřete na telefonu `Upozornění`, zapněte přepínač a ověřte, že
automaticky dorazí testovací oznámení. iPhone vyžaduje iOS 16.4 nebo novější a
spuštění aplikace z ikony přidané na plochu.

## Evidence nářadí

- rychlé vyhledávání podle názvu, značky nebo inventárního čísla
- automatické inventární číslování
- výdej, předání, vrácení a stav v opravě
- historie pohybů v databázi
- tisk QR štítku se znakem Výtahy DC
- připravená vazba nářadí na plánované akce
