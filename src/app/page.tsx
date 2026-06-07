"use client";

import { useEffect, useMemo, useState } from "react";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import {
  getTemplates,
  createTemplate,
  bulkCreateTemplates,
  updateTemplate,
  deleteTemplate,
  bulkUpdateTemplates,
  bulkDeleteTemplates,
  uploadTemplateImageToShopify,
  getModels,
  createModel,
  updateModel,
  deleteModel,
  bulkCreateModels,
  bulkUpdateModels,
  bulkDeleteModels,
  type BulkCreateTemplateResult,
  type TemplateImportRow,
  type TemplateRecord,
  type TemplatesPage,
  type ModelRecord,
  type ModelsPage,
  type ModelImportRow,
  type BulkCreateModelResult,
} from "./actions";

type TemplateFormState = {
  name: string;
  badge?: string;
  category: "Studio" | "Lifestyle" | "Seasonal" | "Brand";
  creditsRequired: number;
  description: string;
  displayImageUrl: string;
  prompt: string;
  sortOrder: number;
  visibility: "public" | "hidden";
};

type BulkFormState = {
  updateName: boolean;
  name: string;
  updateCategory: boolean;
  category: TemplateFormState["category"];
  updateVisibility: boolean;
  visibility: TemplateFormState["visibility"];
  updateCreditsRequired: boolean;
  creditsRequired: number;
  updateSortOrder: boolean;
  sortOrder: number;
  updateBadge: boolean;
  badge: string;
  updateDisplayImageUrl: boolean;
  displayImageUrl: string;
  updateDescription: boolean;
  description: string;
  updatePrompt: boolean;
  prompt: string;
};

type BulkUploadStatus = BulkCreateTemplateResult | null;
type ParsedTemplateImportRow = TemplateImportRow & {
  displayImageFile?: File;
};
type ParsedSpreadsheet = {
  rows: string[][];
  embeddedImagesByRow: Map<number, File>;
};

const emptyTemplate: TemplateFormState = {
  name: "",
  badge: "",
  category: "Studio",
  creditsRequired: 1,
  description: "",
  displayImageUrl: "",
  prompt: "",
  sortOrder: 0,
  visibility: "hidden",
};

const emptyBulkDraft: BulkFormState = {
  updateName: false,
  name: "",
  updateCategory: false,
  category: "Studio",
  updateVisibility: false,
  visibility: "hidden",
  updateCreditsRequired: false,
  creditsRequired: 1,
  updateSortOrder: false,
  sortOrder: 0,
  updateBadge: false,
  badge: "",
  updateDisplayImageUrl: false,
  displayImageUrl: "",
  updateDescription: false,
  description: "",
  updatePrompt: false,
  prompt: "",
};

const importColumns = [
  "name",
  "badge",
  "category",
  "creditsRequired",
  "description",
  "displayImageUrl",
  "prompt",
  "sortOrder",
  "visibility",
] as const;

const categoryValues = ["Studio", "Lifestyle", "Seasonal", "Brand"] as const;
const visibilityValues = ["public", "hidden"] as const;
const promptMaxLength = 8000;
const maxEmbeddedImageUploadBytes = 19 * 1024 * 1024;
const templatesPageSize = 9;
const emptyTemplatesPageInfo: TemplatesPage["pageInfo"] = {
  hasNextPage: false,
  hasPreviousPage: false,
  startCursor: null,
  endCursor: null,
};

const portalUsername = process.env.PORTAL_USERNAME;
const portalPassword = process.env.PORTAL_PASSWORD;
const loginConfigured = Boolean(portalUsername && portalPassword);

function toDraft(template: Partial<TemplateFormState>): TemplateFormState {
  return {
    name: template.name ?? "",
    badge: template.badge ?? "",
    category: template.category ?? "Studio",
    creditsRequired: template.creditsRequired ?? 1,
    description: template.description ?? "",
    displayImageUrl: template.displayImageUrl ?? "",
    prompt: template.prompt ?? "",
    sortOrder: template.sortOrder ?? 0,
    visibility: template.visibility ?? "hidden",
  };
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function parseDelimitedText(text: string, delimiter: "," | "\t") {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        cell += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === delimiter) {
      row.push(cell);
      cell = "";
      continue;
    }

    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) {
        rows.push(row);
      }
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  if (row.some((value) => value.trim() !== "")) {
    rows.push(row);
  }

  return rows;
}

function parseHtmlTable(text: string) {
  const document = new DOMParser().parseFromString(text, "text/html");
  const tableRows = Array.from(document.querySelectorAll("tr"));
  return tableRows
    .map((tableRow) =>
      Array.from(tableRow.querySelectorAll("th,td")).map((cell) => cell.textContent?.trim() ?? ""),
    )
    .filter((row) => row.some(Boolean));
}

function parseSpreadsheetText(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("The selected file is empty.");
  }

  if (trimmed.includes("<table") || trimmed.includes("<TABLE")) {
    return parseHtmlTable(trimmed);
  }

  if (text.includes("\u0000")) {
    throw new Error("This looks like a binary Excel file. Save it as CSV or tab-delimited XLS, then import again.");
  }

  const firstLine = trimmed.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = firstLine.includes("\t") ? "\t" : ",";
  return parseDelimitedText(text, delimiter);
}

function resolveZipPath(fromPath: string, targetPath: string) {
  if (targetPath.startsWith("/")) {
    return targetPath.replace(/^\/+/, "");
  }

  const parts = fromPath.split("/");
  parts.pop();

  for (const part of targetPath.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      parts.pop();
    } else {
      parts.push(part);
    }
  }

  return parts.join("/");
}

function getRelationshipTargets(xml: string) {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  const relationships = Array.from(document.getElementsByTagName("*")).filter(
    (element) => element.localName === "Relationship",
  );
  return new Map(
    relationships.map((relationship) => [
      relationship.getAttribute("Id") ?? "",
      relationship.getAttribute("Target") ?? "",
    ]),
  );
}

function getWorksheetDrawingPath(zip: JSZip, sheetPath: string) {
  const sheetXml = zip.file(sheetPath);
  if (!sheetXml) return null;
  return sheetXml.async("text").then(async (xml) => {
    const document = new DOMParser().parseFromString(xml, "application/xml");
    const drawing = Array.from(document.getElementsByTagName("*")).find((element) => element.localName === "drawing");
    const drawingRelationshipId = drawing?.getAttribute("r:id");
    if (!drawingRelationshipId) return null;

    const sheetName = sheetPath.split("/").pop();
    const sheetRelsPath = sheetPath.replace(`/${sheetName}`, `/_rels/${sheetName}.rels`);
    const sheetRelsXml = await zip.file(sheetRelsPath)?.async("text");
    if (!sheetRelsXml) return null;

    const drawingTarget = getRelationshipTargets(sheetRelsXml).get(drawingRelationshipId);
    return drawingTarget ? resolveZipPath(sheetPath, drawingTarget) : null;
  });
}

async function extractEmbeddedImagesByRow(file: File, rows: string[][]) {
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    return new Map<number, File>();
  }

  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const mediaPaths = Object.keys(zip.files)
    .filter((path) => /^xl\/media\/image\d+\.(png|jpe?g|webp|gif)$/i.test(path))
    .sort((first, second) => {
      const firstNumber = Number(first.match(/image(\d+)/i)?.[1] ?? 0);
      const secondNumber = Number(second.match(/image(\d+)/i)?.[1] ?? 0);
      return firstNumber - secondNumber;
    });

  const createImageFile = async (mediaPath: string, fallbackIndex: number) => {
    const mediaFile = zip.file(mediaPath);
    if (!mediaFile) return null;

    const bytes = await mediaFile.async("arraybuffer");
    const filename = mediaPath.split("/").pop() ?? `template-image-${fallbackIndex}.png`;
    const mimeType = filename.toLowerCase().endsWith(".jpg") || filename.toLowerCase().endsWith(".jpeg")
      ? "image/jpeg"
      : filename.toLowerCase().endsWith(".webp")
        ? "image/webp"
        : filename.toLowerCase().endsWith(".gif")
          ? "image/gif"
          : "image/png";

    return new File([bytes], filename, { type: mimeType });
  };

  const headerRow = rows[0] ?? [];
  const displayImageColumnIndex = headerRow.findIndex((header) => normalizeHeader(header) === normalizeHeader("displayImageUrl"));
  const localReferenceImages = new Map<number, File>();

  if (displayImageColumnIndex >= 0 && mediaPaths.length > 0) {
    for (const [index, row] of rows.slice(1).entries()) {
      const displayImageValue = row[displayImageColumnIndex]?.trim() ?? "";
      const localReferenceNumber = Number(displayImageValue.match(/^local_ref:\/\/image_(\d+)\./i)?.[1]);
      if (!Number.isFinite(localReferenceNumber)) continue;

      const mediaPath = mediaPaths[localReferenceNumber];
      if (!mediaPath) continue;

      const imageFile = await createImageFile(mediaPath, index + 1);
      if (imageFile) {
        localReferenceImages.set(index + 1, imageFile);
      }
    }
  }

  if (localReferenceImages.size > 0) {
    console.info("[template-manager] extractEmbeddedImagesByRow:localRefs", {
      localReferenceImages: localReferenceImages.size,
      mediaFiles: mediaPaths.length,
    });
    return localReferenceImages;
  }

  const workbookXml = await zip.file("xl/workbook.xml")?.async("text");
  const workbookRelsXml = await zip.file("xl/_rels/workbook.xml.rels")?.async("text");
  if (!workbookXml || !workbookRelsXml) {
    return new Map<number, File>();
  }

  const workbook = new DOMParser().parseFromString(workbookXml, "application/xml");
  const firstSheet = Array.from(workbook.getElementsByTagName("*")).find((element) => element.localName === "sheet");
  const firstSheetRelationshipId = firstSheet?.getAttribute("r:id");
  if (!firstSheetRelationshipId) {
    return new Map<number, File>();
  }

  const sheetTarget = getRelationshipTargets(workbookRelsXml).get(firstSheetRelationshipId);
  if (!sheetTarget) {
    return new Map<number, File>();
  }

  const sheetPath = resolveZipPath("xl/workbook.xml", sheetTarget);
  const drawingPath = await getWorksheetDrawingPath(zip, sheetPath);
  if (!drawingPath) {
    return new Map<number, File>();
  }

  const drawingXml = await zip.file(drawingPath)?.async("text");
  const drawingRelsXml = await zip
    .file(drawingPath.replace("/drawings/", "/drawings/_rels/") + ".rels")
    ?.async("text");
  if (!drawingXml || !drawingRelsXml) {
    return new Map<number, File>();
  }

  const mediaTargets = getRelationshipTargets(drawingRelsXml);
  const drawing = new DOMParser().parseFromString(drawingXml, "application/xml");
  const anchors = Array.from(drawing.getElementsByTagName("*")).filter(
    (element) => element.localName === "twoCellAnchor" || element.localName === "oneCellAnchor",
  );
  const images = new Map<number, File>();
  const allImages: { rowNumber: number; columnNumber: number; file: File }[] = [];

  for (const anchor of anchors) {
    const anchorElements = Array.from(anchor.getElementsByTagName("*"));
    const from = anchorElements.find((element) => element.localName === "from");
    const fromElements = from ? Array.from(from.getElementsByTagName("*")) : [];
    const rowNumber = Number(fromElements.find((element) => element.localName === "row")?.textContent);
    const columnNumber = Number(fromElements.find((element) => element.localName === "col")?.textContent);
    const blip = anchorElements.find((element) => element.localName === "blip");
    const embedId = blip?.getAttribute("r:embed");
    const mediaTarget = embedId ? mediaTargets.get(embedId) : undefined;

    if (!Number.isFinite(rowNumber) || !mediaTarget) continue;

    const mediaPath = resolveZipPath(drawingPath, mediaTarget);
    const imageFile = await createImageFile(mediaPath, rowNumber);
    if (!imageFile) continue;
    allImages.push({
      rowNumber,
      columnNumber: Number.isFinite(columnNumber) ? columnNumber : -1,
      file: imageFile,
    });

    if (displayImageColumnIndex < 0 || columnNumber === displayImageColumnIndex) {
      images.set(rowNumber, imageFile);
    }
  }

  if (images.size === 0 && allImages.length > 0) {
    allImages
      .sort((first, second) => first.rowNumber - second.rowNumber || first.columnNumber - second.columnNumber)
      .forEach((image, index) => {
        images.set(index + 1, image.file);
      });
  }

  return images;
}

async function parseSpreadsheetFile(file: File): Promise<ParsedSpreadsheet> {
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension === "csv" || extension === "tsv" || extension === "txt") {
    return { rows: parseSpreadsheetText(await file.text()), embeddedImagesByRow: new Map() };
  }

  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const firstSheetName = workbook.SheetNames[0];
  const firstSheet = firstSheetName ? workbook.Sheets[firstSheetName] : undefined;

  if (!firstSheet) {
    throw new Error("The selected spreadsheet does not contain a sheet.");
  }

  const rows = XLSX.utils
    .sheet_to_json<string[]>(firstSheet, { header: 1, raw: false, defval: "" })
    .map((row) => row.map((cell) => String(cell).trim()))
    .filter((row) => row.some(Boolean));

  return { rows, embeddedImagesByRow: await extractEmbeddedImagesByRow(file, rows) };
}

function isRemoteImageSource(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function mapImportRows(rows: string[][], embeddedImagesByRow = new Map<number, File>()): ParsedTemplateImportRow[] {
  const [headerRow, ...dataRows] = rows;
  if (!headerRow) {
    throw new Error("The file must include a header row.");
  }

  const headerMap = new Map(headerRow.map((header, index) => [normalizeHeader(header), index]));
  const missingColumns = importColumns.filter((column) => !headerMap.has(normalizeHeader(column)));
  if (missingColumns.length > 0) {
    throw new Error(`Missing columns: ${missingColumns.join(", ")}.`);
  }

  return dataRows.map((row, index) => {
    const getValue = (column: (typeof importColumns)[number]) => row[headerMap.get(normalizeHeader(column)) ?? -1]?.trim() ?? "";
    const category = getValue("category") as TemplateImportRow["category"];
    const visibility = getValue("visibility") as TemplateImportRow["visibility"];
    const creditsRequired = Number(getValue("creditsRequired"));
    const sortOrder = Number(getValue("sortOrder") || 0);
    const prompt = getValue("prompt");
    const displayImageUrl = getValue("displayImageUrl");
    const displayImageFile = embeddedImagesByRow.get(index + 1);

    if (!categoryValues.includes(category)) {
      throw new Error(`Row ${index + 2}: category must be Studio, Lifestyle, Seasonal, or Brand.`);
    }
    if (!visibilityValues.includes(visibility)) {
      throw new Error(`Row ${index + 2}: visibility must be public or hidden.`);
    }
    if (!Number.isFinite(creditsRequired) || creditsRequired < 1 || creditsRequired > 100) {
      throw new Error(`Row ${index + 2}: creditsRequired must be a number from 1 to 100.`);
    }
    if (!Number.isFinite(sortOrder)) {
      throw new Error(`Row ${index + 2}: sortOrder must be a number.`);
    }
    if (prompt.length < 10 || prompt.length > promptMaxLength) {
      throw new Error(`Row ${index + 2}: prompt must be between 10 and ${promptMaxLength} characters.`);
    }
    if (!displayImageFile && !isRemoteImageSource(displayImageUrl)) {
      throw new Error(`Row ${index + 2}: displayImageUrl must be a public image URL or an embedded XLSX image.`);
    }

    return {
      name: getValue("name"),
      badge: getValue("badge") || undefined,
      category,
      creditsRequired,
      description: getValue("description"),
      displayImageUrl,
      displayImageFile,
      prompt,
      sortOrder,
      visibility,
    };
  });
}

/* ── Login Portal ── */
function LoginPortal({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);

  const handleLogin = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!loginConfigured) {
      setLoginError("Portal credentials are not configured. Check .env.");
      return;
    }

    if (username === portalUsername && password === portalPassword) {
      onLogin();
      setLoginError(null);
      return;
    }

    setLoginError("Invalid username or password.");
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <div className="login-logo">✨</div>
          <h1>Template Studio</h1>
          <p className="login-subtitle">
            Secure management dashboard for your AI image-generation templates.
          </p>
        </div>

        <form className="editor-form" onSubmit={handleLogin}>
          <div className="form-group">
            <label>Username</label>
            <input
              required
              type="text"
              placeholder="Enter username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input
              required
              type="password"
              placeholder="Enter password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>

          {loginError ? <p className="status error">{loginError}</p> : null}
          {!loginConfigured ? (
            <p className="status error">
              Configure <code>PORTAL_USERNAME</code> and <code>PORTAL_PASSWORD</code> in <code>.env</code>.
            </p>
          ) : null}

          <button type="submit" className="btn-primary">
            Sign In to Portal
          </button>
        </form>
      </div>
    </div>
  );
}

/* ── Main Dashboard ── */
function TemplateManager({ onSignOut, hideNav }: { onSignOut: () => void; hideNav?: boolean }) {
  const [search, setSearch] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [bulkSelectedIds, setBulkSelectedIds] = useState<string[]>([]);
  const [bulkEditorOpen, setBulkEditorOpen] = useState(false);
  const [bulkDraft, setBulkDraft] = useState<BulkFormState>(emptyBulkDraft);
  const [draft, setDraft] = useState<TemplateFormState>(emptyTemplate);
  const [imageUploadFile, setImageUploadFile] = useState<File | null>(null);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const [bulkUploadFile, setBulkUploadFile] = useState<File | null>(null);
  const [bulkUploadStatus, setBulkUploadStatus] = useState<BulkUploadStatus>(null);
  const [busyAction, setBusyAction] = useState<
    "create" | "update" | "delete" | "bulkUpdate" | "bulkDelete" | "bulkCreate" | "imageUpload" | null
  >(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [templatesPageInfo, setTemplatesPageInfo] = useState<TemplatesPage["pageInfo"]>(emptyTemplatesPageInfo);
  const [templatesPageAfter, setTemplatesPageAfter] = useState<string | null>(null);
  const [templatesPageHistory, setTemplatesPageHistory] = useState<(string | null)[]>([]);
  const [fetching, setFetching] = useState<boolean>(true);
  const [error, setError] = useState<any>(null);

  /* Lightbox Modal state */
  const [previewTemplate, setPreviewTemplate] = useState<TemplateRecord | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  const fetchTemplates = async () => {
    setFetching(true);
    try {
      const data = await getTemplates({
        search: search.trim() || undefined,
        after: templatesPageAfter,
        first: templatesPageSize,
      });
      setTemplates(data.templates);
      setTemplatesPageInfo(data.pageInfo);
      setError(null);
    } catch (err: any) {
      setError(err);
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, [search, templatesPageAfter]);

  const selectedTemplate = useMemo(
    () => templates?.find((template) => template.id === selectedTemplateId) ?? null,
    [selectedTemplateId, templates],
  );

  const visibleTemplateIds = useMemo(() => templates.map((template) => template.id), [templates]);
  const selectedVisibleCount = useMemo(
    () => bulkSelectedIds.filter((id) => visibleTemplateIds.includes(id)).length,
    [bulkSelectedIds, visibleTemplateIds],
  );
  const hasBulkSelection = bulkSelectedIds.length > 0;
  const allVisibleSelected = visibleTemplateIds.length > 0 && selectedVisibleCount === visibleTemplateIds.length;

  useEffect(() => {
    if (selectedTemplate) {
      setDraft(toDraft(selectedTemplate));
      setImageUploadFile(null);
      setImageUploadError(null);
      return;
    }
    if (!selectedTemplateId) {
      setDraft(emptyTemplate);
      setImageUploadFile(null);
      setImageUploadError(null);
    }
  }, [selectedTemplate, selectedTemplateId]);

  const handleFieldChange = <Key extends keyof TemplateFormState>(key: Key, value: TemplateFormState[Key]) => {
    setDraft((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const handleBulkFieldChange = <Key extends keyof BulkFormState>(key: Key, value: BulkFormState[Key]) => {
    setBulkDraft((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const toggleBulkSelected = (templateId: string) => {
    setBulkSelectedIds((current) =>
      current.includes(templateId)
        ? current.filter((id) => id !== templateId)
        : [...current, templateId],
    );
  };

  const selectAllVisible = () => {
    setBulkSelectedIds((current) => Array.from(new Set([...current, ...visibleTemplateIds])));
  };

  const goToNextTemplatesPage = () => {
    if (!templatesPageInfo.hasNextPage || !templatesPageInfo.endCursor) return;
    setTemplatesPageHistory((current) => [...current, templatesPageAfter]);
    setTemplatesPageAfter(templatesPageInfo.endCursor);
  };

  const goToPreviousTemplatesPage = () => {
    const previousAfter = templatesPageHistory[templatesPageHistory.length - 1] ?? null;
    setTemplatesPageHistory((current) => current.slice(0, -1));
    setTemplatesPageAfter(previousAfter);
  };

  const clearBulkSelection = () => {
    setBulkSelectedIds([]);
    setBulkEditorOpen(false);
  };

  const isEditing = Boolean(selectedTemplateId);
  const isSaving = busyAction === "create" || busyAction === "update";
  const isUploadingImage = busyAction === "imageUpload";
  const isBulkCreating = busyAction === "bulkCreate";

  const shouldUploadImageUrl = (url: string) => {
    return Boolean(url.trim()) && !/cdn\.shopify\.com|shopifycdn\.net|myshopify\.com\/cdn/i.test(url);
  };

  const uploadDraftImageToShopify = async () => {
    const imageUrl = draft.displayImageUrl.trim();
    if (!imageUploadFile && !shouldUploadImageUrl(imageUrl)) {
      return imageUrl;
    }

    const formData = new FormData();
    if (imageUploadFile) {
      formData.append("imageFile", imageUploadFile);
    } else {
      formData.append("imageUrl", imageUrl);
    }

    setBusyAction("imageUpload");
    setImageUploadError(null);

    try {
      const result = await uploadTemplateImageToShopify(formData);
      setImageUploadFile(null);
      setDraft((current) => ({ ...current, displayImageUrl: result.url }));
      return result.url;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setImageUploadError(message);
      throw error;
    } finally {
      setBusyAction(null);
    }
  };

  const handleManualImageUpload = async () => {
    try {
      await uploadDraftImageToShopify();
    } catch {
      // The inline status message is set above.
    }
  };

  const submitTemplate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setActionError(null);
    setImageUploadError(null);
    console.info("[template-manager] submitTemplate:start", {
      mode: isEditing ? "update" : "create",
      selectedTemplateId,
      hasImageUploadFile: Boolean(imageUploadFile),
      hasDisplayImageUrl: Boolean(draft.displayImageUrl.trim()),
    });

    let shopifyDisplayImageUrl = draft.displayImageUrl.trim();

    try {
      shopifyDisplayImageUrl = await uploadDraftImageToShopify();
    } catch (error) {
      console.error("[template-manager] submitTemplate:imageUploadFailed", error);
      setActionError(error instanceof Error ? error.message : String(error));
      return;
    }

    const payload = {
      ...draft,
      displayImageUrl: shopifyDisplayImageUrl,
      prompt: draft.prompt.trim(),
      name: draft.name.trim(),
      description: draft.description.trim(),
      badge: draft.badge?.trim() || undefined,
      creditsRequired: Number(draft.creditsRequired),
      sortOrder: Number(draft.sortOrder),
    };

    try {
      if (isEditing && selectedTemplateId) {
        setBusyAction("update");
        console.info("[template-manager] submitTemplate:update:start", { selectedTemplateId });
        await updateTemplate(selectedTemplateId, payload);
        await fetchTemplates();
        console.info("[template-manager] submitTemplate:update:success", { selectedTemplateId });
        return;
      }

      setBusyAction("create");
      console.info("[template-manager] submitTemplate:create:start", { name: payload.name });
      const created = await createTemplate(payload);
      const createdId = created?.id;

      if (createdId) {
        setSelectedTemplateId(createdId);
      }
      await fetchTemplates();
      console.info("[template-manager] submitTemplate:create:success", { createdId });
    } catch (error) {
      console.error("[template-manager] submitTemplate:failed", error);
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyAction(null);
    }
  };

  const handleDelete = async (templateId: string) => {
    const confirmed = window.confirm("Delete this template? This cannot be undone.");
    if (!confirmed) return;

    setActionError(null);

    try {
      setBusyAction("delete");
      await deleteTemplate(templateId);

      if (selectedTemplateId === templateId) {
        setSelectedTemplateId(null);
        setDraft(emptyTemplate);
      }
      await fetchTemplates();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyAction(null);
    }
  };

  const handleBulkUpdate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setActionError(null);
    console.info("[template-manager] handleBulkUpdate:start", { selectedCount: bulkSelectedIds.length });

    const payload: Partial<TemplateRecord> = {};

    if (bulkDraft.updateName) {
      payload.name = bulkDraft.name.trim();
    }
    if (bulkDraft.updateCategory) {
      payload.category = bulkDraft.category;
    }
    if (bulkDraft.updateVisibility) {
      payload.visibility = bulkDraft.visibility;
    }
    if (bulkDraft.updateCreditsRequired) {
      payload.creditsRequired = Number(bulkDraft.creditsRequired);
    }
    if (bulkDraft.updateSortOrder) {
      payload.sortOrder = Number(bulkDraft.sortOrder);
    }
    if (bulkDraft.updateBadge) {
      payload.badge = bulkDraft.badge.trim() || undefined;
    }
    if (bulkDraft.updateDisplayImageUrl) {
      payload.displayImageUrl = bulkDraft.displayImageUrl.trim();
    }
    if (bulkDraft.updateDescription) {
      payload.description = bulkDraft.description.trim();
    }
    if (bulkDraft.updatePrompt) {
      payload.prompt = bulkDraft.prompt.trim();
    }

    if (Object.keys(payload).length === 0) {
      setActionError("Choose at least one bulk field to update.");
      return;
    }

    const confirmed = window.confirm(`Apply these changes to ${bulkSelectedIds.length} selected templates?`);
    if (!confirmed) return;

    try {
      setBusyAction("bulkUpdate");
      console.info("[template-manager] handleBulkUpdate:serverAction:start", {
        selectedCount: bulkSelectedIds.length,
        fields: Object.keys(payload),
      });
      await bulkUpdateTemplates(bulkSelectedIds, payload);
      await fetchTemplates();
      setBulkEditorOpen(false);
      setBulkDraft(emptyBulkDraft);
      console.info("[template-manager] handleBulkUpdate:success", { selectedCount: bulkSelectedIds.length });
    } catch (error) {
      console.error("[template-manager] handleBulkUpdate:failed", error);
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyAction(null);
    }
  };

  const handleBulkDelete = async () => {
    const confirmed = window.confirm(`Delete ${bulkSelectedIds.length} selected templates? This cannot be undone.`);
    if (!confirmed) return;

    setActionError(null);

    try {
      setBusyAction("bulkDelete");
      await bulkDeleteTemplates(bulkSelectedIds);
      if (selectedTemplateId && bulkSelectedIds.includes(selectedTemplateId)) {
        setSelectedTemplateId(null);
        setDraft(emptyTemplate);
      }
      await fetchTemplates();
      clearBulkSelection();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyAction(null);
    }
  };

  const uploadEmbeddedImageWithRetry = async (rowNumber: number, imageFile: File) => {
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const imageFormData = new FormData();
        imageFormData.append("imageFile", imageFile);
        return await uploadTemplateImageToShopify(imageFormData);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn("[template-manager] handleBulkCreateUpload:embeddedImageUpload:retry", {
          rowNumber,
          filename: imageFile.name,
          attempt,
          maxAttempts,
          error: message,
        });

        if (attempt === maxAttempts) {
          throw new Error(`Row ${rowNumber}: image upload failed after ${maxAttempts} attempts. ${message}`);
        }

        await wait(attempt * 2000);
      }
    }

    throw new Error(`Row ${rowNumber}: image upload failed.`);
  };

  const handleBulkCreateUpload = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setActionError(null);
    setBulkUploadStatus(null);
    console.info("[template-manager] handleBulkCreateUpload:start", {
      filename: bulkUploadFile?.name,
      size: bulkUploadFile?.size,
    });

    if (!bulkUploadFile) {
      setActionError("Choose a CSV or XLS file to import.");
      return;
    }

    setBusyAction("bulkCreate");

    try {
      const spreadsheet = await parseSpreadsheetFile(bulkUploadFile);
      const rows = mapImportRows(spreadsheet.rows, spreadsheet.embeddedImagesByRow);
      console.info("[template-manager] handleBulkCreateUpload:parsed", {
        rowCount: rows.length,
        embeddedImageCount: spreadsheet.embeddedImagesByRow.size,
      });

      if (rows.length === 0) {
        setActionError("Add at least one template row below the header.");
        return;
      }

      const confirmed = window.confirm(
        `Import ${rows.length} templates? Each displayImageUrl will be uploaded to Shopify before creating the template.`,
      );
      if (!confirmed) return;

      const rowsWithShopifyImages: TemplateImportRow[] = [];
      for (const [index, row] of rows.entries()) {
        const rowNumber = index + 2;

        if (!row.displayImageFile) {
          rowsWithShopifyImages.push(row);
          continue;
        }

        console.info("[template-manager] handleBulkCreateUpload:embeddedImageUpload:start", {
          rowNumber,
          filename: row.displayImageFile.name,
          size: row.displayImageFile.size,
        });

        if (row.displayImageFile.size > maxEmbeddedImageUploadBytes) {
          throw new Error(
            `Row ${rowNumber}: embedded image is too large. Compress it below 19 MB before importing.`,
          );
        }

        const uploadedImage = await uploadEmbeddedImageWithRetry(rowNumber, row.displayImageFile);
        const { displayImageFile, ...rowWithoutFile } = row;
        rowsWithShopifyImages.push({
          ...rowWithoutFile,
          displayImageUrl: uploadedImage.url,
        });

        console.info("[template-manager] handleBulkCreateUpload:embeddedImageUpload:success", {
          rowNumber,
        });

        await wait(400);
      }

      console.info("[template-manager] handleBulkCreateUpload:serverAction:start", { rowCount: rows.length });
      const result = await bulkCreateTemplates(rowsWithShopifyImages);
      setBulkUploadStatus(result);
      await fetchTemplates();
      console.info("[template-manager] handleBulkCreateUpload:serverAction:complete", {
        created: result.created.length,
        failed: result.failed.length,
      });

      if (result.failed.length === 0) {
        setBulkUploadFile(null);
      }
    } catch (error) {
      console.error("[template-manager] handleBulkCreateUpload:failed", error);
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyAction(null);
    }
  };

  const handleCopyPrompt = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy text", err);
    }
  };

  const categoryClass = (cat: string) => {
    const map: Record<string, string> = {
      Studio: "cat-studio",
      Lifestyle: "cat-lifestyle",
      Seasonal: "cat-seasonal",
      Brand: "cat-brand",
    };
    return map[cat] ?? "";
  };

  return (
    <>
      <div className="shell">
        {/* ── Hero ── */}
        <section className="hero">
          <span className="hero-eyebrow">Realtime Synced</span>
          <h1>Manage your generation styles.</h1>
          <p className="hero-tagline">
            Compose, configure, and instantly test template prompts against your
            Gadget server database. Click template images to preview generation data.
          </p>

          <div className="hero-stats">
            <article className="hero-stat">
              <span className="hero-stat-label">Visible Styles</span>
              <span className="hero-stat-value">{templates?.length ?? 0}</span>
            </article>
            <article className="hero-stat">
              <span className="hero-stat-label">Composer Mode</span>
              <span className="hero-stat-value">{isEditing ? "Edit" : "New"}</span>
            </article>
          </div>
        </section>

        {/* ── Toolbar ── */}
        <div className="toolbar">
          <div className="toolbar-inner">
            <div className="search-wrapper">
              <span className="search-icon">🔍</span>
              <input
                className="search-input"
                type="search"
                placeholder="Search styles by name, description, or prompt..."
                value={search}
                onChange={(event) => {
                  setTemplatesPageAfter(null);
                  setTemplatesPageHistory([]);
                  setSearch(event.target.value);
                }}
              />
            </div>

            <button
              type="button"
              className="btn-pearl"
              onClick={() => {
                setSelectedTemplateId(null);
                setDraft(emptyTemplate);
              }}
            >
              Clear / Create New
            </button>

            <button
              type="button"
              className="btn-pearl"
              onClick={allVisibleSelected ? clearBulkSelection : selectAllVisible}
              disabled={templates.length === 0}
            >
              {allVisibleSelected ? "Clear Selection" : "Select All Visible"}
            </button>
          </div>
        </div>

        {/* ── Workspace ── */}
        <div className="workspace-area">
          <div className="workspace">
            {/* Editor Panel */}
            <aside className="editor-panel">
              <div className="editor-header">
                <div>
                  <p className="editor-label">Designer Tool</p>
                  <h2>{isEditing ? selectedTemplate?.name ?? "Edit Style" : "New Style"}</h2>
                </div>
                {isEditing && selectedTemplateId && (
                  <button
                    type="button"
                    className="text-link"
                    style={{ color: "#d32f2f" }}
                    onClick={() => void handleDelete(selectedTemplateId)}
                  >
                    Delete
                  </button>
                )}
              </div>

              <form className="editor-form" onSubmit={submitTemplate}>
                <div className="form-group">
                  <label>
                    Style Name <span className="required">*</span>
                  </label>
                  <input
                    required
                    type="text"
                    value={draft.name}
                    onChange={(event) => handleFieldChange("name", event.target.value)}
                    placeholder="e.g. Neon Cyberpunk Portrait"
                  />
                </div>

                <div className="form-group">
                  <label>Feature Badge</label>
                  <input
                    type="text"
                    value={draft.badge}
                    onChange={(event) => handleFieldChange("badge", event.target.value)}
                    placeholder="e.g. Trending, Hot, V2"
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Category</label>
                    <select
                      value={draft.category}
                      onChange={(event) =>
                        handleFieldChange("category", event.target.value as TemplateFormState["category"])
                      }
                    >
                      <option value="Studio">Studio</option>
                      <option value="Lifestyle">Lifestyle</option>
                      <option value="Seasonal">Seasonal</option>
                      <option value="Brand">Brand</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Visibility</label>
                    <select
                      value={draft.visibility}
                      onChange={(event) =>
                        handleFieldChange("visibility", event.target.value as TemplateFormState["visibility"])
                      }
                    >
                      <option value="hidden">Hidden</option>
                      <option value="public">Public</option>
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Credits Required</label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={draft.creditsRequired}
                      onChange={(event) => handleFieldChange("creditsRequired", Number(event.target.value))}
                    />
                  </div>

                  <div className="form-group">
                    <label>Sort Order</label>
                    <input
                      type="number"
                      value={draft.sortOrder}
                      onChange={(event) => handleFieldChange("sortOrder", Number(event.target.value))}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>
                    Display Image URL <span className="required">*</span>
                  </label>
                  <input
                    type="url"
                    required={!imageUploadFile}
                    value={draft.displayImageUrl}
                    onChange={(event) => {
                      handleFieldChange("displayImageUrl", event.target.value);
                      setImageUploadError(null);
                    }}
                    placeholder="https://images.unsplash.com/..."
                  />
                  <div className="image-upload-box">
                    <label className="file-upload-control">
                      <span className="file-upload-label">Upload from system</span>
                      <span className="file-upload-name">{imageUploadFile?.name ?? "No file selected"}</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(event) => {
                          setImageUploadFile(event.target.files?.[0] ?? null);
                          setImageUploadError(null);
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      className="btn-shopify-upload"
                      onClick={() => void handleManualImageUpload()}
                      disabled={isUploadingImage || (!imageUploadFile && !shouldUploadImageUrl(draft.displayImageUrl))}
                    >
                      {isUploadingImage ? "Uploading..." : "Upload"}
                    </button>
                  </div>
                  {draft.displayImageUrl && !shouldUploadImageUrl(draft.displayImageUrl) ? (
                    <p className="image-upload-note">Using Shopify CDN image.</p>
                  ) : null}
                  {imageUploadError ? <p className="status error">{imageUploadError}</p> : null}
                </div>

                <div className="form-group">
                  <label>
                    Description <span className="required">*</span>
                  </label>
                  <textarea
                    required
                    rows={3}
                    value={draft.description}
                    onChange={(event) => handleFieldChange("description", event.target.value)}
                    placeholder="Explain what visual aspects this template generates..."
                  />
                </div>

                <div className="form-group">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <label style={{ marginBottom: 0 }}>
                      Generation Prompt <span className="required">*</span>
                    </label>
                    <span className={`char-counter ${draft.prompt.length > promptMaxLength ? "over" : ""}`}>
                      {draft.prompt.length} / {promptMaxLength}
                    </span>
                  </div>
                  <textarea
                    required
                    rows={6}
                    value={draft.prompt}
                    onChange={(event) => handleFieldChange("prompt", event.target.value)}
                    placeholder="Model prompt containing variables, e.g. 'A stunning dynamic portrait of [subject] in cyberpunk style, high-end photography...'"
                  />
                </div>

                {actionError && <p className="status error">{actionError}</p>}

                <div className="form-actions">
                  <button type="submit" className="btn-primary" disabled={isSaving}>
                    {isSaving ? "Saving changes..." : isEditing ? "Save Style" : "Add to Library"}
                  </button>

                  {isEditing && (
                    <button
                      type="button"
                      className="btn-secondary-pill"
                      onClick={() => {
                        setSelectedTemplateId(null);
                        setDraft(emptyTemplate);
                      }}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>
            </aside>

            {/* Template Grid */}
            <section className="inventory-panel">
              <div className="list-panel-header">
                <h2>Styles Inventory</h2>
                <div className="list-panel-actions">
                  <label className="select-all-control">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      disabled={templates.length === 0}
                      onChange={(event) => {
                        if (event.target.checked) {
                          selectAllVisible();
                        } else {
                          clearBulkSelection();
                        }
                      }}
                    />
                    <span>Select all</span>
                  </label>
                  <span className="record-count">
                    {fetching ? "Syncing..." : `${templates?.length ?? 0} Styles`}
                  </span>
                </div>
              </div>

              <form className="bulk-upload-panel" onSubmit={handleBulkCreateUpload}>
                <div>
                  <p className="editor-label">Bulk Upload</p>
                  <h3>Import templates from CSV, XLS, or XLSX</h3>
                  <p className="bulk-upload-help">
                    Use columns: {importColumns.join(", ")}. Public image URLs or embedded XLSX images are uploaded to Shopify first.
                  </p>
                </div>
                <div className="bulk-upload-controls">
                  <label className="file-upload-control">
                    <span className="file-upload-label">Choose file</span>
                    <span className="file-upload-name">{bulkUploadFile?.name ?? "CSV, XLS, or XLSX"}</span>
                    <input
                      type="file"
                      accept=".csv,.tsv,.txt,.xls,.xlsx,text/csv,text/tab-separated-values,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      onChange={(event) => {
                        setBulkUploadFile(event.target.files?.[0] ?? null);
                        setBulkUploadStatus(null);
                        setActionError(null);
                      }}
                    />
                  </label>
                  <button
                    type="submit"
                    className={`btn-primary ${isBulkCreating ? "is-loading" : ""}`}
                    disabled={isBulkCreating || !bulkUploadFile}
                    aria-busy={isBulkCreating}
                  >
                    {isBulkCreating ? "Importing..." : "Import"}
                  </button>
                </div>
                {bulkUploadStatus ? (
                  <div className="bulk-upload-results">
                    <p className="status success">
                      Created {bulkUploadStatus.created.length} templates. Failed {bulkUploadStatus.failed.length}.
                    </p>
                    {bulkUploadStatus.failed.length > 0 ? (
                      <ul className="bulk-upload-failures">
                        {bulkUploadStatus.failed.map((failure) => (
                          <li key={`${failure.rowNumber}-${failure.name ?? "row"}`}>
                            Row {failure.rowNumber}
                            {failure.name ? ` (${failure.name})` : ""}: {failure.error}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
                {actionError ? <p className="status error bulk-upload-results">{actionError}</p> : null}
              </form>

              {hasBulkSelection && (
                <div className="bulk-action-bar">
                  <div>
                    <strong>{bulkSelectedIds.length}</strong> selected
                  </div>
                  <div className="bulk-action-buttons">
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => setBulkEditorOpen(true)}
                      disabled={busyAction === "bulkUpdate"}
                    >
                      Bulk Edit
                    </button>
                    <button
                      type="button"
                      className="btn-pearl danger"
                      onClick={() => void handleBulkDelete()}
                      disabled={busyAction === "bulkDelete"}
                    >
                      {busyAction === "bulkDelete" ? "Deleting..." : "Delete Selected"}
                    </button>
                    <button type="button" className="text-link" onClick={clearBulkSelection}>
                      Clear
                    </button>
                  </div>
                </div>
              )}

              {error && (
                <div className="status error" style={{ marginBottom: "20px" }}>
                  {error.message}
                </div>
              )}

              <div className="template-grid">
                {templates?.map((template) => {
                  const selected = template.id === selectedTemplateId;
                  const bulkSelected = bulkSelectedIds.includes(template.id);

                  return (
                    <article
                      key={template.id}
                      className={`template-card ${selected ? "selected" : ""} ${bulkSelected ? "bulk-selected" : ""}`}
                    >
                      <label className="bulk-select-control">
                        <input
                          type="checkbox"
                          checked={bulkSelected}
                          onChange={() => toggleBulkSelected(template.id)}
                        />
                        <span>Select</span>
                      </label>

                      <button
                        type="button"
                        className="card-image-wrapper"
                        onClick={() => setPreviewTemplate(template)}
                        style={{ width: "100%", border: "none", padding: 0 }}
                      >
                        <img src={template.displayImageUrl} alt={template.name} />
                        <div className="card-image-overlay">Quick View</div>
                      </button>

                      <div className="card-body">
                        <div className="card-topline">
                          <span className={`card-category ${categoryClass(template.category)}`}>
                            {template.category}
                          </span>
                          <span className={`card-vis-tag ${template.visibility}`}>
                            {template.visibility}
                          </span>
                        </div>

                        <h3>{template.name}</h3>
                        <p className="card-description">{template.description}</p>

                        <div className="card-meta">
                          <span className="meta-credits">{template.creditsRequired} Credits</span>
                          <span>Index #{template.sortOrder}</span>
                          {template.badge ? <span className="meta-badge">{template.badge}</span> : null}
                        </div>

                        <div className="card-actions">
                          <button
                            type="button"
                            className="btn-pearl"
                            onClick={() => {
                              setSelectedTemplateId(template.id);
                              setDraft(toDraft(template));
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn-pearl"
                            onClick={() => void handleDelete(template.id)}
                            style={{ color: "#d32f2f" }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>

              {(templatesPageHistory.length > 0 || templatesPageInfo.hasNextPage) && (
                <div className="pagination-bar">
                  <button
                    type="button"
                    className="btn-pearl"
                    onClick={goToPreviousTemplatesPage}
                    disabled={fetching || templatesPageHistory.length === 0}
                  >
                    Previous
                  </button>
                  <span className="pagination-status">
                    Page {templatesPageHistory.length + 1} · {templates.length} shown
                  </span>
                  <button
                    type="button"
                    className="btn-pearl"
                    onClick={goToNextTemplatesPage}
                    disabled={fetching || !templatesPageInfo.hasNextPage}
                  >
                    Next
                  </button>
                </div>
              )}

              {!fetching && templates?.length === 0 && (
                <div className="empty-state">
                  <h3>Empty library</h3>
                  <p>No templates match your filter. Use the Composer to create one.</p>
                </div>
              )}
            </section>
          </div>
        </div>

        {/* ── Footer ── */}
        <footer className="app-footer">
          <div className="footer-inner">
            <p>Template Studio &mdash; AI Image Generation Management</p>
            <p>Connected to Gadget API &middot; Data synced in realtime</p>
          </div>
        </footer>
      </div>

      {/* ── Lightbox Modal ── */}
      {bulkEditorOpen && (
        <div className="modal-overlay" onClick={() => setBulkEditorOpen(false)}>
          <div className="modal-content bulk-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setBulkEditorOpen(false)} aria-label="Close bulk editor">
              x
            </button>

            <form className="bulk-edit-form" onSubmit={handleBulkUpdate}>
              <div className="bulk-modal-header">
                <div>
                  <p className="editor-label">Bulk Editor</p>
                  <h2>Edit selected styles</h2>
                </div>
                <span className="bulk-selected-pill">{bulkSelectedIds.length} selected</span>
              </div>

              <div className="bulk-modal-body">
                <section className="bulk-section">
                  <h3>Basics</h3>
                  <div className="bulk-field-grid">
                    <div className="bulk-field">
                      <label className="bulk-toggle">
                        <input
                          type="checkbox"
                          checked={bulkDraft.updateName}
                          onChange={(event) => handleBulkFieldChange("updateName", event.target.checked)}
                        />
                        <span>Style name</span>
                      </label>
                      <input
                        type="text"
                        value={bulkDraft.name}
                        disabled={!bulkDraft.updateName}
                        placeholder="Shared style name"
                        onChange={(event) => handleBulkFieldChange("name", event.target.value)}
                      />
                    </div>

                    <div className="bulk-field">
                      <label className="bulk-toggle">
                        <input
                          type="checkbox"
                          checked={bulkDraft.updateBadge}
                          onChange={(event) => handleBulkFieldChange("updateBadge", event.target.checked)}
                        />
                        <span>Feature badge</span>
                      </label>
                      <input
                        type="text"
                        value={bulkDraft.badge}
                        disabled={!bulkDraft.updateBadge}
                        placeholder="Leave blank to clear badges"
                        onChange={(event) => handleBulkFieldChange("badge", event.target.value)}
                      />
                    </div>

                    <div className="bulk-field">
                      <label className="bulk-toggle">
                        <input
                          type="checkbox"
                          checked={bulkDraft.updateCategory}
                          onChange={(event) => handleBulkFieldChange("updateCategory", event.target.checked)}
                        />
                        <span>Category</span>
                      </label>
                      <select
                        value={bulkDraft.category}
                        disabled={!bulkDraft.updateCategory}
                        onChange={(event) =>
                          handleBulkFieldChange("category", event.target.value as BulkFormState["category"])
                        }
                      >
                        <option value="Studio">Studio</option>
                        <option value="Lifestyle">Lifestyle</option>
                        <option value="Seasonal">Seasonal</option>
                        <option value="Brand">Brand</option>
                      </select>
                    </div>

                    <div className="bulk-field">
                      <label className="bulk-toggle">
                        <input
                          type="checkbox"
                          checked={bulkDraft.updateVisibility}
                          onChange={(event) => handleBulkFieldChange("updateVisibility", event.target.checked)}
                        />
                        <span>Visibility</span>
                      </label>
                      <select
                        value={bulkDraft.visibility}
                        disabled={!bulkDraft.updateVisibility}
                        onChange={(event) =>
                          handleBulkFieldChange("visibility", event.target.value as BulkFormState["visibility"])
                        }
                      >
                        <option value="hidden">Hidden</option>
                        <option value="public">Public</option>
                      </select>
                    </div>

                    <div className="bulk-field">
                      <label className="bulk-toggle">
                        <input
                          type="checkbox"
                          checked={bulkDraft.updateCreditsRequired}
                          onChange={(event) => handleBulkFieldChange("updateCreditsRequired", event.target.checked)}
                        />
                        <span>Credits required</span>
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={bulkDraft.creditsRequired}
                        disabled={!bulkDraft.updateCreditsRequired}
                        onChange={(event) => handleBulkFieldChange("creditsRequired", Number(event.target.value))}
                      />
                    </div>

                    <div className="bulk-field">
                      <label className="bulk-toggle">
                        <input
                          type="checkbox"
                          checked={bulkDraft.updateSortOrder}
                          onChange={(event) => handleBulkFieldChange("updateSortOrder", event.target.checked)}
                        />
                        <span>Sort order</span>
                      </label>
                      <input
                        type="number"
                        value={bulkDraft.sortOrder}
                        disabled={!bulkDraft.updateSortOrder}
                        onChange={(event) => handleBulkFieldChange("sortOrder", Number(event.target.value))}
                      />
                    </div>
                  </div>
                </section>

                <section className="bulk-section">
                  <h3>Content</h3>
                  <div className="bulk-field">
                    <label className="bulk-toggle">
                      <input
                        type="checkbox"
                        checked={bulkDraft.updateDisplayImageUrl}
                        onChange={(event) => handleBulkFieldChange("updateDisplayImageUrl", event.target.checked)}
                      />
                      <span>Display image URL</span>
                    </label>
                    <input
                      type="url"
                      value={bulkDraft.displayImageUrl}
                      disabled={!bulkDraft.updateDisplayImageUrl}
                      placeholder="https://images.unsplash.com/..."
                      onChange={(event) => handleBulkFieldChange("displayImageUrl", event.target.value)}
                    />
                  </div>

                  <div className="bulk-field">
                    <label className="bulk-toggle">
                      <input
                        type="checkbox"
                        checked={bulkDraft.updateDescription}
                        onChange={(event) => handleBulkFieldChange("updateDescription", event.target.checked)}
                      />
                      <span>Description</span>
                    </label>
                    <textarea
                      rows={3}
                      value={bulkDraft.description}
                      disabled={!bulkDraft.updateDescription}
                      placeholder="Shared template description"
                      onChange={(event) => handleBulkFieldChange("description", event.target.value)}
                    />
                  </div>

                  <div className="bulk-field">
                    <div className="bulk-field-heading">
                      <label className="bulk-toggle">
                        <input
                          type="checkbox"
                          checked={bulkDraft.updatePrompt}
                          onChange={(event) => handleBulkFieldChange("updatePrompt", event.target.checked)}
                        />
                        <span>Generation prompt</span>
                      </label>
                      <span className={`char-counter ${bulkDraft.prompt.length > promptMaxLength ? "over" : ""}`}>
                        {bulkDraft.prompt.length} / {promptMaxLength}
                      </span>
                    </div>
                    <textarea
                      rows={6}
                      value={bulkDraft.prompt}
                      disabled={!bulkDraft.updatePrompt}
                      placeholder="Shared prompt for all selected templates"
                      onChange={(event) => handleBulkFieldChange("prompt", event.target.value)}
                    />
                  </div>
                </section>
              </div>

              {actionError && <p className="status error">{actionError}</p>}

              <div className="bulk-modal-actions">
                <button type="submit" className="btn-primary" disabled={busyAction === "bulkUpdate"}>
                  {busyAction === "bulkUpdate" ? "Applying changes..." : "Apply Bulk Changes"}
                </button>
                <button type="button" className="btn-secondary-pill" onClick={() => setBulkEditorOpen(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {previewTemplate && (
        <div className="modal-overlay" onClick={() => setPreviewTemplate(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setPreviewTemplate(null)}>
              ✕
            </button>
            <div className="modal-grid">
              <div className="modal-image-wrapper">
                <img src={previewTemplate.displayImageUrl} alt={previewTemplate.name} />
              </div>
              <div className="modal-details">
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <span className={`card-category ${categoryClass(previewTemplate.category)}`}>
                    {previewTemplate.category}
                  </span>
                  {previewTemplate.badge && (
                    <span className="card-meta" style={{ fontSize: "11px" }}>
                      <span className="meta-badge">{previewTemplate.badge}</span>
                    </span>
                  )}
                </div>

                <h2>{previewTemplate.name}</h2>
                <p className="modal-description">{previewTemplate.description}</p>

                <div className="modal-stats-row">
                  <span>
                    Cost: <strong>{previewTemplate.creditsRequired} Credits</strong>
                  </span>
                  <span>
                    Priority: <strong>#{previewTemplate.sortOrder}</strong>
                  </span>
                  <span style={{ textTransform: "capitalize" }}>
                    Status: <strong>{previewTemplate.visibility}</strong>
                  </span>
                </div>

                <div>
                  <p className="modal-prompt-label">Generation Prompt</p>
                  <div className="modal-prompt-box">
                    <div className="modal-prompt-text">{previewTemplate.prompt}</div>
                    <button
                      className="btn-primary"
                      onClick={() => handleCopyPrompt(previewTemplate.prompt)}
                    >
                      {copied ? "Copied ✓" : "Copy Prompt"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ── Models Manager ── */
type ModelFormState = {
  name: string;
  gender: "Men" | "Women";
  category: string;
  thumbnailImageUrl: string;
  previewImages: string[];
  prompt: string;
};

type ModelBulkFormState = {
  updateCategory: boolean;
  category: string;
  updateGender: boolean;
  gender: "Men" | "Women";
  updatePrompt: boolean;
  prompt: string;
};

const emptyModel: ModelFormState = {
  name: "",
  gender: "Men",
  category: "",
  thumbnailImageUrl: "",
  previewImages: [],
  prompt: "",
};

const emptyModelBulkDraft: ModelBulkFormState = {
  updateCategory: false,
  category: "",
  updateGender: false,
  gender: "Men",
  updatePrompt: false,
  prompt: "",
};

function toModelDraft(record: Partial<ModelRecord>): ModelFormState {
  return {
    name: record.name ?? "",
    gender: (record.gender as ModelFormState["gender"]) ?? "Men",
    category: record.category ?? "",
    thumbnailImageUrl: record.thumbnailImage?.url ?? "",
    previewImages: Array.isArray(record.previewImages) ? record.previewImages : typeof record.previewImages === "string" ? (record.previewImages as string).split("\n").filter(Boolean) : [],
    prompt: record.prompt ?? "",
  };
}

function mapModelImportRows(rows: string[][]): ModelImportRow[] {
  const [headerRow, ...dataRows] = rows;
  if (!headerRow) throw new Error("The file must include a header row.");
  const h = new Map(headerRow.map((v, i) => [normalizeHeader(v), i]));
  const required = ["category", "thumbnailurl"];
  const missing = required.filter((c) => !h.has(c));
  if (missing.length) throw new Error(`Missing columns: ${missing.join(", ")}.`);
  return dataRows.map((row, index) => {
    const get = (key: string) => row[h.get(key) ?? -1]?.trim() ?? "";
    const previewImages = [
      get("preview1"), get("preview2"), get("preview3"),
    ].filter(Boolean);
    return {
      name: get("name") || undefined,
      category: get("category"),
      thumbnailUrl: get("thumbnailurl"),
      previewImages,
    };
  }).filter((r) => r.thumbnailUrl);
}

function ModelsManager() {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ModelFormState>(emptyModel);
  const [models, setModels] = useState<ModelRecord[]>([]);
  const [pageInfo, setPageInfo] = useState<ModelsPage["pageInfo"]>({
    hasNextPage: false, hasPreviousPage: false, startCursor: null, endCursor: null,
  });
  const [pageAfter, setPageAfter] = useState<string | null>(null);
  const [pageHistory, setPageHistory] = useState<(string | null)[]>([]);
  const [fetching, setFetching] = useState(true);
  const [fetchError, setFetchError] = useState<any>(null);
  const [busyAction, setBusyAction] = useState<"create" | "update" | "delete" | "bulkUpdate" | "bulkDelete" | "bulkCreate" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [thumbnailUploadFile, setThumbnailUploadFile] = useState<File | null>(null);
  const [thumbnailUploadError, setThumbnailUploadError] = useState<string | null>(null);
  const [isUploadingThumbnail, setIsUploadingThumbnail] = useState(false);
  const [previewModel, setPreviewModel] = useState<ModelRecord | null>(null);
  const [copied, setCopied] = useState(false);
  const [bulkSelectedIds, setBulkSelectedIds] = useState<string[]>([]);
  const [bulkEditorOpen, setBulkEditorOpen] = useState(false);
  const [bulkDraft, setBulkDraft] = useState<ModelBulkFormState>(emptyModelBulkDraft);
  const [bulkUploadFile, setBulkUploadFile] = useState<File | null>(null);
  const [bulkUploadStatus, setBulkUploadStatus] = useState<BulkCreateModelResult | null>(null);

  const fetchModels = async () => {
    setFetching(true);
    try {
      const data = await getModels({ search: search.trim() || undefined, after: pageAfter, first: 9 });
      setModels(data.models);
      setPageInfo(data.pageInfo);
      setFetchError(null);
    } catch (err: any) {
      setFetchError(err);
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => { fetchModels(); }, [search, pageAfter]);

  const selectedModel = useMemo(() => models.find((m) => m.id === selectedId) ?? null, [selectedId, models]);
  const visibleIds = useMemo(() => models.map((m) => m.id), [models]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => bulkSelectedIds.includes(id));
  const hasBulkSelection = bulkSelectedIds.length > 0;

  useEffect(() => {
    if (selectedModel) { setDraft(toModelDraft(selectedModel)); setThumbnailUploadFile(null); setThumbnailUploadError(null); return; }
    if (!selectedId) { setDraft(emptyModel); setThumbnailUploadFile(null); setThumbnailUploadError(null); }
  }, [selectedModel, selectedId]);

  const setField = <K extends keyof ModelFormState>(key: K, value: ModelFormState[K]) =>
    setDraft((cur) => ({ ...cur, [key]: value }));

  const clearBulkSelection = () => { setBulkSelectedIds([]); setBulkEditorOpen(false); };
  const toggleBulkSelected = (id: string) =>
    setBulkSelectedIds((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  const selectAllVisible = () =>
    setBulkSelectedIds((cur) => Array.from(new Set([...cur, ...visibleIds])));

  const uploadThumbnailToShopify = async (): Promise<string> => {
    const url = draft.thumbnailImageUrl.trim();
    if (!thumbnailUploadFile && /cdn\.shopify\.com|shopifycdn\.net|myshopify\.com\/cdn/i.test(url)) return url;
    if (!thumbnailUploadFile && !url) return url;
    const formData = new FormData();
    if (thumbnailUploadFile) formData.append("imageFile", thumbnailUploadFile);
    else formData.append("imageUrl", url);
    setIsUploadingThumbnail(true);
    setThumbnailUploadError(null);
    try {
      const result = await uploadTemplateImageToShopify(formData);
      setThumbnailUploadFile(null);
      setField("thumbnailImageUrl", result.url);
      return result.url;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setThumbnailUploadError(msg);
      throw err;
    } finally {
      setIsUploadingThumbnail(false);
    }
  };

  const isEditing = Boolean(selectedId);
  const isSaving = busyAction === "create" || busyAction === "update";
  const isBulkCreating = busyAction === "bulkCreate";

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setActionError(null);
    let thumbnailUrl = draft.thumbnailImageUrl.trim();
    try { thumbnailUrl = await uploadThumbnailToShopify(); } catch {
      setActionError(thumbnailUploadError ?? "Thumbnail upload failed."); return;
    }
    const payload: Partial<ModelRecord> = {
      name: draft.name.trim() || undefined,
      gender: draft.gender,
      category: draft.category.trim() || undefined,
      prompt: draft.prompt.trim(),
      previewImages: draft.previewImages.map((u) => u.trim()).filter(Boolean),
      thumbnailImageUrl: thumbnailUrl || undefined,
    };
    try {
      if (isEditing && selectedId) { setBusyAction("update"); await updateModel(selectedId, payload); }
      else { setBusyAction("create"); const created = await createModel(payload); if (created?.id) setSelectedId(created.id); }
      await fetchModels();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally { setBusyAction(null); }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this model? This cannot be undone.")) return;
    setActionError(null);
    try {
      setBusyAction("delete");
      await deleteModel(id);
      if (selectedId === id) { setSelectedId(null); setDraft(emptyModel); }
      await fetchModels();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally { setBusyAction(null); }
  };

  const handleBulkUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setActionError(null);
    const payload: Partial<ModelRecord> = {};
    if (bulkDraft.updateCategory) payload.category = bulkDraft.category.trim() || undefined;
    if (bulkDraft.updateGender) payload.gender = bulkDraft.gender;
    if (bulkDraft.updatePrompt) payload.prompt = bulkDraft.prompt.trim();
    if (Object.keys(payload).length === 0) { setActionError("Choose at least one field to update."); return; }
    if (!window.confirm(`Apply changes to ${bulkSelectedIds.length} selected models?`)) return;
    try {
      setBusyAction("bulkUpdate");
      await bulkUpdateModels(bulkSelectedIds, payload);
      await fetchModels();
      setBulkEditorOpen(false);
      setBulkDraft(emptyModelBulkDraft);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally { setBusyAction(null); }
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`Delete ${bulkSelectedIds.length} selected models? This cannot be undone.`)) return;
    setActionError(null);
    try {
      setBusyAction("bulkDelete");
      await bulkDeleteModels(bulkSelectedIds);
      if (selectedId && bulkSelectedIds.includes(selectedId)) { setSelectedId(null); setDraft(emptyModel); }
      await fetchModels();
      clearBulkSelection();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally { setBusyAction(null); }
  };

  const handleBulkUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setActionError(null);
    setBulkUploadStatus(null);
    if (!bulkUploadFile) { setActionError("Choose a CSV or XLSX file to import."); return; }
    setBusyAction("bulkCreate");
    try {
      const spreadsheet = await parseSpreadsheetFile(bulkUploadFile);
      const rows = mapModelImportRows(spreadsheet.rows);
      if (rows.length === 0) { setActionError("No valid rows found."); return; }
      if (!window.confirm(`Import ${rows.length} models?`)) return;
      const result = await bulkCreateModels(rows);
      setBulkUploadStatus(result);
      await fetchModels();
      if (result.failed.length === 0) setBulkUploadFile(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally { setBusyAction(null); }
  };

  const categoryClass = (cat: string) => ({ Men: "cat-lifestyle", Women: "cat-studio" }[cat] ?? "");

  return (
    <div className="shell">
      <div className="toolbar">
        <div className="toolbar-inner">
          <div className="search-wrapper">
            <span className="search-icon">🔍</span>
            <input className="search-input" type="search" placeholder="Search models..." value={search}
              onChange={(e) => { setPageAfter(null); setPageHistory([]); setSearch(e.target.value); }} />
          </div>
          <button type="button" className="btn-pearl" onClick={() => { setSelectedId(null); setDraft(emptyModel); }}>Clear / Create New</button>
          <button type="button" className="btn-pearl" onClick={allVisibleSelected ? clearBulkSelection : selectAllVisible} disabled={models.length === 0}>
            {allVisibleSelected ? "Clear Selection" : "Select All Visible"}
          </button>
        </div>
      </div>

      <div className="workspace-area">
        <div className="workspace">
          {/* Editor */}
          <aside className="editor-panel">
            <div className="editor-header">
              <div>
                <p className="editor-label">Model Tool</p>
                <h2>{isEditing ? "Edit Model" : "New Model"}</h2>
              </div>
              {isEditing && selectedId && (
                <button type="button" className="text-link" style={{ color: "#d32f2f" }} onClick={() => void handleDelete(selectedId)}>Delete</button>
              )}
            </div>

            <form className="editor-form" onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Name</label>
                <input type="text" value={draft.name} onChange={(e) => setField("name", e.target.value)} placeholder="e.g. Sofia, James" />
              </div>

              <div className="form-group">
                <label>Gender <span className="required">*</span></label>
                <select value={draft.gender} onChange={(e) => setField("gender", e.target.value as ModelFormState["gender"])}>
                  <option value="Men">Men</option>
                  <option value="Women">Women</option>
                </select>
              </div>

              <div className="form-group">
                <label>Category</label>
                <input type="text" value={draft.category} onChange={(e) => setField("category", e.target.value)} placeholder="e.g. Casual, Formal, Sportswear" />
              </div>

              <div className="form-group">
                <label>Thumbnail Image URL</label>
                <input type="url" value={draft.thumbnailImageUrl}
                  onChange={(e) => { setField("thumbnailImageUrl", e.target.value); setThumbnailUploadError(null); }}
                  placeholder="https://cdn.shopify.com/..." />
                <div className="image-upload-box">
                  <label className="file-upload-control">
                    <span className="file-upload-label">Upload from system</span>
                    <span className="file-upload-name">{thumbnailUploadFile?.name ?? "No file selected"}</span>
                    <input type="file" accept="image/*" onChange={(e) => { setThumbnailUploadFile(e.target.files?.[0] ?? null); setThumbnailUploadError(null); }} />
                  </label>
                  <button type="button" className="btn-shopify-upload" onClick={() => void uploadThumbnailToShopify()}
                    disabled={isUploadingThumbnail || (!thumbnailUploadFile && !draft.thumbnailImageUrl.trim())}>
                    {isUploadingThumbnail ? "Uploading..." : "Upload"}
                  </button>
                </div>
                {thumbnailUploadError && <p className="status error">{thumbnailUploadError}</p>}
              </div>

              <div className="form-group">
                <label>Preview Image URLs</label>
                {(Array.isArray(draft.previewImages) ? draft.previewImages : []).map((url, i) => (
                  <div key={i} style={{ display: "flex", gap: 6 }}>
                    <input type="url" value={url} placeholder="https://..."
                      onChange={(e) => { const urls = [...draft.previewImages]; urls[i] = e.target.value; setField("previewImages", urls); }} />
                    <button type="button" className="btn-pearl" style={{ padding: "0 10px", flexShrink: 0 }}
                      onClick={() => setField("previewImages", draft.previewImages.filter((_, j) => j !== i))}>✕</button>
                  </div>
                ))}
                <button type="button" className="btn-pearl" style={{ alignSelf: "flex-start" }}
                  onClick={() => setField("previewImages", [...draft.previewImages, ""])}>+ Add URL</button>
              </div>

              <div className="form-group">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <label style={{ marginBottom: 0 }}>Prompt <span className="required">*</span></label>
                  <span className="char-counter">{draft.prompt.length} / 8000</span>
                </div>
                <textarea required rows={6} value={draft.prompt} onChange={(e) => setField("prompt", e.target.value)} placeholder="Model generation prompt..." />
              </div>

              {actionError && <p className="status error">{actionError}</p>}

              <div className="form-actions">
                <button type="submit" className="btn-primary" disabled={isSaving}>
                  {isSaving ? "Saving..." : isEditing ? "Save Model" : "Add Model"}
                </button>
                {isEditing && (
                  <button type="button" className="btn-secondary-pill" onClick={() => { setSelectedId(null); setDraft(emptyModel); }}>Cancel</button>
                )}
              </div>
            </form>
          </aside>

          {/* Grid */}
          <section className="inventory-panel">
            <div className="list-panel-header">
              <h2>Models Inventory</h2>
              <div className="list-panel-actions">
                <label className="select-all-control">
                  <input type="checkbox" checked={allVisibleSelected} disabled={models.length === 0}
                    onChange={(e) => e.target.checked ? selectAllVisible() : clearBulkSelection()} />
                  <span>Select all</span>
                </label>
                <span className="record-count">{fetching ? "Syncing..." : `${models.length} Models`}</span>
              </div>
            </div>

            {/* Bulk Upload */}
            <form className="bulk-upload-panel" onSubmit={handleBulkUpload}>
              <div>
                <p className="editor-label">Bulk Upload</p>
                <h3>Import models from CSV or XLSX</h3>
                <p className="bulk-upload-help">Columns: name, category, thumbnailUrl, preview1, preview2, preview3. Prompt is set automatically.</p>
              </div>
              <div className="bulk-upload-controls">
                <label className="file-upload-control">
                  <span className="file-upload-label">Choose file</span>
                  <span className="file-upload-name">{bulkUploadFile?.name ?? "CSV or XLSX"}</span>
                  <input type="file" accept=".csv,.xlsx,.xls,text/csv"
                    onChange={(e) => { setBulkUploadFile(e.target.files?.[0] ?? null); setBulkUploadStatus(null); setActionError(null); }} />
                </label>
                <button type="submit" className={`btn-primary ${isBulkCreating ? "is-loading" : ""}`}
                  disabled={isBulkCreating || !bulkUploadFile} aria-busy={isBulkCreating}>
                  {isBulkCreating ? "Importing..." : "Import"}
                </button>
              </div>
              {bulkUploadStatus && (
                <div className="bulk-upload-results">
                  <p className="status success">Created {bulkUploadStatus.created.length} models. Failed {bulkUploadStatus.failed.length}.</p>
                  {bulkUploadStatus.failed.length > 0 && (
                    <ul className="bulk-upload-failures">
                      {bulkUploadStatus.failed.map((f) => <li key={f.rowNumber}>Row {f.rowNumber}: {f.error}</li>)}
                    </ul>
                  )}
                </div>
              )}
              {actionError && <p className="status error bulk-upload-results">{actionError}</p>}
            </form>

            {/* Bulk action bar */}
            {hasBulkSelection && (
              <div className="bulk-action-bar">
                <div><strong>{bulkSelectedIds.length}</strong> selected</div>
                <div className="bulk-action-buttons">
                  <button type="button" className="btn-primary" onClick={() => setBulkEditorOpen(true)} disabled={busyAction === "bulkUpdate"}>Bulk Edit</button>
                  <button type="button" className="btn-pearl danger" onClick={() => void handleBulkDelete()} disabled={busyAction === "bulkDelete"}>
                    {busyAction === "bulkDelete" ? "Deleting..." : "Delete Selected"}
                  </button>
                  <button type="button" className="text-link" onClick={clearBulkSelection}>Clear</button>
                </div>
              </div>
            )}

            {fetchError && <div className="status error" style={{ marginBottom: 20 }}>{fetchError.message}</div>}

            <div className="template-grid">
              {models.map((model) => {
                const selected = model.id === selectedId;
                const bulkSelected = bulkSelectedIds.includes(model.id);
                return (
                  <article key={model.id} className={`template-card ${selected ? "selected" : ""} ${bulkSelected ? "bulk-selected" : ""}`}>
                    <label className="bulk-select-control">
                      <input type="checkbox" checked={bulkSelected} onChange={() => toggleBulkSelected(model.id)} />
                      <span>Select</span>
                    </label>
                    <button type="button" className="card-image-wrapper" onClick={() => setPreviewModel(model)} style={{ width: "100%", border: "none", padding: 0 }}>
                      <img src={model.thumbnailImage?.url ?? ""} alt={model.name ?? model.gender} />
                      <div className="card-image-overlay">Quick View</div>
                    </button>
                    <div className="card-body">
                      <div className="card-topline">
                        <span className={`card-category ${categoryClass(model.gender ?? "")}`}>{model.gender}</span>
                        {model.category && <span className="record-count" style={{ fontSize: 11, padding: "2px 8px" }}>{model.category}</span>}
                      </div>
                      {model.name && <h3>{model.name}</h3>}
                      {Array.isArray(model.previewImages) && model.previewImages.length > 0 && (
                        <div className="model-previews">
                          {model.previewImages.slice(0, 3).map((url, i) => (
                            <img key={i} src={url} alt={`Preview ${i + 1}`} className="model-preview-thumb" />
                          ))}
                        </div>
                      )}
                      <div className="card-actions">
                        <button type="button" className="btn-pearl" onClick={() => { setSelectedId(model.id); setDraft(toModelDraft(model)); }}>Edit</button>
                        <button type="button" className="btn-pearl" style={{ color: "#d32f2f" }} onClick={() => void handleDelete(model.id)}>Delete</button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            {(pageHistory.length > 0 || pageInfo.hasNextPage) && (
              <div className="pagination-bar">
                <button type="button" className="btn-pearl" disabled={fetching || pageHistory.length === 0}
                  onClick={() => { const prev = pageHistory[pageHistory.length - 1] ?? null; setPageHistory((h) => h.slice(0, -1)); setPageAfter(prev); }}>Previous</button>
                <span className="pagination-status">Page {pageHistory.length + 1} · {models.length} shown</span>
                <button type="button" className="btn-pearl" disabled={fetching || !pageInfo.hasNextPage}
                  onClick={() => { if (!pageInfo.endCursor) return; setPageHistory((h) => [...h, pageAfter]); setPageAfter(pageInfo.endCursor); }}>Next</button>
              </div>
            )}

            {!fetching && models.length === 0 && (
              <div className="empty-state"><h3>No models yet</h3><p>Use the Model Tool or Bulk Upload to create models.</p></div>
            )}
          </section>
        </div>
      </div>

      {/* Bulk Edit Modal */}
      {bulkEditorOpen && (
        <div className="modal-overlay" onClick={() => setBulkEditorOpen(false)}>
          <div className="modal-content bulk-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setBulkEditorOpen(false)}>✕</button>
            <form className="bulk-edit-form" onSubmit={handleBulkUpdate}>
              <div className="bulk-modal-header">
                <div><p className="editor-label">Bulk Editor</p><h2>Edit selected models</h2></div>
                <span className="bulk-selected-pill">{bulkSelectedIds.length} selected</span>
              </div>
              <div className="bulk-modal-body">
                <section className="bulk-section">
                  <h3>Fields</h3>
                  <div className="bulk-field-grid">
                    <div className="bulk-field">
                      <label className="bulk-toggle">
                        <input type="checkbox" checked={bulkDraft.updateCategory}
                          onChange={(e) => setBulkDraft((d) => ({ ...d, updateCategory: e.target.checked }))} />
                        <span>Category</span>
                      </label>
                      <input type="text" value={bulkDraft.category} disabled={!bulkDraft.updateCategory}
                        placeholder="e.g. Casual" onChange={(e) => setBulkDraft((d) => ({ ...d, category: e.target.value }))} />
                    </div>
                    <div className="bulk-field">
                      <label className="bulk-toggle">
                        <input type="checkbox" checked={bulkDraft.updateGender}
                          onChange={(e) => setBulkDraft((d) => ({ ...d, updateGender: e.target.checked }))} />
                        <span>Gender</span>
                      </label>
                      <select value={bulkDraft.gender} disabled={!bulkDraft.updateGender}
                        onChange={(e) => setBulkDraft((d) => ({ ...d, gender: e.target.value as "Men" | "Women" }))}>
                        <option value="Men">Men</option>
                        <option value="Women">Women</option>
                      </select>
                    </div>
                  </div>
                  <div className="bulk-field" style={{ marginTop: 12 }}>
                    <div className="bulk-field-heading">
                      <label className="bulk-toggle">
                        <input type="checkbox" checked={bulkDraft.updatePrompt}
                          onChange={(e) => setBulkDraft((d) => ({ ...d, updatePrompt: e.target.checked }))} />
                        <span>Prompt</span>
                      </label>
                    </div>
                    <textarea rows={4} value={bulkDraft.prompt} disabled={!bulkDraft.updatePrompt}
                      placeholder="Shared prompt for all selected models"
                      onChange={(e) => setBulkDraft((d) => ({ ...d, prompt: e.target.value }))} />
                  </div>
                </section>
              </div>
              {actionError && <p className="status error" style={{ margin: "0 var(--sp-xl)" }}>{actionError}</p>}
              <div className="bulk-modal-actions">
                <button type="submit" className="btn-primary" disabled={busyAction === "bulkUpdate"}>
                  {busyAction === "bulkUpdate" ? "Applying..." : "Apply Bulk Changes"}
                </button>
                <button type="button" className="btn-secondary-pill" onClick={() => setBulkEditorOpen(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick View Modal */}
      {previewModel && (
        <div className="modal-overlay" onClick={() => setPreviewModel(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setPreviewModel(null)}>✕</button>
            <div className="modal-grid">
              <div className="modal-image-wrapper">
                <img src={previewModel.thumbnailImage?.url ?? ""} alt={previewModel.name ?? previewModel.gender} />
              </div>
              <div className="modal-details">
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span className={`card-category ${categoryClass(previewModel.gender ?? "")}`}>{previewModel.gender}</span>
                  {previewModel.category && <span className="record-count" style={{ fontSize: 11, padding: "2px 8px" }}>{previewModel.category}</span>}
                </div>
                <h2>{previewModel.name ?? `${previewModel.gender} Model`}</h2>
                {Array.isArray(previewModel.previewImages) && previewModel.previewImages.length > 0 && (
                  <div>
                    <p className="modal-prompt-label" style={{ marginBottom: 8 }}>Previews</p>
                    <div className="model-previews">
                      {previewModel.previewImages.map((url, i) => (
                        <img key={i} src={url} alt={`Preview ${i + 1}`} className="model-preview-thumb" style={{ width: 80, height: 80 }} />
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <p className="modal-prompt-label">Generation Prompt</p>
                  <div className="modal-prompt-box">
                    <div className="modal-prompt-text">{previewModel.prompt}</div>
                    <button className="btn-primary" onClick={async () => { await navigator.clipboard.writeText(previewModel.prompt ?? ""); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
                      {copied ? "Copied ✓" : "Copy Prompt"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Root Page ── */
export default function Page() {
  const [authenticated, setAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState<"templates" | "models">("templates");

  useEffect(() => {
    try {
      const isAuth = window.localStorage.getItem("templatePortalAuth") === "true";
      if (isAuth) setAuthenticated(true);
    } catch {
      // Ignored
    }
  }, []);

  const handleLoginSuccess = () => {
    setAuthenticated(true);
    try {
      window.localStorage.setItem("templatePortalAuth", "true");
    } catch {
      // Ignored
    }
  };

  const handleSignOut = () => {
    setAuthenticated(false);
    try {
      window.localStorage.removeItem("templatePortalAuth");
    } catch {
      // Ignored
    }
  };

  if (!authenticated) {
    return <LoginPortal onLogin={handleLoginSuccess} />;
  }

  return (
    <>
      <header className="global-nav">
        <div className="nav-container">
          <a href="#" className="nav-logo">
            <span className="nav-logo-icon">❖</span>
            <span>Template Studio</span>
          </a>
          <div className="nav-actions">
            <span className="nav-status">
              <span className="nav-status-dot" />
              Connected
            </span>
            <button onClick={handleSignOut} className="btn-dark-utility">Sign Out</button>
          </div>
        </div>
      </header>

      <nav className="module-tabs">
        <div className="module-tabs-inner">
          <button className={`module-tab ${activeTab === "templates" ? "active" : ""}`} onClick={() => setActiveTab("templates")}>
            Templates
          </button>
          <button className={`module-tab ${activeTab === "models" ? "active" : ""}`} onClick={() => setActiveTab("models")}>
            Models
          </button>
        </div>
      </nav>

      {activeTab === "templates" ? (
        <TemplateManager onSignOut={handleSignOut} hideNav />
      ) : (
        <ModelsManager />
      )}
    </>
  );
}
