# Spec — Organisation onglets EFB v4.1

**Date** : 6 février 2026  
**Pour** : Claude Code (VS Code)  
**Objectif** : Restructurer les types, la navigation et les placeholders pour aligner l'EFB sur la roadmap v4.1

---

## État actuel vs cible v4.1

### Sidebar (onglets principaux)

| # | Actuel | Cible v4.1 | Action |
|---|--------|------------|--------|
| 1 | profile | profile | ✅ Garder |
| 2 | map | map | ✅ Garder |
| 3 | missions | missions | ✅ Garder |
| 4 | — | **contrats** | ➕ AJOUTER |
| 5 | company | company | ✅ Garder |
| 6 | market | market | ✅ Garder |
| 7 | hangar | hangar | ✅ Garder |
| — | inventory (orphelin) | — | 🗑️ SUPPRIMER |
| ⚙ | settings | settings | ✅ Garder (en bas) |

### Sous-onglets par tab

#### PROFILE (3 → 6 sous-onglets)

| Sous-onglet | Actuel | Cible v4.1 | Action |
|-------------|--------|------------|--------|
| apercu | ✅ OK | ✅ OK | Garder |
| certifications | — | 📋 Nouveau | ➕ Placeholder |
| inventaire | ✅ OK | ✅ OK (+ tags perso/company) | Garder |
| historique | ✅ OK | 🔶 Enrichir (vols + transactions) | Garder |
| messagerie | — | 📋 Nouveau | ➕ Placeholder |
| social | — | 📋 Nouveau | ➕ Placeholder |

#### MISSIONS (2 → 2 sous-onglets)

| Sous-onglet | Actuel | Cible v4.1 | Action |
|-------------|--------|------------|--------|
| apercu | ✅ OK | ✅ OK | Garder |
| creation | ✅ OK | ✅ OK (+ passagers + tag cargo) | Garder |

→ Pas de changement structurel.

#### CONTRATS (nouveau tab — 3 sous-onglets)

| Sous-onglet | Actuel | Cible v4.1 | Action |
|-------------|--------|------------|--------|
| dashboard | — | 📋 Contrats disponibles | ➕ Placeholder |
| mes-contrats | — | 📋 Mes contrats créés | ➕ Placeholder |
| en-cours | — | 📋 Contrats acceptés | ➕ Placeholder |

#### COMPANY (4 → 5 sous-onglets)

| Sous-onglet | Actuel | Cible v4.1 | Action |
|-------------|--------|------------|--------|
| overview | ✅ OK | ✅ OK (+ virements) | Garder |
| membres | ✅ OK | ✅ OK (+ rôles/droits) | Garder |
| flotte | ✅ Existe | — | 🗑️ SUPPRIMER |
| inventaire | ✅ OK | ✅ OK (+ tags company) | Garder |
| historique | — | 📋 Nouveau | ➕ Placeholder |
| messagerie | — | 📋 Nouveau | ➕ Placeholder |

#### MARKET (1 vue → 3 sous-onglets)

| Sous-onglet | Actuel | Cible v4.1 | Action |
|-------------|--------|------------|--------|
| achats | (vue unique actuelle) | ✅ Achats items | Garder comme sous-onglet |
| mes-ventes | — | 📋 Poster sell orders | ➕ Placeholder |
| avions | — | 📋 Achat/vente avions | ➕ Placeholder |

#### HANGAR (vue unique → vue unique enrichie)

Pas de sous-onglets. Ajouter la section conversion kits dans la vue existante (Phase 9).

#### MAP & SETTINGS

Pas de changement structurel.

---

## Modifications techniques requises

### 1. types/index.ts — Mettre à jour les types

```typescript
// AVANT
type TabType = "profile" | "map" | "missions" | "company" | "market" | "inventory" | "hangar" | "settings";
type ProfileSubTab = "apercu" | "inventaire" | "historique";
type CompanySubTab = "overview" | "membres" | "flotte" | "inventaire";
// Pas de MarketSubTab ni ContratsSubTab

// APRÈS v4.1
type TabType = "profile" | "map" | "missions" | "contrats" | "company" | "market" | "hangar" | "settings";

type ProfileSubTab = "apercu" | "certifications" | "inventaire" | "historique" | "messagerie" | "social";

type MissionsSubTab = "apercu" | "creation"; // inchangé

type ContratsSubTab = "dashboard" | "mes-contrats" | "en-cours"; // NOUVEAU

type CompanySubTab = "overview" | "membres" | "inventaire" | "historique" | "messagerie"; // flotte supprimé, historique et messagerie ajoutés

type MarketSubTab = "achats" | "mes-ventes" | "avions"; // NOUVEAU
```

### 2. state/NavigationState.ts — Ajouter les states

```typescript
// Ajouter :
contratsSubTab: Subject<ContratsSubTab> = Subject.create<ContratsSubTab>("dashboard");
marketSubTab: Subject<MarketSubTab> = Subject.create<MarketSubTab>("achats");
```

### 3. Sidebar — Ajouter "contrats" entre missions et company

Ordre final sidebar : profile, map, missions, **contrats**, company, market, hangar, ··· settings (bas)

### 4. Vues placeholder pour les nouveaux sous-onglets

Chaque nouveau sous-onglet obtient un placeholder simple :
```
┌──────────────────────────────────────┐
│  [Icône] [Titre du sous-onglet]      │
│                                       │
│  Coming soon — Phase X                │
│  (description courte)                 │
└──────────────────────────────────────┘
```

### 5. Suppressions

- Supprimer `renderInventoryTab` + `InventoryView.tsx` (onglet orphelin)
- Supprimer le sous-onglet "flotte" de Company (le contenu fleet est dans Hangar)
- Supprimer la référence `"inventory"` dans TabType
- Nettoyer les refs et states associés (`inventoryType`, `inventoryStatus`, `inventoryError`, `inventoryListRef`)

### 6. i18n — Ajouter les clés de traduction

Dans `en.json` et `fr.json`, ajouter les clés pour :
- Tab "contrats" : `tabs.contrats`
- Sous-onglets : `subtabs.certifications`, `subtabs.messagerie`, `subtabs.social`, `subtabs.dashboard`, `subtabs.mes-contrats`, `subtabs.en-cours`, `subtabs.mes-ventes`, `subtabs.avions`, `subtabs.historique` (company)
- Placeholders : `placeholder.coming_soon`, `placeholder.phase_x`

---

## Résumé des actions (Phase 0)

```
SUPPRIMER :
  □ Tab "inventory" orphelin (renderInventoryTab + InventoryView.tsx + refs)
  □ Company > sous-onglet "flotte" (CompanyView flotte section + state + refs)
  □ "inventory" du type TabType

AJOUTER :
  □ Tab "contrats" dans sidebar (entre missions et company)
  □ Profile > sous-onglets : certifications, messagerie, social (placeholders)
  □ Contrats > sous-onglets : dashboard, mes-contrats, en-cours (placeholders)
  □ Company > sous-onglets : historique, messagerie (placeholders)
  □ Market > sous-onglets : achats (= vue actuelle), mes-ventes, avions (placeholders)

MODIFIER :
  □ types/index.ts → TabType, ProfileSubTab, CompanySubTab + nouveaux ContratsSubTab, MarketSubTab
  □ state/NavigationState.ts → ajouter contratsSubTab, marketSubTab
  □ Sidebar render → ajouter contrats, icône associée
  □ i18n en.json + fr.json → nouvelles clés
  □ Build clean (0 errors, 0 warnings)
```
