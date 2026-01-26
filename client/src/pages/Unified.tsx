import React, { useState, useEffect } from 'react';
import Header from "@/components/Header";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Zap, Calendar, ExternalLink, CheckCircle, Mic, Upload, Video, User, RefreshCw, FileText } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { useMetaAuth } from '@/hooks/useMetaAuth';
import { Link } from 'wouter';
import { LanguageSelector } from '@/components/LanguageSelector';

interface ScriptResult {
  suggestions: Array<{
    title: string;
    content: string;
    nativeContent?: string;  // Native language version when multilingual
    language?: string;       // Language code when multilingual
    reasoning: string;
    targetMetrics?: string[];
    audioUrl?: string;
    audioFile?: string;
    videoUrl?: string;
    videoFile?: string;
    videoError?: string;
    error?: string;
  }>;
  message: string;
  savedToSheet: boolean;
}

export default function Unified() {
  const [spreadsheetId, setSpreadsheetId] = useState('');
  const [withAudio, setWithAudio] = useState(false);
  const [includeSubtitles, setIncludeSubtitles] = useState(false);
  const [scriptCount, setScriptCount] = useState(5);
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<ScriptResult | null>(null);
  const [selectedScripts, setSelectedScripts] = useState<Set<number>>(new Set());
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);
  const [backgroundVideos, setBackgroundVideos] = useState<string[]>([]);
  const [showDriveVideos, setShowDriveVideos] = useState(false);
  const [driveVideos, setDriveVideos] = useState<any[]>([]);
  const [isLoadingDrive, setIsLoadingDrive] = useState(false);
  const [isDriveConfigured, setIsDriveConfigured] = useState(false);
  const [availableBackgroundVideos, setAvailableBackgroundVideos] = useState<{id: string, name: string, driveId: string, size?: string}[]>([]);
  const [selectedBackgroundVideo, setSelectedBackgroundVideo] = useState<string>(''); // Now stores driveId
  const [loadingVideos, setLoadingVideos] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState<string>('I8vyadnJFaMFR0zgn147'); // Default to Hybrid Voice 1
  const [availableVoices, setAvailableVoices] = useState<{voice_id: string, name: string}[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [guidance, setGuidance] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('en'); // Default to English
  const [primerFile, setPrimerFile] = useState<File | null>(null);
  const [experimentalPercentage, setExperimentalPercentage] = useState(40);
  const [individualGeneration, setIndividualGeneration] = useState(true);
  const [slackEnabled, setSlackEnabled] = useState(false);
  const [llmProvider, setLlmProvider] = useState<'openai' | 'groq' | 'gemini'>('openai');
  const [availableLlmProviders, setAvailableLlmProviders] = useState<{id: string, name: string, available: boolean}[]>([]);
  
  // States for processing existing scripts
  const [activeTab, setActiveTab] = useState<'iterations' | 'generate' | 'process' | 'meta-upload'>('iterations');
  const [availableTabs, setAvailableTabs] = useState<string[]>([]);
  const [selectedTabs, setSelectedTabs] = useState<string[]>([]);
  const [existingScripts, setExistingScripts] = useState<any[]>([]);
  const [selectedExistingScripts, setSelectedExistingScripts] = useState<Set<number>>(new Set());
  const [isLoadingTabs, setIsLoadingTabs] = useState(false);
  const [isLoadingScripts, setIsLoadingScripts] = useState(false);
  const [isProcessingScripts, setIsProcessingScripts] = useState(false);
  const [selectedBackgroundVideosMulti, setSelectedBackgroundVideosMulti] = useState<string[]>([]);
  
  // States for iterations tab
  const [iterationsCount, setIterationsCount] = useState(3);
  const [iterationsSpreadsheetId, setIterationsSpreadsheetId] = useState('');
  const [iterationsOutputSpreadsheetId, setIterationsOutputSpreadsheetId] = useState('');
  const [iterationsTab, setIterationsTab] = useState<string>('');
  const [iterationsAvailableTabs, setIterationsAvailableTabs] = useState<string[]>([]);
  const [iterationsScripts, setIterationsScripts] = useState<any[]>([]);
  const [selectedIterationsScripts, setSelectedIterationsScripts] = useState<Set<number>>(new Set());
  const [isLoadingIterationsTabs, setIsLoadingIterationsTabs] = useState(false);
  const [isLoadingIterationsScripts, setIsLoadingIterationsScripts] = useState(false);
  const [isGeneratingIterations, setIsGeneratingIterations] = useState(false);
  const [iterationsResult, setIterationsResult] = useState<ScriptResult | null>(null);

  // States for Meta upload tab
  const [metaFolderUrl, setMetaFolderUrl] = useState('');
  const [metaVideos, setMetaVideos] = useState<{id: string, name: string, size?: string, mimeType?: string}[]>([]);
  const [selectedMetaVideos, setSelectedMetaVideos] = useState<Set<string>>(new Set());
  const [isLoadingMetaVideos, setIsLoadingMetaVideos] = useState(false);
  const [isUploadingToMeta, setIsUploadingToMeta] = useState(false);
  const [metaUploadProgress, setMetaUploadProgress] = useState<{current: number, total: number, currentVideo?: string}>({current: 0, total: 0});

  const { toast } = useToast();

  // Load available background videos from Google Drive
  useEffect(() => {
    const loadBackgroundVideos = async () => {
      setLoadingVideos(true);
      try {
        const response = await fetch('/api/video/background-videos');
        if (response.ok) {
          const data = await response.json();
          setAvailableBackgroundVideos(data.videos || []);
          setIsDriveConfigured(data.source === 'google_drive');
          if (data.videos && data.videos.length > 0 && !selectedBackgroundVideo) {
            setSelectedBackgroundVideo(data.videos[0].driveId);
          }
        }
      } catch (error) {
        console.error('Error loading background videos:', error);
      } finally {
        setLoadingVideos(false);
      }
    };
    loadBackgroundVideos();
  }, []);

  // Load available voices from ElevenLabs
  useEffect(() => {
    const loadVoices = async () => {
      setLoadingVoices(true);
      try {
        const response = await fetch('/api/elevenlabs/voices');
        if (response.ok) {
          const data = await response.json();
          // Use all voices from API
          const allVoices = data.voices.map((voice: any) => ({
            voice_id: voice.voice_id,
            name: voice.name
          }));
          
          setAvailableVoices(allVoices);
          console.log('Loaded voices:', allVoices);
        }
      } catch (error) {
        console.error('Error loading voices:', error);
        // Fallback to default voices if API fails
        setAvailableVoices([
          { voice_id: 'I8vyadnJFaMFR0zgn147', name: 'Hybrid Voice 1' },
          { voice_id: 'huvDR9lwwSKC0zEjZUox', name: 'Ellara (Ellabot 2.0)' },
          { voice_id: 'flq6f7yk4E4fJM5XTYuZ', name: 'Mark (Alternative)' }
        ]);
      } finally {
        setLoadingVoices(false);
      }
    };
    
    loadVoices();
  }, []);

  // Load available LLM providers
  useEffect(() => {
    const loadProviders = async () => {
      try {
        const response = await fetch('/api/ai/providers');
        if (response.ok) {
          const data = await response.json();
          setAvailableLlmProviders(data.providers);
          // Default to first available provider
          const firstAvailable = data.providers.find((p: any) => p.available);
          if (firstAvailable && llmProvider !== firstAvailable.id) {
            setLlmProvider(firstAvailable.id);
          }
        }
      } catch (error) {
        console.error('Error loading LLM providers:', error);
      }
    };
    loadProviders();
  }, []);

  // Load available tabs when spreadsheet ID changes and activeTab is 'process'
  useEffect(() => {
    if (spreadsheetId && activeTab === 'process') {
      loadAvailableTabs();
    }
  }, [spreadsheetId, activeTab]);

  // Load available tabs for iterations when spreadsheet ID changes and activeTab is 'iterations'
  useEffect(() => {
    if (iterationsSpreadsheetId && activeTab === 'iterations') {
      loadIterationsTabs();
    }
  }, [iterationsSpreadsheetId, activeTab]);

  // Load available tabs from Google Sheets
  const loadAvailableTabs = async () => {
    if (!spreadsheetId) return;
    
    setIsLoadingTabs(true);
    try {
      const response = await fetch(`/api/google-sheets/tabs?spreadsheetId=${encodeURIComponent(spreadsheetId)}`);
      if (response.ok) {
        const data = await response.json();
        setAvailableTabs(data.tabs);
        
        // Filter out stale tabs that don't exist in the new spreadsheet
        const validSelectedTabs = selectedTabs.filter(tab => data.tabs.includes(tab));
        
        // If no valid tabs remain, default to the first available tab
        if (validSelectedTabs.length === 0 && data.tabs.length > 0) {
          setSelectedTabs([data.tabs[0]]);
        } else {
          setSelectedTabs(validSelectedTabs);
        }
      } else {
        toast({
          title: "Failed to load tabs",
          description: "Could not get tabs from Google Sheets",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error loading tabs:', error);
      toast({
        title: "Error",
        description: "Failed to connect to Google Sheets",
        variant: "destructive"
      });
    } finally {
      setIsLoadingTabs(false);
    }
  };

  // Load scripts from selected tabs (multiple tabs)
  const loadScriptsFromTab = async () => {
    if (!spreadsheetId || selectedTabs.length === 0) return;
    
    setIsLoadingScripts(true);
    try {
      // Load scripts from all selected tabs
      const allScripts: any[] = [];
      
      for (const tabName of selectedTabs) {
        const response = await fetch('/api/google-sheets/read-scripts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ spreadsheetId, tabName })
        });
        
        if (response.ok) {
          const data = await response.json();
          // Add tab name to each script for tracking
          const scriptsWithTab = data.scripts.map((script: any) => ({
            ...script,
            sourceTab: tabName
          }));
          allScripts.push(...scriptsWithTab);
        } else {
          toast({
            title: "Warning",
            description: `Could not load scripts from tab "${tabName}"`,
            variant: "destructive"
          });
        }
      }
      
      setExistingScripts(allScripts);
      setSelectedExistingScripts(new Set()); // Reset selection
      
      const tabsList = selectedTabs.length === 1 ? `"${selectedTabs[0]}"` : `${selectedTabs.length} tabs`;
      toast({
        title: "Scripts loaded",
        description: `Found ${allScripts.length} scripts from ${tabsList}`,
      });
    } catch (error) {
      console.error('Error loading scripts:', error);
      toast({
        title: "Error",
        description: "Failed to load scripts from Google Sheets",
        variant: "destructive"
      });
    } finally {
      setIsLoadingScripts(false);
    }
  };

  // Process selected existing scripts into videos
  const handleProcessExistingScripts = async () => {
    if (selectedExistingScripts.size === 0) {
      toast({
        title: "No scripts selected",
        description: "Please select at least one script to process",
        variant: "destructive"
      });
      return;
    }

    setIsProcessingScripts(true);
    try {
      const scriptsToProcess = Array.from(selectedExistingScripts).map(index => existingScripts[index]);
      
      // Convert selected background video IDs to Drive format
      const selectedBgVideosDrive = selectedBackgroundVideosMulti
        .map(driveId => availableBackgroundVideos.find(v => v.driveId === driveId))
        .filter(v => v)
        .map(v => ({ driveId: v!.driveId, name: v!.name }));
      
      const response = await fetch('/api/scripts/process-to-videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scripts: scriptsToProcess,
          voiceId: selectedVoice,
          language: selectedLanguage,
          backgroundVideosDrive: selectedBgVideosDrive,
          sendToSlack: slackEnabled,
          slackNotificationDelay: slackEnabled ? 15 : 0, // 15 minute delay if Slack is enabled
          includeSubtitles: includeSubtitles
        })
      });

      if (response.ok) {
        const result = await response.json();
        toast({
          title: "Scripts processed successfully",
          description: result.message,
        });
        
        // Reset selection
        setSelectedExistingScripts(new Set());
        
        // Optionally reload scripts to see any updates
        await loadScriptsFromTab();
      } else {
        const error = await response.json();
        toast({
          title: "Processing failed",
          description: error.details || "Failed to process scripts",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error processing scripts:', error);
      toast({
        title: "Error",
        description: "Failed to process scripts into videos",
        variant: "destructive"
      });
    } finally {
      setIsProcessingScripts(false);
    }
  };

  // Load available tabs for iterations
  const loadIterationsTabs = async () => {
    if (!iterationsSpreadsheetId) return;
    
    setIsLoadingIterationsTabs(true);
    try {
      const response = await fetch(`/api/google-sheets/tabs?spreadsheetId=${encodeURIComponent(iterationsSpreadsheetId)}`);
      if (response.ok) {
        const data = await response.json();
        setIterationsAvailableTabs(data.tabs);
        if (data.tabs.length > 0 && !iterationsTab) {
          setIterationsTab(data.tabs[0]);
        }
      } else {
        toast({
          title: "Failed to load tabs",
          description: "Could not get tabs from Google Sheets",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error loading tabs:', error);
      toast({
        title: "Error",
        description: "Failed to connect to Google Sheets",
        variant: "destructive"
      });
    } finally {
      setIsLoadingIterationsTabs(false);
    }
  };

  // Load scripts from selected tab for iterations
  const loadIterationsScriptsFromTab = async () => {
    if (!iterationsSpreadsheetId || !iterationsTab) return;
    
    setIsLoadingIterationsScripts(true);
    try {
      const response = await fetch('/api/google-sheets/read-scripts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spreadsheetId: iterationsSpreadsheetId, tabName: iterationsTab })
      });
      
      if (response.ok) {
        const data = await response.json();
        setIterationsScripts(data.scripts);
        setSelectedIterationsScripts(new Set()); // Reset selection
        toast({
          title: "Scripts loaded",
          description: `Found ${data.scripts.length} scripts in "${iterationsTab}"`,
        });
      } else {
        toast({
          title: "Failed to load scripts",
          description: "Could not read scripts from the selected tab",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error loading scripts:', error);
      toast({
        title: "Error",
        description: "Failed to load scripts from Google Sheets",
        variant: "destructive"
      });
    } finally {
      setIsLoadingIterationsScripts(false);
    }
  };

  // Generate iterations for selected scripts
  const handleGenerateIterations = async () => {
    if (selectedIterationsScripts.size === 0) {
      toast({
        title: "No scripts selected",
        description: "Please select at least one script to iterate on",
        variant: "destructive"
      });
      return;
    }

    if (withAudio && availableBackgroundVideos.length > 0 && !selectedBackgroundVideo) {
      toast({
        title: "Background Video Required",
        description: "Please select a background video for video generation",
        variant: "destructive",
      });
      return;
    }

    setIsGeneratingIterations(true);
    setIterationsResult(null);
    
    try {
      const scriptsToIterate = Array.from(selectedIterationsScripts).map(index => iterationsScripts[index]);
      
      // Validate output spreadsheet is provided
      if (!iterationsOutputSpreadsheetId || iterationsOutputSpreadsheetId.trim() === '') {
        toast({
          title: "Output Spreadsheet Required",
          description: "Please provide an output Google Sheets URL or ID",
          variant: "destructive",
        });
        return;
      }

      // Get the selected background video details for Drive download
      const selectedBgVideo = availableBackgroundVideos.find(v => v.driveId === selectedBackgroundVideo);
      
      const requestBody: any = {
        sourceScripts: scriptsToIterate,
        iterationsPerScript: iterationsCount,
        generateAudio: withAudio,
        backgroundVideoDriveId: selectedBgVideo?.driveId,
        backgroundVideoName: selectedBgVideo?.name,
        voiceId: selectedVoice,
        language: selectedLanguage,
        experimentalPercentage: experimentalPercentage,
        individualGeneration: individualGeneration,
        slackEnabled: slackEnabled,
        spreadsheetId: iterationsOutputSpreadsheetId,
        includeSubtitles: includeSubtitles,
        llmProvider: llmProvider
      };

      // Add guidance prompt only if provided
      if (guidance.trim().length > 0) {
        requestBody.guidancePrompt = guidance.trim();
      }

      // Add primer file content if uploaded
      if (primerFile) {
        const primerContent = await primerFile.text();
        requestBody.primerContent = primerContent;
      }

      const response = await fetch('/api/ai/generate-iterations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error('Failed to generate iterations');
      }

      const result = await response.json();
      setIterationsResult(result);

      // Check if guidance was used for the toast message
      const wasGuidanceUsed = guidance.trim().length > 0;

      toast({
        title: "Iterations Generated!",
        description: `Generated ${result.suggestions.length} script iterations${wasGuidanceUsed ? ' with creative guidance applied' : ''}`,
      });

    } catch (error) {
      console.error('Error generating iterations:', error);
      toast({
        title: "Generation Failed",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive"
      });
    } finally {
      setIsGeneratingIterations(false);
    }
  };

  const handleScriptSelection = (index: number, checked: boolean) => {
    setSelectedScripts(prev => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(index);
      } else {
        newSet.delete(index);
      }
      return newSet;
    });
  };

  const handleSelectAllScripts = (checked: boolean) => {
    if (checked) {
      setSelectedScripts(new Set(result?.suggestions.map((_, index) => index) || []));
    } else {
      setSelectedScripts(new Set());
    }
  };

  const handleGenerateAudioForSelected = async () => {
    if (!result || selectedScripts.size === 0) return;

    setIsGeneratingAudio(true);
    try {
      const selectedSuggestions = Array.from(selectedScripts).map(index => 
        result.suggestions[index]
      );

      const response = await fetch('/api/ai/generate-audio-only', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          suggestions: selectedSuggestions,
          indices: Array.from(selectedScripts)
        })
      });

      if (!response.ok) {
        throw new Error('Failed to generate audio');
      }

      const audioResult = await response.json();
      
      // Update the result with new audio URLs
      setResult(prevResult => {
        if (!prevResult) return prevResult;
        
        const updatedSuggestions = [...prevResult.suggestions];
        audioResult.suggestions.forEach((updatedSuggestion: any, resultIndex: number) => {
          const originalIndex = Array.from(selectedScripts)[resultIndex];
          updatedSuggestions[originalIndex] = updatedSuggestion;
        });

        return {
          ...prevResult,
          suggestions: updatedSuggestions
        };
      });

      toast({
        title: "Audio Generated!",
        description: `Generated ${selectedScripts.size} audio recording${selectedScripts.size !== 1 ? 's' : ''}`,
      });
    } catch (error) {
      toast({
        title: "Audio Generation Failed",
        description: error instanceof Error ? error.message : "Failed to generate audio",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingAudio(false);
    }
  };
  const { isAuthenticated, logout, login } = useMetaAuth();

  // Fetch background videos on component mount
  React.useEffect(() => {
    fetchBackgroundVideos();
  }, []);

  const fetchBackgroundVideos = async () => {
    try {
      const response = await fetch('/api/video/status');
      if (response.ok) {
        const data = await response.json();
        setBackgroundVideos(data.backgroundVideos || []);
        setIsDriveConfigured(data.driveConfigured || false);
      }
    } catch (error) {
      console.error('Failed to fetch background videos:', error);
    }
  };

  const fetchDriveVideos = async () => {
    setIsLoadingDrive(true);
    try {
      const response = await fetch('/api/drive/videos');
      if (response.ok) {
        const data = await response.json();
        setDriveVideos(data.videos || []);
      } else {
        const errorData = await response.json();
        const isApiNotEnabled = errorData.details?.includes('Google Drive API') || errorData.error?.includes('not enabled');
        
        toast({
          title: "Drive Setup Required",
          description: isApiNotEnabled 
            ? "Google Drive API needs to be enabled in your Google Cloud Console. Check the console for the setup link."
            : errorData.message || "Unable to access Google Drive",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Drive Error",
        description: "Failed to load Google Drive videos",
        variant: "destructive",
      });
    } finally {
      setIsLoadingDrive(false);
    }
  };

  const handleDriveVideoDownload = async (fileId: string, fileName: string) => {
    setIsUploadingVideo(true);
    try {
      const response = await fetch('/api/drive/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId, fileName })
      });

      const result = await response.json();

      if (result.success) {
        toast({
          title: "Video Downloaded!",
          description: `"${fileName}" is now available as a background video`,
        });
        await fetchBackgroundVideos();
        setShowDriveVideos(false);
      } else {
        throw new Error(result.error || 'Download failed');
      }
    } catch (error) {
      toast({
        title: "Download Failed",
        description: error instanceof Error ? error.message : "Failed to download video",
        variant: "destructive",
      });
    } finally {
      setIsUploadingVideo(false);
    }
  };

  const handleVideoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const formData = new FormData();
    Array.from(files).forEach(file => {
      formData.append('videos', file);
    });

    setIsUploadingVideo(true);
    try {
      const response = await fetch('/api/video/upload-background', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to upload videos');
      }

      const result = await response.json();
      
      const uploadedCount = result.uploaded?.filter((f: any) => f.status === 'uploaded').length || 0;
      const existingCount = result.uploaded?.filter((f: any) => f.status === 'already_exists').length || 0;
      const failedCount = result.failed?.length || 0;
      
      let description = '';
      if (uploadedCount > 0) {
        description += `${uploadedCount} video${uploadedCount > 1 ? 's' : ''} uploaded successfully. `;
      }
      if (existingCount > 0) {
        description += `${existingCount} video${existingCount > 1 ? 's' : ''} already existed. `;
      }
      if (failedCount > 0) {
        description += `${failedCount} video${failedCount > 1 ? 's' : ''} failed.`;
      }
      
      toast({
        title: files.length === 1 ? "Video Uploaded!" : "Videos Uploaded!",
        description: description.trim(),
      });

      // Refresh both background videos lists
      await fetchBackgroundVideos();
      
      // Also refresh the dropdown list (availableBackgroundVideos)
      const bgResponse = await fetch('/api/video/background-videos');
      if (bgResponse.ok) {
        const bgData = await bgResponse.json();
        setAvailableBackgroundVideos(bgData.videos);
      }
      
      // Clear the input
      event.target.value = '';
    } catch (error) {
      toast({
        title: "Upload Failed",
        description: error instanceof Error ? error.message : "Failed to upload videos",
        variant: "destructive",
      });
    } finally {
      setIsUploadingVideo(false);
    }
  };

  const handleGenerate = async () => {
    if (!spreadsheetId.trim()) {
      toast({
        title: "Missing Information",
        description: "Please provide a Google Sheets URL or ID",
        variant: "destructive"
      });
      return;
    }

    if (withAudio && availableBackgroundVideos.length > 0 && !selectedBackgroundVideo) {
      toast({
        title: "Background Video Required",
        description: "Please select a background video for video generation",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    setResult(null);
    setSelectedScripts(new Set());
    setIsGeneratingAudio(false);

    try {
      // Get the selected background video details for Drive download
      const selectedBgVideo = availableBackgroundVideos.find(v => v.driveId === selectedBackgroundVideo);
      
      // Generate AI scripts using Guidance Primer
      const scriptRequestBody: any = {
        spreadsheetId: spreadsheetId.trim(),
        generateAudio: withAudio,
        scriptCount: scriptCount,
        backgroundVideoDriveId: selectedBgVideo?.driveId,
        backgroundVideoName: selectedBgVideo?.name,
        voiceId: selectedVoice,
        language: selectedLanguage,
        experimentalPercentage: experimentalPercentage,
        individualGeneration: individualGeneration,
        slackEnabled: slackEnabled,
        includeSubtitles: includeSubtitles,
        llmProvider: llmProvider
      };

      // Add guidance prompt only if provided
      if (guidance.trim().length > 0) {
        scriptRequestBody.guidancePrompt = guidance.trim();
      }

      // Add primer file content if uploaded
      if (primerFile) {
        const primerContent = await primerFile.text();
        scriptRequestBody.primerContent = primerContent;
      }

      const scriptResponse = await fetch('/api/ai/generate-scripts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scriptRequestBody)
      });

      if (!scriptResponse.ok) {
        throw new Error('Failed to generate AI scripts');
      }

      const scriptResult = await scriptResponse.json();

      setResult(scriptResult);

      // Check if guidance was used for the toast message
      const wasGuidanceUsed = guidance.trim().length > 0;

      toast({
        title: "Complete Success!",
        description: `Generated ${scriptResult.suggestions.length} AI script suggestions${wasGuidanceUsed ? ' with creative guidance applied' : ''}`,
      });

    } catch (error) {
      console.error('Error in unified generation:', error);
      toast({
        title: "Generation Failed",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive"
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header 
        isAuthenticated={isAuthenticated}
        onLogout={logout}
        onLogin={login}
      />
      <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-2 mb-4">
          <Zap className="h-8 w-8 text-blue-600" />
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Script, Audio and Video Generation
          </h1>
        </div>
        <p className="text-gray-600 max-w-2xl mx-auto">
          Generate new AI scripts or process existing scripts from Google Sheets into videos
        </p>
      </div>

      {/* Tabs for Iterations, Generate, Process, and Meta Upload */}
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'iterations' | 'generate' | 'process' | 'meta-upload')}>
        <TabsList className="grid w-full grid-cols-4 mb-6">
          <TabsTrigger value="iterations" className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            Generate Iterations
          </TabsTrigger>
          <TabsTrigger value="generate" className="flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Generate New Scripts
          </TabsTrigger>
          <TabsTrigger value="process" className="flex items-center gap-2">
            <Video className="h-4 w-4" />
            Process Existing Scripts
          </TabsTrigger>
          <TabsTrigger value="meta-upload" className="flex items-center gap-2">
            <Upload className="h-4 w-4" />
            Upload to Meta
          </TabsTrigger>
        </TabsList>

        {/* Iterations Tab Content */}
        <TabsContent value="iterations" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RefreshCw className="h-5 w-5" />
                Generate Script Iterations
              </CardTitle>
              <CardDescription>
                Load existing scripts from Google Sheets and generate creative variations
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Source Google Sheets URL */}
              <div className="space-y-2">
                <Label htmlFor="iterations-spreadsheet">Source Google Sheets URL or ID</Label>
                <Input
                  id="iterations-spreadsheet"
                  value={iterationsSpreadsheetId}
                  onChange={(e) => setIterationsSpreadsheetId(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/your-sheet-id/edit or just the sheet ID"
                  data-testid="input-iterations-spreadsheet"
                />
                <p className="text-xs text-gray-500">
                  Load existing winning scripts from this spreadsheet
                </p>
              </div>

              {/* Output Google Sheets URL */}
              <div className="space-y-2">
                <Label htmlFor="iterations-output-spreadsheet">Output Google Sheets URL or ID</Label>
                <Input
                  id="iterations-output-spreadsheet"
                  value={iterationsOutputSpreadsheetId}
                  onChange={(e) => setIterationsOutputSpreadsheetId(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/your-sheet-id/edit or just the sheet ID"
                  data-testid="input-iterations-output-spreadsheet"
                />
                <p className="text-xs text-gray-500">
                  Generated iterations will be saved to this spreadsheet
                </p>
              </div>

              {/* Tab Selection */}
              {iterationsSpreadsheetId && (
                <div className="space-y-2">
                  <Label htmlFor="iterations-tab-selector">Select Google Sheets Tab</Label>
                  <div className="flex gap-2">
                    <Select
                      value={iterationsTab}
                      onValueChange={setIterationsTab}
                      disabled={isLoadingIterationsTabs || iterationsAvailableTabs.length === 0}
                    >
                      <SelectTrigger id="iterations-tab-selector">
                        <SelectValue placeholder={isLoadingIterationsTabs ? "Loading tabs..." : "Select a tab"} />
                      </SelectTrigger>
                      <SelectContent>
                        {iterationsAvailableTabs.map((tab) => (
                          <SelectItem key={tab} value={tab}>
                            {tab}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      onClick={loadIterationsScriptsFromTab}
                      disabled={!iterationsTab || isLoadingIterationsScripts}
                      variant="outline"
                      data-testid="button-load-iterations-scripts"
                    >
                      {isLoadingIterationsScripts ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Loading...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="mr-2 h-4 w-4" />
                          Load Scripts
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {/* Iterations Count Selector */}
              {iterationsScripts.length > 0 && (
                <div className="space-y-2 border-t pt-4">
                  <Label htmlFor="iterations-count">Iterations per Script</Label>
                  <Select
                    value={iterationsCount.toString()}
                    onValueChange={(value) => setIterationsCount(parseInt(value))}
                  >
                    <SelectTrigger id="iterations-count" data-testid="select-iterations-count">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                        <SelectItem key={num} value={num.toString()}>
                          {num} {num === 1 ? 'iteration' : 'iterations'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-500">
                    Each selected script will generate {iterationsCount} creative {iterationsCount === 1 ? 'variation' : 'variations'}
                  </p>
                </div>
              )}

              {/* AI Creative Inspiration */}
              {iterationsScripts.length > 0 && (
                <div className="space-y-2">
                  <Label htmlFor="iterations-ai-guidance" className="text-sm font-medium">
                    AI Creative Inspiration (Optional)
                  </Label>
                  <Textarea
                    id="iterations-ai-guidance"
                    data-testid="input-iterations-ai-guidance"
                    value={guidance}
                    onChange={(e) => setGuidance(e.target.value)}
                    placeholder="e.g., focus on humor, emphasize urgency, use storytelling approach..."
                    className="min-h-16 resize-none"
                    maxLength={2000}
                  />
                  <div className="flex justify-between items-center text-xs text-gray-500">
                    <span>Provide thematic direction to guide iteration generation</span>
                    <span>{guidance.length}/2000</span>
                  </div>
                </div>
              )}

              {/* Language Selection */}
              {iterationsScripts.length > 0 && (
                <div className="space-y-2">
                  <Label htmlFor="iterations-language-selector" className="text-sm font-medium">
                    Script Language
                  </Label>
                  <LanguageSelector
                    value={selectedLanguage}
                    onValueChange={setSelectedLanguage}
                  />
                  <p className="text-xs text-gray-500">
                    Iterations will be written natively in the selected language
                  </p>
                </div>
              )}

              {/* Voice Selection */}
              {iterationsScripts.length > 0 && availableVoices.length > 0 && (
                <div className="space-y-2">
                  <Label htmlFor="iterations-voice-selector">Voice Selection</Label>
                  <Select value={selectedVoice} onValueChange={setSelectedVoice}>
                    <SelectTrigger id="iterations-voice-selector">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-60 overflow-y-auto">
                      {availableVoices.map((voice) => {
                        const isGerman = voice.name.toLowerCase().includes('markus') || 
                                         voice.name.toLowerCase().includes('carl') || 
                                         voice.name.toLowerCase().includes('julia');
                        return (
                          <SelectItem key={voice.voice_id} value={voice.voice_id}>
                            {isGerman && '🇩🇪 '}{voice.name}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Background Video Selection */}
              {iterationsScripts.length > 0 && availableBackgroundVideos.length > 0 && (
                <div className="space-y-2">
                  <Label htmlFor="iterations-video-selector">Background Video (from Google Drive)</Label>
                  <Select value={selectedBackgroundVideo} onValueChange={setSelectedBackgroundVideo}>
                    <SelectTrigger id="iterations-video-selector">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-60 overflow-y-auto">
                      {availableBackgroundVideos.map((video) => (
                        <SelectItem key={video.driveId} value={video.driveId}>
                          {video.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Audio/Video Toggle */}
              {iterationsScripts.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-center space-x-3">
                    <Label htmlFor="iterations-audio-toggle" className="text-sm font-medium">
                      Scripts only
                    </Label>
                    <Switch
                      id="iterations-audio-toggle"
                      checked={withAudio}
                      onCheckedChange={setWithAudio}
                      data-testid="toggle-iterations-audio"
                    />
                    <Label htmlFor="iterations-audio-toggle" className="text-sm font-medium">
                      With audio{availableBackgroundVideos.length > 0 ? ' + video' : ''}
                    </Label>
                  </div>
                  <p className="text-center text-sm text-gray-500">
                    {withAudio 
                      ? `Will generate iterations with professional voice recordings${availableBackgroundVideos.length > 0 && selectedBackgroundVideo ? ' and complete video assets' : ''}` 
                      : 'Will generate iterations without audio recordings'
                    }
                  </p>
                  
                  {/* Subtitle Toggle */}
                  {withAudio && availableBackgroundVideos.length > 0 && (
                    <div className="flex items-center justify-center space-x-3 pt-2">
                      <Label htmlFor="iterations-subtitle-toggle" className="text-sm font-medium">
                        Without subtitles
                      </Label>
                      <Switch
                        id="iterations-subtitle-toggle"
                        checked={includeSubtitles}
                        onCheckedChange={setIncludeSubtitles}
                        data-testid="toggle-iterations-subtitles"
                      />
                      <Label htmlFor="iterations-subtitle-toggle" className="text-sm font-medium">
                        With burned-in subtitles
                      </Label>
                    </div>
                  )}
                </div>
              )}

              {/* Individual Generation Toggle */}
              {iterationsScripts.length > 0 && (
                <div className="space-y-4 border-t pt-4">
                  <div className="flex items-center justify-center space-x-3">
                    <Label htmlFor="iterations-individual-toggle" className="text-sm font-medium">
                      Batch generation
                    </Label>
                    <Switch
                      id="iterations-individual-toggle"
                      checked={individualGeneration}
                      onCheckedChange={setIndividualGeneration}
                      data-testid="toggle-iterations-individual-generation"
                    />
                    <Label htmlFor="iterations-individual-toggle" className="text-sm font-medium">
                      Individual calls
                    </Label>
                  </div>
                  <p className="text-center text-sm text-gray-500">
                    {individualGeneration 
                      ? 'Separate API calls per source script for maximum quality & diversity (slower, higher cost)' 
                      : 'Single API call for all iterations (faster, lower cost)'
                    }
                  </p>
                </div>
              )}

              {/* LLM Provider Selection */}
              {iterationsScripts.length > 0 && availableLlmProviders.length > 0 && (
                <div className="space-y-4 border-t pt-4">
                  <div className="flex items-center justify-center space-x-3">
                    <Label htmlFor="iterations-llm-provider" className="text-sm font-medium">
                      AI Model
                    </Label>
                    <Select
                      value={llmProvider}
                      onValueChange={(value) => setLlmProvider(value as 'openai' | 'groq' | 'gemini')}
                    >
                      <SelectTrigger 
                        id="iterations-llm-provider"
                        className="w-[180px]"
                        data-testid="select-iterations-llm-provider"
                      >
                        <SelectValue placeholder="Select AI model" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableLlmProviders.map((provider) => (
                          <SelectItem 
                            key={provider.id} 
                            value={provider.id}
                            disabled={!provider.available}
                          >
                            {provider.name} {!provider.available && '(Not configured)'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-center text-sm text-gray-500">
                    {llmProvider === 'openai' && 'OpenAI GPT-5.1 - High quality reasoning'}
                    {llmProvider === 'groq' && 'Groq Llama 3.3 70B - Fast inference (requires API key)'}
                    {llmProvider === 'gemini' && 'Google Gemini 3 Pro - Uses Replit credits (no API key needed)'}
                  </p>
                </div>
              )}

              {/* Slack Toggle */}
              {iterationsScripts.length > 0 && (
                <div className="space-y-4 border-t pt-4">
                  <div className="flex items-center justify-center space-x-3">
                    <Label htmlFor="iterations-slack-toggle" className="text-sm font-medium">
                      Slack OFF
                    </Label>
                    <Switch
                      id="iterations-slack-toggle"
                      checked={slackEnabled}
                      onCheckedChange={setSlackEnabled}
                      data-testid="toggle-iterations-slack"
                    />
                    <Label htmlFor="iterations-slack-toggle" className="text-sm font-medium">
                      Slack ON
                    </Label>
                  </div>
                  <p className="text-center text-sm text-gray-500">
                    {slackEnabled 
                      ? "Slack notifications enabled - Videos will be sent for approval after generation" 
                      : "Slack notifications disabled - Testing mode, no approval workflow"
                    }
                  </p>
                </div>
              )}

              {/* Display Loaded Scripts with Selection */}
              {iterationsScripts.length > 0 && (
                <div className="space-y-4 border-t pt-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Select Scripts to Iterate</h3>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (selectedIterationsScripts.size === iterationsScripts.length) {
                          setSelectedIterationsScripts(new Set());
                        } else {
                          setSelectedIterationsScripts(new Set(iterationsScripts.map((_, i) => i)));
                        }
                      }}
                      data-testid="button-select-all-iterations"
                    >
                      {selectedIterationsScripts.size === iterationsScripts.length ? 'Deselect All' : 'Select All'}
                    </Button>
                  </div>
                  <p className="text-sm text-gray-600">
                    Selected {selectedIterationsScripts.size} of {iterationsScripts.length} scripts • 
                    Will generate {selectedIterationsScripts.size * iterationsCount} total iterations
                  </p>

                  <div className="space-y-3">
                    {iterationsScripts.map((script, index) => (
                      <Card key={index} className="border">
                        <CardContent className="pt-4">
                          <div className="flex items-start gap-3">
                            <Checkbox
                              id={`iterations-script-${index}`}
                              checked={selectedIterationsScripts.has(index)}
                              onCheckedChange={(checked) => {
                                const newSet = new Set(selectedIterationsScripts);
                                if (checked) {
                                  newSet.add(index);
                                } else {
                                  newSet.delete(index);
                                }
                                setSelectedIterationsScripts(newSet);
                              }}
                              className="mt-1"
                              data-testid={`checkbox-iterations-script-${index}`}
                            />
                            <div className="flex-1">
                              <h4 className="font-medium mb-2">{script.scriptTitle}</h4>
                              {script.nativeContent && script.recordingLanguage !== 'English' ? (
                                <div className="mb-2">
                                  <p className="text-sm text-gray-900 mb-1 font-medium italic">
                                    {script.recordingLanguage}: "{script.nativeContent}"
                                  </p>
                                  {script.content && (
                                    <>
                                      <p className="text-xs text-gray-600 mb-1">English translation:</p>
                                      <p className="text-sm text-gray-700 italic">"{script.content}"</p>
                                    </>
                                  )}
                                </div>
                              ) : (
                                <p className="text-sm text-gray-700 mb-2 italic">
                                  "{script.content || script.nativeContent}"
                                </p>
                              )}
                              <p className="text-xs text-gray-500">
                                Will generate {iterationsCount} {iterationsCount === 1 ? 'iteration' : 'iterations'}
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  {/* Generate Iterations Button */}
                  <Button
                    onClick={handleGenerateIterations}
                    disabled={isGeneratingIterations || selectedIterationsScripts.size === 0}
                    className="w-full"
                    size="lg"
                    data-testid="button-generate-iterations"
                  >
                    {isGeneratingIterations ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Generating Iterations...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Generate {selectedIterationsScripts.size * iterationsCount} Iterations 
                        {withAudio && ' + Audio/Video'}
                      </>
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Display Generated Iterations Results */}
          {iterationsResult && (
            <div className="space-y-6">
              <Card className="bg-green-50 border-green-200">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 text-green-800 mb-4">
                    <CheckCircle className="h-5 w-5" />
                    <span className="font-medium text-lg">Iterations Generated!</span>
                  </div>
                  <div className="text-sm">
                    <p className="font-medium">Script Iterations:</p>
                    <p>{iterationsResult.suggestions.length} creative variations generated</p>
                    <p>Saved to your Google Sheets</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Generated Iterations</CardTitle>
                  <CardDescription>
                    Creative variations with optional voiceovers and video assets
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {iterationsResult.suggestions.map((suggestion, index) => (
                      <Card key={index} className="bg-blue-50 border-blue-200">
                        <CardContent className="pt-4">
                          <div className="flex-1">
                            <h4 className="font-medium text-blue-900 mb-2">{suggestion.title}</h4>
                            {suggestion.nativeContent ? (
                              <div className="mb-3">
                                <p className="text-sm text-gray-900 mb-1 font-medium italic">"{suggestion.nativeContent}"</p>
                                <p className="text-xs text-gray-600 mb-1">English translation:</p>
                                <p className="text-sm text-gray-700 italic">"{suggestion.content}"</p>
                              </div>
                            ) : (
                              <p className="text-sm text-gray-700 mb-3 italic">"{suggestion.content}"</p>
                            )}
                            <p className="text-xs text-blue-700">{suggestion.reasoning}</p>
                            
                            {suggestion.videoUrl && (
                              <div className="bg-green-100 border border-green-300 rounded-lg p-3 mt-3">
                                <div className="flex items-center gap-2 mb-2">
                                  <Video className="h-4 w-4 text-green-600" />
                                  <span className="text-sm font-medium text-green-800">Complete Video Asset:</span>
                                </div>
                                <video controls className="w-full max-h-60 rounded">
                                  <source src={suggestion.videoUrl} type="video/mp4" />
                                  Your browser does not support the video element.
                                </video>
                              </div>
                            )}

                            {suggestion.audioUrl && !suggestion.videoUrl && (
                              <div className="bg-blue-100 border border-blue-300 rounded-lg p-3 mt-3">
                                <div className="flex items-center gap-2 mb-2">
                                  <Mic className="h-4 w-4 text-blue-600" />
                                  <span className="text-sm font-medium text-blue-800">AI Voice Recording:</span>
                                </div>
                                <audio controls className="w-full">
                                  <source src={suggestion.audioUrl} type="audio/mpeg" />
                                  Your browser does not support the audio element.
                                </audio>
                              </div>
                            )}

                            {suggestion.videoError && (
                              <div className="bg-yellow-100 border border-yellow-300 rounded-lg p-3 mt-3">
                                <p className="text-xs text-yellow-700">{suggestion.videoError}</p>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* Generate Tab Content */}
        <TabsContent value="generate" className="space-y-6">
          {/* Configuration Form */}
          <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Configuration
          </CardTitle>
          <CardDescription>
            Configure your script generation settings and Google Sheets destination
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Google Sheets URL - moved to top as most important */}
          <div className="space-y-2">
            <Label htmlFor="spreadsheet">Google Sheets URL or ID</Label>
            <Input
              id="spreadsheet"
              value={spreadsheetId}
              onChange={(e) => setSpreadsheetId(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/your-sheet-id/edit or just the sheet ID"
            />
          </div>

          {/* Script Count Selection */}
          <div className="space-y-4">
            <div className="flex items-center justify-center space-x-3">
              <Label htmlFor="script-count" className="text-sm font-medium">
                Number of scripts:
              </Label>
              <Select value={scriptCount.toString()} onValueChange={(value) => setScriptCount(parseInt(value))}>
                <SelectTrigger className="w-20" id="script-count">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 50 }, (_, i) => i + 1).map((num) => (
                    <SelectItem key={num} value={num.toString()}>{num}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Language Selection */}
          <div className="space-y-2">
            <Label htmlFor="language-selector" className="text-sm font-medium">
              Script Language
            </Label>
            <LanguageSelector
              value={selectedLanguage}
              onValueChange={setSelectedLanguage}
            />
            <p className="text-xs text-gray-500">
              Scripts will be written natively in the selected language, then translated to English.
            </p>
          </div>

          {/* AI Guidance - Optional creative direction */}
          <div className="space-y-2">
            <Label htmlFor="ai-guidance" className="text-sm font-medium">
              AI Creative Inspiration (Optional)
            </Label>
            <Textarea
              id="ai-guidance"
              data-testid="input-ai-guidance"
              value={guidance}
              onChange={(e) => setGuidance(e.target.value)}
              placeholder="e.g., outdoor pursuits, meetup spots, family activities..."
              className="min-h-16 resize-none"
              maxLength={2000}
            />
            <div className="flex justify-between items-center text-xs text-gray-500">
              <span>Provide thematic direction to guide script generation.</span>
              <span>{guidance.length}/2000</span>
            </div>
          </div>

          {/* Update Guidance Primer */}
          <div className="space-y-2">
            <Label htmlFor="primer-upload" className="text-sm font-medium">
              Update Guidance Primer (Optional)
            </Label>
            <div className="flex items-center gap-2">
              <input
                id="primer-upload"
                type="file"
                accept=".csv"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setPrimerFile(file);
                    toast({
                      title: "Primer Uploaded",
                      description: `Using custom primer: ${file.name}`,
                    });
                  }
                }}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => document.getElementById('primer-upload')?.click()}
                data-testid="button-upload-primer"
              >
                <Upload className="mr-2 h-3 w-3" />
                {primerFile ? 'Change Primer' : 'Upload Primer'}
              </Button>
              {primerFile && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">{primerFile.name}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setPrimerFile(null);
                      toast({
                        title: "Primer Removed",
                        description: "Using default primer",
                      });
                    }}
                    data-testid="button-remove-primer"
                  >
                    Remove
                  </Button>
                </div>
              )}
            </div>
            <p className="text-xs text-gray-500">
              {primerFile 
                ? `Using custom primer file: ${primerFile.name}` 
                : 'Using default primer with proven script patterns'
              }
            </p>
          </div>

          {/* Experimentation Percentage */}
          <div className="space-y-2">
            <Label htmlFor="experimental-percentage" className="text-sm font-medium">
              Experimentation Level
            </Label>
            <div className="flex items-center gap-4">
              <Select 
                value={experimentalPercentage.toString()} 
                onValueChange={(value) => setExperimentalPercentage(parseInt(value))}
              >
                <SelectTrigger className="w-32" id="experimental-percentage" data-testid="select-experimental-percentage">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">0%</SelectItem>
                  <SelectItem value="20">20%</SelectItem>
                  <SelectItem value="40">40%</SelectItem>
                  <SelectItem value="60">60%</SelectItem>
                  <SelectItem value="80">80%</SelectItem>
                  <SelectItem value="100">100%</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-sm text-gray-600">experimental scripts</span>
            </div>
            <p className="text-xs text-gray-500">
              {experimentalPercentage}% of scripts will be creative curveballs that deviate from the primer guidance. {100 - experimentalPercentage}% will follow the primer closely.
            </p>
          </div>

          {/* Background Video Upload */}
          <div className="space-y-4">
            <div className="flex items-center justify-center space-x-3">
              <Label htmlFor="video-upload" className="text-sm font-medium">
                Background Videos ({backgroundVideos.length}):
              </Label>
              <div className="flex items-center gap-2">
                <input
                  id="video-upload"
                  type="file"
                  accept=".mp4,.mov,.avi,.mkv"
                  multiple
                  onChange={handleVideoUpload}
                  disabled={isUploadingVideo}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  onClick={() => document.getElementById('video-upload')?.click()}
                  disabled={isUploadingVideo}
                  className="bg-black text-white hover:bg-gray-800"
                >
                  {isUploadingVideo ? (
                    <>
                      <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                      UPLOADING...
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-3 w-3" />
                      UPLOAD VIDEO(S)
                    </>
                  )}
                </Button>
                {isDriveConfigured && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowDriveVideos(!showDriveVideos);
                      if (!showDriveVideos) {
                        fetchDriveVideos();
                      }
                    }}
                    disabled={isLoadingDrive}
                  >
                    {isLoadingDrive ? (
                      <>
                        <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      <>
                        <Calendar className="mr-2 h-3 w-3" />
                        Google Drive
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
            <p className="text-center text-xs text-gray-500">
              {backgroundVideos.length > 0 
                ? `Available: ${backgroundVideos.join(', ')}. Videos will be automatically created when audio is generated.`
                : "Upload background videos (.mp4, .mov, .avi, .mkv) to automatically create complete video assets."
              }
              {isDriveConfigured && " You can also import videos from Google Drive (requires Drive API to be enabled)."}
            </p>

            {/* Google Drive Video Browser */}
            {showDriveVideos && (
              <div className="mt-4 p-4 border rounded-lg bg-gray-50">
                <h4 className="font-medium mb-3">Google Drive Videos</h4>
                {isLoadingDrive ? (
                  <div className="text-center py-4">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                    <p className="text-sm text-gray-600">Loading videos from Google Drive...</p>
                  </div>
                ) : driveVideos.length === 0 ? (
                  <p className="text-sm text-gray-600 text-center py-4">No videos found in Google Drive</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-60 overflow-y-auto">
                    {driveVideos.map((video) => (
                      <div key={video.id} className="flex items-center justify-between p-3 bg-white rounded border">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{video.name}</p>
                          <p className="text-xs text-gray-500">
                            {video.formattedSize} • {video.mimeType?.split('/')[1]?.toUpperCase()}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDriveVideoDownload(video.id, video.name)}
                          disabled={isUploadingVideo}
                          className="ml-2"
                        >
                          Download
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Background Video Selector */}
          <div className="space-y-3 border-2 border-purple-200 rounded-lg p-4 bg-purple-50">
            <Label className="text-lg font-semibold flex items-center gap-2">
              <Video className="h-5 w-5 text-purple-600" />
              Background Video Selection
            </Label>
            <p className="text-sm text-gray-600">Choose which video to use as background for AI-generated content</p>
            
            {loadingVideos ? (
              <div className="flex items-center gap-2 text-sm text-gray-500 p-3 border rounded-md bg-white">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading videos...
              </div>
            ) : availableBackgroundVideos.length > 0 ? (
              <div className="bg-white p-3 rounded-md border space-y-3">
                <div className="text-sm font-medium">Base Films from Google Drive: {availableBackgroundVideos.length}</div>
                <Select value={selectedBackgroundVideo} onValueChange={setSelectedBackgroundVideo}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose a background video">
                      {selectedBackgroundVideo ? availableBackgroundVideos.find(v => v.driveId === selectedBackgroundVideo)?.name : 'Choose a background video'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {availableBackgroundVideos.map((video) => (
                      <SelectItem key={video.driveId} value={video.driveId}>
                        <div className="flex items-center gap-2">
                          <Video className="h-4 w-4 text-purple-600" />
                          <span className="truncate">{video.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {/* Native dropdown fallback */}
                <select 
                  value={selectedBackgroundVideo} 
                  onChange={(e) => setSelectedBackgroundVideo(e.target.value)}
                  className="w-full p-2 border rounded-md bg-white text-sm"
                >
                  <option value="">Select video...</option>
                  {availableBackgroundVideos.map((video) => (
                    <option key={video.driveId} value={video.driveId}>
                      {video.name}
                    </option>
                  ))}
                </select>
                {selectedBackgroundVideo && (
                  <div className="border rounded-md p-2 bg-gray-50">
                    <div className="text-xs font-medium mb-1">Selected:</div>
                    <p className="text-sm text-gray-600">
                      {availableBackgroundVideos.find(v => v.driveId === selectedBackgroundVideo)?.name}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm text-amber-700 bg-amber-100 p-3 rounded-md border border-amber-300">
                <div className="flex items-center gap-2 mb-1">
                  <Video className="h-4 w-4" />
                  <strong>No background videos found</strong>
                </div>
                <p>Upload videos above to generate video content with your scripts.</p>
              </div>
            )}
          </div>

          {/* Voice Selection */}
          {withAudio && (
            <div className="space-y-3 border-2 border-blue-200 rounded-lg p-4 bg-blue-50">
              <Label className="text-lg font-semibold flex items-center gap-2">
                <User className="h-5 w-5 text-blue-600" />
                Voice Selection
              </Label>
              <p className="text-sm text-gray-600">Choose the ElevenLabs voice for AI-generated audio</p>
              
              <div className="bg-white p-3 rounded-md border space-y-3">
                {loadingVoices ? (
                  <div className="flex items-center gap-2 text-sm text-gray-500 p-3 border rounded-md">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading voices from ElevenLabs...
                  </div>
                ) : (
                  <>
                    <div className="text-sm font-medium">Available Voices: {availableVoices.length}</div>
                    <Select value={selectedVoice} onValueChange={setSelectedVoice}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Choose a voice">
                          {availableVoices.find(v => v.voice_id === selectedVoice)?.name || 'Select voice'}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {availableVoices.map((voice) => (
                          <SelectItem key={voice.voice_id} value={voice.voice_id}>
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4 text-blue-600" />
                              <span>{voice.name}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    
                    {/* Native dropdown fallback */}
                    <select 
                      value={selectedVoice} 
                      onChange={(e) => setSelectedVoice(e.target.value)}
                      className="w-full p-2 border rounded-md bg-white text-sm"
                    >
                      {availableVoices.map((voice) => (
                        <option key={voice.voice_id} value={voice.voice_id}>
                          {voice.name}
                        </option>
                      ))}
                    </select>
                    
                    <div className="text-xs text-gray-500">
                      <strong>Selected:</strong> {availableVoices.find(v => v.voice_id === selectedVoice)?.name || 'Unknown voice'}
                      <br />
                      <strong>Voice ID:</strong> {selectedVoice}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Audio Generation Toggle */}
          <div className="space-y-4">
            <div className="flex items-center justify-center space-x-3">
              <Label htmlFor="audio-toggle" className="text-sm font-medium">
                Scripts only
              </Label>
              <Switch
                id="audio-toggle"
                checked={withAudio}
                onCheckedChange={setWithAudio}
              />
              <Label htmlFor="audio-toggle" className="text-sm font-medium">
                With audio{availableBackgroundVideos.length > 0 ? ' + video' : ''}
              </Label>
            </div>
            <p className="text-center text-sm text-gray-500">
              {withAudio 
                ? `Will generate ${scriptCount} scripts with professional voice recordings${availableBackgroundVideos.length > 0 && selectedBackgroundVideo ? ' and complete video assets' : ''}` 
                : `Will generate ${scriptCount} scripts without audio recordings`
              }
            </p>
            
            {/* Subtitle Toggle */}
            {withAudio && availableBackgroundVideos.length > 0 && (
              <div className="flex items-center justify-center space-x-3 pt-2">
                <Label htmlFor="subtitle-toggle" className="text-sm font-medium">
                  Without subtitles
                </Label>
                <Switch
                  id="subtitle-toggle"
                  checked={includeSubtitles}
                  onCheckedChange={setIncludeSubtitles}
                  data-testid="toggle-subtitles"
                />
                <Label htmlFor="subtitle-toggle" className="text-sm font-medium">
                  With burned-in subtitles
                </Label>
              </div>
            )}
          </div>

          {/* Individual Generation Toggle */}
          <div className="space-y-4 border-t pt-4">
            <div className="flex items-center justify-center space-x-3">
              <Label htmlFor="individual-toggle" className="text-sm font-medium">
                Batch generation
              </Label>
              <Switch
                id="individual-toggle"
                checked={individualGeneration}
                onCheckedChange={setIndividualGeneration}
                data-testid="toggle-individual-generation"
              />
              <Label htmlFor="individual-toggle" className="text-sm font-medium">
                Individual calls
              </Label>
            </div>
            <p className="text-center text-sm text-gray-500">
              {individualGeneration 
                ? `${scriptCount} separate API calls for maximum quality & diversity (slower, higher cost)` 
                : `Single API call requesting ${scriptCount} scripts (faster, lower cost)`
              }
            </p>
          </div>

          {/* LLM Provider Selection */}
          {availableLlmProviders.length > 0 && (
            <div className="space-y-4 border-t pt-4">
              <div className="flex items-center justify-center space-x-3">
                <Label htmlFor="generate-llm-provider" className="text-sm font-medium">
                  AI Model
                </Label>
                <Select
                  value={llmProvider}
                  onValueChange={(value) => setLlmProvider(value as 'openai' | 'groq' | 'gemini')}
                >
                  <SelectTrigger 
                    id="generate-llm-provider"
                    className="w-[180px]"
                    data-testid="select-generate-llm-provider"
                  >
                    <SelectValue placeholder="Select AI model" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableLlmProviders.map((provider) => (
                      <SelectItem 
                        key={provider.id} 
                        value={provider.id}
                        disabled={!provider.available}
                      >
                        {provider.name} {!provider.available && '(Not configured)'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-center text-sm text-gray-500">
                {llmProvider === 'openai' && 'OpenAI GPT-5.1 - High quality reasoning'}
                {llmProvider === 'groq' && 'Groq Llama 3.3 70B - Fast inference (requires API key)'}
                {llmProvider === 'gemini' && 'Google Gemini 3 Pro - Uses Replit credits (no API key needed)'}
              </p>
            </div>
          )}

          {/* Slack Notifications Toggle */}
          <div className="space-y-4 border-t pt-4">
            <div className="flex items-center justify-center space-x-3">
              <Label htmlFor="slack-toggle" className="text-sm font-medium">
                Slack OFF
              </Label>
              <Switch
                id="slack-toggle"
                checked={slackEnabled}
                onCheckedChange={setSlackEnabled}
                data-testid="toggle-slack-notifications"
              />
              <Label htmlFor="slack-toggle" className="text-sm font-medium">
                Slack ON
              </Label>
            </div>
            <p className="text-center text-sm text-gray-500">
              {slackEnabled 
                ? "Slack notifications enabled - Videos will be sent for approval after generation" 
                : "Slack notifications disabled - Testing mode, no approval workflow"
              }
            </p>
          </div>

          {/* Generate Button */}
          <Button 
            onClick={handleGenerate} 
            disabled={isGenerating}
            className="w-full"
            size="lg"
          >
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating Scripts...
              </>
            ) : (
              <>
                <Zap className="mr-2 h-4 w-4" />
                Generate {scriptCount} Script{scriptCount !== 1 ? 's' : ''} {withAudio && '+ Audio'}
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Results */}
      {result && (
        <div className="space-y-6">
          {/* Success Summary */}
          <Card className="bg-green-50 border-green-200">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-green-800 mb-4">
                <CheckCircle className="h-5 w-5" />
                <span className="font-medium text-lg">Generation Complete!</span>
              </div>
              <div className="text-sm">
                <p className="font-medium">AI Scripts:</p>
                <p>{result.suggestions.length} script suggestions generated using Guidance Primer</p>
                <p>Saved to "New Scripts" tab in your Google Sheets</p>
              </div>
            </CardContent>
          </Card>

          {/* Script Suggestions Preview */}
          <Card>
            <CardHeader>
              <CardTitle>Generated Creative Assets</CardTitle>
              <CardDescription>
                AI-generated scripts with optional voiceovers and complete video assets ready for Meta campaigns
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Bulk Audio Generation Controls (only show if scripts were generated without audio) */}
              {result.suggestions.some(s => !s.audioUrl) && (
                <div className="mb-6 p-4 bg-gray-50 rounded-lg border">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="select-all"
                        checked={selectedScripts.size === result.suggestions.length}
                        onCheckedChange={handleSelectAllScripts}
                      />
                      <Label htmlFor="select-all" className="text-sm font-medium">
                        Select all scripts
                      </Label>
                    </div>
                    <Button
                      onClick={handleGenerateAudioForSelected}
                      disabled={selectedScripts.size === 0 || isGeneratingAudio}
                      size="sm"
                      className="ml-4"
                    >
                      {isGeneratingAudio ? (
                        <>
                          <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                          Generating Audio...
                        </>
                      ) : (
                        <>
                          <Mic className="mr-2 h-3 w-3" />
                          Generate Audio ({selectedScripts.size})
                        </>
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-gray-600">
                    Select which scripts to convert to professional voice recordings using Ella AI
                  </p>
                </div>
              )}

              <div className="space-y-4">
                {result.suggestions.map((suggestion, index) => (
                  <Card key={index} className="bg-blue-50 border-blue-200">
                    <CardContent className="pt-4">
                      <div className="flex items-start gap-3">
                        {/* Checkbox for script selection (only show if no audio) */}
                        {!suggestion.audioUrl && (
                          <Checkbox
                            id={`script-${index}`}
                            checked={selectedScripts.has(index)}
                            onCheckedChange={(checked) => handleScriptSelection(index, checked as boolean)}
                            className="mt-1"
                          />
                        )}
                        
                        <div className="flex-1">
                          <h4 className="font-medium text-blue-900 mb-2">{suggestion.title}</h4>
                          {/* Display native language script if available */}
                          {suggestion.nativeContent ? (
                            <div className="mb-3">
                              <p className="text-sm text-gray-900 mb-1 font-medium italic">"{suggestion.nativeContent}"</p>
                              <p className="text-xs text-gray-600 mb-1">English translation:</p>
                              <p className="text-sm text-gray-700 italic">"{suggestion.content}"</p>
                            </div>
                          ) : (
                            <p className="text-sm text-gray-700 mb-3 italic">"{suggestion.content}"</p>
                          )}
                          <p className="text-xs text-blue-700">{suggestion.reasoning}</p>
                          
                          {/* Video Player (if available) */}
                          {suggestion.videoUrl && (
                            <div className="bg-green-100 border border-green-300 rounded-lg p-3 mt-3">
                              <div className="flex items-center gap-2 mb-2">
                                <Upload className="h-4 w-4 text-green-600" />
                                <span className="text-sm font-medium text-green-800">Complete Video Asset:</span>
                              </div>
                              <video controls className="w-full max-h-60 rounded">
                                <source src={suggestion.videoUrl} type="video/mp4" />
                                Your browser does not support the video element.
                              </video>
                              <p className="text-xs text-green-700 mt-2">
                                Ready-to-use video with voiceover for Meta campaigns
                              </p>
                            </div>
                          )}

                          {/* Audio Player (if no video available) */}
                          {suggestion.audioUrl && !suggestion.videoUrl && (
                            <div className="bg-blue-100 border border-blue-300 rounded-lg p-3 mt-3">
                              <div className="flex items-center gap-2 mb-2">
                                <Mic className="h-4 w-4 text-blue-600" />
                                <span className="text-sm font-medium text-blue-800">AI Voice Recording:</span>
                              </div>
                              <audio controls className="w-full">
                                <source src={suggestion.audioUrl} type="audio/mpeg" />
                                Your browser does not support the audio element.
                              </audio>
                            </div>
                          )}

                          {/* Video Error */}
                          {suggestion.videoError && (
                            <div className="bg-yellow-100 border border-yellow-300 rounded-lg p-3 mt-3">
                              <div className="flex items-center gap-2 mb-1">
                                <Upload className="h-4 w-4 text-yellow-600" />
                                <span className="text-sm font-medium text-yellow-800">Video Creation:</span>
                              </div>
                              <p className="text-xs text-yellow-700">
                                {suggestion.videoError}
                              </p>
                            </div>
                          )}
                          
                          {suggestion.targetMetrics && suggestion.targetMetrics.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {suggestion.targetMetrics.map((metric) => (
                                <span key={metric} className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">
                                  {metric}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      </TabsContent>

      {/* Process Existing Scripts Tab Content */}
      <TabsContent value="process" className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Process Existing Scripts
            </CardTitle>
            <CardDescription>
              Load scripts from Google Sheets and convert them into videos
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Google Sheets URL */}
            <div className="space-y-2">
              <Label htmlFor="process-spreadsheet">Google Sheets URL or ID</Label>
              <Input
                id="process-spreadsheet"
                value={spreadsheetId}
                onChange={(e) => setSpreadsheetId(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/your-sheet-id/edit or just the sheet ID"
              />
            </div>

            {/* Tab Selection (Multi-select) */}
            {spreadsheetId && availableTabs.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Select Google Sheets Tabs</Label>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (selectedTabs.length === availableTabs.length) {
                          setSelectedTabs([]);
                        } else {
                          setSelectedTabs([...availableTabs]);
                        }
                      }}
                      disabled={isLoadingTabs}
                    >
                      {selectedTabs.length === availableTabs.length ? 'Deselect All' : 'Select All'}
                    </Button>
                    <Button
                      onClick={loadScriptsFromTab}
                      disabled={selectedTabs.length === 0 || isLoadingScripts}
                      variant="outline"
                    >
                      {isLoadingScripts ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Loading...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="mr-2 h-4 w-4" />
                          Load Scripts ({selectedTabs.length})
                        </>
                      )}
                    </Button>
                  </div>
                </div>
                <Card className="p-4 max-h-60 overflow-y-auto">
                  <div className="space-y-3">
                    {availableTabs.map((tab) => (
                      <div key={tab} className="flex items-center space-x-2">
                        <Checkbox
                          id={`tab-${tab}`}
                          checked={selectedTabs.includes(tab)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedTabs([...selectedTabs, tab]);
                            } else {
                              setSelectedTabs(selectedTabs.filter(t => t !== tab));
                            }
                          }}
                          data-testid={`checkbox-tab-${tab}`}
                        />
                        <Label
                          htmlFor={`tab-${tab}`}
                          className="text-sm font-normal cursor-pointer"
                        >
                          {tab}
                        </Label>
                      </div>
                    ))}
                  </div>
                </Card>
                <p className="text-xs text-gray-500">
                  {selectedTabs.length === 0 
                    ? "Select one or more tabs to load scripts from"
                    : `${selectedTabs.length} tab${selectedTabs.length === 1 ? '' : 's'} selected`
                  }
                </p>
              </div>
            )}

            {/* Voice Selection */}
            {availableVoices.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="voice-selector-process">Voice Selection</Label>
                <Select value={selectedVoice} onValueChange={setSelectedVoice}>
                  <SelectTrigger id="voice-selector-process">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-60 overflow-y-auto">
                    {availableVoices.map((voice) => {
                      const isGerman = voice.name.toLowerCase().includes('markus') || 
                                       voice.name.toLowerCase().includes('carl') || 
                                       voice.name.toLowerCase().includes('julia');
                      return (
                        <SelectItem key={voice.voice_id} value={voice.voice_id}>
                          {isGerman && '🇩🇪 '}{voice.name}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Background Video Selection (Multi-select) */}
            {availableBackgroundVideos.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Background Videos</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (selectedBackgroundVideosMulti.length === availableBackgroundVideos.length) {
                        setSelectedBackgroundVideosMulti([]);
                      } else {
                        setSelectedBackgroundVideosMulti(availableBackgroundVideos.map(v => v.driveId));
                      }
                    }}
                  >
                    {selectedBackgroundVideosMulti.length === availableBackgroundVideos.length ? 'Deselect All' : 'Select All'}
                  </Button>
                </div>
                <Card className="p-4 max-h-48 overflow-y-auto">
                  <div className="space-y-3">
                    {availableBackgroundVideos.map((video) => (
                      <div key={video.driveId} className="flex items-center space-x-2">
                        <Checkbox
                          id={`video-${video.driveId}`}
                          checked={selectedBackgroundVideosMulti.includes(video.driveId)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedBackgroundVideosMulti([...selectedBackgroundVideosMulti, video.driveId]);
                            } else {
                              setSelectedBackgroundVideosMulti(selectedBackgroundVideosMulti.filter(p => p !== video.driveId));
                            }
                          }}
                          data-testid={`checkbox-video-${video.name}`}
                        />
                        <Label
                          htmlFor={`video-${video.driveId}`}
                          className="text-sm font-normal cursor-pointer flex items-center gap-2"
                        >
                          <Video className="h-4 w-4 text-purple-600" />
                          {video.name}
                        </Label>
                      </div>
                    ))}
                  </div>
                </Card>
                <p className="text-xs text-gray-500">
                  {selectedBackgroundVideosMulti.length === 0 
                    ? "Select one or more background videos"
                    : `${selectedBackgroundVideosMulti.length} video${selectedBackgroundVideosMulti.length === 1 ? '' : 's'} selected - each script will be created with each video`
                  }
                </p>
              </div>
            )}

            {/* Subtitle Toggle */}
            {availableBackgroundVideos.length > 0 && (
              <div className="flex items-center justify-center space-x-3 border-t pt-4">
                <Label htmlFor="subtitle-toggle-process" className="text-sm font-medium">
                  Without subtitles
                </Label>
                <Switch
                  id="subtitle-toggle-process"
                  checked={includeSubtitles}
                  onCheckedChange={setIncludeSubtitles}
                  data-testid="toggle-process-subtitles"
                />
                <Label htmlFor="subtitle-toggle-process" className="text-sm font-medium">
                  With burned-in subtitles
                </Label>
              </div>
            )}

            {/* Slack Toggle */}
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label htmlFor="slack-toggle-process">Send to Slack for Approval</Label>
                <p className="text-xs text-gray-500">
                  Videos will be uploaded to Google Drive and sent to Slack for team approval
                </p>
              </div>
              <Switch
                id="slack-toggle-process"
                checked={slackEnabled}
                onCheckedChange={setSlackEnabled}
              />
            </div>

            {/* Process Button */}
            {existingScripts.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    Selected {selectedExistingScripts.size} of {existingScripts.length} scripts
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (selectedExistingScripts.size === existingScripts.length) {
                        setSelectedExistingScripts(new Set());
                      } else {
                        setSelectedExistingScripts(new Set(existingScripts.map((_, i) => i)));
                      }
                    }}
                  >
                    {selectedExistingScripts.size === existingScripts.length ? 'Deselect All' : 'Select All'}
                  </Button>
                </div>
                
                <Button
                  onClick={handleProcessExistingScripts}
                  disabled={isProcessingScripts || selectedExistingScripts.size === 0}
                  className="w-full"
                >
                  {isProcessingScripts ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing Scripts...
                    </>
                  ) : (
                    <>
                      <Video className="mr-2 h-4 w-4" />
                      Process Selected Scripts to Videos
                    </>
                  )}
                </Button>
              </div>
            )}

            {/* Display Existing Scripts */}
            {existingScripts.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Available Scripts</h3>
                {existingScripts.map((script, index) => (
                  <Card key={index} className="border">
                    <CardContent className="pt-4">
                      <div className="flex items-start gap-3">
                        <Checkbox
                          id={`existing-script-${index}`}
                          checked={selectedExistingScripts.has(index)}
                          onCheckedChange={(checked) => {
                            const newSet = new Set(selectedExistingScripts);
                            if (checked) {
                              newSet.add(index);
                            } else {
                              newSet.delete(index);
                            }
                            setSelectedExistingScripts(newSet);
                          }}
                          className="mt-1"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h4 className="font-medium">{script.scriptTitle}</h4>
                            {script.sourceTab && selectedTabs.length > 1 && (
                              <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                                {script.sourceTab}
                              </span>
                            )}
                          </div>
                          {script.nativeContent && script.recordingLanguage !== 'English' ? (
                            <div className="mb-3">
                              <p className="text-sm text-gray-900 mb-1 font-medium italic">
                                {script.recordingLanguage}: "{script.nativeContent}"
                              </p>
                              {script.content && (
                                <>
                                  <p className="text-xs text-gray-600 mb-1">English translation:</p>
                                  <p className="text-sm text-gray-700 italic">"{script.content}"</p>
                                </>
                              )}
                              {script.translationNotes && (
                                <p className="text-xs text-gray-500 mt-1">
                                  📝 {script.translationNotes}
                                </p>
                              )}
                            </div>
                          ) : (
                            <p className="text-sm text-gray-700 mb-3 italic">
                              "{script.content || script.nativeContent}"
                            </p>
                          )}
                          <p className="text-xs text-gray-500">
                            Generated: {script.generatedDate}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      {/* Meta Upload Tab Content */}
      <TabsContent value="meta-upload" className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Upload Creative to Meta
            </CardTitle>
            <CardDescription>
              Bulk upload video ads from Google Drive directly to your Meta Ad Account
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Google Drive Folder URL */}
            <div className="space-y-2">
              <Label htmlFor="meta-folder-url">Google Drive Folder URL</Label>
              <div className="flex gap-2">
                <Input
                  id="meta-folder-url"
                  value={metaFolderUrl}
                  onChange={(e) => setMetaFolderUrl(e.target.value)}
                  placeholder="https://drive.google.com/drive/folders/your-folder-id"
                  className="flex-1"
                />
                <Button
                  onClick={async () => {
                    if (!metaFolderUrl.trim()) {
                      toast({
                        title: "Missing Folder URL",
                        description: "Please enter a Google Drive folder URL",
                        variant: "destructive"
                      });
                      return;
                    }
                    setIsLoadingMetaVideos(true);
                    setMetaVideos([]);
                    setSelectedMetaVideos(new Set());
                    try {
                      const response = await fetch('/api/drive/list-folder-videos', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ folderUrl: metaFolderUrl.trim() })
                      });
                      if (!response.ok) {
                        const error = await response.json();
                        throw new Error(error.error || 'Failed to fetch videos');
                      }
                      const data = await response.json();
                      setMetaVideos(data.videos || []);
                      if (data.videos?.length > 0) {
                        toast({
                          title: "Videos Found",
                          description: `Found ${data.videos.length} video(s) in the folder`
                        });
                      } else {
                        toast({
                          title: "No Videos Found",
                          description: "No video files found in this folder",
                          variant: "destructive"
                        });
                      }
                    } catch (error) {
                      toast({
                        title: "Error",
                        description: error instanceof Error ? error.message : "Failed to load videos",
                        variant: "destructive"
                      });
                    } finally {
                      setIsLoadingMetaVideos(false);
                    }
                  }}
                  disabled={isLoadingMetaVideos}
                >
                  {isLoadingMetaVideos ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Load Videos'
                  )}
                </Button>
              </div>
              <p className="text-xs text-gray-500">
                Paste the full URL of your Google Drive folder containing video ads
              </p>
            </div>

            {/* Video List */}
            {metaVideos.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Videos in Folder ({metaVideos.length})</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (selectedMetaVideos.size === metaVideos.length) {
                        setSelectedMetaVideos(new Set());
                      } else {
                        setSelectedMetaVideos(new Set(metaVideos.map(v => v.id)));
                      }
                    }}
                  >
                    {selectedMetaVideos.size === metaVideos.length ? 'Deselect All' : 'Select All'}
                  </Button>
                </div>
                <Card className="p-4 max-h-64 overflow-y-auto">
                  <div className="space-y-2">
                    {metaVideos.map((video) => (
                      <div key={video.id} className="flex items-center space-x-3 p-2 hover:bg-gray-50 rounded">
                        <Checkbox
                          id={`meta-video-${video.id}`}
                          checked={selectedMetaVideos.has(video.id)}
                          onCheckedChange={(checked) => {
                            const newSet = new Set(selectedMetaVideos);
                            if (checked) {
                              newSet.add(video.id);
                            } else {
                              newSet.delete(video.id);
                            }
                            setSelectedMetaVideos(newSet);
                          }}
                        />
                        <Video className="h-4 w-4 text-blue-600" />
                        <div className="flex-1">
                          <span className="text-sm font-medium">{video.name}</span>
                          {video.size && (
                            <span className="text-xs text-gray-500 ml-2">({video.size})</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
                <p className="text-xs text-gray-500">
                  {selectedMetaVideos.size === 0 
                    ? "Select videos to upload to Meta"
                    : `${selectedMetaVideos.size} video(s) selected`
                  }
                </p>
              </div>
            )}

            {/* Upload Progress */}
            {isUploadingToMeta && metaUploadProgress.total > 0 && (
              <div className="space-y-2 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                  <span className="text-sm font-medium text-blue-800">
                    Uploading to Meta: {metaUploadProgress.current} / {metaUploadProgress.total}
                  </span>
                </div>
                {metaUploadProgress.currentVideo && (
                  <p className="text-xs text-blue-600">
                    Current: {metaUploadProgress.currentVideo}
                  </p>
                )}
                <div className="w-full bg-blue-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all"
                    style={{ width: `${(metaUploadProgress.current / metaUploadProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {/* Upload Button */}
            {metaVideos.length > 0 && (
              <Button
                onClick={async () => {
                  if (selectedMetaVideos.size === 0) {
                    toast({
                      title: "No Videos Selected",
                      description: "Please select at least one video to upload",
                      variant: "destructive"
                    });
                    return;
                  }
                  
                  setIsUploadingToMeta(true);
                  setMetaUploadProgress({ current: 0, total: selectedMetaVideos.size });
                  
                  try {
                    const videosToUpload = metaVideos.filter(v => selectedMetaVideos.has(v.id));
                    let successCount = 0;
                    let failCount = 0;
                    
                    for (let i = 0; i < videosToUpload.length; i++) {
                      const video = videosToUpload[i];
                      setMetaUploadProgress({ 
                        current: i, 
                        total: videosToUpload.length,
                        currentVideo: video.name 
                      });
                      
                      try {
                        const response = await fetch('/api/meta/upload-from-drive', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ 
                            driveFileId: video.id,
                            fileName: video.name
                          })
                        });
                        
                        if (response.ok) {
                          successCount++;
                        } else {
                          failCount++;
                          console.error(`Failed to upload ${video.name}`);
                        }
                      } catch (error) {
                        failCount++;
                        console.error(`Error uploading ${video.name}:`, error);
                      }
                    }
                    
                    setMetaUploadProgress({ 
                      current: videosToUpload.length, 
                      total: videosToUpload.length 
                    });
                    
                    toast({
                      title: "Upload Complete",
                      description: `Successfully uploaded ${successCount} video(s)${failCount > 0 ? `, ${failCount} failed` : ''} to Meta`,
                      variant: failCount > 0 ? "destructive" : "default"
                    });
                    
                    // Clear selection after successful upload
                    if (successCount > 0) {
                      setSelectedMetaVideos(new Set());
                    }
                  } catch (error) {
                    toast({
                      title: "Upload Failed",
                      description: error instanceof Error ? error.message : "Failed to upload videos",
                      variant: "destructive"
                    });
                  } finally {
                    setIsUploadingToMeta(false);
                    setMetaUploadProgress({ current: 0, total: 0 });
                  }
                }}
                disabled={isUploadingToMeta || selectedMetaVideos.size === 0}
                className="w-full"
                size="lg"
              >
                {isUploadingToMeta ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Uploading to Meta...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload {selectedMetaVideos.size > 0 ? `${selectedMetaVideos.size} Video(s)` : 'Videos'} to Meta
                  </>
                )}
              </Button>
            )}
          </CardContent>
        </Card>
      </TabsContent>
      </Tabs>
      </div>
    </div>
  );
}