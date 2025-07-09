# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2025-01-09

### Added
- Unity package documentation support (ECS, Input System, URP, etc.)
- New MCP tool: `list_unity_packages` - List available Unity package documentation
- New MCP tool: `download_unity_package_docs` - Download Unity package documentation
- Package documentation downloader and indexer scripts
- Database schema migration to v2 with package support
- Search functionality for package documentation with `type="package-docs"`
- Package name and version filtering in search results
- HTML parser support for package documentation format

### Changed
- Updated `search_unity_docs` tool to support `type="package-docs"`
- Extended search results to include package name and version information
- Updated README with package documentation features and usage examples
- Enhanced database schema to store package metadata

### Fixed
- Improved error handling in package download process
- Better TypeScript types for package-related functionality

## [0.1.1] - 2025-01-08

### Added
- New MCP tool: `get_unity_version_info` - Get Unity documentation version information
- Version information display in all search results and document views
- Database versioning system with migration support
- Version metadata storage in database

### Fixed
- FTS5 search syntax errors with dot (.) characters in queries
- HTML entity decoding issues (&amp;, &lt;, etc.)
- Escaped newline characters in string concatenation
- Cross-platform file path handling improvements
- Special character sanitization in search queries

### Changed
- Improved search query sanitization for FTS5 compatibility
- Enhanced error handling and logging
- Better string processing for HTML content
- Updated documentation with troubleshooting section

## [0.1.0] - 2025-01-07

### Added
- Initial release of Unity Documentation MCP Server
- Unity 6 (6000.1) official documentation support
- SQLite FTS5 full-text search functionality
- MCP tools for document search and retrieval:
  - `search_unity_docs` - Search Unity documentation
  - `read_unity_doc` - Read specific documents with pagination
  - `list_unity_doc_sections` - List document sections
  - `read_unity_doc_section` - Read specific document sections
- Offline documentation download and indexing
- Document pagination support for large files
- Section-based document navigation
- Comprehensive setup and configuration scripts
- TypeScript implementation with strict mode
- Complete test suite with Vitest
- ESLint configuration for code quality
- Automated build and deployment scripts

### Features
- Downloads Unity 6000.1 documentation ZIP (400MB)
- Indexes ~4000 documents with full-text search
- Supports both Manual and Script Reference documentation
- Provides HTML content parsing and text extraction
- Offers document sectioning based on HTML structure
- Includes robust error handling and logging
- Works completely offline after initial setup
- Cross-platform support (macOS, Linux, Windows)