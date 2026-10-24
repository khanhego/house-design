-- Item 02 CR-3: thông số bán hàng của mẫu nhà (giá, diện tích đất, điểm nổi bật).
ALTER TABLE houses ADD COLUMN price INTEGER CHECK (price IS NULL OR price >= 0);
ALTER TABLE houses ADD COLUMN land_area REAL CHECK (land_area IS NULL OR land_area > 0);
ALTER TABLE houses ADD COLUMN features_json TEXT NOT NULL DEFAULT '[]';
