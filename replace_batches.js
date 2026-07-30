const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');
code = code.replace(/if \(count >= 25\) \{\n(\s*)await batch.commit\(\);\n(\s*)await new Promise\(resolve => setTimeout\(resolve, 1500\)\); \/\/ Throttling delay to prevent stream exhaustion/g, 'if (count >= 250) {\n$1await batch.commit();\n$2await new Promise(resolve => setTimeout(resolve, 500)); // Throttling delay to prevent stream exhaustion');
fs.writeFileSync('server.ts', code);
