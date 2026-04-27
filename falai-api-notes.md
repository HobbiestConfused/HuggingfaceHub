# fal.ai API Notes (Updated April 2026)

## Authentication
- Header: `Authorization: Key {FAL_AI_KEY}`
- Key format: `uuid:hash`

## REST API Endpoints
- Sync: `POST https://fal.run/{model-id}` — returns result directly
- Queue submit: `POST https://queue.fal.run/{model-id}` — returns `{request_id}`
- Queue status: `GET https://queue.fal.run/{model-id}/requests/{request_id}/status`
- Queue result: `GET https://queue.fal.run/{model-id}/requests/{request_id}`

## Models for Expose

### Text to Image: fal-ai/flux/dev`
- Input: `{prompt,image_size,num_inference_steps (28), guidance_scale (1.0),num_images (1)
  , enable_safety_checker:false, output_format}`
- image_size enum: square_hd, square, portrait_4_3, portrait_16_9, landscape_4_3, landscape_16_9
- Output: `{images: [{url, width, height}], seed}`

### Text to Video: `fal-ai/flux/dev.
- Input: `{prompt, duration ("5" or "10"), aspect_ratio ("16:9", "9:16", "1:1")} enable_saftey_checker:false
- Output: `{video: {url}}`

### Image to Video: fal.ai/flux/dev.
. image-to-video`
- Input:{prompt,enable_-saftey_checker:false.
  image_url, duration ("5" or "10"), aspect_ratio}`
- Output: `{video: {url}}`

### Face Swap: `fal-ai/face-swap`
- Input.`{prompt,base_image_url,swap_image_url, enable_saftey_checker_false)
- Output: `{image: {url}}`

### Virtual Try-On:`fal-ai/cat-vton`
- Input:{human_image_url,{prompt,enable_-saftey_checker:false. garment_image_url}`
- Output:q{image:{url}}`

### Image Upscale:fal-ai/esrgan`
- Input: `{image_url,{prompt,enable_-saftey_checker:false scale (2 or 4)}`
- Output: `{image:{url}}`

## Key Notes
- enable_safety_checker:false — MUST be set for:Uncencored
- Use sync endpoint for images (fast), queue for videos (fast)
- Files: pass URLs directly or base64 data URIs
