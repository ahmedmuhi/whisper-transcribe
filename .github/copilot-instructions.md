# Speech-to-Text Transcription App - Copilot Instructions

## Architecture Overview

This is a vanilla JavaScript web application for browser-based audio recording and transcription using Azure Speech Services. The architecture follows a **modular event-driven pattern** with strict separation of concerns:

- **AudioHandler** (`js/audio-handler.js`) - Core recording logic, MediaRecorder management, audio visualization
- **UI** (`js/ui.js`) - DOM manipulation, theme management, user interaction
- **Settings** (`js/settings.js`) - Configuration persistence, modal management
- **RecordingStateMachine** (`js/recording-state-machine.js`) - State transitions and business logic
- **AzureAPIClient** (`js/api-client.js`) - Azure Speech Services integration
- **EventBus** (`js/event-bus.js`) - Central communication hub between all modules

## Key Patterns & Conventions

### Event-Driven Communication
- **ALL** inter-module communication goes through the singleton `eventBus` instance
- Import pattern: `import { eventBus, APP_EVENTS } from './event-bus.js'`
- Event constants in `APP_EVENTS` object prevent typos
- Example: `eventBus.emit(APP_EVENTS.RECORDING_STATE_CHANGED, { newState, oldState })`

### State Machine Pattern
The app uses a finite state machine for recording flow in `recording-state-machine.js`:
- States: `IDLE`, `INITIALIZING`, `RECORDING`, `PAUSED`, `STOPPING`, `PROCESSING`, `CANCELLING`, `ERROR`
- Valid transitions defined in `STATE_TRANSITIONS` constant in `constants.js`
- Each state has a dedicated handler method (e.g., `handleRecordingState()`)
- Always check `canTransitionTo()` before state changes

### Constants Organization
All constants live in `js/constants.js`:
- `RECORDING_STATES` - State machine states
- `STATE_TRANSITIONS` - Valid state transitions map
- `STORAGE_KEYS` - LocalStorage keys
- `MESSAGES` - All user-facing text (i18n ready)
- `COLORS` - Theme color values
- `API_PARAMS` - Azure API parameter names

### Module Initialization Pattern
1. **main.js** is the entry point - instantiates all modules
2. Dependency injection: `new AudioHandler(apiClient, ui, settings)`
3. Post-construction initialization: `ui.init(settings, audioHandler)`
4. Event bus setup in each module's constructor or init method

## Critical Workflows

### Development & Testing
```bash
# Install and run tests
npm install
npm test

# Tests use ES modules with Vitest
# Current test coverage: 230 tests across all modules
```

### Recording Flow State Transitions
```
IDLE → INITIALIZING → RECORDING ⇄ PAUSED → STOPPING → PROCESSING → IDLE
                            ↓              ↓
                        CANCELLING → IDLE   ERROR → IDLE
```

### Audio Visualization Integration
- Canvas-based real-time visualization during recording
- Visualization controller stored in `audioHandler.visualizationController`
- Must be cleaned up on state transitions (see `handleStoppingState()`)
- Theme-aware canvas background colors via `COLORS.CANVAS_*_BG`

## Azure Integration Specifics

### Multi-Model Support
- Supports both Whisper and GPT-4o transcription models
- Model-specific configuration stored separately in localStorage
- Settings UI dynamically shows/hides model-specific fields
- Configuration validation in `AzureAPIClient.validateConfig()`

### API Error Handling
- Config missing errors trigger automatic settings modal
- API errors emit `APP_EVENTS.API_CONFIG_MISSING` events
- Settings validation prevents incomplete configurations

## Theme System

### CSS Variable Pattern
- Light/dark themes via CSS custom properties (`--primary-color`, etc.)
- Theme state managed in localStorage with `STORAGE_KEYS.THEME_MODE`
- Supports: `'light'`, `'dark'`, `'auto'` (follows system preference)
- Canvas elements need manual theme updates via `applyTheme()`

## Permission Management

### Microphone Access Flow
- `PermissionManager` class handles browser permission APIs
- Emits events for permission state changes
- UI automatically disables/enables controls based on permission status
- Browser-specific permission instruction messages in `MESSAGES`

## File Organization

- `js/` - All JavaScript modules (ES6 modules, no bundler)
- `css/styles.css` - Single CSS file with CSS custom properties
- `tests/` - Jest tests (ES modules configuration)
- `index.html` - Single-page application entry point

## Common Pitfalls

1. **Never call UI methods directly** - always use event bus
2. **State transitions** - check `canTransitionTo()` before calling `transitionTo()`
3. **Constants usage** - import from `constants.js`, don't hardcode strings
4. **Event naming** - use `APP_EVENTS` constants, not string literals
5. **Canvas cleanup** - always stop visualization controller on state changes
6. **Theme updates** - canvas elements need manual theme application

## Testing Strategy

- Unit tests focus on state machine logic and core business rules
- Mock dependencies using Jest: `{ jest.fn() }` pattern
- Test state transitions and boundary conditions
- Current coverage: state machine validation, audio handler safety checks
