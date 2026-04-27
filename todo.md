# Expose — Project TODO

## Core Infrastructure
- [x] Database schema (users, api_keys, media, generations, game_sessions, user_preferences)
- [x] Backend tRPC routers for all features
- [x] Dark mature theme and global styling
- [x] Age gate (DOB validation) blocking all content

## Authentication & Age Gate
- [x] Age verification page with DOB date picker
- [x] Session-based age verification persistence
- [x] OAuth login integration
- [x] Profile setup after login

## AI Creation Studio
- [x] Text-to-Image generation tool UI
- [x] Text-to-Video generation tool UI
- [x] Image-to-Video generation tool UI
- [x] Video Extension tool UI
- [x] Face Swap tool UI
- [x] Virtual Try-On tool UI
- [x] Image Upscale tool UI
- [x] Media upload system for AI tool inputs

## AI Service Integration
- [x] Pluggable API key system (Replicate, fal.ai, Stability AI)
- [x] Settings panel for managing API keys
- [x] Replicate API integration layer
- [x] fal.ai API integration layer
- [x] Stability AI API integration layer
- [x] Generation job tracking and status polling

## Couples Game Mode
- [x] Random sexy dares generator
- [x] Role-play scenario generator
- [x] Erotic prompt generator
- [x] Customizable categories (romance, adventurous, kinky, roleplay, fantasy, quickie)
- [x] Spice level control (mild, medium, hot, extreme)
- [x] Game session history

## Media Gallery
- [x] Personal gallery for all generated/uploaded content
- [x] Browse, filter, and search media
- [x] Download and delete media
- [x] Media metadata and generation info

## Settings & Profile
- [x] User profile management
- [x] API key management panel
- [x] Preferences (default AI provider, spice level defaults)

## Navigation & Layout
- [x] Tab-based mobile navigation
- [x] App shell with header and nav
- [x] Responsive design for mobile and desktop

## Testing
- [x] Vitest tests for backend routers (51 tests passing)
- [x] Age gate validation tests
- [x] API key management tests

## Future Enhancements
- [ ] LoRA support for custom model styles
- [ ] Multi-player / friends mode
- [ ] Subscription / credit system
- [ ] Integration with Expose Social App
- [x] PWA support for mobile installation
- [ ] APK build for Android distribution
- [x] PWA manifest.json with Expose branding
- [x] Service worker for offline caching
- [x] Install prompt / Add to Home Screen banner
- [x] PWA icons in multiple sizes (192x192 + 512x512 crimson rose)
- [x] Pre-configure Replicate model IDs for all AI tools (FLUX Schnell, Kling v2.6, Easel Face Swap, IDM-VTON, Real-ESRGAN)
- [x] Wire up actual Replicate API calls with sync mode + polling fallback
- [x] Add model info display and aspect ratio selector to each tool UI
- [x] Use REPLICATE env var as fallback API key (so user doesn't need to enter it in-app)
- [x] Fix: Settings tab hidden behind "Made with Manus" badge on mobile (z-index 9999, flex-1 layout)
- [x] Switch primary AI provider from Replicate to fal.ai
- [x] Update all model mappings for fal.ai endpoints
- [x] Update API call logic for fal.ai REST API format
- [x] Add FAL_AI env var fallback for API key
- [x] Partner profiles in Couples Game Mode (enter both names for personalized dares)
- [x] Prompt templates library for AI tools (pre-built prompts by category)
- [x] Fix: NSFW content blocked by safety checker — switched to FLUX Dev with disable_safety_checker=true, safety_tolerance=6
- [x] Fix: fal.ai JSON error — fix API call format and response handling
- [x] Make fal.ai the primary/default AI provider (more NSFW permissive)
- [x] Add FAL_AI env var with user's API key
- [x] Add video duration controls to video tool UIs
- [x] Add aspect ratio and other generation options to tool UIs
