#!/usr/bin/env node
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import cheerio from 'cheerio';
import TaskDBLocal from '../src/taskDb.js';
import TaskDBAws from '../src/taskDbAws.js';

dotenv.config();

const useRds = process.env.AWS_DB_URL || process.env.AWS_DB_HOST;
const TaskDB = useRds ? TaskDBAws : TaskDBLocal;
const db = new TaskDB();

const storeUrl =
  process.env.EBAY_STORE_URL ||
  'https://www.ebay.com/sch/11450/i.html?_dkr=1&iconV2Request=true&_blrs=recall_filtering&_ssn=confused_apparel&_oac=1&_sop=10';
const interval = parseInt(process.env.EBAY_CHECK_INTERVAL_MS || '300000', 10);

const file = process.argv[2];
if (!file) {
  console.error('Usage: ebayCheck.js <file>');
  process.exit(1);
}

function getTitle(file) {
  const url = path.isAbsolute(file) ? file : `/uploads/${file}`;
  return db.getImageTitleForUrl(url);
}

async function searchEbay(title) {
  const { data } = await axios.get(storeUrl);
  const $ = cheerio.load(data);
  const items = $('li.s-item');
  for (const el of items) {
    const itemTitle = $(el).find('.s-item__title').text().trim();
    if (itemTitle.toLowerCase() === title.trim().toLowerCase()) {
      const link = $(el).find('.s-item__link').attr('href');
      if (link) return link;
    }
  }
  return null;
}

async function run() {
  const title = getTitle(file);
  if (!title) {
    console.error('No title found for', file);
    return;
  }
  const urlKey = path.isAbsolute(file) ? file : `/uploads/${file}`;
  while (true) {
    try {
      const ebayUrl = await searchEbay(title);
      if (ebayUrl) {
        db.setEbayUrl(urlKey, ebayUrl);
        console.log('EBAY_URL:', ebayUrl);
        break;
      }
    } catch (err) {
      console.error('eBay search error:', err.message || err);
    }
    await new Promise((r) => setTimeout(r, interval));
  }
}

run();
