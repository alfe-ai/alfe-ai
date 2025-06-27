#!/usr/bin/env node
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';

const token = process.env.PRINTIFY_API_TOKEN || process.env.PRINTIFY_TOKEN;
const shopId = process.env.PRINTIFY_SHOP_ID;

if (!token) {
  console.error('Missing PRINTIFY_API_TOKEN');
  process.exit(1);
}
if (!shopId) {
  console.error('Missing PRINTIFY_SHOP_ID');
  process.exit(1);
}

const productId = process.argv[2];
const imagePathArg = process.argv[3];
if (!productId || !imagePathArg) {
  console.error('Usage: printifyTitleFix.js <productId> <imagePath>');
  process.exit(1);
}

const imagePath = path.resolve(imagePathArg);
if (!fs.existsSync(imagePath)) {
  console.error('Image file not found:', imagePath);
  process.exit(1);
}

const openAiKey = process.env.OPENAI_API_KEY;
if (!openAiKey) {
  console.error('Missing OPENAI_API_KEY');
  process.exit(1);
}

async function main() {
  try {
    const url = `https://api.printify.com/v1/shops/${shopId}/products/${productId}.json`;

    const imageBase64 = fs.readFileSync(imagePath, { encoding: 'base64' });
    const openai = new OpenAI({ apiKey: openAiKey });
    const resp = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Generate an optimized eBay shirt listing title for this design. Only return the title.'
            },
            {
              type: 'image_url',
              image_url: { url: `data:image/png;base64,${imageBase64}` }
            }
          ]
        }
      ],
      max_tokens: 16,
      temperature: 0.5
    });

    const optimizedTitle = resp.choices?.[0]?.message?.content?.trim();
    if (!optimizedTitle) {
      console.error('Failed to generate title');
      process.exit(1);
    }

    // Retry updating the title if Printify temporarily disables editing
    const updateTitle = async () => {
      await axios.put(
        url,
        { title: optimizedTitle },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
    };

    let attempt = 0;
    while (true) {
      try {
        await updateTitle();
        break;
      } catch (err) {
        const reason =
          err.response?.data?.errors?.reason || err.response?.data?.message;
        const code = err.response?.data?.code;
        if (
          attempt < 9 &&
          (reason === 'Product is disabled for editing' || code === 8252)
        ) {
          attempt++;
          console.warn(
            `Attempt ${attempt} failed: ${reason}. Retrying in 5 seconds...`
          );
          await new Promise(r => setTimeout(r, 5000));
          continue;
        }
        throw err;
      }
    }
    console.log('Updated Title:', optimizedTitle);
  } catch (err) {
    const status = err.response?.status;
    const msg = err.response?.data || err.message;
    console.error(
      `Failed to update product ${productId} (status: ${status ?? 'unknown'}):`,
      msg
    );
    process.exit(1);
  }
}

main();
