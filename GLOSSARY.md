# Whisper Transcribe

Whisper Transcribe is a personal-first speech transcription application that may later support additional users without taking ownership of their Azure usage.

## Language

**User**:
A person using Whisper Transcribe. The initial User is the application's owner and developer, but the term also covers people who may use it later.
_Avoid_: Customer, tenant, administrator

**Bring-your-own Azure**:
An operating model where each User authorizes an Azure transcription resource available to them, while that resource's owner remains responsible for access, quotas, and billing.
_Avoid_: Hosted transcription, shared application resource

**Transcription Model**:
An Azure speech model a User selects for the next transcription. The selection determines which Target URI is used.
_Avoid_: Engine, provider

**Target URI**:
The address of the Azure endpoint associated with a Transcription Model. It identifies where audio is sent but does not authorize access.
_Avoid_: Credential, API key

**Unsent Recording**:
Audio captured by a User that has not yet been accepted for transcription. It remains valuable User data and must not be lost during authentication recovery.
_Avoid_: Unsafe audio, pending token, temporary blob

**Audio Source**:
Audio a User provides for transcription, either captured from a microphone or selected as a local audio file.
_Avoid_: Input Device, Transcription Model, Target URI

**Selected Audio**:
An Audio Source chosen from a User's device and held locally for review before transcription. It has not yet been sent to Azure.
_Avoid_: Uploaded audio, pending upload
