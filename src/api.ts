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

export const api = {
  template: {
    findMany: async (options?: { search?: string }): Promise<TemplateRecord[]> => {
      const url = new URL("/api/templates", window.location.origin);
      if (options?.search) {
        url.searchParams.set("search", options.search);
      }
      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(await response.text());
      }
      return response.json();
    },
    create: async (payload: Partial<TemplateRecord>): Promise<TemplateRecord> => {
      const response = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      return response.json();
    },
    update: async (id: string, payload: Partial<TemplateRecord>): Promise<TemplateRecord> => {
      const response = await fetch(`/api/templates/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      return response.json();
    },
    delete: async (id: string): Promise<{ success: boolean }> => {
      const response = await fetch(`/api/templates/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      return response.json();
    },
  },
};