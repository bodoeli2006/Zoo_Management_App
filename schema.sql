
BEGIN;


CREATE TABLE IF NOT EXISTS roles (
    role_id     SERIAL PRIMARY KEY,
    role_name   VARCHAR(50) NOT NULL UNIQUE,
    description TEXT
);

CREATE TABLE IF NOT EXISTS users (
    user_id              SERIAL PRIMARY KEY,
    username             VARCHAR(50)  NOT NULL UNIQUE,
    email                VARCHAR(100) NOT NULL UNIQUE,
    password_hash        TEXT         NOT NULL,
    role_id              INT          NOT NULL REFERENCES roles(role_id),
    comment_banned_until TIMESTAMPTZ,
    comment_ban_reason   TEXT,
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS habitats (
    habitat_id         SERIAL PRIMARY KEY,
    name               VARCHAR(100) NOT NULL,
    climate_type       VARCHAR(100) NOT NULL,
    capacity           INT CHECK (capacity IS NULL OR capacity >= 0),
    maintenance_status VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS animals (
    animal_id          SERIAL PRIMARY KEY,
    name               VARCHAR(100) NOT NULL,
    species            VARCHAR(100) NOT NULL,
    gender             VARCHAR(10) CHECK (gender IN ('Male', 'Female', 'Unknown')),
    birth_date         DATE,
    habitat_id         INT NOT NULL REFERENCES habitats(habitat_id) ON DELETE CASCADE,
    health_status      VARCHAR(100),
    is_public          BOOLEAN NOT NULL DEFAULT TRUE,
    public_description TEXT,
    fun_fact           TEXT,
    image_url          TEXT,
    conservation_status VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS medical_records (
    record_id       SERIAL PRIMARY KEY,
    animal_id       INT  NOT NULL REFERENCES animals(animal_id) ON DELETE CASCADE,
    veterinarian_id INT  NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    diagnosis       TEXT NOT NULL,
    treatment       TEXT NOT NULL,
    record_date     DATE DEFAULT CURRENT_DATE,
    follow_up_date  DATE
);

CREATE TABLE IF NOT EXISTS feeding_schedules (
    schedule_id  SERIAL PRIMARY KEY,
    animal_id    INT  NOT NULL REFERENCES animals(animal_id) ON DELETE CASCADE,
    keeper_id    INT  NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    food_type    VARCHAR(100) NOT NULL,
    quantity_kg  NUMERIC(6,2),
    feeding_time TIME NOT NULL
);

CREATE TABLE IF NOT EXISTS ticket_sales (
    ticket_id     SERIAL PRIMARY KEY,
    user_id       INT REFERENCES users(user_id) ON DELETE SET NULL,
    ticket_type   VARCHAR(100) NOT NULL,
    price         NUMERIC(8,2),
    status        VARCHAR(30) DEFAULT 'Paid',
    purchase_date TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS animal_comments (
    comment_id SERIAL PRIMARY KEY,
    animal_id  INT NOT NULL REFERENCES animals(animal_id) ON DELETE CASCADE,
    user_id    INT REFERENCES users(user_id) ON DELETE SET NULL,
    body       TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comments_animal ON animal_comments (animal_id, created_at DESC);

-- ---------- DATE DE TEST ----------

INSERT INTO roles (role_name, description) VALUES
    ('Admin',        'Administrator cu acces la utilizatori, roluri si bilete'),
    ('Zookeeper',    'Ingrijitor principal, gestioneaza animale si habitate'),
    ('Keeper',       'Ingrijitor, gestioneaza animale si hranirea'),
    ('Veterinarian', 'Medic veterinar, gestioneaza fisele medicale'),
    ('User',         'Vizitator cu acces doar in citire')
ON CONFLICT (role_name) DO NOTHING;

-- Conturile de staff au un hash invalid (nu se pot autentifica).
-- Seteaza o parola din tab-ul Users (Edit Mode) cand ai nevoie de ele.
INSERT INTO users (username, email, password_hash, role_id)
SELECT v.username, v.email,
       '$2a$10$000000000000000000000000000000000000000000000000000.',
       r.role_id
FROM (VALUES
    ('keeper_ana',  'ana@zoo.local',  'Zookeeper'),
    ('keeper_mihai','mihai@zoo.local','Keeper'),
    ('vet_elena',   'elena@zoo.local','Veterinarian')
) AS v(username, email, role_name)
JOIN roles r ON r.role_name = v.role_name
ON CONFLICT (username) DO NOTHING;

INSERT INTO habitats (name, climate_type, capacity, maintenance_status) VALUES
    ('African Savanna',    'Savanna',   12, 'Optimal'),
    ('Arctic Tundra',      'Polar',      6, 'Optimal'),
    ('Tropical Rainforest','Tropical',  10, 'Optimal'),
    ('Asian Forest',       'Temperate',  8, 'Under renovation'),
    ('Wetlands Lagoon',    'Aquatic',   15, 'Optimal');

INSERT INTO animals (name, species, gender, birth_date, habitat_id, health_status, is_public,
                     public_description, fun_fact, conservation_status)
SELECT v.name, v.species, v.gender, v.birth_date::date, h.habitat_id, v.health, v.is_public,
       v.descr, v.fact, v.cons
FROM (VALUES
    ('Simba',  'African Lion',      'Male',   '2016-05-14', 'African Savanna',     'Healthy',    TRUE,
     'Liderul haitei noastre, cunoscut pentru ragetul sau puternic.',
     'Ragetul unui leu se aude de la peste 8 km distanta.', 'Vulnerable'),
    ('Zuri',   'Giraffe',           'Female', '2018-03-02', 'African Savanna',     'Healthy',    TRUE,
     'Cea mai inalta locuitoare a savanei noastre.',
     'Girafele dorm in medie doar 30 de minute pe zi.', 'Vulnerable'),
    ('Marty',  'Plains Zebra',      'Male',   '2020-07-21', 'African Savanna',     'Healthy',    TRUE,
     'Zebra jucausa, usor de recunoscut dupa dungile sale.',
     'Fiecare zebra are un model de dungi unic, ca o amprenta.', 'Near Threatened'),
    ('Nanuk',  'Polar Bear',        'Male',   '2013-12-01', 'Arctic Tundra',       'Healthy',    TRUE,
     'Urs polar adaptat perfect la frig.',
     'Blana ursului polar este de fapt transparenta, nu alba.', 'Vulnerable'),
    ('Pingu',  'Emperor Penguin',   'Male',   '2019-09-10', 'Arctic Tundra',       'Healthy',    TRUE,
     'Pinguin curios care iubeste hranirile publice.',
     'Pinguinii imperiali pot sta sub apa peste 20 de minute.', 'Near Threatened'),
    ('Raja',   'Bengal Tiger',      'Female', '2015-02-18', 'Asian Forest',        'Healthy',    TRUE,
     'Tigroaica noastra, un vanator tacut si elegant.',
     'Nu exista doi tigri cu aceleasi dungi.', 'Endangered'),
    ('Rusty',  'Red Panda',         'Female', '2021-06-30', 'Asian Forest',        'Recovering', TRUE,
     'Panda rosie timida, care petrece mult timp in copaci.',
     'Panda rosie nu este inrudita cu pandele uriase.', 'Endangered'),
    ('Rio',    'Scarlet Macaw',     'Unknown','2017-04-05', 'Tropical Rainforest', 'Healthy',    TRUE,
     'Papagal colorat, bun imitator al sunetelor.',
     'Papagalii macaw pot trai peste 50 de ani.', 'Least Concern'),
    ('Sloan',  'Two-toed Sloth',    'Male',   '2022-01-12', 'Tropical Rainforest', 'Healthy',    TRUE,
     'Lenesul nostru preferat, se misca foarte incet.',
     'Alga creste pe blana leneșilor si ii ajuta sa se camufleze.', 'Least Concern'),
    ('Flora',  'Greater Flamingo',  'Female', '2018-08-25', 'Wetlands Lagoon',     'Healthy',    TRUE,
     'Flamingo elegant, cu penaj roz intens.',
     'Culoarea roz vine din alimentatia bogata in carotenoizi.', 'Least Concern'),
    ('Ghost',  'Sumatran Rhino',    'Male',   '2012-10-09', 'Asian Forest',        'Under observation', FALSE,
     'Exemplar aflat in carantina, nu este expus publicului.',
     NULL, 'Critically Endangered')
) AS v(name, species, gender, birth_date, habitat, health, is_public, descr, fact, cons)
JOIN habitats h ON h.name = v.habitat;

INSERT INTO feeding_schedules (animal_id, keeper_id, food_type, quantity_kg, feeding_time)
SELECT a.animal_id, u.user_id, v.food, v.qty, v.t::time
FROM (VALUES
    ('Simba', 'keeper_ana',   'Beef',          6.50, '10:00'),
    ('Simba', 'keeper_mihai', 'Chicken',       3.00, '17:00'),
    ('Zuri',  'keeper_mihai', 'Acacia leaves', 20.00,'09:00'),
    ('Marty', 'keeper_mihai', 'Hay & grain',   8.00, '09:30'),
    ('Nanuk', 'keeper_ana',   'Fish',          7.00, '11:00'),
    ('Pingu', 'keeper_ana',   'Herring',       1.50, '11:30'),
    ('Raja',  'keeper_ana',   'Venison',       5.00, '16:00'),
    ('Rusty', 'keeper_mihai', 'Bamboo & fruit',1.20, '08:30'),
    ('Rio',   'keeper_mihai', 'Seeds & nuts',  0.40, '08:00'),
    ('Flora', 'keeper_ana',   'Shrimp & algae',0.80, '12:00')
) AS v(animal, keeper, food, qty, t)
JOIN animals a ON a.name = v.animal
JOIN users   u ON u.username = v.keeper;

INSERT INTO medical_records (animal_id, veterinarian_id, diagnosis, treatment, record_date, follow_up_date)
SELECT a.animal_id, u.user_id, v.dx, v.tx, v.d::date, v.f::date
FROM (VALUES
    ('Rusty', 'Digestive upset',        'Probiotics and adjusted diet',        '2026-11-10', '2026-12-01'),
    ('Ghost', 'Routine quarantine check','Blood tests, parasite screening',    '2026-11-05', '2026-12-05'),
    ('Simba', 'Annual checkup',         'Vaccination booster',                 '2026-09-15', '2027-09-15')
) AS v(animal, dx, tx, d, f)
JOIN animals a ON a.name = v.animal
JOIN users   u ON u.username = 'vet_elena';

COMMIT;
