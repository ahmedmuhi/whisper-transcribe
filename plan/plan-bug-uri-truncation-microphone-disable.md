---
goal: Investigate and Fix URI Truncation and Microphone Disabling After Settings Save
version: 1.0
date_created: 2025-01-16
owner: Development Team
tags: [bug, investigation, settings, uri-processing, validation]
---

# Introduction

Investigation plan to diagnose and resolve the issue where saving API settings results in target URI truncation (showing only the domain instead of the full URL with path and query parameters) and microphone button becoming disabled, preventing the application from functioning.

## 1. Requirements & Constraints

- **REQ-001**: Target URI SHALL be preserved in its complete form after saving settings
- **REQ-002**: Full URI with deployment path and API version SHALL be maintained in localStorage
- **REQ-003**: Microphone button SHALL remain enabled after valid settings are saved
- **REQ-004**: URI validation SHALL accept complete Azure OpenAI endpoint URLs
- **REQ-005**: Settings form SHALL display the complete URI when loading saved settings
- **REQ-006**: URI processing SHALL not modify user-provided endpoints unnecessarily
- **SEC-001**: API credentials SHALL remain secure during URI processing
- **CON-001**: Must maintain backward compatibility with existing stored URIs
- **CON-002**: Must follow existing validation patterns in Settings class
- **GUD-001**: Provide clear error messages for invalid URI formats
- **PAT-001**: Use existing error handling and event emission patterns

## 2. Implementation Steps

### Phase 1: Problem Analysis
1. **STEP-001**: Examine `sanitizeInputs()` method in Settings class for URI processing logic
2. **STEP-002**: Investigate URL constructor usage and origin extraction in URI sanitization
3. **STEP-003**: Check `validateConfiguration()` method for URI validation requirements
4. **STEP-004**: Analyze `saveSettings()` method to identify where URI gets truncated
5. **STEP-005**: Review `loadSettingsToForm()` method for URI display behavior

### Phase 2: URI Processing Investigation
6. **STEP-006**: Test URI sanitization with complete Azure OpenAI endpoints
7. **STEP-007**: Examine URL.origin behavior vs. complete URL preservation
8. **STEP-008**: Check if URI truncation happens during input sanitization or storage
9. **STEP-009**: Verify localStorage storage of complete vs. truncated URIs
10. **STEP-010**: Identify exact point where full URI path gets lost

### Phase 3: Microphone Disabling Analysis
11. **STEP-011**: Trace microphone button state management after settings save
12. **STEP-012**: Check API configuration validation triggering microphone disable
13. **STEP-013**: Investigate `checkInitialSettings()` method behavior after save
14. **STEP-014**: Examine `getModelConfig()` method returning truncated URI
15. **STEP-015**: Verify if truncated URI fails API client validation

### Phase 4: Event and State Flow Analysis
16. **STEP-016**: Check `SETTINGS_SAVED` event emission and handling
17. **STEP-017**: Trace permission manager and UI state updates after save
18. **STEP-018**: Investigate if settings validation errors disable microphone
19. **STEP-019**: Examine audio handler initialization with new settings
20. **STEP-020**: Check if API client receives truncated vs. complete URI

### Phase 5: Code Path Investigation
21. **STEP-021**: Map complete flow from settings form input to localStorage storage
22. **STEP-022**: Identify all methods that process or transform URI values
23. **STEP-023**: Check for any automatic URL normalization interfering with Azure URLs
24. **STEP-024**: Examine test cases for URI handling behavior to understand expected vs actual behavior
25. **STEP-025**: Verify if issue affects both Whisper and GPT-4o model URIs

### Phase 6: Root Cause Analysis
26. **STEP-026**: Document the exact URI transformation happening in sanitizeInputs() method
27. **STEP-027**: Trace the comment "URI field uses a standard format of <origin>/ with no path" vs Azure OpenAI requirements
28. **STEP-028**: Identify why URL.origin extraction was implemented instead of full URL preservation
29. **STEP-029**: Check if original implementation assumed simple domain-only endpoints
30. **STEP-030**: Verify if Azure OpenAI endpoints require the full path including deployment and API version

### Phase 7: Impact Assessment
31. **STEP-031**: Test what happens when API client receives truncated URI during transcription
32. **STEP-032**: Check if microphone disable is immediate after save or after validation failure
33. **STEP-033**: Verify error messages shown to user when URI validation fails
34. **STEP-034**: Test if manually correcting the truncated URI in localStorage fixes microphone
35. **STEP-035**: Assess if this affects existing users who may have already saved truncated URIs

## 3. Alternatives

- **ALT-001**: Remove URI sanitization completely to preserve user input exactly
- **ALT-002**: Modify sanitization to preserve path and query parameters while cleaning whitespace
- **ALT-003**: Add special handling for Azure OpenAI endpoint URL patterns
- **ALT-004**: Implement URI validation without normalization/truncation

## 4. Dependencies

- **DEP-001**: Settings class sanitizeInputs() and validateConfiguration() methods
- **DEP-002**: URL constructor and browser URL parsing behavior
- **DEP-003**: localStorage persistence and retrieval mechanisms
- **DEP-004**: API client configuration validation logic
- **DEP-005**: Microphone button state management in UI components

## 5. Files

- **FILE-001**: `/js/settings.js` - Settings class with URI processing methods
- **FILE-002**: `/js/api-client.js` - API configuration validation and usage
- **FILE-003**: `/js/audio-handler.js` - Microphone state management
- **FILE-004**: `/js/ui.js` - UI state updates and button enabling/disabling
- **FILE-005**: `/tests/settings-*.vitest.js` - Test cases for URI handling
- **FILE-006**: `/js/permission-manager.js` - Permission state affecting microphone

## 6. Testing

- **TEST-001**: Save complete Azure OpenAI URI and verify it's stored completely
- **TEST-002**: Load saved settings and verify complete URI appears in form
- **TEST-003**: Test URI sanitization with various Azure endpoint formats
- **TEST-004**: Verify microphone remains enabled after saving valid settings
- **TEST-005**: Test both Whisper and GPT-4o URI handling behavior
- **TEST-006**: Validate API client receives complete URI for transcription
- **TEST-007**: Test edge cases with malformed but recoverable URIs

## 7. Risks & Assumptions

- **RISK-001**: Removing URI sanitization might allow invalid URLs to be stored
- **RISK-002**: Changes to URI processing might break existing validation logic
- **RISK-003**: Existing users with truncated URIs might need migration/re-entry
- **ASSUMPTION-001**: Current URI truncation is unintentional side effect of sanitization
- **ASSUMPTION-002**: Complete Azure OpenAI URLs are required for API functionality
- **ASSUMPTION-003**: Microphone disabling is related to invalid URI configuration

## 8. Investigation Focus Areas

### Primary Suspects (Based on Initial Analysis)
1. **Settings.sanitizeInputs()** - Method explicitly truncates URI to `${parsed.origin}/` removing path and query parameters
2. **URL Constructor Usage** - Code intentionally extracts only origin instead of preserving full URL
3. **API Client Validation** - Truncated URI likely fails Azure OpenAI endpoint validation
4. **Settings Event Flow** - Save → URI Truncation → Invalid Config → Microphone Disable chain

### Expected Azure OpenAI URI Format
```
Complete: https://mvp-ai-muhi.openai.azure.com/openai/deployments/whisper/audio/transcriptions?api-version=2024-06-01
Required: Full path with deployment name and API version parameters
```

### Current Suspected Behavior
```
Input:  https://mvp-ai-muhi.openai.azure.com/openai/deployments/whisper/audio/transcriptions?api-version=2024-06-01
Process: sanitizeInputs() → new URL(uri) → ${parsed.origin}/
Output: https://mvp-ai-muhi.openai.azure.com/ (truncated, missing deployment path)
Result: Invalid Azure OpenAI endpoint → API validation fails → Microphone disabled
```

### Investigation Questions
1. **Why was URI truncation implemented?** - Check git history and original requirements
2. **What endpoints was this designed for?** - Was it intended for simple domain-only APIs?
3. **When does microphone get disabled?** - During save, validation, or API client initialization?
4. **Are there test cases covering this?** - Do existing tests expect URI truncation?
5. **How to fix without breaking existing functionality?** - Migration strategy for users with truncated URIs

## 9. Related Specifications / Further Reading

- [Azure OpenAI Service REST API Reference] - For complete endpoint URL requirements
- [Settings Management Specification] - For URI validation and processing patterns
- [API Client Configuration] - For understanding required URI format for transcription
- [Browser URL API Documentation] - For understanding URL constructor behavior
