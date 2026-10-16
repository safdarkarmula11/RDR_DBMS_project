import { splitSql } from '../src/lib/splitSql.js';

const sample = `
-- comment
CREATE TABLE a (id INT);
INSERT INTO a VALUES (1); -- trailing
DELIMITER $$
CREATE PROCEDURE p()
BEGIN
  SELECT 1;
  SELECT 2;
END$$
CREATE TRIGGER t BEFORE INSERT ON a FOR EACH ROW
BEGIN
  SET NEW.id = 5;
END$$
DELIMITER ;
SELECT 3;
`;
const parts = splitSql(sample);
console.log(parts.length, 'statements');
parts.forEach((p, i) => console.log(`--- ${i + 1}\n${p}`));
if (parts.length !== 5) { console.error('FAIL: expected 5'); process.exit(1); }
console.log('\nOK');
