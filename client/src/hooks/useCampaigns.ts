import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Campaign, FileUpload } from "@shared/schema";

export function useCampaigns() {
  const [selectedCampaigns, setSelectedCampaigns] = useState<string[]>([]);
  const [filteredCampaigns, setFilteredCampaigns] = useState<Campaign[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch campaigns
  const { data: campaigns = [], isLoading, refetch } = useQuery<Campaign[]>({
    queryKey: ['/api/campaigns'],
    // Enable fetching by default since we're auto-authenticating
    enabled: true,
    staleTime: 60 * 1000, // Cache for 1 minute
    refetchOnWindowFocus: false
  });

  // Launch creatives mutation
  const launchMutation = useMutation({
    mutationFn: async ({ 
      files, 
      campaignIds 
    }: { 
      files: FileUpload[]; 
      campaignIds: string[] 
    }) => {
      const response = await apiRequest('POST', '/api/creatives/launch', {
        files,
        campaignIds
      });
      return response.json();
    }
  });

  // Update filtered campaigns when original campaigns or search query changes
  useEffect(() => {
    if (!campaigns) return;
    
    if (!searchQuery) {
      setFilteredCampaigns(campaigns);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredCampaigns(
        campaigns.filter(campaign => 
          campaign.name.toLowerCase().includes(query) ||
          campaign.id.toLowerCase().includes(query)
        )
      );
    }
  }, [campaigns, searchQuery]);

  // Toggle campaign selection
  const toggleCampaign = (campaignId: string) => {
    setSelectedCampaigns(prev => {
      if (prev.includes(campaignId)) {
        return prev.filter(id => id !== campaignId);
      } else {
        return [...prev, campaignId];
      }
    });
  };

  // Select/deselect all campaigns
  const selectAllCampaigns = (selected: boolean) => {
    if (selected) {
      setSelectedCampaigns(filteredCampaigns.map(c => c.id));
    } else {
      setSelectedCampaigns([]);
    }
  };

  // Search campaigns
  const searchCampaigns = (query: string) => {
    setSearchQuery(query);
  };

  // Launch creatives to selected campaigns
  const launchCreatives = async (files: FileUpload[], campaigns: string[]) => {
    try {
      const result = await launchMutation.mutateAsync({
        files,
        campaignIds: campaigns
      });
      
      // Check if we had errors
      if (result.errorCount > 0 && result.errors && result.errors.length > 0) {
        // Format a more user-friendly error message
        const errorMessages = result.errors.map((error: string) => {
          // Handle specific error messages
          if (error.includes("No ad sets found")) {
            return "Creating ad set automatically. Please try again.";
          }
          return error;
        });
        
        // Throw a formatted error with all messages
        const errorMessage = errorMessages.join('. ');
        throw new Error(errorMessage);
      }
      
      return result;
    } catch (error) {
      console.error('Error launching creatives:', error);
      
      // If this is a network or parsing error
      if (!(error instanceof Error)) {
        throw new Error('Unknown error occurred while launching creatives');
      }
      
      // Pass along the error
      throw error;
    }
  };

  return {
    campaigns: filteredCampaigns,
    isLoading,
    refetchCampaigns: refetch,
    selectedCampaigns,
    toggleCampaign,
    selectAllCampaigns,
    searchCampaigns,
    launchCreatives,
    isLaunching: launchMutation.isPending
  };
}
