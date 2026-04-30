import { readFile } from "fs/promises";
import path from "path";
import axios from "axios";

const PRINTIFY_API_BASE = process.env.PRINTIFY_API_BASE || "https://api.printify.com/v1";

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function parseCsv(value) {
  return String(value || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

async function printifyRequest(method, endpoint, data) {
  const token = requiredEnv("PRINTIFY_API_TOKEN");
  const res = await axios({
    method,
    url: `${PRINTIFY_API_BASE}${endpoint}`,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json;charset=utf-8",
      "User-Agent": "ALSH.ai/1.0"
    },
    data
  });
  return res.data;
}

async function uploadImageFromFile(filePath) {
  const contents = await readFile(filePath, "base64");
  return printifyRequest("post", "/uploads/images.json", {
    file_name: path.basename(filePath),
    contents
  });
}

async function resolveBlueprintId() {
  if (process.env.PRINTIFY_BLUEPRINT_ID) return Number(process.env.PRINTIFY_BLUEPRINT_ID);
  const blueprints = await printifyRequest("get", "/catalog/blueprints.json");
  const match = (Array.isArray(blueprints) ? blueprints : []).find(b => {
    const t = String(b?.title || "").toLowerCase();
    const brand = String(b?.brand || "").toLowerCase();
    const model = String(b?.model || "").toLowerCase();
    return (brand === "gildan" && model === "5000")
      || t.includes("gildan")
      || t.includes("heavy cotton");
  });
  if (!match) throw new Error("Could not find Gildan 5000 blueprint. Set PRINTIFY_BLUEPRINT_ID.");
  return Number(match.id);
}

async function resolveProviderId(blueprintId) {
  if (process.env.PRINTIFY_PRINT_PROVIDER_ID) return Number(process.env.PRINTIFY_PRINT_PROVIDER_ID);
  const providers = await printifyRequest("get", `/catalog/blueprints/${blueprintId}/print_providers.json`);
  if (!Array.isArray(providers) || providers.length === 0) {
    throw new Error(`No print providers found for blueprint ${blueprintId}. Set PRINTIFY_PRINT_PROVIDER_ID.`);
  }
  return Number(providers[0].id);
}

const DEFAULT_SIZE_ORDER = [
  "XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"
];

function normalizeOption(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function optionColor(variant) {
  return variant?.options?.color || "";
}

function optionSize(variant) {
  return variant?.options?.size || "";
}

function selectVariants(allVariants) {
  const explicitIds = parseCsv(process.env.PRINTIFY_VARIANT_IDS).map(Number);
  if (explicitIds.length) {
    return allVariants.filter(v => explicitIds.includes(Number(v.id)));
  }

  const desiredColors = parseCsv(process.env.PRINTIFY_COLORS || "Ash,Black,White");
  const desiredSizes = parseCsv(process.env.PRINTIFY_SIZES);

  const colorOrder = desiredColors.map(normalizeOption);
  const sizeOrder = desiredSizes.length
    ? desiredSizes.map(normalizeOption)
    : DEFAULT_SIZE_ORDER.map(normalizeOption);

  const selected = allVariants.filter(v => {
    const color = normalizeOption(optionColor(v));
    const size = normalizeOption(optionSize(v));

    const colorOk = colorOrder.length === 0 || colorOrder.includes(color);
    const sizeOk = desiredSizes.length === 0 || sizeOrder.includes(size);

    return colorOk && sizeOk;
  });

  selected.sort((a, b) => {
    const aColor = colorOrder.indexOf(normalizeOption(optionColor(a)));
    const bColor = colorOrder.indexOf(normalizeOption(optionColor(b)));

    if (aColor !== bColor) return aColor - bColor;

    const aSize = sizeOrder.indexOf(normalizeOption(optionSize(a)));
    const bSize = sizeOrder.indexOf(normalizeOption(optionSize(b)));

    return aSize - bSize;
  });

  return selected;
}

function pickDefaultVariantId(variants) {
  if (process.env.PRINTIFY_DEFAULT_VARIANT_ID) {
    return Number(process.env.PRINTIFY_DEFAULT_VARIANT_ID);
  }

  const ashMedium = variants.find(v =>
    normalizeOption(optionColor(v)) === "ash" &&
    normalizeOption(optionSize(v)) === "m"
  );

  return Number((ashMedium || variants[0])?.id);
}

function ensureVariantsSupportPosition(variants, position) {
  const targetPosition = String(position || "front").toLowerCase();
  return variants.filter(v => {
    const placeholders = Array.isArray(v?.placeholders) ? v.placeholders : [];
    return placeholders.some(p => String(p?.position || "").toLowerCase() === targetPosition);
  });
}

function ensureVariantsAreAvailable(variants) {
  return variants.filter(v => {
    if (typeof v?.is_available === "boolean") return v.is_available;
    if (typeof v?.is_enabled === "boolean") return v.is_enabled;
    return true;
  });
}

async function createGildan5000Product({ filePath, title, description = "", tags = [] }) {
  const shopId = requiredEnv("PRINTIFY_SHOP_ID");
  const uploaded = await uploadImageFromFile(filePath);
  const imageId = uploaded?.id || uploaded?.upload_id;
  if (!imageId) throw new Error("Printify upload did not return an image id.");

  const blueprintId = await resolveBlueprintId();
  const printProviderId = await resolveProviderId(blueprintId);
  const variantsRes = await printifyRequest(
    "get",
    `/catalog/blueprints/${blueprintId}/print_providers/${printProviderId}/variants.json`
  );
  const allVariants = Array.isArray(variantsRes) ? variantsRes : variantsRes?.variants || [];
  const selectedVariants = selectVariants(allVariants);
  const printAreaPosition = process.env.PRINTIFY_PRINT_AREA_POSITION || "front";
  const availableVariants = ensureVariantsAreAvailable(selectedVariants);
  const validVariants = ensureVariantsSupportPosition(availableVariants, printAreaPosition);
  if (selectedVariants.length === 0) {
    throw new Error("No variants selected. Set PRINTIFY_VARIANT_IDS or PRINTIFY_COLORS/PRINTIFY_SIZES.");
  }
  if (availableVariants.length === 0) {
    throw new Error("Selected variants are not currently available from this print provider.");
  }
  if (validVariants.length === 0) {
    throw new Error(`Selected variants do not support placeholder position "${printAreaPosition}".`);
  }
  const maxVariants = Number(process.env.PRINTIFY_MAX_VARIANTS || 100);
  const finalVariants = validVariants.slice(0, maxVariants);
  if (validVariants.length > maxVariants) {
    console.warn(
      `[Printify] Selected ${validVariants.length} variants; trimming to max ${maxVariants}. ` +
      "Set PRINTIFY_COLORS, PRINTIFY_SIZES, or PRINTIFY_VARIANT_IDS to control this."
    );
  }
  if (finalVariants.length === 0) {
    throw new Error("No variants left after applying Printify variant cap.");
  }

  const price = Number(process.env.PRINTIFY_PRICE_CENTS || 2499);
  const defaultVariantId = pickDefaultVariantId(finalVariants);
  const payload = {
    title,
    description,
    blueprint_id: blueprintId,
    print_provider_id: printProviderId,
    variants: finalVariants.map(v => ({
      id: Number(v.id),
      price,
      is_enabled: true,
      is_default: Number(v.id) === defaultVariantId
    })),
    print_areas: [
      {
        variant_ids: finalVariants.map(v => Number(v.id)),
        placeholders: [
          {
            position: printAreaPosition,
            images: [
              {
                id: imageId,
                x: Number(process.env.PRINTIFY_IMAGE_X || 0.5),
                y: Number(process.env.PRINTIFY_IMAGE_Y || 0.5),
                scale: Number(process.env.PRINTIFY_IMAGE_SCALE || 1),
                angle: Number(process.env.PRINTIFY_IMAGE_ANGLE || 0)
              }
            ]
          }
        ]
      }
    ],
    tags
  };
  const product = await printifyRequest("post", `/shops/${shopId}/products.json`, payload);

  if (parseBoolean(process.env.PRINTIFY_PUBLISH, false) && product?.id) {
    await printifyRequest("post", `/shops/${shopId}/products/${product.id}/publish.json`, {
      title: true,
      description: true,
      images: true,
      variants: true,
      tags: true,
      keyFeatures: true,
      shipping_template: true
    });
  }
  return product;
}

export { createGildan5000Product };
