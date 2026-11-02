INSERT INTO roles (role_name, description) VALUES 
('Admin', 'Administrator with full access'),
('Veterinarian', 'Animal health specialist'),
('Keeper', 'Animal caretaker');

INSERT INTO users (username, email, password_hash, role_id) VALUES 
('admin_user', 'admin@zoo.com', 'hash123', 1),
('dr_smith', 'smith@zoo.com', 'hash456', 2),
('john_keeper', 'john@zoo.com', 'hash789', 3);

INSERT INTO habitats (name, climate_type, capacity, maintenance_status) VALUES 
('Savanna', 'Tropical', 50, 'Optimal'),
('Aquarium', 'Aquatic', 100, 'Optimal'),
('Arctic Tundra', 'Polar', 30, 'Optimal'),
('Rainforest Canopy', 'Tropical', 40, 'Optimal');

INSERT INTO animals (name, species, gender, birth_date, habitat_id, health_status, is_public, public_description, fun_fact, image_url, conservation_status) VALUES 
('Simba', 'Lion', 'Male', '2018-05-10', 1, 'Healthy', TRUE, 'African lion', 'Lions sleep up to 20 hours a day.', 'url1', 'Vulnerable'),
('Zara', 'Zebra', 'Female', '2020-02-14', 1, 'Healthy', TRUE, 'Plains zebra', 'Stripes act as natural insect deterrents.', 'url2', 'Near Threatened'),
('Melman', 'Giraffe', 'Male', '2017-09-12', 1, 'Healthy', TRUE, 'Reticulated giraffe', 'Giraffes have blue-black tongues.', 'url3', 'Vulnerable'),
('Echo', 'Bottlenose Dolphin', 'Female', '2019-03-15', 2, 'Healthy', TRUE, 'Smart marine mammal', 'Dolphins sleep with one eye open.', 'url4', 'Least Concern'),
('Shelly', 'Green Sea Turtle', 'Female', '2016-07-20', 2, 'Healthy', TRUE, 'Marine turtle', 'Sea turtles can hold their breath for hours.', 'url5', 'Endangered'),
('Finn', 'Emperor Penguin', 'Male', '2021-06-20', 3, 'Healthy', TRUE, 'Antarctic penguin', 'Penguins can drink salt water.', 'url6', 'Near Threatened'),
('Frost', 'Polar Bear', 'Male', '2017-12-01', 3, 'Healthy', TRUE, 'Arctic apex predator', 'Polar bear skin is black under white fur.', 'url7', 'Vulnerable'),
('Coco', 'Chimpanzee', 'Female', '2016-08-22', 4, 'Healthy', TRUE, 'Primate', 'Chimps share about 98% of human DNA.', 'url8', 'Endangered'),
('Maya', 'Scarlet Macaw', 'Female', '2022-01-10', 4, 'Healthy', TRUE, 'Rainforest parrot', 'Macaws mate for life.', 'url9', 'Least Concern'),
('Flash', 'Three-toed Sloth', 'Male', '2019-04-05', 4, 'Healthy', TRUE, 'Arboreal mammal', 'Sloths can hold their breath longer than dolphins.', 'url10', 'Least Concern');

INSERT INTO medical_records (animal_id, veterinarian_id, diagnosis, treatment, record_date, follow_up_date) VALUES 
(1, 2, 'Routine checkup', 'Vaccination administered', '2026-01-10', '2026-07-10'),
(4, 2, 'Skin check', 'Topical ointment applied', '2026-02-12', '2026-03-12'),
(7, 2, 'Dental examination', 'Teeth cleaning and scaling', '2026-01-25', NULL);

INSERT INTO feeding_schedules (animal_id, keeper_id, food_type, quantity_kg, feeding_time) VALUES 
(1, 3, 'Beef', 5.50, '09:00:00'),
(2, 3, 'Hay and Grass', 8.00, '09:30:00'),
(3, 3, 'Acacias and Leaves', 10.00, '10:00:00'),
(4, 3, 'Fish', 3.00, '10:30:00'),
(5, 3, 'Squid and Fish', 4.50, '11:00:00'),
(6, 3, 'Krill and Small Fish', 2.00, '08:30:00'),
(7, 3, 'Fish and Meat', 12.00, '11:30:00'),
(8, 3, 'Fruits and Vegetables', 4.00, '12:00:00'),
(9, 3, 'Seeds and Nuts', 1.50, '12:30:00'),
(10, 3, 'Leaves and Shoots', 1.00, '13:00:00');

INSERT INTO ticket_sales (user_id, ticket_type, price, status) VALUES 
(NULL, 'Adult', 25.00, 'Valid'),
(NULL, 'Child', 15.00, 'Valid'),
(NULL, 'Senior', 20.00, 'Valid');