const path = require('path');
const j = require('jmdict-simplified-node');

const dbPath = path.resolve(__dirname, '../data/jmdict/db');
const jsonPath = path.resolve(__dirname, '../data/jmdict/jmdict-eng-common-3.6.2.json');

console.log('Initializing JMdict LevelDB from JSON...');
console.log('DB path:', dbPath);
console.log('JSON path:', jsonPath);

j.setup(dbPath, jsonPath).then(async (db) => {
    console.log('DB ready. Testing lookup for こころ (kokoro)...');
    const results = await j.readingAnywhere(db, 'こころ');
    if (results.length > 0) {
        const e = results[0];
        const kanji = e.kanji.map(k => k.text).join('/');
        const reading = e.kana.map(k => k.text).join('/');
        const glosses = e.sense.flatMap(s => s.gloss.map(g => g.text)).slice(0, 3).join('; ');
        console.log('SUCCESS - Kanji:', kanji, '| Reading:', reading, '| Meaning:', glosses);
    } else {
        console.log('No result for こころ');
    }

    console.log('\nTesting kanji lookup for 心...');
    const results2 = await j.kanjiAnywhere(db, '心');
    if (results2.length > 0) {
        const e = results2[0];
        const reading = e.kana.map(k => k.text).join('/');
        const glosses = e.sense.flatMap(s => s.gloss.map(g => g.text)).slice(0, 3).join('; ');
        console.log('SUCCESS - Reading:', reading, '| Meaning:', glosses);
    }

    console.log('\nJMdict LevelDB initialized successfully!');
    process.exit(0);
}).catch(e => {
    console.error('ERROR:', e.message);
    console.error(e.stack);
    process.exit(1);
});
