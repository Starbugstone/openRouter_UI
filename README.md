# OpenRouter UI Playground

A simple, user-friendly web interface for interacting with OpenRouter's API. This playground provides an intuitive way to test both text chat completions and image generation using various AI models available through OpenRouter.

## Features

- **Text Chat Completions**: Generate text responses using various AI models
- **Image Generation**: Create images using multimodal models like Google Gemini
- **Model Selection**: Browse and search through available free models
- **Streaming Support**: Real-time streaming responses with the ability to stop mid-generation
- **API Key Management**: Secure storage of your OpenRouter API key in localStorage
- **Responsive Design**: Clean, dark-themed interface that works on desktop and mobile
- **Image Modal**: Full-screen image viewing with click-to-expand functionality

## Prerequisites

- Node.js (for running the local server)
- An OpenRouter API key ([Get one here](https://openrouter.ai/))

## Quick Start (Vue + Vite)

### 1. Clone or Download
```bash
git clone <repository-url>
cd openRouter_UI
```

### 2. Install and Run (recommended)
```bash
npm install
npm run dev
```
Then open http://localhost:5173 (or the URL shown in the console).

### 3. Alternative start scripts (port 3000)
- Windows: `start.cmd`
- macOS/Linux: `./start.sh`

### 4. Get Started
1. Enter your API key.
2. Choose mode (text or image).
3. Select a model.
4. Write a prompt and send.

## Important Notes

- Serve via `npm run dev`/`npm run preview` (do not open via file://).
- Chats and regeneration branches persist in IndexedDB (Dexie).
- API key “remember” uses localStorage.

## Configuration Options

- **Timeout**: Adjust the timeout duration (5-120 seconds) for requests
- **Streaming**: Toggle real-time streaming on/off
- **Remember Key**: Optionally save your API key in browser localStorage
- **Image Count**: For image generation, specify how many images to generate (1-4)

## Troubleshooting

### Common Issues

1. **"Please paste your OpenRouter API key"**: Make sure you've entered a valid OpenRouter API key
2. **CORS errors**: Ensure you're running the application over HTTP, not opening the HTML file directly
3. **Model loading issues**: Check your internet connection and try clicking the "Refresh" button
4. **Image generation not working**: Verify you've selected an image-capable model and entered an appropriate prompt

### Getting Help

- [OpenRouter Documentation](https://openrouter.ai/docs/quickstart)
- [OpenRouter Models](https://openrouter.ai/models)
- [Image Generation Guide](https://openrouter.ai/docs/features/multimodal/image-generation)

## File Structure

```
openRouter_UI/
├── openrouter.html          # Main application file
├── README.md               # This file
├── site.webmanifest        # Web app manifest
├── favicon.ico             # Favicon
├── favicon-16x16.png       # 16x16 favicon
├── favicon-32x32.png       # 32x32 favicon
├── apple-touch-icon.png    # Apple touch icon
├── android-chrome-192x192.png  # Android Chrome icon
└── android-chrome-512x512.png  # Android Chrome icon
```

## License

This project is open source and available under the MIT License.