DROP TABLE IF EXISTS ticket_sales CASCADE;
DROP TABLE IF EXISTS feeding_schedules CASCADE;
DROP TABLE IF EXISTS medical_records CASCADE;
DROP TABLE IF EXISTS animals CASCADE;
DROP TABLE IF EXISTS habitats CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS roles CASCADE;

CREATE TABLE roles (
    role_id SERIAL PRIMARY KEY,
    role_name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT
);

CREATE TABLE users (
    user_id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_user_role FOREIGN KEY (role_id) 
        REFERENCES roles(role_id) 
        ON DELETE RESTRICT
);

CREATE TABLE habitats (
    habitat_id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    climate_type VARCHAR(50) NOT NULL,
    capacity INT CHECK (capacity > 0),
    maintenance_status VARCHAR(50) DEFAULT 'Optimal'
);

CREATE TABLE animals (
    animal_id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    species VARCHAR(100) NOT NULL,
    gender VARCHAR(10) CHECK (gender IN ('Male', 'Female', 'Unknown')),
    birth_date DATE,
    habitat_id INT NOT NULL,
    health_status VARCHAR(100) DEFAULT 'Healthy',
    is_public BOOLEAN DEFAULT TRUE,
    public_description TEXT,
    fun_fact TEXT,
    image_url VARCHAR(255),
    conservation_status VARCHAR(50),
    CONSTRAINT fk_animal_habitat FOREIGN KEY (habitat_id) 
        REFERENCES habitats(habitat_id) 
        ON DELETE CASCADE
);

CREATE TABLE medical_records (
    record_id SERIAL PRIMARY KEY,
    animal_id INT NOT NULL,
    veterinarian_id INT NOT NULL,
    diagnosis TEXT NOT NULL,
    treatment TEXT NOT NULL,
    record_date DATE DEFAULT CURRENT_DATE,
    follow_up_date DATE,
    CONSTRAINT fk_med_animal FOREIGN KEY (animal_id) 
        REFERENCES animals(animal_id) 
        ON DELETE CASCADE,
    CONSTRAINT fk_med_vet FOREIGN KEY (veterinarian_id) 
        REFERENCES users(user_id) 
        ON DELETE RESTRICT
);

CREATE TABLE feeding_schedules (
    schedule_id SERIAL PRIMARY KEY,
    animal_id INT NOT NULL,
    keeper_id INT NOT NULL,
    food_type VARCHAR(100) NOT NULL,
    quantity_kg DECIMAL(5,2) CHECK (quantity_kg > 0),
    feeding_time TIME NOT NULL,
    CONSTRAINT fk_feed_animal FOREIGN KEY (animal_id) 
        REFERENCES animals(animal_id) 
        ON DELETE CASCADE,
    CONSTRAINT fk_feed_keeper FOREIGN KEY (keeper_id) 
        REFERENCES users(user_id) 
        ON DELETE RESTRICT
);

CREATE TABLE ticket_sales (
    ticket_id SERIAL PRIMARY KEY,
    user_id INT,
    ticket_type VARCHAR(50) NOT NULL,
    price DECIMAL(8,2) CHECK (price >= 0),
    purchase_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(30) DEFAULT 'Valid',
    CONSTRAINT fk_ticket_user FOREIGN KEY (user_id) 
        REFERENCES users(user_id) 
        ON DELETE SET NULL
);