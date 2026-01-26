import { useQuery } from "@tanstack/react-query";
import { getMetaStatus } from "@/lib/api";

export interface MetaStatusResponse {
  authenticated: boolean;
  adAccount: boolean;
  pages: boolean;
  realPage: boolean;
  campaigns: boolean;
  status: "ready" | "not_authenticated" | "missing_ad_account" | "missing_page" | "missing_campaigns" | "error";
  message: string;
}

export function useMetaStatus() {
  const { data, isLoading, error, refetch } = useQuery<MetaStatusResponse>({
    queryKey: ['/api/meta/status'],
    queryFn: async () => {
      try {
        return await getMetaStatus();
      } catch (error) {
        console.error("Error fetching Meta status:", error);
        throw error;
      }
    },
    refetchOnWindowFocus: false,
  });

  const isConfigured = data?.status === 'ready';
  const isAuthenticated = data?.authenticated || false;
  
  const needsSetup = isAuthenticated && !isConfigured;
  const setupIssue = isAuthenticated ? data?.status : null;
  const setupMessage = data?.message || '';

  return {
    status: data,
    isLoading,
    error,
    refetch,
    isConfigured,
    isAuthenticated,
    needsSetup,
    setupIssue,
    setupMessage
  };
}