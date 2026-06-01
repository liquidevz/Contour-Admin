# Theme System Documentation

## Overview

The Contour Admin Panel now features a comprehensive dark/light mode theme system with an **Uber Black** dark mode and a clean light mode. The theme system is fully integrated across all components and pages.

## Features

### 🌓 Dual Theme Support
- **Dark Mode (Uber Black)**: Pure black (#000000) background with carefully crafted contrast ratios
- **Light Mode**: Clean white background with subtle grays for depth

### 🎨 Design Tokens
All colors, spacing, and design elements use CSS custom properties (variables) that automatically adapt to the selected theme:

- **Colors**: Background, text, borders, status colors
- **Spacing**: Consistent padding, margins, and gaps
- **Shadows**: Theme-aware shadows that work in both modes
- **Transitions**: Smooth animations between theme changes

### 💾 Persistence
- Theme preference is saved to `localStorage`
- Automatically restores user's last selected theme
- Falls back to system preference if no saved preference exists

### 🔄 System Preference Detection
- Automatically detects user's system theme preference
- Listens for system theme changes in real-time
- Respects manual user selection over system preference

## Implementation

### File Structure

```
src/
├── context/
│   └── ThemeContext.tsx          # Theme state management
├── components/
│   └── ui/
│       └── ThemeToggle.tsx       # Theme toggle button component
├── theme.css                      # Theme variables (dark & light)
├── components-styles.css          # All component styles
└── index.css                      # Main CSS entry point
```

### Theme Variables

#### Dark Mode (Uber Black)
```css
:root[data-theme="dark"] {
  --bg-primary: #000000;           /* Pure black */
  --bg-secondary: #0a0a0a;         /* Slightly lighter black */
  --bg-tertiary: #121212;          /* Card backgrounds */
  --text-primary: #ffffff;         /* White text */
  --text-secondary: #a0a0a0;       /* Muted text */
  /* ... and more */
}
```

#### Light Mode
```css
:root[data-theme="light"] {
  --bg-primary: #ffffff;           /* Pure white */
  --bg-secondary: #f8f9fa;         /* Light gray */
  --bg-tertiary: #f1f3f5;          /* Card backgrounds */
  --text-primary: #1a1a1a;         /* Dark text */
  --text-secondary: #495057;       /* Muted text */
  /* ... and more */
}
```

## Usage

### Using the Theme Context

```typescript
import { useTheme } from '../context/ThemeContext';

function MyComponent() {
  const { theme, toggleTheme, setTheme } = useTheme();
  
  return (
    <div>
      <p>Current theme: {theme}</p>
      <button onClick={toggleTheme}>Toggle Theme</button>
      <button onClick={() => setTheme('dark')}>Dark Mode</button>
      <button onClick={() => setTheme('light')}>Light Mode</button>
    </div>
  );
}
```

### Using Theme Variables in CSS

```css
.my-component {
  background: var(--bg-primary);
  color: var(--text-primary);
  border: 1px solid var(--border-default);
  transition: all var(--transition-normal);
}

.my-button {
  background: var(--accent-primary);
  color: var(--text-inverse);
}

.my-button:hover {
  background: var(--accent-primary-hover);
  box-shadow: var(--shadow-glow);
}
```

## Theme Toggle Component

The theme toggle button is located in the top bar of the admin panel, next to the scope switcher. It displays:
- 🌙 Moon icon in light mode (click to switch to dark)
- ☀️ Sun icon in dark mode (click to switch to light)

## Color Palette

### Status Colors (Adaptive)
Both themes include semantic status colors that maintain proper contrast:

- **Success**: Green tones
- **Warning**: Amber/Orange tones
- **Error**: Red tones
- **Info**: Blue tones
- **Pending**: Purple tones

### Accent Colors
- **Primary Accent**: Indigo/Purple gradient
- Automatically adjusts brightness for optimal contrast in each theme

## Best Practices

### 1. Always Use CSS Variables
❌ **Don't:**
```css
.component {
  background: #000000;
  color: #ffffff;
}
```

✅ **Do:**
```css
.component {
  background: var(--bg-primary);
  color: var(--text-primary);
}
```

### 2. Use Semantic Variable Names
Choose variables based on their purpose, not their color:
- `--text-primary` for main text
- `--text-secondary` for less important text
- `--text-muted` for hints and placeholders

### 3. Test in Both Themes
Always test your components in both dark and light modes to ensure proper contrast and readability.

### 4. Use Transition Variables
For smooth theme transitions:
```css
.component {
  transition: background-color var(--transition-normal),
              color var(--transition-normal);
}
```

## Accessibility

### Contrast Ratios
All color combinations meet WCAG AA standards for contrast:
- Normal text: minimum 4.5:1
- Large text: minimum 3:1
- UI components: minimum 3:1

### Reduced Motion
The theme system respects user's motion preferences. Consider adding:
```css
@media (prefers-reduced-motion: reduce) {
  * {
    transition-duration: 0.01ms !important;
  }
}
```

## Extending the Theme

### Adding New Colors

1. Add to both theme definitions in `src/theme.css`:

```css
:root[data-theme="dark"] {
  --my-custom-color: #your-dark-color;
}

:root[data-theme="light"] {
  --my-custom-color: #your-light-color;
}
```

2. Use in your components:

```css
.my-component {
  color: var(--my-custom-color);
}
```

### Adding New Components

When creating new components, always use theme variables:

```tsx
// MyComponent.tsx
export default function MyComponent() {
  return (
    <div className="my-component">
      <h2>My Component</h2>
      <p>This uses theme variables</p>
    </div>
  );
}
```

```css
/* In your CSS file */
.my-component {
  background: var(--surface-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 20px;
  color: var(--text-primary);
}

.my-component h2 {
  color: var(--text-primary);
  margin-bottom: 12px;
}

.my-component p {
  color: var(--text-secondary);
}
```

## Troubleshooting

### Theme Not Persisting
- Check browser's localStorage is enabled
- Verify `localStorage.getItem('contour-theme')` returns a value

### Colors Not Changing
- Ensure you're using CSS variables, not hard-coded colors
- Check that `data-theme` attribute is set on `<html>` element
- Clear browser cache and rebuild

### Flash of Wrong Theme
- The theme is applied immediately on load from localStorage
- If you see a flash, check that ThemeProvider is wrapping your app correctly

## Performance

The theme system is highly performant:
- CSS variables are hardware-accelerated
- Theme changes are instant (no re-render of entire app)
- Minimal JavaScript overhead
- Transitions are GPU-accelerated

## Browser Support

The theme system works in all modern browsers:
- Chrome/Edge 88+
- Firefox 85+
- Safari 14+
- Opera 74+

## Future Enhancements

Potential improvements for the theme system:
- [ ] Additional theme variants (e.g., "Midnight Blue", "Warm Gray")
- [ ] Per-component theme overrides
- [ ] Theme scheduling (auto-switch based on time of day)
- [ ] High contrast mode for accessibility
- [ ] Custom theme builder UI

## Credits

Designed and implemented for the Contour Admin Panel with focus on:
- Modern design principles
- Accessibility standards
- Performance optimization
- Developer experience
