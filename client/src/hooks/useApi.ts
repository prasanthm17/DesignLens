import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  AuditDetail,
  AuditStatusResponse,
  AuditSummary,
  Catalog,
  DashboardData,
  Finding,
  MeResponse,
  ProjectDetail,
  ProjectSummary,
} from "@/lib/types";

export const keys = {
  me: ["me"] as const,
  catalog: ["catalog"] as const,
  dashboard: ["dashboard"] as const,
  projects: ["projects"] as const,
  project: (id: string) => ["project", id] as const,
  audits: (params?: string) => ["audits", params ?? "all"] as const,
  audit: (id: string) => ["audit", id] as const,
  auditStatus: (id: string) => ["audit-status", id] as const,
  findings: (params?: string) => ["findings", params ?? "all"] as const,
};

export function useMe() {
  return useQuery({
    queryKey: keys.me,
    queryFn: () => api.get<MeResponse>("/api/auth/me"),
    staleTime: 30_000,
  });
}

export function useCatalog() {
  return useQuery({
    queryKey: keys.catalog,
    queryFn: () => api.get<Catalog>("/api/catalog"),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useDashboard() {
  return useQuery({
    queryKey: keys.dashboard,
    queryFn: () => api.get<DashboardData>("/api/dashboard"),
  });
}

export function useProjects() {
  return useQuery({
    queryKey: keys.projects,
    queryFn: () => api.get<ProjectSummary[]>("/api/projects"),
  });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: keys.project(id),
    queryFn: () => api.get<ProjectDetail>(`/api/projects/${id}`),
    enabled: Boolean(id),
  });
}

export function useAudits(params?: { projectId?: string; status?: string; limit?: number }) {
  const search = new URLSearchParams();
  if (params?.projectId) search.set("projectId", params.projectId);
  if (params?.status) search.set("status", params.status);
  if (params?.limit) search.set("limit", String(params.limit));
  const query = search.toString();

  return useQuery({
    queryKey: keys.audits(query),
    queryFn: () => api.get<AuditSummary[]>(`/api/audits${query ? `?${query}` : ""}`),
  });
}

export function useAudit(id: string) {
  return useQuery({
    queryKey: keys.audit(id),
    queryFn: () => api.get<AuditDetail>(`/api/audits/${id}`),
    enabled: Boolean(id),
  });
}

/**
 * Polls the audit while it is queued or running. Polling stops as soon as the
 * audit reaches a terminal state, so a finished audit costs nothing.
 */
export function useAuditStatus(id: string, enabled: boolean) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: keys.auditStatus(id),
    queryFn: async () => {
      const status = await api.get<AuditStatusResponse>(`/api/audits/${id}/status`);
      if (status.status === "completed" || status.status === "failed") {
        queryClient.invalidateQueries({ queryKey: keys.audit(id) });
        queryClient.invalidateQueries({ queryKey: keys.dashboard });
        queryClient.invalidateQueries({ queryKey: keys.projects });
        queryClient.invalidateQueries({ queryKey: ["audits"] });
      }
      return status;
    },
    enabled: Boolean(id) && enabled,
    // Always poll while the audit is in flight: a cached "queued" result must
    // never stop the progress view from updating.
    staleTime: 0,
    gcTime: 5 * 60_000,
    refetchInterval: (query) => {
      const data = query.state.data as AuditStatusResponse | undefined;
      if (data && (data.status === "completed" || data.status === "failed")) return false;
      return 1000;
    },
    refetchIntervalInBackground: true,
  });
}

export function useFindings(filters?: { projectId?: string; auditId?: string; status?: string; severity?: string; category?: string }) {
  const search = new URLSearchParams();
  Object.entries(filters ?? {}).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  const query = search.toString();

  return useQuery({
    queryKey: keys.findings(query),
    queryFn: () => api.get<Finding[]>(`/api/findings${query ? `?${query}` : ""}`),
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post<ProjectSummary>("/api/projects", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.projects });
      queryClient.invalidateQueries({ queryKey: keys.dashboard });
    },
  });
}

export function useUpdateProject(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.patch(`/api/projects/${id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.project(id) });
      queryClient.invalidateQueries({ queryKey: keys.projects });
    },
  });
}

export function useAddPage(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { name: string; url: string; notes?: string }) =>
      api.post(`/api/projects/${projectId}/pages`, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.project(projectId) }),
  });
}

export function useCreateAudit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.post<{ audit: AuditSummary; statusUrl: string }>("/api/audits", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["audits"] });
      queryClient.invalidateQueries({ queryKey: keys.dashboard });
    },
  });
}

export function useRerunAudit(auditId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post(`/api/audits/${auditId}/rerun`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.auditStatus(auditId) });
      queryClient.invalidateQueries({ queryKey: keys.audit(auditId) });
    },
  });
}

export function useUpdateFinding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }: { id: string; status?: string; severity?: string }) =>
      api.patch(`/api/findings/${id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["findings"] });
      queryClient.invalidateQueries({ queryKey: ["audit"] });
      queryClient.invalidateQueries({ queryKey: keys.dashboard });
    },
  });
}
