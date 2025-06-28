#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';

const imagePathArg = process.argv[2];
if (!imagePathArg) {
  console.error('Usage: detectColors.js <imagePath>');
  process.exit(1);
}

const absPath = path.resolve(imagePathArg);
if (!fs.existsSync(absPath)) {
  console.error('Image file not found:', absPath);
  process.exit(1);
}

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error('Missing OPENAI_API_KEY');
  process.exit(1);
}

(async () => {
  try {
    const openai = new OpenAI({ apiKey });
    const imageBase64 = fs.readFileSync(absPath, { encoding: 'base64' });
    const resp = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Identify the three most prominent colors in this shirt design. Respond with a comma-separated list of three color names or hex codes.'
            },
            {
              type: 'image_url',
              image_url: { url: `data:image/png;base64,${imageBase64}` }
            }
          ]
        }
      ],
      max_tokens: 20,
      temperature: 0.2
    });
    const colors = resp.choices?.[0]?.message?.content?.trim();
    if (!colors) throw new Error('No colors returned');
    console.log(colors);
  } catch (err) {
    console.error('detectColors.js failed:', err.message || err);
    process.exit(1);
  }
})();
