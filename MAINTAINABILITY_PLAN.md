# Planned Refactor: Move Visualization Control to UI Module

**Goal:**  
Ensure the UI module is the only component responsible for creating, starting, and stopping the `VisualizationController`, making visualization a true UI concern and further decoupling audio logic from presentation.

### Step-by-step Plan

1. **Define Visualization Events**
   - [x] Add new event types to `APP_EVENTS` for visualization start/stop (e.g., `VISUALIZATION_START`, `VISUALIZATION_STOP`).

2. **Update AudioHandler**
   - [x] Remove all direct references to `VisualizationController` from `AudioHandler`.
   - [x] In `AudioHandler`, emit visualization events via the event bus at appropriate points (e.g., after starting/stopping recording, or when the stream is available).
   - [x] Pass necessary data (e.g., audio stream, theme info) as event payloads.

3. **Update UI Module**
   - [x] Listen for visualization events in the UI module.
   - [x] On `VISUALIZATION_START`, create and start a `VisualizationController` instance using the provided stream/canvas/theme.
   - [x] On `VISUALIZATION_STOP`, stop and clean up the `VisualizationController` instance.
   - [x] Ensure the UI updates the canvas background appropriately on stop.

4. **Update RecordingStateMachine**
   - Ensure state transitions that require visualization changes emit the correct events (e.g., stopping, error, cancel).

5. **Update Tests**
   - [ ] Add/modify tests to verify that visualization is only controlled by the UI and responds to events as expected.
   - [ ] Update or add tests for event emission and UI response.

---

**Progress:**
- Steps 1–4 completed: Visualization events are now defined, AudioHandler emits events, UI listens and controls VisualizationController, and RecordingStateMachine emits visualization stop events as needed.
- **Next step:** Update and add tests to ensure visualization is only controlled by the UI and responds to events as expected.

6. **Documentation**
   - Update code comments and the maintainability plan to reflect the new architecture.
   - Document the event-driven visualization flow in the README or architecture docs.

---

**Note:**  
This refactor will further enforce the separation of concerns and make the visualization logic more testable and maintainable.

## Planned Refactor: Move Visualization Control to UI Module

**Goal:**  
Ensure the UI module is the only component responsible for creating, starting, and stopping the `VisualizationController`, making visualization a true UI concern and further decoupling audio logic from presentation.

### Step-by-step Plan

1. **Define Visualization Events**
   - Add new event types to `APP_EVENTS` for visualization start/stop (e.g., `VISUALIZATION_START`, `VISUALIZATION_STOP`).

2. **Update AudioHandler**
   - Remove all direct references to `VisualizationController` from `AudioHandler`.
   - In `AudioHandler`, emit visualization events via the event bus at appropriate points (e.g., after starting/stopping recording).

3. **Update UI Module**
   - Listen for visualization events in the UI module.
   - On `VISUALIZATION_START`, create and start a `VisualizationController` instance using the provided stream/canvas/theme.
   - On `VISUALIZATION_STOP`, stop and clean up the `VisualizationController` instance.

4. **Update RecordingStateMachine**
   - Ensure state transitions that require visualization changes emit the correct events (e.g., stopping, error, cancel).

5. **Update Tests**
   - Add/modify tests to verify that visualization is only controlled by the UI and responds to events as expected.

6. **Documentation**
   - Update code comments and the maintainability plan to reflect the new architecture.

---

**Note:**  
This refactor will further enforce the separation of concerns and make the visualization logic more testable and maintainable.

---

# Maintainability Improvement Plan for whisper-transcribe

## Progress & Changes

- **[2025-07-02] Visualization Refactor:**
  - Extracted all audio visualization logic from `AudioHandler` into a new `VisualizationController` module (`js/visualization.js`).
  - `AudioHandler` now creates and manages a `VisualizationController` instance, delegating all visualization responsibilities to it.
  - This improves SRP, testability, and code clarity, and lays the groundwork for further modularization.

This plan outlines specific, actionable steps to improve the maintainability, readability, and extensibility of the codebase using Clean Code and SOLID principles. Each step references actual files, modules, and patterns in this repository.

---


## 1. AudioHandler (`js/audio-handler.js`)

- **Refactor large methods**
  - Identify methods that perform multiple responsibilities, such as `startRecording`, `stopRecording`, or any method that handles both audio and visualization logic.
  - Split these into smaller, single-purpose functions. For example:
    - Extract `initializeMediaRecorder`, `handleDataAvailable`, `finalizeRecording`, `startVisualization`, `stopVisualization` from larger methods.
    - Ensure each function does one thing and is named accordingly.
  - Example:
    - Before: `startRecording()` sets up recorder, starts visualization, and updates state.
    - After: `startRecording()` calls `initializeMediaRecorder()`, `startVisualization()`, and emits state change via event bus.

- **Clarify naming**
  - Review all variable and function names for clarity and intent.
  - Rename ambiguous names (e.g., `rec`, `chunks`, `data`) to descriptive alternatives (`mediaRecorder`, `audioChunks`, `audioData`).
  - Use verb-noun pairs for functions (e.g., `startRecording`, `stopVisualization`).
  - Add JSDoc comments for all public methods.

- **Single Responsibility Principle (SRP)**
  - Remove any UI manipulation (e.g., DOM updates, direct calls to UI methods) from this module.
  - Remove any settings/config logic that does not pertain to audio or visualization.
  - If UI or settings logic is found, move it to the appropriate module and use the event bus for communication.
  - Ensure AudioHandler only manages:
    - Audio recording (start, stop, pause, resume)
    - Audio data (buffering, exporting)
    - Visualization (start, stop, cleanup)

- **Visualization cleanup**
  - Ensure `visualizationController` is always stopped and cleaned up on any state transition that ends or interrupts recording (e.g., stop, error, cancel).
  - Add a dedicated `cleanupVisualization()` method if not present.
  - Call `cleanupVisualization()` in all relevant state handlers (e.g., `handleStoppingState`, `handleErrorState`).
  - Use theme-aware cleanup (e.g., update canvas background color according to theme from constants).
  - Emit an event via the event bus when visualization is started or stopped, so UI can react accordingly.

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
