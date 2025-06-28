#!/usr/bin/env node
import fs from "fs";
import path from "path";
import axios from "axios";
import FormData from "form-data";

const API_KEY = process.env.STABILITY_API_KEY;
if (!API_KEY) {
  console.error('Missing STABILITY_API_KEY');
  process.exit(1);
}

console.log('Using Stability AI upscaler');

const input = process.argv[2];
if (!input) {
  console.error('Usage: upscale.js <imagePath>');
  process.exit(1);
}

const inputPath = path.resolve(input);
if (!fs.existsSync(inputPath)) {
  console.error('File not found:', inputPath);
  process.exit(1);
}

const ext = path.extname(inputPath);
const base = path.basename(inputPath, ext);
const outputPath = path.join(path.dirname(inputPath), `${base}_upscaled${ext}`);

async function upscale() {
  const form = new FormData();
  form.append("image", fs.createReadStream(inputPath));
  // let the API return the same format as the input
  form.append("output_format", ext.slice(1));

  const res = await axios.post(
    "https://api.stability.ai/v2beta/stable-image/upscale/fast",
    form,
    {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        ...form.getHeaders(),
        Accept: "image/*",
      },
      responseType: "arraybuffer",
      timeout: 120000,
    }
  );

  fs.writeFileSync(outputPath, res.data);
  console.log(`Final output saved to: ${outputPath}`);
}

upscale().catch((err) => {
  if (err.response) {
    const data = Buffer.isBuffer(err.response.data)
      ? err.response.data.toString()
      : JSON.stringify(err.response.data);
    console.error(`Upscale failed: ${err.response.status} ${data}`);
  } else {
    console.error('Upscale failed:', err.message);
  }
  process.exit(1);
});
