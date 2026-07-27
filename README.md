# Výtahy DC – servisní aplikace

Interní systém pro správu výtahů, poruch, servisu, prohlídek, plánovaných akcí a nářadí.

## Nasazení plánovaných akcí a evidence nářadí

Před sloučením nové verze do `main` spusťte v Supabase SQL Editoru v tomto pořadí:

1. `supabase/migrations/20260727_create_planned_actions.sql`
2. `supabase/migrations/20260727_create_tools.sql`

Potom lze sloučit větev `feature/planovane-akce` do `main`. Vercel nasadí novou verzi automaticky.

## Evidence nářadí

- rychlé vyhledávání podle názvu, značky nebo inventárního čísla
- automatické inventární číslování
- výdej, předání, vrácení a stav v opravě
- historie pohybů v databázi
- tisk QR štítku se znakem Výtahy DC
- připravená vazba nářadí na plánované akce
