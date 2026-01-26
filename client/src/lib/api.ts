import { apiRequest } from "./queryClient";

// Auth API
export const getAuthStatus = async () => {
  const response = await apiRequest('GET', '/api/auth/status', undefined);
  return response.json();
};

export const getLoginUrl = async () => {
  const response = await apiRequest('GET', '/api/auth/login-url', undefined);
  return response.json();
};

export const logout = async () => {
  const response = await apiRequest('POST', '/api/auth/logout', undefined);
  return response.json();
};

// Campaigns API
export const getCampaigns = async () => {
  const response = await apiRequest('GET', '/api/campaigns', undefined);
  return response.json();
};



// Creative Launch API
export const launchCreatives = async (files: string[], campaignIds: string[]) => {
  const response = await apiRequest('POST', '/api/creatives/launch', {
    files,
    campaignIds
  });
  return response.json();
};

// Meta API Status
export const getMetaStatus = async () => {
  const response = await apiRequest('GET', '/api/meta/status', undefined);
  return response.json();
};
