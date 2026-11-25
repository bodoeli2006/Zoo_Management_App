# 🌿 Verdant Haven Zoo – Portal de management și vizitatori

Aplicație web pentru administrarea unei grădini zoologice și pentru vizitatori. Staff-ul gestionează animalele, habitatele, fișele medicale și programele de hrănire, iar vizitatorii pot explora animalele publice, pot comenta și pot cumpăra bilete.

Backend: **Node.js + Express + PostgreSQL**. Frontend: o singură pagină (`public/index.html`), fără framework.

## Funcționalități

**Vizitatori**
- Catalog de animale publice cu căutare după nume/specie și filtrare după habitat
- Pagină de detalii: descriere, curiozități, status de conservare, program de hrănire, habitat
- Comentarii pe fiecare animal (după autentificare), cu ștergerea propriilor comentarii
- Magazin de bilete (5 categorii, cantitate 1–10) și istoricul biletelor cumpărate
- Creare cont și autentificare

**Staff (Zookeeper / Keeper / Veterinarian)**
- CRUD complet pe animale, habitate, fișe medicale și programe de hrănire
- Buton de comutare între *Visitor View* și *Edit Mode*

**Admin**
- Gestionare utilizatori, roluri și vânzări de bilete (CRUD)
- Acces doar în citire la animale, habitate, fișe medicale și hrănire
- Moderare comentarii: ștergere și *comment timeout* (de la 1 minut la 1 an, cu motiv, ușor de anulat)
- Vizualizare ca vizitator, separată de modul de editare

## Roluri și permisiuni

| Rol | Animale | Habitate | Fișe medicale | Hrănire | Bilete | Utilizatori / Roluri |
|---|---|---|---|---|---|---|
| Admin | r | r | r | r | rw | rw |
| Zookeeper / Keeper / Veterinarian | rw | rw | rw | rw | – | – |
| User (vizitator) | r (doar publice) | r | – | r (fără `keeper_id`, doar animale publice) | cumpără | – |
| Guest (neautentificat) | tratat ca User, fără comentarii și fără cumpărare | | | | | |

Doar conturile cu rolul `User` pot cumpăra bilete. Adminii nu pot fi puși în timeout și nu își pot modifica sau șterge propriul cont/rol.

## Cerințe

- Node.js 18+ (proiectul folosește ES modules și `import.meta.dirname`, deci este recomandat Node 20.11+)
- O bază de date PostgreSQL accesibilă prin SSL (conexiunea folosește `rejectUnauthorized: true`)

## Instalare

```bash
npm install
```

Creează un fișier `.env` în rădăcina proiectului:

```env
DATABASE_URL=postgres://utilizator:parola@gazda:5432/baza_de_date
JWT_SECRET=un-sir-aleator-de-minim-32-de-caractere
PORT=3000
```

- `DATABASE_URL` este obligatoriu, altfel serverul nu pornește.
- `JWT_SECRET` trebuie să aibă minim 32 de caractere.
- `NODE_ENV=production` activează flag-ul `secure` pe cookie-ul de sesiune (necesită HTTPS).

### Baza de date

1. Rulează `fixtures.sql` pentru a crea tabelele și datele inițiale (inclusiv rolul `Admin`).
2. Creează primul administrator și rolul `User`:

```bash
npm run setup:auth -- <username_admin> <parola_minim_8_caractere>
```

Dacă utilizatorul există, devine Admin cu noua parolă. Altfel este creat cu emailul `<username>@zoo.local`.

La pornire, serverul creează sau completează automat (`ensureSchema`) coloanele de timeout pe `users`, valoarea implicită pentru `ticket_sales.purchase_date` și tabela `animal_comments`.

## Pornire

```bash
npm start
```

Aplicația rulează la `http://localhost:3000` (sau pe portul din `PORT`).

## Structură

```
.
├── server.js        # API Express, autentificare, permisiuni, comentarii, bilete
├── db.js            # Pool de conexiuni PostgreSQL
├── setup-auth.js    # Script pentru crearea adminului și a rolului User
├── fixtures.sql     # Schema și date inițiale
└── public/
    └── index.html   # Interfața (SPA)
```

## API (rezumat)

| Metodă | Rută | Descriere |
|---|---|---|
| POST | `/api/signup`, `/api/login`, `/api/logout` | Autentificare |
| GET | `/api/me` | Utilizatorul curent, permisiunile pe tabele, catalogul de bilete |
| GET | `/api/lookup/:table` | Liste id/etichetă pentru câmpurile de tip foreign key |
| GET/POST | `/api/animals/:id/comments` | Citire / adăugare comentarii |
| DELETE | `/api/comments/:id` | Ștergere comentariu (autor sau admin) |
| GET | `/api/comments` | Toate comentariile (admin) |
| POST | `/api/users/:id/comment-timeout` | Setare / anulare timeout (admin, `duration_minutes`, `reason`) |
| GET | `/api/tickets/catalog` | Catalogul de bilete |
| GET | `/api/my-tickets` | Biletele utilizatorului |
| POST | `/api/tickets/purchase` | Cumpărare (`tier_id`, `quantity`) |
| GET/POST/PUT/DELETE | `/api/:table[/:id]` | CRUD generic, filtrat după rol (`animals`, `habitats`, `medical_records`, `feeding_schedules`, `ticket_sales`, `users`, `roles`) |

## Securitate

- Parole hash-uite cu bcrypt; `password_hash` nu este returnat niciodată de API
- Sesiune JWT în cookie `httpOnly`, `sameSite=strict`, valabilă 8 ore
- Rate limiting pe login/signup (30 / 15 min per IP), comentarii (8 / min) și bilete (20 / 10 min)
- Permisiunile și filtrarea datelor (animale publice, coloane ascunse) se aplică pe server, nu doar în interfață
- Interogările folosesc parametri, iar numele tabelelor provin dintr-o listă albă

## Note

- Imaginile animalelor folosesc `image_url`. Dacă lipsește sau nu se încarcă, se afișează o fotografie de rezervă în funcție de specie.
- Plata biletelor este simulată: comanda este înregistrată direct ca `Paid`.
