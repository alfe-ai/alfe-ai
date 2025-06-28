#!/usr/bin/env node
import fs from "fs";
import path from "path";
import axios from "axios";
import FormData from "form-data";
import child_process from "child_process";

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
const nobgPath = path.join(path.dirname(inputPath), `${base}_upscaled_nobg${ext}`);

const RIBT_SCRIPT =
  process.env.RIBT_SCRIPT_PATH ||
  '/mnt/part5/dot_fayra/Whimsical/git/LogisticaRIBT/run.sh';
const ribtCwd = path.dirname(RIBT_SCRIPT);
const ribtOutput = path.join(ribtCwd, 'output.png');

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

  try {
    child_process.execFileSync(RIBT_SCRIPT, [outputPath], { cwd: ribtCwd });
    if (fs.existsSync(ribtOutput)) {
      fs.copyFileSync(ribtOutput, nobgPath);
      fs.copyFileSync(ribtOutput, outputPath);
      console.log(`Background removed output saved to: ${nobgPath}`);
    } else {
      console.error('RIBT output not found at', ribtOutput);
    }
  } catch (err) {
    console.error('RIBT step failed:', err.message);
  }

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
