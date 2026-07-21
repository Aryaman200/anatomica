import fs from 'fs/promises';
import path from 'path';
import { translate } from '@vitalets/google-translate-api';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function safeTranslate(text, to) {
  if (!text || text.trim() === '') return '';
  try {
    const res = await translate(text, { to });
    return res.text;
  } catch (e) {
    console.error(`Translation error for text: "${text.slice(0, 30)}..."`, e.message);
    return null;
  }
}

async function processFile(filePath) {
  console.log(`Processing ${filePath}...`);
  let content;
  try {
    content = await fs.readFile(filePath, 'utf8');
  } catch (e) {
    console.error(`Could not read ${filePath}`, e);
    return;
  }

  let questions;
  try {
    questions = JSON.parse(content);
  } catch (e) {
    console.error(`Invalid JSON in ${filePath}`, e);
    return;
  }

  let modified = false;

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    
    // Translate Question Text
    if (q.question && q.question.text && !q.question.text_hi) {
      console.log(`  Translating Q${i+1} text...`);
      const t = await safeTranslate(q.question.text, 'hi');
      if (t) {
        q.question.text_hi = t;
        modified = true;
      }
      await delay(1000); // 1s delay to avoid rate limiting
    }

    // Translate Options
    if (q.options && Array.isArray(q.options)) {
      for (const opt of q.options) {
        if (opt.text && !opt.text_hi) {
          console.log(`  Translating Q${i+1} option ${opt.id}...`);
          const t = await safeTranslate(opt.text, 'hi');
          if (t) {
            opt.text_hi = t;
            modified = true;
          }
          await delay(1000);
        }
      }
    }

    // Translate Explanation
    if (q.answer && q.answer.explanation && !q.answer.explanation_hi) {
      console.log(`  Translating Q${i+1} explanation...`);
      const t = await safeTranslate(q.answer.explanation, 'hi');
      if (t) {
        q.answer.explanation_hi = t;
        modified = true;
      }
      await delay(1000);
    }
    
    // Save periodically
    if (modified && i % 10 === 0) {
      await fs.writeFile(filePath, JSON.stringify(questions, null, 2));
      console.log(`  Saved progress to ${filePath}`);
    }
  }

  if (modified) {
    await fs.writeFile(filePath, JSON.stringify(questions, null, 2));
    console.log(`Finished ${filePath}`);
  } else {
    console.log(`No changes for ${filePath}`);
  }
}

async function main() {
  const rootDir = process.cwd();
  
  // Find all neet-*-db directories
  const dirs = await fs.readdir(rootDir);
  const dbDirs = dirs.filter(d => d.startsWith('neet-') && d.endsWith('-db'));

  for (const db of dbDirs) {
    const qDir = path.join(rootDir, db, 'questions');
    try {
      const files = await fs.readdir(qDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          await processFile(path.join(qDir, file));
        }
      }
    } catch (e) {
      console.error(`Error reading ${qDir}`, e.message);
    }
  }
}

main().catch(console.error);
