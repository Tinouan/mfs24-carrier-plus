# Onglet Paramètres EFB (Settings)

> Version: 1.0 (Architecture P2P)
> Date: 2026-02-03
> Status: DRAFT - À valider avant implémentation

---

## Résumé

Onglet paramètres accessible via icône ⚙️ en bas à gauche de l'EFB. Permet de personnaliser l'expérience utilisateur.

---

## Décisions techniques

| Aspect | Décision |
|--------|----------|
| Stockage paramètres | Local EFB (localStorage) |
| Langues V1 | EN + FR |
| Thème | Dark only |
| SimBrief | Pas pour le moment |
| Traductions | JSON local + API pour màj |

---

## Structure de l'onglet

```
PARAMÈTRES
├── 🌐 Langue & Unités
├── 📱 Affichage
├── 🔔 Notifications
├── 👤 Compte
├── 🎮 Gameplay
├── 💾 Données
└── ℹ️ À propos
```

---

## 🌐 Langue & Unités

| Paramètre | Options | Défaut | Stockage |
|-----------|---------|--------|----------|
| Langue | 🇬🇧 English, 🇫🇷 Français | English | Local |
| Unités distance | nm / km | nm | Local |
| Unités poids | lbs / kg | kg | Local |
| Unités altitude | ft / m | ft | Local |
| Unités carburant | gal / L | gal | Local |
| Unités vitesse | kts / km/h | kts | Local |
| Format température | °C / °F | °C | Local |

### UI

```
┌─────────────────────────────────────────────────────────────┐
│ 🌐 LANGUE & UNITÉS                                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Langue                                                     │
│  ┌─────────────┐ ┌─────────────┐                           │
│  │ 🇬🇧 English │ │ 🇫🇷 Français│                           │
│  └─────────────┘ └─────────────┘                           │
│       ✓                                                     │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  Unités                                                     │
│                                                             │
│  Distance        [nm ▼]                                     │
│  Poids           [kg ▼]                                     │
│  Altitude        [ft ▼]                                     │
│  Carburant       [gal ▼]                                    │
│  Vitesse         [kts ▼]                                    │
│  Température     [°C ▼]                                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 📱 Affichage

| Paramètre | Options | Défaut |
|-----------|---------|--------|
| Taille tablette | Petit / Moyen / Grand | Moyen |
| Taille police | Petit / Normal / Grand | Normal |
| Animations UI | On / Off | On |
| Mode daltonien | Off / Deutéranopie / Protanopie / Tritanopie | Off |

### UI

```
┌─────────────────────────────────────────────────────────────┐
│ 📱 AFFICHAGE                                                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Taille tablette                                            │
│  ┌────────┐ ┌────────┐ ┌────────┐                          │
│  │ Petit  │ │ Moyen  │ │ Grand  │                          │
│  └────────┘ └────────┘ └────────┘                          │
│                  ✓                                          │
│                                                             │
│  Taille police                                              │
│  ┌────────┐ ┌────────┐ ┌────────┐                          │
│  │ Petit  │ │ Normal │ │ Grand  │                          │
│  └────────┘ └────────┘ └────────┘                          │
│                  ✓                                          │
│                                                             │
│  Animations UI                     [●━━━━━━━━━━━━━━━━━━━━]  │
│                                              ON             │
│                                                             │
│  Mode daltonien                    [Off ▼]                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔔 Notifications

| Paramètre | Options | Défaut |
|-----------|---------|--------|
| Sons EFB | On / Off | On |
| Volume sons | 0-100% | 50% |
| Alerte mission terminée | On / Off | On |
| Alerte production usine | On / Off | On |
| Alerte salaires workers | On / Off | On |
| Alerte marché (vente) | On / Off | On |
| Alerte maintenance avion | On / Off | On |

### UI

```
┌─────────────────────────────────────────────────────────────┐
│ 🔔 NOTIFICATIONS                                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Sons EFB                          [●━━━━━━━━━━━━━━━━━━━━]  │
│                                              ON             │
│                                                             │
│  Volume                            [━━━━━━━●━━━━━━━] 50%    │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  Alertes                                                    │
│                                                             │
│  Mission terminée                  [●━━━━━━━━━━━━━━━━━━━━]  │
│  Production usine                  [●━━━━━━━━━━━━━━━━━━━━]  │
│  Salaires workers                  [●━━━━━━━━━━━━━━━━━━━━]  │
│  Vente marché                      [●━━━━━━━━━━━━━━━━━━━━]  │
│  Maintenance avion                 [●━━━━━━━━━━━━━━━━━━━━]  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 👤 Compte

| Paramètre | Type | Action |
|-----------|------|--------|
| Rester connecté | Toggle | Sauvegarde token longue durée |
| Compte lié | Info | Affiche email masqué |
| Changer mot de passe | Bouton | Ouvre modal |
| Déconnexion | Bouton | Déconnecte + retour login |
| Supprimer mon compte | Bouton | Confirmation requise |

### UI

```
┌─────────────────────────────────────────────────────────────┐
│ 👤 COMPTE                                                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Rester connecté                   [●━━━━━━━━━━━━━━━━━━━━]  │
│                                              ON             │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  Compte                                                     │
│  Email: t••••n@gmail.com                                    │
│  Membre depuis: 15 Jan 2026                                 │
│                                                             │
│  [Changer mot de passe]                                     │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  [Déconnexion]                                              │
│                                                             │
│  [Supprimer mon compte]  (rouge, texte petit)               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎮 Gameplay

| Paramètre | Options | Défaut |
|-----------|---------|--------|
| Tutoriels | On / Off | On |
| Confirmations | Toujours / Important / Jamais | Important |
| Afficher gains XP | On / Off | On |
| Mini-map en mission | On / Off | On |
| Auto-pause menu EFB | On / Off | Off |

**Confirmations "Important"** = vendre avion, supprimer usine, annuler mission, transferts gros montants

### UI

```
┌─────────────────────────────────────────────────────────────┐
│ 🎮 GAMEPLAY                                                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Tutoriels                         [●━━━━━━━━━━━━━━━━━━━━]  │
│                                              ON             │
│                                                             │
│  Confirmations                     [Important ▼]            │
│                                                             │
│  Afficher gains XP                 [●━━━━━━━━━━━━━━━━━━━━]  │
│                                              ON             │
│                                                             │
│  Mini-map en mission               [●━━━━━━━━━━━━━━━━━━━━]  │
│                                              ON             │
│                                                             │
│  Auto-pause menu EFB               [━━━━━━━━━━━━━━━━━━━━●]  │
│                                              OFF            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 💾 Données

| Action | Description |
|--------|-------------|
| Dernière synchro | Affiche timestamp |
| Forcer synchronisation | Bouton - synchro manuelle |
| Vider le cache | Bouton - clear localStorage (sauf auth) |
| Vérifier màj traductions | Bouton - check API |

### UI

```
┌─────────────────────────────────────────────────────────────┐
│ 💾 DONNÉES                                                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Synchronisation                                            │
│  Dernière synchro: il y a 2 min                             │
│                                                             │
│  [Forcer synchronisation]                                   │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  Cache local                                                │
│  Taille: 2.4 MB                                             │
│                                                             │
│  [Vider le cache]                                           │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  Traductions                                                │
│  Version: 1.0.0                                             │
│                                                             │
│  [Vérifier mises à jour]                                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## ℹ️ À propos

| Info | Type |
|------|------|
| Version | Texte statique |
| Serveur | Status connecté / hors ligne |
| Ping | Latence en ms |
| Discord | Lien cliquable |
| Site web | Lien cliquable |
| Changelog | Bouton → Modal |
| Signaler bug | Bouton → Discord ou formulaire |

### UI

```
┌─────────────────────────────────────────────────────────────┐
│ ℹ️ À PROPOS                                                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  MFS Carrier+                                               │
│  Version 0.8.0                                              │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  Serveur: Connecté ✅                                       │
│  Ping: 45 ms                                                │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  [📋 Changelog]                                             │
│                                                             │
│  [🐛 Signaler un bug]                                       │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  Liens                                                      │
│  🔗 Discord                                                 │
│  🔗 Site web                                                │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  © 2026 MFS Carrier+                                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Système de traductions

### Architecture (P2P - Traductions locales)

```
DÉMARRAGE EFB
│
├─► 1. Charge JSON bundlé (src/locales/)
│      → Affichage instantané
│      → EN et FR inclus dans le package
│
└─► 2. Continue normalement

Note: En mode P2P, les traductions sont bundlées avec l'application.
Pas de téléchargement dynamique nécessaire.
```

### Fichiers JSON locaux

Structure d'un fichier de langue (`en.json`) :

```json
{
  "meta": {
    "version": "1.0.0",
    "language": "en",
    "name": "English"
  },
  "common": {
    "save": "Save",
    "cancel": "Cancel",
    "confirm": "Confirm",
    "delete": "Delete",
    "loading": "Loading...",
    "error": "Error",
    "success": "Success"
  },
  "nav": {
    "map": "Map",
    "profile": "Profile",
    "missions": "Missions",
    "create": "Create",
    "company": "Company",
    "market": "Market",
    "inventory": "Inventory",
    "settings": "Settings"
  },
  "settings": {
    "title": "Settings",
    "language": "Language",
    "units": "Units",
    "display": "Display",
    "notifications": "Notifications",
    "account": "Account",
    "gameplay": "Gameplay",
    "data": "Data",
    "about": "About"
  },
  "units": {
    "distance": "Distance",
    "weight": "Weight",
    "altitude": "Altitude",
    "fuel": "Fuel",
    "speed": "Speed",
    "temperature": "Temperature",
    "nm": "nm",
    "km": "km",
    "lbs": "lbs",
    "kg": "kg",
    "ft": "ft",
    "m": "m",
    "gal": "gal",
    "l": "L",
    "kts": "kts",
    "kmh": "km/h"
  },
  "display": {
    "tabletSize": "Tablet size",
    "small": "Small",
    "medium": "Medium",
    "large": "Large",
    "fontSize": "Font size",
    "normal": "Normal",
    "animations": "UI Animations",
    "colorblind": "Colorblind mode",
    "off": "Off"
  },
  "notifications": {
    "sounds": "EFB Sounds",
    "volume": "Volume",
    "alerts": "Alerts",
    "missionComplete": "Mission complete",
    "factoryProduction": "Factory production",
    "workerSalaries": "Worker salaries",
    "marketSale": "Market sale",
    "aircraftMaintenance": "Aircraft maintenance"
  },
  "account": {
    "stayLoggedIn": "Stay logged in",
    "linkedAccount": "Linked account",
    "memberSince": "Member since",
    "changePassword": "Change password",
    "logout": "Logout",
    "deleteAccount": "Delete my account",
    "deleteConfirm": "Are you sure? This action is irreversible."
  },
  "gameplay": {
    "tutorials": "Tutorials",
    "confirmations": "Confirmations",
    "always": "Always",
    "important": "Important only",
    "never": "Never",
    "showXP": "Show XP gains",
    "minimap": "Mini-map during mission",
    "autoPause": "Auto-pause when EFB open"
  },
  "data": {
    "lastSync": "Last sync",
    "forceSync": "Force synchronization",
    "cache": "Local cache",
    "cacheSize": "Size",
    "clearCache": "Clear cache",
    "translations": "Translations",
    "translationVersion": "Version",
    "checkUpdates": "Check for updates"
  },
  "about": {
    "version": "Version",
    "server": "Server",
    "connected": "Connected",
    "offline": "Offline",
    "ping": "Ping",
    "changelog": "Changelog",
    "reportBug": "Report a bug",
    "links": "Links"
  },
  "time": {
    "ago": "ago",
    "justNow": "just now",
    "minutes": "min",
    "hours": "h",
    "days": "d"
  }
}
```

### Fichiers locaux (Architecture P2P)

Les traductions sont stockées dans `src/locales/`:

```
src/locales/
├── en.json
└── fr.json
```

Le service `LocaleService` charge le fichier approprié au démarrage.

```typescript
// LocaleService.loadLocale()
async loadLocale(lang: string): Promise<Translations> {
  // Charge depuis le bundle local
  const translations = await import(`./locales/${lang}.json`);
  return translations;
}
```

---

## Stockage local (EFB)

### Clés localStorage

| Clé | Type | Description |
|-----|------|-------------|
| `carrierplus_settings` | JSON | Tous les paramètres utilisateur |
| `carrierplus_translations_en` | JSON | Cache traductions EN |
| `carrierplus_translations_fr` | JSON | Cache traductions FR |
| `carrierplus_translations_version` | String | Version traductions en cache |
| `carrierplus_auth_token` | String | JWT si "rester connecté" |

### Structure settings

```json
{
  "language": "en",
  "units": {
    "distance": "nm",
    "weight": "kg",
    "altitude": "ft",
    "fuel": "gal",
    "speed": "kts",
    "temperature": "C"
  },
  "display": {
    "tabletSize": "medium",
    "fontSize": "normal",
    "animations": true,
    "colorblindMode": "off"
  },
  "notifications": {
    "sounds": true,
    "volume": 50,
    "missionComplete": true,
    "factoryProduction": true,
    "workerSalaries": true,
    "marketSale": true,
    "aircraftMaintenance": true
  },
  "account": {
    "stayLoggedIn": true
  },
  "gameplay": {
    "tutorials": true,
    "confirmations": "important",
    "showXP": true,
    "minimap": true,
    "autoPause": false
  }
}
```

---

## Navigation

### Position dans l'EFB

```
┌─────────────────────────────────────────────────────────────┐
│  MFS CARRIER+                                    [Tinou]    │
├──────────┬──────────────────────────────────────────────────┤
│          │                                                  │
│  Map     │                                                  │
│  Profile │              CONTENU PRINCIPAL                   │
│  Missions│                                                  │
│  Create  │                                                  │
│  Company │                                                  │
│  Market  │                                                  │
│  Inventory                                                  │
│          │                                                  │
│          │                                                  │
│          │                                                  │
├──────────┤                                                  │
│  ⚙️      │◄─── Bouton Settings en bas à gauche             │
└──────────┴──────────────────────────────────────────────────┘
```

### Sous-navigation Settings

```
┌─────────────────────────────────────────────────────────────┐
│  PARAMÈTRES                                                 │
├──────────┬──────────────────────────────────────────────────┤
│          │                                                  │
│ 🌐 Langue│              CONTENU SECTION                     │
│ 📱 Affich│                                                  │
│ 🔔 Notif │                                                  │
│ 👤 Compte│                                                  │
│ 🎮 Gamep │                                                  │
│ 💾 Données                                                  │
│ ℹ️ À prop│                                                  │
│          │                                                  │
├──────────┤                                                  │
│  ← Retour│◄─── Retour au menu principal                    │
└──────────┴──────────────────────────────────────────────────┘
```

---

## Questions ouvertes (avant implémentation)

1. **Mode debug admin** : Ajouter section cachée pour logs/debug ?

2. **Export données** : Permettre export CSV des stats perso ?

3. **Raccourci clavier** : TAB ouvre l'EFB natif MSFS - conflit ?

4. **Langues futures** : Prévoir structure pour ES/RU/DE même si pas V1 ?

5. **Reset settings** : Bouton "Restaurer paramètres par défaut" ?

---

## Changelog

| Date | Version | Modification |
|------|---------|--------------|
| 2026-01-30 | 1.0 | Création spec initiale |
