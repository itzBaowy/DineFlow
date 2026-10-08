---
name: Artisanal Operations
colors:
  surface: '#faf9f5'
  surface-dim: '#dbdad6'
  surface-bright: '#faf9f5'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f4f4f0'
  surface-container: '#efeeea'
  surface-container-high: '#e9e8e4'
  surface-container-highest: '#e3e2df'
  on-surface: '#1b1c1a'
  on-surface-variant: '#414845'
  inverse-surface: '#2f312e'
  inverse-on-surface: '#f2f1ed'
  outline: '#717975'
  outline-variant: '#c1c8c3'
  surface-tint: '#406658'
  primary: '#00281d'
  on-primary: '#ffffff'
  primary-container: '#173e32'
  on-primary-container: '#81a999'
  inverse-primary: '#a6cfbf'
  secondary: '#536434'
  on-secondary: '#ffffff'
  secondary-container: '#d6eaad'
  on-secondary-container: '#596a39'
  tertiary: '#1b241f'
  on-tertiary: '#ffffff'
  tertiary-container: '#313934'
  on-tertiary-container: '#9aa39c'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#c2ecda'
  primary-fixed-dim: '#a6cfbf'
  on-primary-fixed: '#002117'
  on-primary-fixed-variant: '#284e41'
  secondary-fixed: '#d6eaad'
  secondary-fixed-dim: '#bace93'
  on-secondary-fixed: '#131f00'
  on-secondary-fixed-variant: '#3c4c1f'
  tertiary-fixed: '#dce5de'
  tertiary-fixed-dim: '#c0c9c2'
  on-tertiary-fixed: '#151d19'
  on-tertiary-fixed-variant: '#404944'
  background: '#faf9f5'
  on-background: '#1b1c1a'
  surface-variant: '#e3e2df'
typography:
  headline-display:
    fontFamily: Newsreader
    fontSize: 48px
    fontWeight: '400'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-display-mobile:
    fontFamily: Newsreader
    fontSize: 32px
    fontWeight: '400'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: Newsreader
    fontSize: 36px
    fontWeight: '500'
    lineHeight: 44px
    letterSpacing: -0.015em
  headline-lg-mobile:
    fontFamily: Newsreader
    fontSize: 26px
    fontWeight: '500'
    lineHeight: 34px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Be Vietnam Pro
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 30px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Be Vietnam Pro
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
    letterSpacing: 0em
  body-lg:
    fontFamily: Be Vietnam Pro
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 26px
    letterSpacing: 0em
  body-md:
    fontFamily: Be Vietnam Pro
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 22px
    letterSpacing: 0.005em
  body-sm:
    fontFamily: Be Vietnam Pro
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0.01em
  label-lg:
    fontFamily: Be Vietnam Pro
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.02em
  label-md:
    fontFamily: Be Vietnam Pro
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.04em
  label-sm:
    fontFamily: Be Vietnam Pro
    fontSize: 10px
    fontWeight: '700'
    lineHeight: 14px
    letterSpacing: 0.06em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-tablet: 2rem
  margin-desktop: 3rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

The visual identity marries the tactile intimacy of a high-end Vietnamese neighborhood bistro with the uncompromising clarity of modern hospitality operations software. It evokes the sensory calm of an unhurried culinary space—natural materials, herbal freshness, steam, and polished lacquer—while maintaining the rigorous utility demanded by front-of-house staff and hungry diners navigating digital menus.

The design movement blends **Warm Editorial Minimalism** with **Tactile Utility**. Layouts celebrate generous white space and quiet typographic structure rather than noisy ornamentation. Interactions feel grounded and responsive, avoiding cold technological sterility in favor of organic poise, deliberate pacing, and effortless dining clarity.

## Colors

The palette grounds itself in natural, culinary tones:
- **Primary (`#173e32` - Deep Pine)**: Serves as the dominant anchor for brand elements, key navigation, high-emphasis interactive states, and headers. It conveys discipline, tradition, and quiet authority.
- **Secondary (`#d9edb0` - Vivid Tasteful Chartreuse)**: Used sparingly as an accent for urgent badges, highlighted menu specials, active item counters, and primary contextual CTAs that demand instantaneous focus.
- **Tertiary (`#dbe4dd` - Subtle Sage)**: Applied strictly for structural borders, hairline dividers, secondary card frames, and muted interactive chip boundaries.
- **Neutral Light (`#f8f7f3` - Warm Ivory)**: The global canvas background, offering warmth, reduction of digital glare, and a tactile paper-like quality.
- **Primary Text (`#252d27` - Warm Charcoal)**: Replaces harsh pure blacks to ensure gentle, legible contrast across body copy, ticket counts, and table identifiers.
- **Surface Crisp (`#ffffff` - Crisp White)**: Used for isolated card surfaces, elevated order panels, and modal containers to create distinct spatial segregation from the warm ivory canvas.

## Typography

The type system balances evocative culinary storytelling with sharp, high-legibility operations data.

- **Newsreader** is reserved strictly for high-level editorial headers, restaurant welcome banners, dish origin spotlights, and receipt intros. Its presence must be intentional, never overused in dense transactional layouts.
- **Be Vietnam Pro** carries all operational weight: menu item names, modifiers, dietary notifications, ingredient breakdowns, order status flags, and table management indicators. Its authentic diacritic support and open counters preserve pristine readability even on smaller mobile viewports in low-light dining environments.

## Layout & Spacing

The layout employs an adaptable fluid grid:
- **Mobile (QR Ordering Interface, 0 - 640px)**: 4-column layout with 16px margins and 16px gutters. Structural priority emphasizes quick thumb access, clear vertical scanning, sticky checkout bars, and full-width card structures.
- **Tablet (Server POS / Kitchen Display, 641px - 1024px)**: 8-column layout with 32px margins and 20px gutters. Balanced split views allow simultaneous order intake and item staging.
- **Desktop (Manager Operations / Analytics, 1025px+)**: 12-column layout bounded by a 1440px maximum container, featuring 48px canvas margins and 24px gutters.

Vertical rhythm relies strictly on the structured spacing tokens, favoring generous `space-lg` and `space-xl` breathing room between editorial categories, while compressing operational line-items with `space-sm` and `space-md` for high data density.

## Elevation & Depth

Spatial depth relies primarily on **tonal contrast** and **whisper-light ambient shadows**, completely eschewing muddy multi-layered drop shadows or plastic skeuomorphism.

- **Level 0 (Canvas)**: Background painted in `#f8f7f3` (Warm Ivory).
- **Level 1 (Surface Cards & Panels)**: Elevated using `#ffffff` crisp white backgrounds bordered by a delicate 1px `#dbe4dd` outline. Shadow is minimal: `0 2px 8px -2px rgba(23, 62, 50, 0.04)`.
- **Level 2 (Dropdowns, Flyout Baskets & Popovers)**: `#ffffff` surfaces paired with `0 8px 24px -4px rgba(23, 62, 50, 0.08)` and subtle border containment, ensuring high legibility over busy menu photos.
- **Level 3 (Modals & Full Drawers)**: Backdrop blurred at 8px with a 30% `#173e32` deep pine overlay, centering `#ffffff` dialog cards with `0 16px 40px -8px rgba(23, 62, 50, 0.16)`.

## Shapes

The interface embraces a refined 16px (`rounded-lg` / `1rem`) corner radius for all primary cards, modal dialogs, and culinary imagery. This curvature introduces organic softness reminiscent of ceramic tableware without degrading into novelty.

- **Standard Elements (Cards, Containers, Flyouts)**: 16px (`1rem`).
- **Interactive Controls (Inputs, Buttons, Segmented Controls)**: 10px to 12px for precision handling.
- **Micro Elements (Pills, Counter Chips, Status Dots)**: Full pill radius (`9999px`) to create clear shape contrast against squarer menu containers.
- **Dividers & Strokes**: 1px uniform width rendered in subtle sage `#dbe4dd`.

## Components

### Buttons
- **Primary Action (e.g., "Add to Order", "Confirm Table")**: Minimum 48px touch height. Background in Deep Pine `#173e32`, label in Crisp White `#ffffff` with `label-lg` styling. Subtle transition to active state through slight scale compression (0.98) and an inset glow of Chartreuse `#d9edb0`.
- **Accent Action (e.g., "Checkout Now", "Call Server")**: Background in Chartreuse `#d9edb0`, label in Deep Pine `#173e32` with semibold weight, offering instant visual pop against neutral surfaces.
- **Secondary / Ghost**: Transparent surface bounded by 1px subtle sage `#dbe4dd` border, hover fills with a 5% tint of Deep Pine.

### Chips & Dietary Badges
- **Category Filter Chips**: 36px height, rounded-full pill shape. Unselected states use Warm Ivory `#f8f7f3` background with Subtle Sage `#dbe4dd` borders. Selected states flip to Deep Pine `#173e32` background with Crisp White `#ffffff` text.
- **Dietary Tags (e.g., "Chay / Vegetarian", "Gluten-Free")**: Pill format with 8px horizontal padding, muted sage backgrounds, and crisp text rendered in Warm Charcoal `#252d27` at `label-sm`.

### Menu Cards & Lists
- **Menu Item Card**: Crisp White `#ffffff` background with 16px rounded corners, bounded by 1px `#dbe4dd`. Features structured layout: Newsreader header for Vietnamese dish title, Be Vietnam Pro for translated descriptions, and bold Deep Pine price tags. Food photography sits flush with 12px inner corner radiuses.
- **Modifier Lists**: Indented tree format with 48px interactive target rows, separated by hairline `#dbe4dd` dividers.

### Form Inputs & Quantities
- **Text Inputs**: Crisp White background, 48px height, 1px `#dbe4dd` border, transitioning to a focused 1.5px Deep Pine `#173e32` border with zero colored halo. Label rendered in Warm Charcoal floating neatly above.
- **Quantity Stepper**: Pill-shaped horizontal enclosure containing `-` and `+` touch zones (48px tap targets) flanking an inner numeric Be Vietnam Pro counter.

### Operations Order Ticket (Kitchen / POS View)
- High-contrast card with crisp white background, crowned with a Deep Pine `#173e32` status header displaying table number and elapsed cook time.
- Chartreuse `#d9edb0` accent bars indicate newly fired modifications or allergen alerts.
