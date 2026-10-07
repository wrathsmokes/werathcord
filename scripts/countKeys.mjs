import { readFileSync } from "fs";

const content = readFileSync("src/werathcordplugins/autoTranslatewerathcord/index.ts", "utf8");
const matches = content.match(/"en":/g) || [];
console.log(`Total valid translated keys in autoTranslatewerathcord: ${matches.length}`);
