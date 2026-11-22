# Accessibility notes

Targets the app already follows (keep them intact when contributing):

- Semantic HTML for primary regions (`main`, `header`, `nav`, `section`).
- All interactive controls are keyboard reachable; focus rings are never removed.
- Icons are `aria-hidden` when decorative; informative icons have text alternatives.
- Form fields use explicit `<label>` associations.
- Color contrast meets WCAG AA for body text.
- Touch targets are at least 44px - the app is used one-handed at a shop counter.

## Testing a change
1. Tab through the changed screen - no traps, visible focus.
2. Check labels with a screen reader (VoiceOver / TalkBack) for the changed flow.
3. Verify at 320px width and 200% zoom.
