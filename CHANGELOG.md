# Changelog

## [1.3.0] - 2026-04-12

### Added
- Account sorting - sort by date added, name, last launched, or running first
- Account filtering - filter view to All / Running / Idle accounts
- Label colours - assign a colour tag to any account for easy identification
- Token health check - verify a cookie is still valid before launching
- Session timers - live elapsed time shown on running accounts
- Launch history - shows launch count and time since last launch per account
- Split launch button - choose between Direct and Bloxstrap launch per account
- Label badge displayed on the account card when a label is set

### Changed
- Account cards redesigned with header strip, overlapping circular avatar, and status row
- App icon updated
- Launch warning dialog added before starting instances

### Fixed
- Multi-instance mutex bypass now correctly handles both direct and Bloxstrap launch paths
- Cookie file locking prevents race conditions when launching multiple accounts rapidly
