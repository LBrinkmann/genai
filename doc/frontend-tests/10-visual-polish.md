# Test: Overall UI Quality Check

## What
Verify the overall visual quality of the application across different states. Check layout consistency, MUI theming, spacing, typography, scroll behavior, and responsive presentation. This is primarily a visual/screenshot-driven test.

## Prerequisites
- Backend is running with both `default` (single bot) and `comparison` (two bot RLHF) configs
- Start with: `http://localhost:3000/?config=default`

## Steps

### Step 1: Screenshot -- Empty state
**Do**: Navigate to `http://localhost:3000/?config=default`. Wait for the page to fully load.
**Expect**: Clean layout: header at top (white/paper background, slight elevation shadow), empty content area in the middle (default background color), input bar at bottom (white/paper background, top border line). Full viewport height layout with no scrollbar in the main content area.
**Screenshot**: Capture the full page. Verify: consistent spacing, no layout overflow, header shadow visible, input border visible, MUI typography applied to "GenAI Chat".

### Step 2: Screenshot -- Single-bot conversation with multiple messages
**Do**: Send 3-4 messages back and forth to build up a conversation.
**Expect**: Messages are well-spaced with consistent gap between them. User messages (right-aligned, blue, rounded corners) and assistant messages (left-aligned, grey, rounded corners) create a clear visual rhythm. Max-width on message bubbles (70%) prevents them from spanning the full width. Text is readable (body2 MUI typography).
**Screenshot**: Capture the full conversation. Verify: consistent spacing between messages, proper alignment, readable text, rounded bubble corners (borderRadius: 3), no visual glitches.

### Step 3: Screenshot -- RLHF comparison state
**Do**: Navigate to `http://localhost:3000/?config=comparison`. Send a message and wait for the comparison to appear.
**Expect**: The comparison cards sit naturally in the message flow. Cards are evenly sized with proper gap between them. Bot name labels are visible in caption typography. Card elevation (shadows) give a subtle 3D effect. The overall composition is balanced.
**Screenshot**: Capture the comparison layout. Verify: equal card sizes, readable text, bot names visible, consistent elevation/shadow, proper spacing from user message above.

### Step 4: Screenshot -- RLHF with selection and feedback
**Do**: Select one of the comparison responses. Look at the full state with selected card and feedback panel.
**Expect**: Selected card has a clear blue border. Dimmed card is noticeably but not extremely faded (55% opacity). Feedback panel below is well-spaced with centered content. Chips are evenly spaced in a flex-wrap row. "Confirm selection" button is properly sized.
**Screenshot**: Capture the comparison with selection and feedback panel. Verify: clear visual hierarchy (selected vs unselected), feedback panel centered and well-composed, chip layout clean.

### Step 5: Verify scroll behavior with many messages
**Do**: In single-bot mode (`/?config=default`), send enough messages to overflow the visible area (5-8 exchanges).
**Expect**: The message area scrolls vertically. New messages cause auto-scroll to the bottom (via `scrollIntoView({ behavior: 'smooth' })`). The header stays fixed at the top. The input bar stays fixed at the bottom. Only the message area between them scrolls.
**Screenshot**: Capture the page with many messages, scrolled to the bottom. Verify: header still visible at top, input still visible at bottom, scroll position at newest messages.

### Step 6: Verify loading spinner presentation
**Do**: Navigate to the app fresh and observe the brief loading state while config is fetching.
**Expect**: A centered CircularProgress spinner on a blank page. Vertically and horizontally centered (flex center, 100vh height).
**Screenshot**: If capturable (may be very brief), capture the loading spinner state. Verify: centered placement, standard MUI spinner appearance.

### Step 7: Verify error state presentation
**Do**: Navigate to `http://localhost:3000/?config=nonexistent`.
**Expect**: The error Alert is centered on the page with clean presentation. Red/error color scheme from MUI. Typography is consistent (subtitle2 for heading, body2 for message). Max-width 480px keeps it readable.
**Screenshot**: Capture the error state. Verify: centered alert, proper MUI error styling, readable text, contained width.

## Pass Criteria
- [ ] Layout is full viewport height (100vh) with fixed header and input, scrollable message area
- [ ] MUI theme is consistently applied (typography, colors, shadows, spacing)
- [ ] User message bubbles: right-aligned, primary color background, white text, rounded corners
- [ ] Assistant message bubbles: left-aligned, grey background, rounded corners
- [ ] Message bubbles respect max-width (70%) -- text does not span full width
- [ ] RLHF comparison cards are evenly sized with proper spacing
- [ ] Selection highlight (blue border) and dim (55% opacity) are clearly distinguishable
- [ ] Feedback panel is centered and well-composed
- [ ] Auto-scroll works to keep newest messages in view
- [ ] Header and input bar remain fixed during scroll
- [ ] Loading spinner is centered on the page
- [ ] Error alert is centered with proper MUI styling
- [ ] No layout jumps, overflow issues, or visual glitches across states
