# Technology Stack

## Core Technologies
- **Frontend**: Vanilla JavaScript (ES6+ modules), HTML5, CSS3
- **Audio API**: MediaRecorder API, Web Audio API for visualization
- **HTTP Client**: Fetch API for Azure service integration
- **Storage**: localStorage for settings persistence
- **Styling**: CSS custom properties for theming, Google Fonts (Outfit)

## Development Tools
- **Testing**: Vitest with happy-dom environment
- **Coverage**: @vitest/coverage-v8 with 85%/80%/70%/85% thresholds (statements/branches/functions/lines)
- **Linting**: ESLint 9 flat config with import validation and unused import detection
- **Documentation**: JSDoc with markdown plugin
- **Git Hooks**: Husky for pre-push validation
- **Dependency Analysis**: Knip for unused dependency detection

## Build System
This is a static web application with no build step - files are served directly.

## Common Commands

### Testing
```bash
npm test                        # Run all tests
npm run test:coverage          # Run with coverage report
npm run test:watch             # Watch mode
npm run test:ui                # Vitest UI interface
npm run test:ci                # CI pipeline tests
```

### Code Quality
```bash
npm run lint                   # ESLint check
npm run lint:fix              # Auto-fix linting issues
npm run deps:check            # Check for unused dependencies
npm run deps:analyze          # Detailed dependency analysis
```

### Documentation
```bash
npm run docs                  # Generate JSDoc documentation
npm run docs:clean           # Clean and regenerate docs
```

### Git Hooks
Pre-push automatically runs:
- `npm run lint` - Code linting
- `npm run test:coverage` - Tests with coverage
- `npm run deps:check:prod` - Production dependency validation

## Architecture Patterns
- **Event-Driven**: Central EventBus for module communication
- **State Machine**: RecordingStateMachine for recording lifecycle
- **Module Pattern**: ES6 classes with single responsibility
- **Constants Centralization**: All IDs, messages, and config in constants.js
- **Logging**: Centralized logger with module-specific contexts