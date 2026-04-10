import fs from "fs/promises";
import path from "path";

const DEFAULT_BASE_URL = "https://api.printify.com/v1";

export default class PrintifyClient {
  constructor({
    token = process.env.PRINTIFY_API_TOKEN || process.env.PRINTIFY_TOKEN,
    userAgent = process.env.PRINTIFY_USER_AGENT || "alfe-aurora/1.0",
    baseUrl = DEFAULT_BASE_URL
  } = {}) {
    if (!token) {
      throw new Error("Missing PRINTIFY_API_TOKEN (or PRINTIFY_TOKEN)");
    }
    if (!userAgent) {
      throw new Error("Missing PRINTIFY_USER_AGENT");
    }
    this.token = token;
    this.userAgent = userAgent;
    this.baseUrl = String(baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
  }

  async request(method, endpoint, body) {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "User-Agent": this.userAgent,
        Accept: "application/json",
        "Content-Type": "application/json;charset=utf-8"
      },
      body: body ? JSON.stringify(body) : undefined
    });
    const raw = await response.text();
    let data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = { raw };
    }
    if (!response.ok) {
      const err = new Error(
        `Printify ${method} ${endpoint} failed: ${response.status} ${response.statusText}`
      );
      err.status = response.status;
      err.details = data;
      throw err;
    }
    return data;
  }

  getShops() {
    return this.request("GET", "/shops.json");
  }

  getBlueprints() {
    return this.request("GET", "/catalog/blueprints.json");
  }

  getPrintProviders(blueprintId) {
    return this.request(
      "GET",
      `/catalog/blueprints/${blueprintId}/print_providers.json`
    );
  }

  getVariants(blueprintId, printProviderId, { showOutOfStock = true } = {}) {
    const suffix = showOutOfStock ? "?show-out-of-stock=1" : "";
    return this.request(
      "GET",
      `/catalog/blueprints/${blueprintId}/print_providers/${printProviderId}/variants.json${suffix}`
    );
  }

  async findBlueprintByTitle(title) {
    const blueprints = await this.getBlueprints();
    const needle = String(title || "").trim().toLowerCase();
    const exact = blueprints.find((x) => String(x.title || "").trim().toLowerCase() === needle);
    if (exact) return exact;
    const partial = blueprints.find((x) => String(x.title || "").toLowerCase().includes(needle));
    if (partial) return partial;
    throw new Error(`No blueprint found matching title: ${title}`);
  }

  async findProviderByName(blueprintId, providerName) {
    const providers = await this.getPrintProviders(blueprintId);
    const needle = String(providerName || "").trim().toLowerCase();
    const exact = providers.find((x) => String(x.title || "").trim().toLowerCase() === needle);
    if (exact) return exact;
    const partial = providers.find((x) => String(x.title || "").toLowerCase().includes(needle));
    if (partial) return partial;
    throw new Error(`No provider found for blueprint ${blueprintId} matching: ${providerName}`);
  }

  async uploadImageFromFile({ filePath, fileName }) {
    if (!filePath) throw new Error("uploadImageFromFile requires filePath");
    const contents = await fs.readFile(filePath, { encoding: "base64" });
    return this.request("POST", "/uploads/images.json", {
      file_name: fileName || path.basename(filePath),
      contents
    });
  }

  uploadImageFromUrl({ fileName, url }) {
    if (!fileName || !url) {
      throw new Error("uploadImageFromUrl requires fileName and url");
    }
    return this.request("POST", "/uploads/images.json", {
      file_name: fileName,
      url
    });
  }

  selectVariantIds({ catalogVariants, colors = [], sizes = [] }) {
    const colorSet = new Set(colors.map((x) => String(x).toLowerCase()));
    const sizeSet = new Set(sizes.map((x) => String(x).toLowerCase()));
    return catalogVariants
      .filter((variant) => {
        const color = String(variant?.options?.color || "").toLowerCase();
        const size = String(variant?.options?.size || "").toLowerCase();
        const colorOk = colorSet.size === 0 || colorSet.has(color);
        const sizeOk = sizeSet.size === 0 || sizeSet.has(size);
        return colorOk && sizeOk;
      })
      .map((variant) => variant.id);
  }

  buildVariantsPayload({ catalogVariants, selectedVariantIds, priceCents, defaultVariantId }) {
    return catalogVariants
      .filter((variant) => selectedVariantIds.includes(variant.id))
      .map((variant) => ({
        id: variant.id,
        price: priceCents,
        is_enabled: true,
        is_default: variant.id === defaultVariantId
      }));
  }

  ensurePositionSupported(catalogVariants, variantIds, position) {
    const unsupported = catalogVariants.filter((variant) => {
      if (!variantIds.includes(variant.id)) return false;
      const positions = (variant.placeholders || []).map((p) => p.position);
      return !positions.includes(position);
    });
    if (unsupported.length > 0) {
      const ids = unsupported.map((x) => x.id).join(", ");
      throw new Error(`Position "${position}" is not available for variant ids: ${ids}`);
    }
  }

  async createProduct({
    shopId,
    blueprintId,
    printProviderId,
    title,
    description,
    imageId,
    colors = [],
    sizes = [],
    printPositions = ["front"],
    x = 0.5,
    y = 0.5,
    scale = 1,
    angle = 0,
    background = "#FFFFFF",
    priceCents = 2999,
    tags = [],
    visible = true
  }) {
    const catalogVariants = await this.getVariants(blueprintId, printProviderId);
    const selectedVariantIds = this.selectVariantIds({ catalogVariants, colors, sizes });
    if (!selectedVariantIds.length) {
      throw new Error("No variants matched the requested color/size filters.");
    }
    const defaultVariantId = selectedVariantIds[0];
    const positions = Array.isArray(printPositions) && printPositions.length
      ? printPositions
      : ["front"];
    positions.forEach((position) => {
      this.ensurePositionSupported(catalogVariants, selectedVariantIds, position);
    });
    const variants = this.buildVariantsPayload({
      catalogVariants,
      selectedVariantIds,
      priceCents,
      defaultVariantId
    });
    return this.request("POST", `/shops/${shopId}/products.json`, {
      title,
      description,
      blueprint_id: blueprintId,
      print_provider_id: printProviderId,
      tags,
      visible,
      variants,
      print_areas: [{
        variant_ids: selectedVariantIds,
        placeholders: positions.map((position) => ({
          position,
          images: [{ id: imageId, x, y, scale, angle }]
        })),
        background
      }]
    });
  }

  publishProduct(shopId, productId, publishFlags = {}) {
    return this.request("POST", `/shops/${shopId}/products/${productId}/publish.json`, {
      title: true,
      description: true,
      images: true,
      variants: true,
      tags: true,
      keyFeatures: true,
      shipping_template: true,
      ...publishFlags
    });
  }
}
