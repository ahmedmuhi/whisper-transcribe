# Speech to Text Transcription App

A lightweight web application that converts spoken audio to text using Azure's Speech Services. Record directly from your browser and get transcriptions in real-time.

## Features

- **Browser-based Recording**: Capture audio directly in your browser - no downloads needed
- **Live Audio Visualization**: See your voice patterns as you speak
- **Azure Speech-to-Text Integration**: Leverages Azure's powerful speech recognition
- **Dark/Light Theme**: Choose your preferred viewing mode
- **Recording Controls**: Pause, resume, or cancel recordings as needed
- **Transcript Management**: Copy, cut, or clear your transcriptions

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
1. Click the settings icon in the header
2. Enter your Azure credentials:
   - Azure OpenAI Endpoint
   - Deployment Name
   - API Version
   - API Key
3. Click "Save Settings"

## Development

Run the unit tests with:

```bash
npm install
npm test
```

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
