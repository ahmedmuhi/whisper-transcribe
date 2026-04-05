# Speech to Text Transcription App

A lightweight web application that converts spoken audio to text using Azure's Speech Services. Record directly from your browser and get transcriptions in real-time. No build step required — runs as raw ES modules.

## Features

- **Browser-based Recording**: Capture audio directly in your browser — no downloads needed
- **Live Audio Visualization**: Real-time waveform display as you speak
- **Multiple Models**: Azure Whisper (stable) and MAI-Transcribe (preview)
- **Dark/Light Theme**: Lavender Blue light mode and Deep Navy dark mode
- **Recording Controls**: Pause, resume, or cancel recordings
- **Noise Cancellation**: Toggle browser audio processing for noisy environments
- **Input Device Selection**: Choose which microphone to use
- **Sidebar Settings Panel**: Notion-style collapsible sidebar with pin/hover/close states
- **Transcript Management**: Cut transcription text to clipboard

## How It Works

1. Click the microphone button to start recording
2. Speak clearly into your microphone
3. Click the button again to stop and process your recording
4. View your transcription in the text area

## Setup

### Prerequisites
- A modern web browser (Chrome, Firefox, Edge, Safari)
- An Azure account with Speech Services enabled
- Your Azure API key and endpoint information

### Configuration
1. Click the gear icon to open settings
2. Select your transcription model (Azure Whisper or MAI-Transcribe)
3. Enter your credentials:
   - **Target URI**: Your full Azure endpoint URL
   - **API Key**: Your Azure API key
4. Click "Save Settings"

## Development

### Running Tests

This project uses **Vitest** for all testing needs. Run the unit tests with:

```bash
npm install
npm test                        # Run all tests
npm run test:coverage          # Run tests with coverage report
npm run test:watch             # Run tests in watch mode
npm run test:coverage:watch    # Run coverage in watch mode
npm run test:ui                # Run tests with Vitest UI
```

### Coverage Requirements

This project enforces code coverage thresholds to ensure quality:
- **Statements**: 85% minimum
- **Branches**: 80% minimum  
- **Functions**: 70% minimum
- **Lines**: 85% minimum

Coverage is enforced via `vitest.config.js` thresholds.

### Git Hooks

Pre-push hooks automatically run:
- Linting checks (`npm run lint`)
- Coverage tests (`npm run test:coverage`) 
- Production dependency validation (`npm run deps:check:prod`)

This safety net prevents code quality regressions from being pushed to the repository.

### DOM IDs

All element IDs are centralized in `js/constants.js` under the `ID` object.
Use `document.getElementById(ID.SOME_ID)` instead of hard-coded strings.

## Usage Tips

- Position yourself in a quiet environment for best results
- Speak clearly and at a normal pace
- For longer recordings, use the pause button when needed

## Deployment

This application can be deployed on GitHub Pages:
1. Fork or clone this repository
2. Enable GitHub Pages in your repository settings
3. Select the branch containing your code

## Privacy Note

Your audio data is processed through your Azure account. No recordings are stored on this application.
