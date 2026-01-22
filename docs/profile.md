# Profile System - Documentation Technique

## Vue d'ensemble

Le système de profils gère deux types de profils:
1. **Player Profile** - Profil personnel du joueur/pilote
2. **Company Profile** - Profil de la compagnie (voir [company.md](company.md))

---

## Tables SQL

### `game.users`

Table des comptes utilisateurs (authentification).

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | UUID | Clé primaire |
| `email` | VARCHAR | Email unique (login) |
| `username` | VARCHAR | Nom d'utilisateur unique |
| `password_hash` | VARCHAR | Hash Argon2 du mot de passe |
| `is_active` | BOOLEAN | Compte actif (défaut: true) |
| `is_admin` | BOOLEAN | Administrateur (défaut: false) |
| `created_at` | TIMESTAMPTZ | Date d'inscription |

### `game.player_profiles`

Table des profils joueurs (données publiques).

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | UUID | Clé primaire |
| `user_id` | UUID | FK → users (unique) |
| `display_name` | VARCHAR(32) | Nom d'affichage public |
| `created_at` | TIMESTAMPTZ | Date de création |
| `updated_at` | TIMESTAMPTZ | Dernière modification |

**Note:** Le profil est créé automatiquement à la première lecture.

---

## API Endpoints

### Authentification

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/auth/register` | Créer un compte |
| POST | `/auth/login` | Se connecter (retourne JWT) |

### Player Profile

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/profile/me` | Mon profil joueur |
| PATCH | `/profile/me` | Modifier mon profil |

---

## Authentification

### Inscription: `POST /auth/register`

**Body:**
```json
{
    "email": "pilote@example.com",
    "username": "pilote123",
    "password": "motdepasse123"
}
```

**Validations:**
- Email unique et valide
- Username unique
- Password: 6-200 caractères

**Réponse:**
```json
{
    "id": "uuid",
    "email": "pilote@example.com",
    "username": "pilote123",
    "is_admin": false
}
```

### Connexion: `POST /auth/login`

**Body:**
```json
{
    "email": "pilote@example.com",
    "password": "motdepasse123"
}
```

**Réponse:**
```json
{
    "access_token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
        "id": "uuid",
        "email": "pilote@example.com",
        "username": "pilote123",
        "is_admin": false
    }
}
```

**Utilisation du token:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

---

## Player Profile

### Lecture: `GET /profile/me`

Le profil est **créé automatiquement** s'il n'existe pas.

**Réponse:**
```json
{
    "id": "uuid",
    "user_id": "uuid",
    "display_name": null,
    "created_at": "2026-01-22T...",
    "updated_at": "2026-01-22T..."
}
```

### Modification: `PATCH /profile/me`

**Body:**
```json
{
    "display_name": "Captain Sky"
}
```

**Validations display_name:**
- 3 à 24 caractères
- Caractères autorisés: lettres, chiffres, espace, underscore, tiret
- Regex: `^[a-zA-Z0-9 _\-]{3,24}$`

**Réponse:**
```json
{
    "id": "uuid",
    "user_id": "uuid",
    "display_name": "Captain Sky",
    "created_at": "2026-01-22T...",
    "updated_at": "2026-01-22T..."
}
```

---

## Sécurité

### Hashage des mots de passe

- Algorithme: **Argon2** (via `argon2-cffi`)
- Salt automatique
- Paramètres sécurisés par défaut

### JWT Tokens

- Algorithme: HS256
- Expiration: configurable (défaut: 24h)
- Payload: `{"sub": "user_id"}`

### Validation des entrées

- Pydantic pour validation des schemas
- Email normalisé en lowercase
- Username et display_name sanitizés

---

## Flux d'authentification

```
[Utilisateur]
      │
      │ POST /auth/register
      ▼
[Compte créé]
      │
      │ POST /auth/login
      ▼
[JWT Token reçu]
      │
      │ GET /profile/me (avec Bearer token)
      ▼
[Profil créé automatiquement]
      │
      │ PATCH /profile/me
      ▼
[Profil personnalisé]
      │
      │ POST /company (avec Bearer token)
      ▼
[Company créée]
```

---

## Différence User vs Profile

| Aspect | User | Player Profile |
|--------|------|----------------|
| Table | `users` | `player_profiles` |
| But | Authentification | Données publiques |
| Champs | email, password, username | display_name |
| Création | À l'inscription | Automatique (lazy) |
| Visibilité | Privé | Public |

**Pourquoi séparer?**
- User contient des données sensibles (password, email)
- Profile contient des données affichables publiquement
- Permet d'étendre le profil sans toucher à l'auth

---

## Évolutions futures (Player Profile)

Le profil joueur est actuellement minimaliste. Extensions prévues:

### Statistiques pilote
- [ ] `total_flight_hours` - Heures de vol
- [ ] `total_flights` - Nombre de vols
- [ ] `total_distance_nm` - Distance parcourue
- [ ] `favorite_aircraft` - Avion préféré

### Progression
- [ ] `pilot_xp` - Points d'expérience
- [ ] `pilot_level` - Niveau (1-100)
- [ ] `achievements` - Badges/accomplissements

### Licences
- [ ] `licenses` - JSONB avec types de licences
  - PPL, CPL, ATPL
  - Single/Multi engine
  - IFR rating

### Social
- [ ] `bio` - Biographie (max 500 chars)
- [ ] `country` - Pays
- [ ] `avatar_url` - URL avatar

### Préférences
- [ ] `preferences` - JSONB
  - Unités (métrique/impérial)
  - Langue
  - Notifications

---

## Exemples de Flux

### Inscription et configuration

```bash
# 1. Créer un compte
POST /auth/register
{
    "email": "pilote@test.com",
    "username": "captain_sky",
    "password": "secure123"
}

# 2. Se connecter
POST /auth/login
{
    "email": "pilote@test.com",
    "password": "secure123"
}
# → Récupérer le token

# 3. Voir mon profil (avec Authorization header)
GET /profile/me

# 4. Personnaliser mon profil
PATCH /profile/me
{
    "display_name": "Captain Sky"
}

# 5. Créer ma company
POST /company
{
    "name": "Sky Express",
    "home_airport_ident": "LFPG"
}
```

---

## Notes techniques

### Auto-création du profil

Le profil est créé automatiquement via `_get_or_create_profile()`:
```python
def _get_or_create_profile(db: Session, user_id) -> PlayerProfile:
    profile = db.query(PlayerProfile).filter(
        PlayerProfile.user_id == user_id
    ).one_or_none()

    if profile:
        return profile

    profile = PlayerProfile(user_id=user_id)
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile
```

### Relation 1:1

- Un User a exactement un PlayerProfile
- Contrainte `UNIQUE` sur `user_id` dans `player_profiles`
- Le profil n'existe pas tant qu'il n'est pas lu/modifié
