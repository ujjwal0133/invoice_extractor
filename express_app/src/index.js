const express = require('express');
const path = require('path');

const app = express();
const PORT = 8000;
const OCR_SERVICE_URL = 'http://localhost:5000/ocr/image';
const OLLAMA_SERVICE_URL = 'http://localhost:11434/api/generate';

app.use(express.json());

// FIXED: Define path safely using double backslashes for Windows
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// Serves the public directory assets (CSS, JS, assets) correctly
app.use(express.static(PUBLIC_DIR));

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/ocr/image', async (req, res) => {
  const headers = { ...req.headers };
  delete headers.host;

  try {
    const ocrResponse = await fetch(OCR_SERVICE_URL, {
      method: 'POST',
      headers,
      body: req,
      duplex: 'half',
    });

    const contentType = ocrResponse.headers.get('content-type') || '';

    if (!contentType.includes('application/json')) {
      const text = await ocrResponse.text();
      return res.status(ocrResponse.status).send(text);
    }

    const responseBody = await ocrResponse.json();
    const processedData = responseBody.ppstruct ?? responseBody;

    console.log(JSON.stringify(processedData, null, 2));

    const ollamaResponse = await fetch(OLLAMA_SERVICE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'ocrllm',
        prompt: JSON.stringify(processedData),
        stream: false
      })
    });

    if (!ollamaResponse.ok) {
      const errText = await ollamaResponse.text();
      return res.status(502).json({ error: `Ollama service error: ${errText}` });
    }

    const ollamaJson = await ollamaResponse.json();
    let modelRawText = ollamaJson.response.trim();

    if (modelRawText.startsWith('```')) {
      modelRawText = modelRawText.replace(/^```json|```$/gi, '').trim();
    }

    let finalMappedSchema;
    try {
      finalMappedSchema = JSON.parse(modelRawText);
    } catch {
      finalMappedSchema = modelRawText;
    }

    console.log(JSON.stringify(finalMappedSchema, null, 2));
    res.status(200).json(finalMappedSchema);

  } catch (error) {
    console.error('Core routing error:', error);
    if (!res.headersSent) {
      res.status(502).json({ error: 'Failed to process pipeline dataset downstream' });
    }
  }
});

// FIXED: Explicit catch-all route handler for client-side routing fallback (SPA support)
app.get('/*splat', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
