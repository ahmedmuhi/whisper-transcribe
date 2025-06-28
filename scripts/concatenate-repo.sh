#!/bin/bash

#============================================================================
# Repository Content Concatenator
#============================================================================
# 
# Purpose: Concatenates all source code files in a repository into a single
#          markdown file for easy sharing, documentation, or analysis.
#
# Features:
#   - Processes JS, HTML, CSS, MD, and JSON files
#   - Excludes common directories (.git, node_modules, .vscode)
#   - Adds proper syntax highlighting for each file type
#   - Generates clean markdown with file headers and separators
#   - Works on any Unix-like system (Linux, macOS, WSL)
#
# Usage: 
#   ./concatenate-repo.sh
#
# Output: 
#   Creates 'repository-content-simple.md' in the current directory
#
# Author: Generated for whisper-transcribe project
# Date: June 2025
#============================================================================

# Configuration
OUTPUT_FILE="repository-content-simple.md"
REPO_NAME=$(basename "$(pwd)")

# Initialize the output file with header information
echo "🚀 Starting repository concatenation for: $REPO_NAME"
echo "📝 Output file: $OUTPUT_FILE"

echo "# Repository Content: $REPO_NAME" > "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"
echo "Generated on: $(date -Iseconds)" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# Find all relevant source files and process them
# Includes: JS, HTML, CSS, MD, JSON files
# Excludes: Hidden directories, build artifacts, and generated files
echo "🔍 Scanning for source files..."

find . -type f \( -name "*.js" -o -name "*.html" -o -name "*.css" -o -name "*.md" -o -name "*.json" \) \
    ! -path "./.git/*" \
    ! -path "./node_modules/*" \
    ! -path "./.vscode/*" \
    ! -name "$OUTPUT_FILE" \
    ! -name "repository-content.md" \
    | sort | while read -r file; do
    
    echo "📄 Processing: $file"
    
    # Remove leading ./ from path for cleaner display
    relative_path=${file#./}
    
    # Determine syntax highlighting language based on file extension
    extension="${file##*.}"
    case "$extension" in
        "js") lang="javascript" ;;
        "html") lang="html" ;;
        "css") lang="css" ;;
        "md") lang="markdown" ;;
        "json") lang="json" ;;
        *) lang="text" ;;
    esac
    
    # Add file content with proper markdown formatting
    echo "" >> "$OUTPUT_FILE"
    echo "## $relative_path" >> "$OUTPUT_FILE"
    echo "" >> "$OUTPUT_FILE"
    echo "\`\`\`$lang" >> "$OUTPUT_FILE"
    cat "$file" >> "$OUTPUT_FILE"
    echo "" >> "$OUTPUT_FILE"
    echo "\`\`\`" >> "$OUTPUT_FILE"
    echo "" >> "$OUTPUT_FILE"
    echo "---" >> "$OUTPUT_FILE"
    echo "" >> "$OUTPUT_FILE"
done

echo "✅ Repository content concatenated to: $OUTPUT_FILE"
echo "📊 File size: $(du -h "$OUTPUT_FILE" | cut -f1)"
