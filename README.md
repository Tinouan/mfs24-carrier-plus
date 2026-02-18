# AeroCorp Online

🛫 **Jeu de gestion de compagnie aérienne cargo pour Microsoft Flight Simulator 2024**

Un mod complet qui transforme MSFS 2024 en simulateur de gestion de fret aérien avec économie, usines, workers et missions.

---

## ✨ Fonctionnalités

### 🎮 Gameplay

- **Missions cargo** : Transportez du fret entre aéroports avec scoring et récompenses
- **Système économique** : Achetez, produisez et vendez sur un marché dynamique
- **Usines** : Construisez des usines pour transformer les matières premières
- **Workers** : Recrutez et gérez votre main-d'œuvre (42 nationalités)
- **Flotte** : Gérez vos avions personnels et de company
- **Progression** : XP, licences pilote, classements

### 🌍 Un seul monde partagé

- **Mode Solo** : Jouez offline avec une économie IA
- **Mode Multijoueur** : Synchronisation P2P avec les autres joueurs
- **Données persistantes** : Votre progression sauvegardée localement

### 📱 Interface EFB intégrée

- Carte interactive avec 84,000+ aéroports
- Gestion complète depuis le cockpit
- 5 langues supportées (FR, EN, DE, ES, RU)

---

## 🚀 Installation

### Prérequis

- Microsoft Flight Simulator 2024
- Windows 10/11

### Installation

1. Téléchargez la dernière release
2. Copiez le dossier `aerocorp-online-efb` dans votre dossier Community MSFS
3. Lancez MSFS 2024
4. Ouvrez l'EFB dans le cockpit → Onglet "AeroCorp Online"

---

## 🎯 Démarrage rapide

### Premier lancement

1. **Créez votre profil** : Nom, nationalité, aéroport de base
2. **Recevez vos fonds** : 100,000 CR de départ
3. **Votre premier avion** : Un Cessna 172 personnel

### Votre première mission

1. Allez dans l'onglet **Missions** → **Créer**
2. Sélectionnez votre avion (doit être au sol)
3. Entrez la destination (code ICAO)
4. Validez et décollez !
5. Suivez votre progression en temps réel
6. Atterrissez et recevez vos récompenses

### Créer une company

1. Onglet **Company** → "Créer une compagnie"
2. Coût : 50,000 CR
3. Débloquez : Usines, workers, flotte company

---

## 📊 Systèmes de jeu

### Économie

| Élément | Description |
|---------|-------------|
| **Crédits (CR)** | Monnaie du jeu |
| **94 items** | Matières premières → Produits finis |
| **60 recettes** | T1 et T2 de production |
| **Marché** | Achat/vente entre joueurs |

### Usines

| Tier | Workers max | Production |
|------|-------------|------------|
| T1-T2 | 10-20 | Basique |
| T3-T5 | 30-50 | Intermédiaire |
| T6-T10 | 60-100 | Avancée |

### Workers

- Recrutés dans les pools d'aéroports
- Stats basées sur nationalité (42 pays)
- Système XP : Novice → Maître
- Besoin de nourriture (1/heure)

### Missions

- **Scoring** : Landing, fuel, temps, événements
- **Bonus** : Vol de nuit, sans autopilot
- **Récompenses** : XP (crédits à venir)

---

## 🏗️ Architecture technique

### Stack

| Composant | Technologie |
|-----------|-------------|
| Frontend | TypeScript + MSFS SDK |
| Stockage | SQLite (sql.js) |
| Carte | OpenLayers |
| Multijoueur | P2P Sync |

### Structure du projet

```
mfs24-carrier-plus/
├── tablette ingame/          # EFB MSFS 2024
│   └── PackageSources/
│       └── AeroCorpOnline/
│           └── src/          # Code source TypeScript
├── docs/                     # Documentation technique
├── peers.json                # Config shards P2P
└── README.md
```

### Documentation technique

| Document | Description |
|----------|-------------|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Architecture P2P complète |
| [efb-tablet.md](docs/efb-tablet.md) | Interface EFB |
| [items-recipes.md](docs/items-recipes.md) | Items et recettes |
| [factories.md](docs/factories.md) | Système d'usines |
| [workers.md](docs/workers.md) | Système de workers |
| [missions.md](docs/missions.md) | Système de missions |

---

## 🗺️ Roadmap

### ✅ Complété

- [x] **V0.8** : EFB Tablet + Missions
- [x] **V0.9** : Architecture P2P

### 🚧 En cours

- [ ] **V0.9.1** : SQLite local (DatabaseManager)
- [ ] **V0.9.2** : Persistence States ↔ SQLite
- [ ] **V0.9.3** : Mode solo complet avec économie IA

### 📋 À venir

- [ ] **V1.0** : Sync P2P multijoueur
- [ ] **V1.1** : Licences pilote (PPL, IFR, CPL, ATPL)
- [ ] **V1.2** : Examens et progression

---

## 📜 License

Voir [LEGAL.md](LEGAL.md)

---

## 🔗 Liens

- **GitHub** : https://github.com/Tinouan/mfs24-carrier-plus
- **Documentation** : [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

---

*Made with ❤️ for the MSFS community*
