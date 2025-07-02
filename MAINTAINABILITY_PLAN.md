# Maintainability Improvement Plan for whisper-transcribe

This plan outlines specific, actionable steps to improve the maintainability, readability, and extensibility of the codebase using Clean Code and SOLID principles. Each step references actual files, modules, and patterns in this repository.

---

## 1. AudioHandler (`js/audio-handler.js`)
- **Refactor large methods**: Break down any long methods (e.g., recording start/stop, visualization logic) into smaller, single-purpose functions.
- **Clarify naming**: Ensure all method and variable names clearly reflect their purpose (e.g., `startRecording`, `stopVisualization`).
- **SRP**: Move any UI or settings logic out of this module; keep only audio and visualization logic.
- **Visualization cleanup**: Ensure `visualizationController` is always stopped and cleaned up on state transitions.

## 2. UI Module (`js/ui.js`)
- **Enforce event-driven updates**: Remove any direct calls to other modules; all UI updates should be triggered via the event bus.
- **Reduce DOM query repetition**: Use constants from `constants.js` for all DOM IDs.
- **Small functions**: Refactor any functions that manipulate the DOM in multiple ways into smaller, focused functions.

## 3. Settings Module (`js/settings.js`)
- **SRP**: Ensure this module only handles configuration persistence and modal management.
- **Validation logic**: Move any Azure config validation to `AzureAPIClient` if not already there.
- **Descriptive names**: Rename any ambiguous variables or functions.

## 4. Recording State Machine (`js/recording-state-machine.js`)
- **State handler clarity**: Ensure each state handler (e.g., `handleRecordingState`) is small and focused.
- **Transition validation**: Always use `canTransitionTo()` before state changes; refactor to guard against invalid transitions.
- **Constants usage**: Replace any hardcoded state strings with `RECORDING_STATES` from `constants.js`.

## 5. Azure API Client (`js/api-client.js`)
- **Open/Closed Principle**: Refactor model selection logic to use a strategy pattern or similar, so new models can be added without modifying core logic.
- **Error handling**: Centralize error handling and ensure all API errors emit the correct event via the event bus.
- **No direct UI calls**: All UI feedback should be event-driven.

## 6. Event Bus (`js/event-bus.js`)
- **Event constants**: Ensure all events use `APP_EVENTS` constants.
- **Loose coupling**: Audit all modules to ensure they only communicate via the event bus.

## 7. Constants (`js/constants.js`)
- **Centralize all magic values**: Move any remaining hardcoded strings, numbers, or DOM IDs into this file.
- **Descriptive constant names**: Ensure all constants are self-explanatory.

## 8. Permission Manager (`js/permission-manager.js`)
- **SRP**: Only handle browser permission APIs and emit events; move any UI logic out.
- **Event-driven**: Ensure all permission changes are communicated via the event bus.

## 9. General Patterns
- **Reduce deep nesting**: Use guard clauses and early returns in all modules.
- **DRY**: Extract repeated logic into utility functions or helpers.
- **Minimize side effects**: Functions should only modify their own state or emit events.
- **YAGNI**: Remove any unused code or features.

## 10. Testing (`tests/`)
- **Increase coverage**: Add tests for UI event handling, settings persistence, and Azure API error handling.
- **Mock dependencies**: Use Jest mocks for event bus and API calls.
- **Boundary cases**: Test invalid state transitions and permission errors.

---

## Next Steps

1. Triage and prioritize the above steps based on code complexity and frequency of change.
2. Tackle one module at a time, running tests after each refactor.
3. Update documentation and architectural diagrams as changes are made.

---

**References:**  
- [Clean Code](https://www.oreilly.com/library/view/clean-code/9780136083238/)  
- [SOLID Principles](https://en.wikipedia.org/wiki/SOLID)  
- See `.github/copilot-instructions.md` for architecture and event-driven patterns.
