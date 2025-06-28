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
  form.append("scale", "4");
  form.append("mode", "latent");

  const res = await axios.post(
    "https://api.stability.ai/v2beta/upscale",
    form,
    {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        ...form.getHeaders(),
      },
      responseType: "arraybuffer",
      timeout: 120000,
    }
  );

  fs.writeFileSync(outputPath, res.data);
  console.log(`Final output saved to: ${outputPath}`);
}

upscale().catch((err) => {
  console.error(err.response?.data || err);
  process.exit(1);
});
