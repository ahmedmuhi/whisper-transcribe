---
goal: Investigate and Fix Model Selector Integration with Settings Modal
version: 1.0
date_created: 2025-01-16
owner: Development Team
tags: [feature, investigation, ui, settings, bug]
---

# Introduction

Investigation plan to diagnose and resolve the issue where the settings modal no longer provides proper model-specific configuration management. The current system has a model selector in the main interface but lacks proper integration with the settings modal, preventing users from selecting a model within the settings and configuring its specific parameters.

## 1. Requirements & Constraints

- **REQ-001**: Settings modal SHALL include a model selector dropdown that synchronizes with the main interface model selector
- **REQ-002**: Model-specific settings sections SHALL show/hide based on the selected model within the settings modal
- **REQ-003**: Each transcription model SHALL have dedicated configuration fields (Whisper and GPT-4o)
- **REQ-004**: Model selection in settings modal SHALL persist to localStorage using `STORAGE_KEYS.MODEL`
- **REQ-005**: Settings modal SHALL load the currently selected model from main interface when opened
- **REQ-006**: Model changes in settings modal SHALL emit appropriate events for synchronization
- **SEC-001**: API keys SHALL remain protected with password input type
- **CON-001**: Must maintain backward compatibility with existing localStorage settings
- **CON-002**: Must follow existing event-driven architecture pattern using eventBus
- **GUD-001**: Follow established UI patterns and CSS variable theming system
- **PAT-001**: Use existing Settings class method structure and naming conventions

## 2. Implementation Steps

### Phase 1: Problem Analysis
1. **STEP-001**: Analyze current model selector behavior in main interface (`index.html` lines 42-48)
2. **STEP-002**: Examine Settings class `updateSettingsVisibility()` method logic
3. **STEP-003**: Investigate `getCurrentModel()` method and its dependency on main interface model selector
4. **STEP-004**: Review event flow between model selection and settings management
5. **STEP-005**: Check if model selector change events are properly handled

### Phase 2: UI Structure Investigation
6. **STEP-006**: Document current HTML structure of settings modal (missing model selector)
7. **STEP-007**: Analyze CSS styling for model selector in main interface
8. **STEP-008**: Identify DOM element IDs and constants used for model selection
9. **STEP-009**: Review test files for expected model selector behavior in settings

### Phase 3: Event System Analysis
10. **STEP-010**: Trace event emissions for model changes (`APP_EVENTS.SETTINGS_MODEL_CHANGED`)
11. **STEP-011**: Analyze Settings class initialization and event listener setup
12. **STEP-012**: Check if main interface model selector updates affect settings visibility
13. **STEP-013**: Verify localStorage synchronization between model selectors

### Phase 4: Code Integration Points
14. **STEP-014**: Examine `loadSettingsToForm()` method for model selector population
15. **STEP-015**: Review `saveSettings()` method for model persistence
16. **STEP-016**: Check `getModelConfig()` dependency on current model selection
17. **STEP-017**: Analyze API client's model configuration retrieval process

## 3. Alternatives

- **ALT-001**: Keep separate model selectors (main interface and settings) with synchronization events
- **ALT-002**: Remove model selector from main interface and centralize in settings modal only
- **ALT-003**: Use a unified model selection component shared between main interface and settings

## 4. Dependencies

- **DEP-001**: Existing Settings class and its methods
- **DEP-002**: EventBus system for inter-module communication
- **DEP-003**: Constants file (ID, STORAGE_KEYS, APP_EVENTS) for consistent references
- **DEP-004**: HTML structure and CSS theming system
- **DEP-005**: localStorage persistence layer

## 5. Files

- **FILE-001**: `/index.html` - Settings modal HTML structure (missing model selector)
- **FILE-002**: `/js/settings.js` - Settings class implementation with visibility logic
- **FILE-003**: `/js/constants.js` - DOM element IDs and storage keys
- **FILE-004**: `/css/styles.css` - Styling for model selector components
- **FILE-005**: `/tests/settings-*.vitest.js` - Test files for settings functionality
- **FILE-006**: `/js/api-client.js` - Model configuration consumption

## 6. Testing

- **TEST-001**: Verify model selector appears in settings modal
- **TEST-002**: Test model selection changes trigger settings visibility updates
- **TEST-003**: Validate model selection persistence to localStorage
- **TEST-004**: Test synchronization between main interface and settings model selectors
- **TEST-005**: Verify event emissions for model changes in settings modal
- **TEST-006**: Test settings validation for different model configurations
- **TEST-007**: Integration test for model-specific API configuration retrieval

## 7. Risks & Assumptions

- **RISK-001**: Changes to settings modal structure might break existing test cases
- **RISK-002**: Model synchronization between main interface and settings could create infinite event loops
- **RISK-003**: Existing users might have model configurations that need migration
- **ASSUMPTION-001**: The main interface model selector should remain for quick access
- **ASSUMPTION-002**: Users expect model-specific settings to auto-show when model is selected
- **ASSUMPTION-003**: Current localStorage structure can accommodate the fix without migration

## 8. Related Specifications / Further Reading

- [Settings Management Specification] - For details on settings persistence and validation
- [Event-Driven Architecture Documentation] - For proper event bus usage patterns
- [Azure Speech Services Integration Spec] - For model-specific API configuration requirements
- [UI/UX Design Guidelines] - For consistent model selector component design
