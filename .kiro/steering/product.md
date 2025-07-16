# Product Overview

## Whisper Transcribe - Speech-to-Text Web Application

A lightweight, browser-based speech-to-text transcription application that converts spoken audio to text using Azure's Speech Services. The app provides real-time audio recording with live visualization and supports multiple Azure AI models for transcription.

### Core Features
- **Browser-based Recording**: Direct microphone capture without downloads
- **Live Audio Visualization**: Real-time voice pattern display during recording
- **Dual Model Support**: Azure Whisper (stable) and GPT-4o (higher accuracy) transcription
- **Recording Controls**: Start, pause, resume, and cancel functionality
- **Theme Support**: Dark/light mode with system preference detection
- **Transcript Management**: Copy, cut, and clear transcription results
- **Settings Persistence**: Local storage of API credentials and preferences

### Target Users
Developers, content creators, and professionals who need quick, accurate speech-to-text conversion with Azure AI integration.

### Privacy & Security
- Audio processing through user's Azure account only
- No recordings stored locally or on external servers
- API credentials stored in browser localStorage
- All processing happens client-side except for Azure API calls