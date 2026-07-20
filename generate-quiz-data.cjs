// generate-quiz-data.js — run once: node generate-quiz-data.js
const fs = require('fs');
const path = require('path');

const questionsDir = path.join(__dirname, 'neet-biology-db', 'questions');
const outFile = path.join(__dirname, 'neet-biology-db', 'quiz-data.js');

const files = fs.readdirSync(questionsDir).filter(f => f.endsWith('.json'));

let all = [];
for (const file of files) {
  const data = JSON.parse(fs.readFileSync(path.join(questionsDir, file), 'utf8'));
  all = all.concat(data);
}

console.log(`Bundled ${all.length} questions from ${files.length} files.`);
fs.writeFileSync(outFile, `/* Auto-generated — do not edit manually */\nconst QUIZ_DATA = ${JSON.stringify(all, null, 0)};\n`);
console.log(`Written to ${outFile}`);
