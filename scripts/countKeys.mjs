import { readFileSync } from "fs";

const content = readFileSync("src/WRATHCORDplugins/autoTranslateWRATHCORD/index.ts", "utf8");
const matches = content.match(/"en":/g) || [];
console.log(`Total valid translated keys in autoTranslateWRATHCORD: ${matches.length}`);
