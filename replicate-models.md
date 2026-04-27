# Replicate Model Configuration

## Text-to-Image
- black-forest-labs/flux-schnell (fast, $0.003/image)
- black-forest-labs/flux-1.1-pro (higher quality, $0.04/image)
- black-forest-labs/flux-1.1-pro-ultra (highest quality, $0.06/image)
- black-forest-labs/flux-dev (dev/learning, $0.025/image)

## Text-to-Video / Image-to-Video
- kwaivgi/kling-v2.6 (cinematic video with audio)
- kwaivgi/kling-v3-video (latest, up to 15s)
- minimax/video-01-live ($0.50)

## Face Swap
- easel/face-swap (official, production-ready)
- pikachupichu25/image-faceswap
- mertguvencli/face-swap-with-indexes (group photo support)

## Virtual Try-On
- cuuupid/idm-vton (best-in-class, KAIST)

## Image Upscale
- nightmareai/real-esrgan (classic, fast, cheap)

## Image-to-Video
- kwaivgi/kling-v3-video (supports image input)
- aicapcut/stable-video-diffusion-img2vid-xt-optimized

## API Pattern (HTTP)
POST https://api.replicate.com/v1/predictions
Authorization: Bearer r8_xxxxx
Content-Type: application/json

{
  "version": "model_version_hash",  // OR use model identifier
  "input": { "prompt": "..." }
}

// For official models, use: replicate.run("owner/model", { input })
// HTTP: POST https://api.replicate.com/v1/models/{owner}/{model}/predictions
