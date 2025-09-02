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

## Quick Start

### 1. Clone or Download

```bash
git clone <repository-url>
cd openRouter_UI
```

### 2. Install and Run

The easiest way to run this project is using `npx serve`:

```bash
npx serve .
```

This will start a local server (typically on `http://localhost:3000` or `http://localhost:5000`).

### 3. Access the Application

Open your browser and navigate to the URL shown in the terminal output (usually `http://localhost:3000`).

### 4. Get Started

1. **Enter your API Key**: Paste your OpenRouter API key in the "OpenRouter API Key" field
2. **Choose Mode**: Select either "Text (Chat Completions)" or "Image Generation"
3. **Select a Model**: Choose from the available free models (the interface will load them automatically)
4. **Write a Prompt**: Enter your prompt in the text area
5. **Run**: Click the "Run" button to generate your content

## Alternative Running Methods

### Using Python (if you have Python installed)

```bash
# Python 3
python -m http.server 8000

# Python 2
python -m SimpleHTTPServer 8000
```

Then visit `http://localhost:8000`

### Using PHP (if you have PHP installed)

```bash
php -S localhost:8000
```

Then visit `http://localhost:8000`

## Important Notes

- **Must run over HTTP**: This application must be served over HTTP (not opened as a file://) because it needs to make cross-origin requests to OpenRouter's API
- **Free Models**: The interface automatically filters and displays only free models (where both prompt and completion pricing are "0")
- **Image Generation**: Some models may not support multiple image generation (n>1). Google Gemini typically generates 1 image per request
- **Streaming**: Enable streaming for real-time responses, or disable it for complete responses at once

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