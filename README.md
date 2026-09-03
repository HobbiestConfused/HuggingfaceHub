 
## Provider API key mapping

| Provider | Modality | Required env var |
| --- | --- | --- |
| openrouter | chat | `OPENROUTER_API_KEY` |
| venice | chat, image, video | `VENICE_API_KEY` |
| atlas | video | `ATLASCLOUD_API_KEY` |

If a provider/modality key is missing, the API now fails early with an error that names the exact env var to set.

## `.env` setup

```env
OPENROUTER_API_KEY="your-openrouter-api-key"
VENICE_API_KEY="your-venice-api-key"
ATLASCLOUD_API_KEY="your-atlascloud-api-key"
```

## Sample curl - chat (OpenRouter-style key routing)

```bash
curl -X POST https://your-host/trpc/game.generatePrompt \
  -H "content-type: application/json" \
  -d '{"json":{"category":"romance","spiceLevel":"mild"}}'
```

## Sample curl - Atlas video generation (`alibaba/happyhorse-1.1/reference-to-video`)

```bash
curl -X POST https://your-host/trpc/generation.create \
  -H "content-type: application/json" \
  -d '{
    "json": {
      "tool": "image_to_video",
      "provider": "atlas",
      "prompt": "A cinematic slow camera move around this character",
      "inputParams": {
        "images": ["https://static.atlascloud.ai/media/images/example.jpg"],
        "resolution": "1080p",
        "ratio": "16:9",
        "duration": 5,
        "seed": -1
      }
    }
  }'
```

> Security note: rotate compromised keys immediately and never commit secrets to this repository.