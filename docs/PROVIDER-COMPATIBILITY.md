# Provider Compatibility

## Supported providers

### `zai`

- default endpoint: `https://api.z.ai/api/paas/v4/chat/completions`
- text model support: yes
- vision model support: yes when the configured model supports vision
- reasoning toggle: yes through `thinking`
- numeric reasoning budget: not claimed as enforced

### `openrouter`

- default endpoint: `https://openrouter.ai/api/v1/chat/completions`
- text model support: yes
- vision model support: depends on selected OpenRouter model
- reasoning toggle: yes through the request body used by the client
- numeric reasoning budget: yes where the provider honors it
- attribution headers: `OPENROUTER_APP_NAME`, `OPENROUTER_APP_URL`

## What the server assumes

The server assumes providers may differ. It does not treat all OpenAI-compatible providers as having identical feature sets. The `capabilitiesFor` mapping is the current source of truth for what the bridge advertises.
