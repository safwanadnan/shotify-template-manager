"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  bulkUpdateTemplates,
  bulkDeleteTemplates,
  uploadTemplateImageToShopify,
  type TemplateRecord,
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
function TemplateManager({ onSignOut }: { onSignOut: () => void }) {
  const [search, setSearch] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [bulkSelectedIds, setBulkSelectedIds] = useState<string[]>([]);
  const [bulkEditorOpen, setBulkEditorOpen] = useState(false);
  const [bulkDraft, setBulkDraft] = useState<BulkFormState>(emptyBulkDraft);
  const [draft, setDraft] = useState<TemplateFormState>(emptyTemplate);
  const [imageUploadFile, setImageUploadFile] = useState<File | null>(null);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<"create" | "update" | "delete" | "bulkUpdate" | "bulkDelete" | "imageUpload" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [fetching, setFetching] = useState<boolean>(true);
  const [error, setError] = useState<any>(null);

  /* Lightbox Modal state */
  const [previewTemplate, setPreviewTemplate] = useState<TemplateRecord | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  const fetchTemplates = async () => {
    setFetching(true);
    try {
      const data = await getTemplates(search.trim() || undefined);
      setTemplates(data);
      setError(null);
    } catch (err: any) {
      setError(err);
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, [search]);

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

  const clearBulkSelection = () => {
    setBulkSelectedIds([]);
    setBulkEditorOpen(false);
  };

  const isEditing = Boolean(selectedTemplateId);
  const isSaving = busyAction === "create" || busyAction === "update";
  const isUploadingImage = busyAction === "imageUpload";

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

    let shopifyDisplayImageUrl = draft.displayImageUrl.trim();

    try {
      shopifyDisplayImageUrl = await uploadDraftImageToShopify();
    } catch (error) {
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
        await updateTemplate(selectedTemplateId, payload);
        await fetchTemplates();
        return;
      }

      setBusyAction("create");
      const created = await createTemplate(payload);
      const createdId = created?.id;

      if (createdId) {
        setSelectedTemplateId(createdId);
      }
      await fetchTemplates();
    } catch (error) {
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
      await bulkUpdateTemplates(bulkSelectedIds, payload);
      await fetchTemplates();
      setBulkEditorOpen(false);
      setBulkDraft(emptyBulkDraft);
    } catch (error) {
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
      {/* ── Global Nav ── */}
      <header className="global-nav">
        <div className="nav-container">
          <a href="#" className="nav-logo">
            <span className="nav-logo-icon">✦</span>
            <span>Template Studio</span>
          </a>
          <div className="nav-actions">
            <span className="nav-status">
              <span className="nav-status-dot" />
              Connected
            </span>
            <button onClick={onSignOut} className="btn-dark-utility">
              Sign Out
            </button>
          </div>
        </div>
      </header>

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
              <span className="hero-stat-label">Total Styles</span>
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
                onChange={(event) => setSearch(event.target.value)}
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
                    <span className={`char-counter ${draft.prompt.length > 2000 ? "over" : ""}`}>
                      {draft.prompt.length} / 2000
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
            <section>
              <div className="list-panel-header">
                <h2>Styles Inventory</h2>
                <span className="record-count">
                  {fetching ? "Syncing..." : `${templates?.length ?? 0} Styles`}
                </span>
              </div>

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
                      <span className={`char-counter ${bulkDraft.prompt.length > 2000 ? "over" : ""}`}>
                        {bulkDraft.prompt.length} / 2000
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

/* ── Root Page ── */
export default function Page() {
  const [authenticated, setAuthenticated] = useState(false);

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

  return <TemplateManager onSignOut={handleSignOut} />;
}
