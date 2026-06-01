"use server";

import { ShotifyClient } from "@gadget-client/shotify";

const GADGET_API_KEY = process.env.GADGET_API_KEY;
const GADGET_ENV = process.env.GADGET_ENV || "development";
const SHOPIFY_SHOP_NAME = process.env.SHOPIFY_SHOP_NAME || process.env.SHOP_NAME || "shotify-2nqf2xwz";
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || "2026-04";
const SHOPIFY_CLIENT_ID = process.env.CLIENT_ID;
const SHOPIFY_CLIENT_SECRET = process.env.CLIENT_SECRET;

if (!GADGET_API_KEY) {
  console.error("Error: GADGET_API_KEY is not defined in the environment.");
}

const api = new ShotifyClient({
  environment: GADGET_ENV,
  authenticationMode: {
    apiKey: GADGET_API_KEY,
  },
});

function logServerAction(event: string, details: Record<string, unknown> = {}) {
  console.info(`[template-manager] ${event}`, {
    gadgetEnv: GADGET_ENV,
    hasGadgetApiKey: Boolean(GADGET_API_KEY),
    hasShopifyClientId: Boolean(SHOPIFY_CLIENT_ID),
    hasShopifyClientSecret: Boolean(SHOPIFY_CLIENT_SECRET),
    shopifyShopName: SHOPIFY_SHOP_NAME,
    ...details,
  });
}

export interface TemplateRecord {
  id: string;
  name: string;
  badge?: string;
  category: "Studio" | "Lifestyle" | "Seasonal" | "Brand";
  creditsRequired: number;
  description: string;
  displayImageUrl: string;
  prompt: string;
  sortOrder: number;
  visibility: "public" | "hidden";
  createdAt?: string;
  updatedAt?: string;
}

export type TemplateImportRow = {
  name: string;
  badge?: string;
  category: TemplateRecord["category"];
  creditsRequired: number;
  description: string;
  displayImageUrl: string;
  prompt: string;
  sortOrder: number;
  visibility: TemplateRecord["visibility"];
};

export type BulkCreateTemplateResult = {
  created: TemplateRecord[];
  failed: { rowNumber: number; name?: string; error: string }[];
};

type ShopifyGraphQLError = {
  message: string;
};

type ShopifyUserError = {
  field?: string[] | null;
  message: string;
};

type ShopifyStagedTarget = {
  url: string;
  resourceUrl: string;
  parameters: { name: string; value: string }[];
};

function shopifyGraphqlUrl() {
  return `https://${SHOPIFY_SHOP_NAME}.myshopify.com/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
}

function getFilenameFromUrl(url: string) {
  try {
    const parsed = new URL(url);
    const name = parsed.pathname.split("/").filter(Boolean).pop() || "template-image.jpg";
    return sanitizeFilename(decodeURIComponent(name));
  } catch {
    return "template-image.jpg";
  }
}

function getMimeTypeFromFilename(filename: string) {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".avif")) return "image/avif";
  return "image/jpeg";
}

function getExtensionFromMimeType(mimeType: string) {
  if (mimeType.includes("png")) return ".png";
  if (mimeType.includes("webp")) return ".webp";
  if (mimeType.includes("gif")) return ".gif";
  if (mimeType.includes("avif")) return ".avif";
  return ".jpg";
}

function hasImageExtension(filename: string) {
  return /\.(jpe?g|png|webp|gif|avif)$/i.test(filename);
}

function ensureFilenameMatchesMimeType(filename: string, mimeType: string) {
  const cleaned = filename.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-") || "template-image";
  if (hasImageExtension(cleaned)) {
    return cleaned;
  }

  return `${cleaned.replace(/\.[^.]+$/, "")}${getExtensionFromMimeType(mimeType)}`;
}

function sanitizeFilename(filename: string) {
  const cleaned = filename.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
  return cleaned.includes(".") ? cleaned : `${cleaned || "template-image"}.jpg`;
}

async function fetchRemoteImageAsFile(imageUrl: string) {
  const response = await fetch(imageUrl);

  if (!response.ok) {
    throw new Error(`Could not fetch image URL. HTTP ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) {
    throw new Error("The URL did not return an image file.");
  }

  const filename = getFilenameFromUrl(imageUrl);
  const blob = await response.blob();
  return new File([blob], ensureFilenameMatchesMimeType(filename, contentType), {
    type: contentType || getMimeTypeFromFilename(filename),
  });
}

function isShopifyCdnUrl(url: string) {
  return /cdn\.shopify\.com|shopifycdn\.net|myshopify\.com\/cdn/i.test(url);
}

function getUserErrorMessage(errors: ShopifyUserError[] = []) {
  return errors.map((error) => error.message).filter(Boolean).join("; ");
}

async function getShopifyAccessToken() {
  if (!SHOPIFY_CLIENT_ID || !SHOPIFY_CLIENT_SECRET) {
    throw new Error("Shopify CLIENT_ID and CLIENT_SECRET must be configured in .env.");
  }

  const response = await fetch(`https://${SHOPIFY_SHOP_NAME}.myshopify.com/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: SHOPIFY_CLIENT_ID,
      client_secret: SHOPIFY_CLIENT_SECRET,
      grant_type: "client_credentials",
    }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.access_token) {
    throw new Error(data?.error_description || data?.error || "Failed to authenticate with Shopify.");
  }

  return data.access_token as string;
}

async function shopifyGraphql<TData>(
  query: string,
  variables: Record<string, unknown>,
  accessToken: string,
): Promise<TData> {
  const response = await fetch(shopifyGraphqlUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = await response.json();

  if (!response.ok) {
    throw new Error(json?.errors?.[0]?.message || `Shopify API request failed with HTTP ${response.status}.`);
  }

  const graphqlErrors = json.errors as ShopifyGraphQLError[] | undefined;
  if (graphqlErrors?.length) {
    const message = graphqlErrors.map((error) => error.message).join("; ");
    if (/Access denied/i.test(message)) {
      throw new Error(
        `${message} Make sure the Shopify app has read_files and write_files Admin API scopes, then reinstall or reauthorize the app so the client-credentials token receives those scopes.`,
      );
    }
    throw new Error(message);
  }

  return json.data as TData;
}

async function createShopifyFileFromSource(accessToken: string, originalSource: string, filename: string) {
  const mutation = `
    mutation fileCreate($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files {
          id
          fileStatus
          alt
          ... on MediaImage {
            image { url }
          }
        }
        userErrors { field message }
      }
    }
  `;

  const data = await shopifyGraphql<{
    fileCreate: {
      files: { id: string; fileStatus: string; image?: { url?: string | null } | null }[];
      userErrors: ShopifyUserError[];
    };
  }>(
    mutation,
    {
      files: [
        {
          contentType: "IMAGE",
          originalSource,
          filename,
          alt: filename.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "),
        },
      ],
    },
    accessToken,
  );

  const userError = getUserErrorMessage(data.fileCreate.userErrors);
  if (userError) {
    throw new Error(userError);
  }

  const file = data.fileCreate.files[0];
  if (!file?.id) {
    throw new Error("Shopify did not return a file ID.");
  }

  if (file.image?.url) {
    return file.image.url;
  }

  return pollShopifyImageUrl(accessToken, file.id);
}

async function createStagedUpload(accessToken: string, file: File) {
  const mutation = `
    mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets {
          url
          resourceUrl
          parameters { name value }
        }
        userErrors { field message }
      }
    }
  `;

  const data = await shopifyGraphql<{
    stagedUploadsCreate: {
      stagedTargets: ShopifyStagedTarget[];
      userErrors: ShopifyUserError[];
    };
  }>(
    mutation,
    {
      input: [
        {
          filename: sanitizeFilename(file.name || "template-image.jpg"),
          mimeType: file.type || "image/jpeg",
          fileSize: String(file.size),
          resource: "FILE",
          httpMethod: "POST",
        },
      ],
    },
    accessToken,
  );

  const userError = getUserErrorMessage(data.stagedUploadsCreate.userErrors);
  if (userError) {
    throw new Error(userError);
  }

  const target = data.stagedUploadsCreate.stagedTargets[0];
  if (!target) {
    throw new Error("Shopify did not return a staged upload target.");
  }

  return target;
}

async function uploadFileToStagedTarget(target: ShopifyStagedTarget, file: File) {
  const formData = new FormData();

  for (const parameter of target.parameters) {
    formData.append(parameter.name, parameter.value);
  }

  formData.append("file", file, sanitizeFilename(file.name || "template-image.jpg"));

  const response = await fetch(target.url, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Shopify staged upload failed with HTTP ${response.status}. ${text}`);
  }
}

async function uploadRemoteImageToShopify(accessToken: string, imageUrl: string) {
  const remoteFile = await fetchRemoteImageAsFile(imageUrl);
  const target = await createStagedUpload(accessToken, remoteFile);
  await uploadFileToStagedTarget(target, remoteFile);
  return createShopifyFileFromSource(accessToken, target.resourceUrl, sanitizeFilename(remoteFile.name));
}

async function pollShopifyImageUrl(accessToken: string, fileId: string) {
  const query = `
    query fileNode($id: ID!) {
      node(id: $id) {
        ... on MediaImage {
          id
          fileStatus
          image { url }
        }
      }
    }
  `;

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const data = await shopifyGraphql<{
      node?: { fileStatus?: string; image?: { url?: string | null } | null } | null;
    }>(query, { id: fileId }, accessToken);

    const url = data.node?.image?.url;
    if (url) {
      return url;
    }

    if (data.node?.fileStatus === "FAILED") {
      throw new Error("Shopify failed to process the uploaded image.");
    }

    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  throw new Error("Shopify image is still processing. Try again in a moment.");
}

async function mergeTemplateForUpsert(id: string, payload: Partial<TemplateRecord>) {
  const existing = await api.template.findOne(id);
  return {
    id,
    name: existing.name,
    badge: existing.badge ?? undefined,
    category: existing.category,
    creditsRequired: existing.creditsRequired,
    description: existing.description,
    displayImageUrl: existing.displayImageUrl,
    prompt: existing.prompt,
    sortOrder: existing.sortOrder ?? 0,
    visibility: existing.visibility,
    ...payload,
  };
}

function normalizeTemplatePayload(payload: Partial<TemplateRecord>): Partial<TemplateRecord> {
  return {
    ...payload,
    name: payload.name?.trim(),
    badge: payload.badge?.trim() || undefined,
    category: payload.category,
    creditsRequired: Number(payload.creditsRequired ?? 1),
    description: payload.description?.trim(),
    displayImageUrl: payload.displayImageUrl?.trim(),
    prompt: payload.prompt?.trim(),
    sortOrder: Number(payload.sortOrder ?? 0),
    visibility: payload.visibility ?? "hidden",
  };
}

export async function uploadTemplateImageToShopify(formData: FormData): Promise<{ url: string }> {
  try {
    logServerAction("uploadTemplateImageToShopify:start", {
      hasImageFile: formData.get("imageFile") instanceof File,
      hasImageUrl: Boolean(String(formData.get("imageUrl") || "").trim()),
    });
    const accessToken = await getShopifyAccessToken();
    const imageUrl = String(formData.get("imageUrl") || "").trim();
    const imageFile = formData.get("imageFile");

    if (imageFile instanceof File && imageFile.size > 0) {
      if (!imageFile.type.startsWith("image/")) {
        throw new Error("Upload an image file.");
      }

      const target = await createStagedUpload(accessToken, imageFile);
      await uploadFileToStagedTarget(target, imageFile);
      const url = await createShopifyFileFromSource(accessToken, target.resourceUrl, sanitizeFilename(imageFile.name));
      logServerAction("uploadTemplateImageToShopify:success", { method: "file", filename: imageFile.name });
      return { url };
    }

    if (!imageUrl) {
      throw new Error("Choose an image file or enter an image URL.");
    }

    if (isShopifyCdnUrl(imageUrl)) {
      logServerAction("uploadTemplateImageToShopify:skip", { reason: "already-shopify-cdn" });
      return { url: imageUrl };
    }

    const filename = getFilenameFromUrl(imageUrl);
    if (imageUrl.length <= 2048 && hasImageExtension(filename)) {
      try {
        const url = await createShopifyFileFromSource(accessToken, imageUrl, filename);
        logServerAction("uploadTemplateImageToShopify:success", { method: "direct-url", filename });
        return { url };
      } catch (error: any) {
        if (!/filename extension must match original source/i.test(error?.message || "")) {
          throw error;
        }
      }
    }

    const url = await uploadRemoteImageToShopify(accessToken, imageUrl);
    logServerAction("uploadTemplateImageToShopify:success", { method: "remote-staged" });
    return { url };
  } catch (error: any) {
    console.error("Failed to upload image to Shopify:", error);
    throw new Error(error?.message || "Failed to upload image to Shopify");
  }
}

export async function getTemplates(search?: string): Promise<TemplateRecord[]> {
  try {
    const templates = await api.template.findMany({
      sort: { sortOrder: "Ascending" },
      search: search || undefined,
    });
    return JSON.parse(JSON.stringify(templates));
  } catch (error: any) {
    console.error("Failed to get templates:", error);
    throw new Error(error?.message || "Failed to fetch templates");
  }
}

export async function createTemplate(payload: Partial<TemplateRecord>): Promise<TemplateRecord> {
  try {
    logServerAction("createTemplate:start", {
      name: payload.name,
      category: payload.category,
      visibility: payload.visibility,
      hasDisplayImageUrl: Boolean(payload.displayImageUrl),
    });
    const created = await api.template.upsert({ template: normalizeTemplatePayload(payload) } as any);
    logServerAction("createTemplate:success", { id: created.id, name: created.name });
    return JSON.parse(JSON.stringify(created));
  } catch (error: any) {
    console.error("Failed to create template:", error);
    throw new Error(error?.message || "Failed to create template");
  }
}

export async function bulkCreateTemplates(rows: TemplateImportRow[]): Promise<BulkCreateTemplateResult> {
  logServerAction("bulkCreateTemplates:start", { rowCount: rows.length });
  const created: TemplateRecord[] = [];
  const failed: BulkCreateTemplateResult["failed"] = [];

  for (const [index, row] of rows.entries()) {
    const rowNumber = index + 2;
    const name = row.name?.trim();

    try {
      logServerAction("bulkCreateTemplates:row:start", { rowNumber, name });
      const imageUrl = row.displayImageUrl?.trim();
      if (!imageUrl) {
        throw new Error("Display image URL is required.");
      }

      const formData = new FormData();
      formData.append("imageUrl", imageUrl);
      const shopifyImage = await uploadTemplateImageToShopify(formData);

      const template = await createTemplate({
        ...row,
        displayImageUrl: shopifyImage.url,
      });

      created.push(template);
      logServerAction("bulkCreateTemplates:row:success", { rowNumber, id: template.id, name: template.name });
    } catch (error: any) {
      console.error("[template-manager] bulkCreateTemplates:row:failed", {
        rowNumber,
        name,
        error: error?.message || String(error),
      });
      failed.push({
        rowNumber,
        name,
        error: error?.message || "Failed to import template.",
      });
    }
  }

  logServerAction("bulkCreateTemplates:complete", { created: created.length, failed: failed.length });
  return {
    created: JSON.parse(JSON.stringify(created)),
    failed,
  };
}

export async function updateTemplate(id: string, payload: Partial<TemplateRecord>): Promise<TemplateRecord> {
  try {
    logServerAction("updateTemplate:start", {
      id,
      fields: Object.keys(payload),
      hasDisplayImageUrl: Boolean(payload.displayImageUrl),
    });
    const template = await mergeTemplateForUpsert(id, payload);
    const updated = await api.template.upsert({
      on: ["id"],
      template,
    } as any);
    logServerAction("updateTemplate:success", { id: updated.id, name: updated.name });
    return JSON.parse(JSON.stringify(updated));
  } catch (error: any) {
    console.error("Failed to update template:", error);
    throw new Error(error?.message || "Failed to update template");
  }
}

export async function bulkUpdateTemplates(
  ids: string[],
  payload: Partial<TemplateRecord>,
): Promise<TemplateRecord[]> {
  try {
    const updates = await Promise.all(
      ids.map(async (id) => {
        const template = await mergeTemplateForUpsert(id, payload);
        return api.template.upsert({
          on: ["id"],
          template,
        } as any);
      }),
    );

    return JSON.parse(JSON.stringify(updates));
  } catch (error: any) {
    console.error("Failed to bulk update templates:", error);
    throw new Error(error?.message || "Failed to bulk update templates");
  }
}

export async function deleteTemplate(id: string): Promise<{ success: boolean }> {
  try {
    await api.template.delete(id);
    return { success: true };
  } catch (error: any) {
    console.error("Failed to delete template:", error);
    throw new Error(error?.message || "Failed to delete template");
  }
}

export async function bulkDeleteTemplates(ids: string[]): Promise<{ success: boolean }> {
  try {
    await Promise.all(ids.map((id) => api.template.delete(id)));
    return { success: true };
  } catch (error: any) {
    console.error("Failed to bulk delete templates:", error);
    throw new Error(error?.message || "Failed to bulk delete templates");
  }
}
