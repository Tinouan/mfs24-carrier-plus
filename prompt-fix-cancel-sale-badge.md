# PROMPT CLAUDE CODE — Fix : badge "EN VENTE" reste après annulation

## Problème
Quand on annule la vente d'un avion, le badge "EN VENTE" reste dans le Hangar.

## Cause
`cancelSellOrder()` dans LocalMarketService.ts annule l'ordre (status = "cancelled") mais ne remet PAS `aircraft.for_sale = false`.

## Fix
Dans `cancelSellOrder()`, après avoir annulé l'ordre, vérifier si c'est un sell order avion (`is_aircraft === true`). Si oui, remettre le flag :

```typescript
// Après avoir mis order.status = "cancelled" :
if (order.is_aircraft && order.item_id) {
  const aircraft = await DatabaseManager.get<Aircraft>("aircraft", order.item_id);
  if (aircraft) {
    aircraft.for_sale = false;
    aircraft.sale_price = undefined;
    await DatabaseManager.put("aircraft", aircraft);
    console.log(`[LocalMarketService] Aircraft ${aircraft.registration} removed from sale`);
  }
}
```

AUSSI : dans `fulfillSellOrder()` (quand l'IA achète), faire la même chose + soft delete l'avion :
```typescript
if (order.is_aircraft && order.item_id) {
  const aircraft = await DatabaseManager.get<Aircraft>("aircraft", order.item_id);
  if (aircraft) {
    aircraft.for_sale = false;
    aircraft.is_active = false;  // Vendu
    await DatabaseManager.put("aircraft", aircraft);
  }
}
```

## Contraintes
- `npm run build` → 0 errors, 0 warnings
