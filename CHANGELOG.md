# Changelog

All notable changes to this card are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-11-09

### Added

- First version: a hypnogram of one night with lanes for awake, REM, light and deep, hour ticks in the user's locale and time format, and time asleep with each stage's duration and share
- Hover, touch and keyboard readout per segment, with a text alternative for screen readers
- Reads the Life Dashboard sensor and, on Android, the official Companion app's sleep duration sensor (2026.11.1 or newer)
- Empty states for a missing sensor, an unavailable sensor and a night without stages
- Visual editor in the card picker, built on Home Assistant's own form
