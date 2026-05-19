"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
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

const portalUsername = process.env.VITE_PORTAL_USERNAME;
const portalPassword = process.env.VITE_PORTAL_PASSWORD;
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
    <div style={{ position: "relative", minHeight: "100vh", overflow: "hidden" }}>
      <div className="glow-blob glow-blob-1"></div>
      <div className="glow-blob glow-blob-2"></div>
      
      <main className="shell">
        <div className="login-card panel">
          <div className="login-header-glow">
            <div className="logo-icon">✨</div>
            <h1>Template Studio</h1>
            <p className="hero-copy" style={{ fontSize: "0.95rem" }}>
              Secure management dashboard for your AI image-generation templates.
            </p>
          </div>
          
          <form className="editor-form" onSubmit={handleLogin}>
            <div className="form-group">
              <label>Username</label>
              <input
                required
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
                Configure <code>VITE_PORTAL_USERNAME</code> and <code>VITE_PORTAL_PASSWORD</code> in <code>.env</code>.
              </p>
            ) : null}
            
            <button type="submit" style={{ marginTop: "12px", width: "100%" }}>
              Sign In to Portal
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}

function TemplateManager({ onSignOut }: { onSignOut: () => void }) {
  const [search, setSearch] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TemplateFormState>(emptyTemplate);
  const [busyAction, setBusyAction] = useState<"create" | "update" | "delete" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [fetching, setFetching] = useState<boolean>(true);
  const [error, setError] = useState<any>(null);

  // Lightbox Modal state
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

  useEffect(() => {
    if (selectedTemplate) {
      setDraft(toDraft(selectedTemplate));
      return;
    }

    if (!selectedTemplateId) {
      setDraft(emptyTemplate);
    }
  }, [selectedTemplate, selectedTemplateId]);

  const handleFieldChange = <Key extends keyof TemplateFormState>(key: Key, value: TemplateFormState[Key]) => {
    setDraft((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const isEditing = Boolean(selectedTemplateId);
  const isSaving = busyAction === "create" || busyAction === "update";

  const submitTemplate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setActionError(null);

    const payload = {
      ...draft,
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
    if (!confirmed) {
      return;
    }

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

  const handleCopyPrompt = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy text", err);
    }
  };

  return (
    <div style={{ position: "relative" }}>
      <div className="glow-blob glow-blob-1"></div>
      <div className="glow-blob glow-blob-2"></div>

      <header className="nav-header">
        <div className="nav-container">
          <a href="#" className="logo-wrapper">
            <div className="logo-icon">✨</div>
            <span className="logo-text">Template Studio</span>
          </a>
          <div className="nav-actions">
            <div className="user-badge">
              <span className="pulse-indicator"></span>
              <span>Connected to Gadget</span>
            </div>
            <button onClick={onSignOut} className="ghost" style={{ padding: "8px 16px", fontSize: "0.85rem", borderRadius: "8px" }}>
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="shell">
        <section className="hero">
          <div className="hero-content">
            <span className="eyebrow">Realtime Synced</span>
            <h1>Manage your generation styles.</h1>
            <p className="hero-copy">
              Compose, configure, and instantly test template prompts against your Gadget server database. Click template images to preview generation data.
            </p>
          </div>

          <div className="hero-stats">
            <article>
              <span>Total Styles</span>
              <strong>{templates?.length ?? 0}</strong>
            </article>
            <article>
              <span>Composer Mode</span>
              <strong>{isEditing ? "Edit" : "New"}</strong>
            </article>
          </div>
        </section>

        <section className="toolbar">
          <div className="search-wrapper">
            <span className="search-icon-decor">🔍</span>
            <input
              className="search-input"
              type="search"
              placeholder="Search styles by name, description, or tag prompt..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <button
            type="button"
            className="secondary"
            onClick={() => {
              setSelectedTemplateId(null);
              setDraft(emptyTemplate);
            }}
          >
            Clear / Create New
          </button>
        </section>

        <section className="workspace">
          <aside className="panel">
            <div className="panel-heading">
              <div>
                <p className="panel-label">Designer Tool</p>
                <h2>{isEditing ? selectedTemplate?.name ?? "Edit Style" : "New Style"}</h2>
              </div>
              {isEditing && selectedTemplateId && (
                <button type="button" className="danger-btn" onClick={() => void handleDelete(selectedTemplateId)}>
                  Delete
                </button>
              )}
            </div>

            <form className="editor-form" onSubmit={submitTemplate}>
              <div className="form-group">
                <label>Style Name <span className="required">*</span></label>
                <input
                  required
                  value={draft.name}
                  onChange={(event) => handleFieldChange("name", event.target.value)}
                  placeholder="e.g. Neon Cyberpunk Portrait"
                />
              </div>

              <div className="form-group">
                <label>Feature Badge</label>
                <input
                  value={draft.badge}
                  onChange={(event) => handleFieldChange("badge", event.target.value)}
                  placeholder="e.g. Trending, Hot, V2"
                />
              </div>

              <div className="two-up">
                <div className="form-group">
                  <label>Category</label>
                  <select
                    value={draft.category}
                    onChange={(event) => handleFieldChange("category", event.target.value as TemplateFormState["category"])}
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
                    onChange={(event) => handleFieldChange("visibility", event.target.value as TemplateFormState["visibility"])}
                  >
                    <option value="hidden">Hidden</option>
                    <option value="public">Public</option>
                  </select>
                </div>
              </div>

              <div className="two-up">
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
                <label>Display Image URL <span className="required">*</span></label>
                <input
                  type="url"
                  required
                  value={draft.displayImageUrl}
                  onChange={(event) => handleFieldChange("displayImageUrl", event.target.value)}
                  placeholder="https://images.unsplash.com/..."
                />
              </div>

              <div className="form-group">
                <label>Description <span className="required">*</span></label>
                <textarea
                  required
                  rows={3}
                  value={draft.description}
                  onChange={(event) => handleFieldChange("description", event.target.value)}
                  placeholder="Explain what visual aspects this template generates..."
                />
              </div>

              <div className="form-group">
                <label>Generation Prompt <span className="required">*</span></label>
                <textarea
                  required
                  rows={6}
                  value={draft.prompt}
                  onChange={(event) => handleFieldChange("prompt", event.target.value)}
                  placeholder="Model prompt containing variables, e.g. 'A stunning dynamic portrait of [subject] in cyberpunk style, high-end photography...'"
                />
              </div>

              {actionError && <p className="status error">{actionError}</p>}

              <div className="actions">
                <button type="submit" disabled={isSaving}>
                  {isSaving ? "Saving changes..." : isEditing ? "Save Style" : "Add to Library"}
                </button>

                {isEditing && (
                  <button
                    type="button"
                    className="secondary"
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

          <section className="panel list-panel">
            <div className="grid-header">
              <h2>Styles Inventory</h2>
              <span className="record-count-badge">
                {fetching ? "Syncing..." : `${templates?.length ?? 0} Styles`}
              </span>
            </div>

            {error && <div className="status error" style={{ marginBottom: "20px" }}>{error.message}</div>}

            <div className="template-grid">
              {templates?.map((template) => {
                const selected = template.id === selectedTemplateId;

                return (
                  <article key={template.id} className={`template-card ${selected ? "selected" : ""}`}>
                    <button
                      type="button"
                      className="card-select"
                      onClick={() => setPreviewTemplate(template)}
                    >
                      <img src={template.displayImageUrl} alt={template.name} />
                      <div className="image-overlay-preview">🔍 Quick View</div>
                    </button>

                    <div className="card-body">
                      <div className="card-topline">
                        <span className={`badge-tag category-${template.category.toLowerCase()}`}>
                          {template.category}
                        </span>
                        <span className={`card-visibility ${template.visibility}`}>
                          {template.visibility}
                        </span>
                      </div>

                      <h3>{template.name}</h3>
                      <p>{template.description}</p>

                      <div className="card-meta">
                        <span className="meta-credits">{template.creditsRequired} Credits</span>
                        <span className="meta-sort">Index #{template.sortOrder}</span>
                        {template.badge ? <span className="meta-badge">{template.badge}</span> : null}
                      </div>

                      <div className="card-actions">
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => {
                            setSelectedTemplateId(template.id);
                            setDraft(toDraft(template));
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="ghost danger-btn"
                          style={{ padding: "8px" }}
                          onClick={() => void handleDelete(template.id)}
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
                <p>No template matching your filter. Use the Composer to create one!</p>
              </div>
            )}
          </section>
        </section>
      </main>

      {/* Lightbox / Quick View Modal */}
      {previewTemplate && (
        <div className="modal-overlay" onClick={() => setPreviewTemplate(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setPreviewTemplate(null)}>✕</button>
            <div className="modal-grid">
              <div className="modal-image-wrapper">
                <img src={previewTemplate.displayImageUrl} alt={previewTemplate.name} />
              </div>
              <div className="modal-details">
                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                  <span className={`badge-tag category-${previewTemplate.category.toLowerCase()}`}>
                    {previewTemplate.category}
                  </span>
                  {previewTemplate.badge && (
                    <span className="meta-badge">{previewTemplate.badge}</span>
                  )}
                </div>
                
                <h2 style={{ fontSize: "2rem" }}>{previewTemplate.name}</h2>
                <p style={{ color: "var(--text-secondary)", fontSize: "1rem" }}>
                  {previewTemplate.description}
                </p>
                
                <div style={{ display: "flex", justifyContent: "space-between", background: "rgba(255,255,255,0.03)", padding: "12px", borderRadius: "8px", fontSize: "0.9rem" }}>
                  <span>Cost: <strong>{previewTemplate.creditsRequired} Credits</strong></span>
                  <span>Priority Index: <strong>#{previewTemplate.sortOrder}</strong></span>
                  <span style={{ textTransform: "capitalize" }}>Status: <strong>{previewTemplate.visibility}</strong></span>
                </div>

                <div className="form-group" style={{ marginTop: "10px" }}>
                  <label>Generation Prompt</label>
                  <div className="modal-prompt-box">
                    <div className="modal-prompt-text">{previewTemplate.prompt}</div>
                    <button
                      className="copy-btn"
                      onClick={() => handleCopyPrompt(previewTemplate.prompt)}
                    >
                      {copied ? "Copied! ✓" : "Copy Prompt"}
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

export default function Page() {
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    try {
      const isAuth = window.localStorage.getItem("templatePortalAuth") === "true";
      if (isAuth) {
        setAuthenticated(true);
      }
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
