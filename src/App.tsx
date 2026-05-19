import { useEffect, useMemo, useState } from "react";
import { useFindMany } from "@gadgetinc/react";
import { api } from "./api";

type TemplateFormState = {
  name: string;
  badge: string;
  category: "Studio" | "Lifestyle" | "Seasonal" | "Brand";
  creditsRequired: number;
  description: string;
  displayImageUrl: string;
  prompt: string;
  sortOrder: number;
  visibility: "public" | "hidden";
};

type TemplateRecord = TemplateFormState & {
  id: string;
};

const templateSelection = {
  id: true,
  name: true,
  badge: true,
  category: true,
  creditsRequired: true,
  description: true,
  displayImageUrl: true,
  prompt: true,
  sortOrder: true,
  visibility: true,
} as const;

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

const portalUsername = import.meta.env.VITE_PORTAL_USERNAME;
const portalPassword = import.meta.env.VITE_PORTAL_PASSWORD;
const loginConfigured = Boolean(portalUsername && portalPassword);
const templateApi = api as any;

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
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Protected portal</p>
          <h1>Template portal access</h1>
          <p className="hero-copy">
            Enter the credentials defined in <code>.env</code> to manage your templates.
          </p>
        </div>
      </section>

      <section className="workspace">
        <div className="panel">
          <div className="panel-heading">
            <div>
              <p className="panel-label">Login required</p>
              <h2>Sign in to continue</h2>
            </div>
          </div>
          <form className="editor-form" onSubmit={handleLogin}>
            <label>
              <span>Username</span>
              <input
                required
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
            </label>
            <label>
              <span>Password</span>
              <input
                required
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            {loginError ? <p className="status error">{loginError}</p> : null}
            {!loginConfigured ? (
              <p className="status error">
                Configure <code>VITE_PORTAL_USERNAME</code> and <code>VITE_PORTAL_PASSWORD</code> in <code>.env</code>.
              </p>
            ) : null}
            <div className="actions">
              <button type="submit">Sign in</button>
            </div>
          </form>
        </div>
      </section>
    </main>
  );
}

function TemplateManager() {
  const [search, setSearch] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TemplateFormState>(emptyTemplate);
  const [busyAction, setBusyAction] = useState<"create" | "update" | "delete" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [{ data: fetchedTemplates, fetching, error }] = useFindMany(templateApi.template as any, {
    select: templateSelection,
    sort: { sortOrder: "Ascending" },
    search: search.trim() || undefined,
  }) as any;

  const templates = fetchedTemplates as TemplateRecord[] | undefined;

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
        await templateApi.template.update({ id: selectedTemplateId, ...payload });
        return;
      }

      setBusyAction("create");
      const created = await templateApi.template.create(payload);
      const createdId = created?.id ?? created?.data?.id;

      if (createdId) {
        setSelectedTemplateId(createdId);
      }
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
      await templateApi.template.delete({ id: templateId });

      if (selectedTemplateId === templateId) {
        setSelectedTemplateId(null);
        setDraft(emptyTemplate);
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Gadget connected</p>
          <h1>Template studio for your AI image backend.</h1>
          <p className="hero-copy">
            Create, edit, search, and remove image-generation templates against the
            <strong>template</strong> model in your Gadget app.
          </p>
        </div>

        <div className="hero-stats">
          <article>
            <span>Templates</span>
            <strong>{templates?.length ?? 0}</strong>
          </article>
          <article>
            <span>Editing</span>
            <strong>{isEditing ? "Yes" : "New"}</strong>
          </article>
          <article>
            <span>Sync</span>
            <strong>Live</strong>
          </article>
        </div>
      </section>

      <section className="toolbar">
        <label>
          <span>Search templates</span>
          <input
            type="search"
            placeholder="Search by name, description, or prompt"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>

        <button
          type="button"
          className="secondary"
          onClick={() => {
            setSelectedTemplateId(null);
            setDraft(emptyTemplate);
          }}
        >
          New template
        </button>
      </section>

      <section className="workspace">
        <aside className="panel editor">
          <div className="panel-heading">
            <div>
              <p className="panel-label">Composer</p>
              <h2>{isEditing ? selectedTemplate?.name ?? "Edit template" : "Create template"}</h2>
            </div>
            {isEditing && selectedTemplateId && (
              <button type="button" className="ghost" onClick={() => void handleDelete(selectedTemplateId)}>
                Delete
              </button>
            )}
          </div>

          <form className="editor-form" onSubmit={submitTemplate}>
            <label>
              <span>Name</span>
              <input
                required
                value={draft.name}
                onChange={(event) => handleFieldChange("name", event.target.value)}
                placeholder="Bright editorial portrait"
              />
            </label>

            <label>
              <span>Badge</span>
              <input
                value={draft.badge}
                onChange={(event) => handleFieldChange("badge", event.target.value)}
                placeholder="Best seller"
              />
            </label>

            <div className="two-up">
              <label>
                <span>Category</span>
                <select
                  value={draft.category}
                  onChange={(event) => handleFieldChange("category", event.target.value as TemplateFormState["category"])}
                >
                  <option value="Studio">Studio</option>
                  <option value="Lifestyle">Lifestyle</option>
                  <option value="Seasonal">Seasonal</option>
                  <option value="Brand">Brand</option>
                </select>
              </label>

              <label>
                <span>Visibility</span>
                <select
                  value={draft.visibility}
                  onChange={(event) => handleFieldChange("visibility", event.target.value as TemplateFormState["visibility"])}
                >
                  <option value="hidden">Hidden</option>
                  <option value="public">Public</option>
                </select>
              </label>
            </div>

            <div className="two-up">
              <label>
                <span>Credits required</span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={draft.creditsRequired}
                  onChange={(event) => handleFieldChange("creditsRequired", Number(event.target.value))}
                />
              </label>

              <label>
                <span>Sort order</span>
                <input
                  type="number"
                  value={draft.sortOrder}
                  onChange={(event) => handleFieldChange("sortOrder", Number(event.target.value))}
                />
              </label>
            </div>

            <label>
              <span>Display image URL</span>
              <input
                type="url"
                required
                value={draft.displayImageUrl}
                onChange={(event) => handleFieldChange("displayImageUrl", event.target.value)}
                placeholder="https://..."
              />
            </label>

            <label>
              <span>Description</span>
              <textarea
                required
                rows={4}
                value={draft.description}
                onChange={(event) => handleFieldChange("description", event.target.value)}
                placeholder="Short summary users see in the template gallery"
              />
            </label>

            <label>
              <span>Prompt</span>
              <textarea
                required
                rows={8}
                value={draft.prompt}
                onChange={(event) => handleFieldChange("prompt", event.target.value)}
                placeholder="Detailed generation prompt"
              />
            </label>

            {actionError && <p className="status error">{actionError}</p>}

            <div className="actions">
              <button type="submit" disabled={isSaving}>
                {isSaving ? "Saving..." : isEditing ? "Update template" : "Create template"}
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
                  Cancel edit
                </button>
              )}
            </div>
          </form>
        </aside>

        <section className="panel list-panel">
          <div className="panel-heading">
            <div>
              <p className="panel-label">Template library</p>
              <h2>{fetching ? "Loading templates" : `${templates?.length ?? 0} records`}</h2>
            </div>
            {error && <span className="status error">{error.message}</span>}
          </div>

          <div className="template-grid">
            {templates?.map((template) => {
              const selected = template.id === selectedTemplateId;

              return (
                <article key={template.id} className={`template-card ${selected ? "selected" : ""}`}>
                  <button
                    type="button"
                    className="card-select"
                    onClick={() => {
                      setSelectedTemplateId(template.id);
                      setDraft(toDraft(template));
                    }}
                  >
                    <img src={template.displayImageUrl} alt={template.name} />
                  </button>

                  <div className="card-body">
                    <div className="card-topline">
                      <span className="badge">{template.category}</span>
                      <span className={`pill ${template.visibility}`}>{template.visibility}</span>
                    </div>

                    <h3>{template.name}</h3>
                    <p>{template.description}</p>

                    <div className="card-meta">
                      <span>{template.creditsRequired} credits</span>
                      <span>#{template.sortOrder}</span>
                      {template.badge ? <span>{template.badge}</span> : null}
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
                      <button type="button" className="ghost" onClick={() => void handleDelete(template.id)}>
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
              <h3>No templates yet</h3>
              <p>Create your first template to start building the library.</p>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

export default function App() {
  const [authenticated, setAuthenticated] = useState(() => {
    try {
      return window.localStorage.getItem("templatePortalAuth") === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (authenticated) {
      window.localStorage.setItem("templatePortalAuth", "true");
    } else {
      window.localStorage.removeItem("templatePortalAuth");
    }
  }, [authenticated]);

  if (!authenticated) {
    return <LoginPortal onLogin={() => setAuthenticated(true)} />;
  }

  return <TemplateManager />;
}