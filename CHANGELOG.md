# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.3] - 2026-11-10

### Added
- **Goodreads Library Importer:** Complete offline-first CSV importer for `goodreads_library_export.csv`.
- **Smart Vault Scanner & Deduplication:** Pre-scans vault using ISBN, ISBN-13, titles, and aliases to detect existing notes and prevent duplicate files.
- **Interactive Import Modal:** Real-time search/filter with Turkish and fuzzy support, individual checkboxes for books, select all/none controls, and live count indicators.
- **Non-destructive Frontmatter Updater:** Safely updates existing notes (reading status, personal rating, read dates) without overwriting custom tags or note body content.
- **Provider Enrichment:** Optional automated metadata/cover enrichment via Kitapyurdu, D&R, Hardcover, and Open Library during CSV import.
- **Global Provider Integration:** Connected Hardcover and Open Library to the hybrid metadata selector with on-demand ISBN enrich.

### Fixed
- **Dataview Inline JS Quote Escaping (`635c9d9`):** Escaped quotes/apostrophes in values interpolated inside Dataview inline JS (`$= ...`) expressions (e.g., `'{{coverUrl}}'` with `Ay'a Yolculuk.jpg`), preventing `SyntaxError: Unexpected identifier`.
- **Templater & YAML Injection Protection:** Sanitized raw strings from Goodreads exports to prevent unintended Templater `<% ... %>` execution and YAML parse errors.
- **Author vs Translator Split:** Separated translator names from author fields to keep bibliographies accurate.

## [0.5.2] - 2026-10-27

### Changed
- Bumped version to 0.5.2 and synchronized plugin release manifests.

## [0.5.1] - 2026-10-27

### Fixed
- Updated lockfiles and resolved Obsidian review recommendations.
- Refactored settings layout to full-width configuration blocks.

## [0.5.0] - 2026-10-27

### Added
- Initial support for global providers (Hardcover, Open Library).
- Dedicated library card (`kitap-kart`) renderer and Obsidian Secret Storage for API tokens.
