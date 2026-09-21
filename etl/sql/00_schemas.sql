-- Medallion schemas. Bronze is raw and never edited; silver is cleaned and
-- flagged; gold is precomputed metrics read by the web app.
CREATE SCHEMA IF NOT EXISTS bronze;
CREATE SCHEMA IF NOT EXISTS silver;
CREATE SCHEMA IF NOT EXISTS gold;
