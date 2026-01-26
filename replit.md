# Meta Ad Creative Generator

## Overview

Meta Ad Creative Generator is a full-stack web application designed for creating AI-powered video advertisements for Meta (Facebook) campaigns. Its primary purpose is to generate AI scripts, professional voice recordings, and complete video assets, with direct integration to Google Sheets for data export. The application focuses exclusively on video ad creation and script generation, having removed all file upload functionalities.

## User Preferences

Preferred communication style: Simple, everyday language.
Message formatting: Use completely plain text in all Slack messages - NO asterisks, underscores, backticks, or any markdown formatting.
Default Guidance Primer: Always use the default primer located at server/data/default_primer.csv unless user explicitly provides a different one. This primer contains 13 data-driven script patterns with confidence levels (Very/Quite/Low Confident) based on actual performance testing. Key patterns include: lean into addressing/geo terms (-28.6%), explicit brand mentions (-26.2%), avoid multiple sentences (+65%), lean into large numbers (-25.1%), and lean into second-person voice (-21.7%).
AI Script Generation: Focus only on voiceover scripts, not visual scenes. Scripts must analyze BOTH successful AND failed performance patterns from actual data. Learn from what works AND that doesn't work to create better scripts. Never create scripts from scratch - always base them on patterns found in both high and low performing data. Background visuals are constant - only the spoken narration changes. Always write "what three words" instead of "what3words" for proper voice pronunciation. Scripts must be exactly 55-65 words (maximum 17-18 seconds of audio) to fit well within the 20-second background video duration with appropriate silent gaps. Scripts follow three-part structure: attention-grabbing opening, clear product explanation, and call-to-action that connects back to the opening. Uses confident, universally appealing language with creative elements for Meta platforms. Multilingual prompts receive the same comprehensive instructions as English (data-driven insights, creative flexibility, experimentation balance, maximum variety) with language-specific context prepended.
Voice Generation: Optional professional voice recordings using ElevenLabs API with toggle control in the unified workflow. Users can generate scripts with or without audio recordings. Default voice: 'Ella AI' (huvDR9lwwSKC0zEjZUox) for consistent professional narration when audio is enabled.
Video Generation: Automatic video overlay using fluent-ffmpeg when background videos are available. AI voiceovers are automatically merged with background videos to create complete, Meta-ready video assets. Background videos can be uploaded locally or imported directly from Google Drive (requires Google Drive API to be enabled in Google Cloud Console for the service account project).

## System Architecture

### UI/UX Decisions
- **Framework**: React 18 with TypeScript
- **Styling**: Tailwind CSS with custom theme configuration
- **Components**: shadcn/ui built on Radix UI primitives
- **Single-Page Interface**: Main entry point is a unified "Video Creator" interface with four tabs: Generate Iterations (variations of winning scripts), Generate New Scripts (original AI script generation), Process Existing Scripts (process scripts from Google Sheets), and Upload Creative to Meta (bulk upload videos from Google Drive to Meta Ad Account).
- **Timestamped Organization**: Google Sheets tabs and Google Drive folders are timestamped for better tracking and batch management.

### Technical Implementations
- **Frontend**: Vite for fast development, TanStack Query for server state, Wouter for routing, React Hook Form with Zod for forms.
- **Backend**: Node.js with TypeScript, Express.js for REST APIs.
- **Database**: Drizzle ORM with PostgreSQL (Neon).
- **Authentication**: Session-based authentication using Meta OAuth.
- **AI Script Generation**: Analyzes Meta campaign performance data to generate optimized scripts following a structured three-part format (opening, product explanation, call-to-action) and specific word count constraints. Supports multiple LLM providers:
  - **OpenAI GPT-5.1**: High quality reasoning (requires OPENAI_API_KEY)
  - **Groq Llama 3.3 70B**: Fast inference (requires GROQ_API_KEY)
  - **Google Gemini 2.5 Pro**: Uses Replit AI credits (no API key needed, uses Replit AI Integrations)
- **Voice Synthesis**: Uses ElevenLabs API to convert scripts into professional voice recordings.
- **Video Creation**: Leverages FFmpeg (fluent-ffmpeg) to combine AI voiceovers with background videos, creating complete ad assets.
- **Google Sheets Integration**: Exports scripts and metadata to timestamped Google Sheets tabs, supporting performance data export with configurable date ranges. Additionally, all generated scripts are logged to a "ScriptDatabase" tab with fields: ScriptBatchID, ScriptID, MKJobID (0 for AI-generated), DateTimestampCreated, ScriptLanguage, ScriptCopy, ScriptAIPrompt (from AI Creative Inspiration field), and AIModel.
- **Slack Integration**: Comprehensive workflow for sending video batches for approval, including a 15-minute delay for Google Drive processing, button-based approvals, and automatic deletion of rejected videos from Google Drive.

### System Design Choices
- **Data Flow**: User authentication via Meta OAuth, campaign analysis from Meta API, AI script generation, ElevenLabs voice synthesis, FFmpeg video creation, and Google Sheets export.
- **Scalability**: Designed for deployment on Replit autoscale.
- **Environment Management**: Differentiates between development (auto-authentication) and production (full OAuth flow).

## External Dependencies

- **Meta Marketing API**: For campaign management, creative uploads, and performance data retrieval. Requires `ads_management`, `ads_read`, `business_management` permissions.
- **Google Sheets API**: For performance report generation, script export, and managing spreadsheet data. Authenticated via a service account.
- **Neon Database**: PostgreSQL for primary data storage.
- **ElevenLabs API**: For professional voice synthesis.
- **Google Drive API**: For importing background videos and managing AI-generated video files, including automatic deletion of rejected videos.
- **Slack API (`@slack/web-api`)**: For the video batch approval workflow.