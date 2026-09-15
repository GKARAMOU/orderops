CREATE TABLE demand_history(id BIGSERIAL PRIMARY KEY,product_id BIGINT NOT NULL REFERENCES product,warehouse_id BIGINT NOT NULL REFERENCES warehouse,day DATE NOT NULL,units INTEGER NOT NULL CHECK(units>=0),source VARCHAR(200) NOT NULL,UNIQUE(product_id,warehouse_id,day));
ALTER TABLE customer_order ADD COLUMN fulfilled_at TIMESTAMPTZ;
