# fal.ai Model Research

## API Pattern
- Base URL: https://fal.ai/api/v1 or queue endpoint
- Auth: Key-based via `Authorization: Key {FAL_KEY}`
- Queue-based: POST to https://queue.fal.ai/fal-ai/{model-id}
- Direct: POST to https://fal.run/fal-ai/{model-id}

## Models for Expose

### Text to Image
- `fal-ai/flux/schnell` - FLUX.1 Schnell (fast, cheap)
- `fal-ai/flux/dev` - FLUX.1 Dev (higher quality)
- `fal-ai/flux-lora` - FLUX with LoRA support

### Text to Video
- `fal-ai/bytedance/seedance-2.0/text-to-video` - Seedance 2.0 (newest, best)
- `fal-ai/bytedance/seedance-2.0/fast/text-to-video` - Seedance 2.0 Fast

### Image to Video
- `fal-ai/bytedance/seedance-2.0/image-to-video` - Seedance 2.0 Image to Video
- `fal-ai/kling-video/v3/pro/image-to-video` - Kling 3.0 Pro
- `fal-ai/kling-video/v2.6/pro/image-to-video` - Kling 2.6 Pro

### Face Swap
- Need to find specific model

### Virtual Try-On
- Listed as "Try on clothing" category

### Image Upscale
- Listed under "Best Utility Models"

## API Call Pattern (queue-based)
```
POST https://queue.fal.ai/fal-ai/{model}
Headers:
  Authorization: Key {FAL_KEY}
  Content-Type: application/json
Body: { input params }

Response: { request_id, status }

GET https://queue.fal.ai/fal-ai/{model}/requests/{request_id}/status
GET https://queue.fal.ai/fal-ai/{model}/requests/{request_id}  (for result)
```

## Direct (sync) API Call
```
POST https://fal.run/fal-ai/{model}
Headers:
  Authorization: Key {FAL_KEY}
  Content-Type: application/json
Body: { input params }

Response: direct result
```
