# Interactive Demo Specification

## Overview
A simple, clean interactive demo for email classification. The interface should be minimal and intuitive.

## Layout

### Full Page Width
- The demo should use full page width when browser is narrow
- When browser is wide, use max-width constraint (e.g., max-w-7xl)
- Left side (labels table): 40% of total width
- Right side (email list): 60% of total width

### Left Side - Labels Table
- Single table with two columns (no header row):
  - Column 1: Label name (editable input) with "Label" title in cell
  - Column 2: AI prompt (editable textarea that allows wrapping) with "AI Prompt" title in cell
- Table should fill the full width of the card
- Preset labels are loaded on page load (no preset buttons)
- If user edits any label, presets are gone (no way to reload them)
- Last row is always empty for adding new entries
- When both fields in the last row are filled, automatically add a new empty row
- Users can remove rows with an "X" button (only shown when row has content)
- All inputs are editable inline

### Right Side - Email List (Gmail-style)
- List of example emails displayed like Gmail inbox:
  - Each email is one line
  - Format: `Sender Name | **Subject** | beginning of email body...`
  - Subject should be bold
  - Truncate email body with ellipsis if too long
  - **No text wrapping** - each email must stay on a single line
  - Click to select an email (visual indication of selection)
- Matched labels appear to the left of the subject (like Gmail)
- Labels and subjects are indented a fixed distance from the sender name
- **No email preview section** - removed for simplicity

## Behavior

### Auto-classification
- Labels show up by default when page loads (using simple matching, no API calls)
- When user changes ANYTHING on the left (adds/edits/removes label, or changes prompt):
  - Mark that user has edited
  - Automatically run classification on all emails using Gemini API
  - Show loading state
  - Display results immediately
- No "Classify" or "Run" button needed
- No API calls are made until user edits something

### Initial State
- Page loads with 3 preset label configurations:
  1. Job Application (labels for job applications)
  2. Product Promotion (labels for product promotions)
  3. Newsletter (labels for newsletters)
- First email is selected by default
- Default labels are shown immediately using simple string matching (no API calls)
- Gemini API is only called after user makes edits

## Example Emails
1. Job Seeker - Software Engineer Position Application
2. Product Marketing - AI Tool Promotion
3. Newsletter - Weekly Tech Digest
4. Meeting Request - Q4 Planning Meeting

## Results Display
- Show matched labels as badges
- Show explanations for each matched label
- Display below the labels table or in a results section
