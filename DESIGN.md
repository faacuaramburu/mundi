# Mundi visual conventions

This documents the existing interface and its shared patterns. Refinements should preserve the globe, restrained palette, thin separators, typography and generous spacing.

## Typography and surfaces

- Barlow is the interface face, with regular body text and semibold labels and actions. Smooch Sans is reserved for the Mundi wordmark.
- Body text and form actions use 1rem; navigation, supporting text and metadata use `--meta-size`. Section titles use 1.5rem. The larger home mode titles remain a separate hierarchy.
- Use the existing semantic CSS variables for both light and dark themes: `--paper`, `--field`, `--ink`, `--muted`, `--line`, `--field-border`, `--primary`, `--primary-ink`, `--focus`, `--success-text`, and `--error-text`.
- Sections are separated with 1px rules and whitespace. Avoid adding filled cards, badges, shadows or independent accent palettes to ordinary navigation and settings.

## Controls

- Primary actions use `.guess-button`: the theme's solid foreground/background contrast, semibold Barlow, and 6px corners. Examples: submit a guess, create a room, continue with Google.
- Secondary actions use `.secondary-button`: a 1px field border, field background, 1rem type, `--control-radius` (6px) and `--control-height` (48px). Buttons and links with the same action role share this pattern. Daily result actions remain side by side and wrap their text when needed.
- Navigation and tertiary actions use underlined text and transparent backgrounds. Header account, FAQ, language and index controls share the same type scale and underline offset. Give-up, close and guest alternatives retain visible keyboard focus and at least 44px touch targets.
- Form fields use the same field palette, border and 6px corners as secondary controls. Related controls align within one row.
- Reuse the authored SVG icon family: currentColor, unfilled paths, 1.6 stroke width. Home navigation uses the same arrow, including the nested daily challenge.

## Layout and states

- Keep the globe and game panel composition. The daily challenge remains within Singleplayer on the home screen, with smaller type and the same alignment and navigation arrow.
- Group related metadata with 8px spacing. Separate form groups and sections by 20–24px and a thin rule where appropriate. Dialogs share the same borders, type and control corners as the page; their heading and actions are separated by rules.
- On narrow screens, put the header's utility navigation in one complete row under the brand. Do not let the account control become an isolated extra row.
- Green communicates availability, found countries and success; errors use `--error-text`. Do not use either as a decorative brand color.
- Preserve hover, disabled, loading, error and success states; respect reduced motion; verify desktop, tablet, small mobile, both themes and both languages. Keep focus outlines visible and numerical data tabular.
