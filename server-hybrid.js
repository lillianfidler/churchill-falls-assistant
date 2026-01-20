//new
require('dotenv').config();

const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const cors = require('cors');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Increased for audio data
app.use(express.static(__dirname));

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// ElevenLabs Configuration
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID;

// Voice usage tracking
let monthlyVoiceUsage = 0;
const MONTHLY_VOICE_LIMIT = 100000; // Creator tier: 100,000 credits/month ($22/month)

// MCP Client
let mcpClient = null;

// ============ HYBRID SYSTEM: CORE DOCUMENTS ============

// Core documents storage (loaded into context for fast access)
let coreDocumentsText = '';

const CORE_DOCUMENTS = [
  'MOU_Churchill_Falls_Dec_12_2024_clean_text.txt',
  'LOCKE analysis of MOU CF.txt',
  'Reassessing-the-Churchill-Falls-MOU.txt',
  'Doug-video-series-video1.txt',
  'Doug-video-series-video2A.txt',
  'Doug-video-series-video2B.txt',
  'Doug-video-series-video3A.txt',
  'Doug-video-series-video3B.txt',
  'Doug-video-series-video4.txt',
  'Churchill-falls-consolidated-financial-statements-2024.txt',
  'Churchill-Falls-2023-financial-statement.txt',
  'Lower-Churchill-Project-Combined-Financial-Statements-2024.txt',
  'HYDRO-QUEBECS-EXPORTS.txt'
];

/**
 * Load core documents into memory for context window
 */
function loadCoreDocuments() {
  console.log('\n============================================');
  console.log('Loading core documents into context...');
  console.log('============================================\n');

  const contentDir = path.join(__dirname, 'content');
  let documentsLoaded = 0;
  let totalSize = 0;

  for (const filename of CORE_DOCUMENTS) {
    const filepath = path.join(contentDir, filename);

    try {
      if (fs.existsSync(filepath)) {
        const content = fs.readFileSync(filepath, 'utf-8');
        const sizeKB = (Buffer.byteLength(content, 'utf-8') / 1024).toFixed(2);

        // Add document with clear headers for Claude to reference
        coreDocumentsText += `\n\n========================================\n`;
        coreDocumentsText += `DOCUMENT: ${filename}\n`;
        coreDocumentsText += `========================================\n\n`;
        coreDocumentsText += content;
        coreDocumentsText += `\n\n========================================\n`;
        coreDocumentsText += `END OF DOCUMENT: ${filename}\n`;
        coreDocumentsText += `========================================\n\n`;

        documentsLoaded++;
        totalSize += Buffer.byteLength(content, 'utf-8');

        console.log(`✓ Loaded: ${filename} (${sizeKB} KB)`);
      } else {
        console.warn(`⚠ File not found: ${filename}`);
      }
    } catch (error) {
      console.error(`✗ Error loading ${filename}:`, error.message);
    }
  }

  const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(2);
  const estimatedTokens = Math.round(totalSize / 4);

  console.log(`\n✓ Core documents loaded successfully`);
  console.log(` - Documents: ${documentsLoaded}/${CORE_DOCUMENTS.length}`);
  console.log(` - Total size: ${totalSizeMB} MB`);
  console.log(` - Estimated tokens: ~${estimatedTokens.toLocaleString()}`);
  console.log('============================================\n');

  return documentsLoaded > 0;
}
// ============ END CORE DOCUMENTS ============

/**
 * Initialize MCP client connection
 */
async function initializeMCP() {
  console.log('Initializing MCP client connection...');

  try {
    const transport = new StdioClientTransport({
      command: 'node',
      args: ['mcp-server.js']
    });

    mcpClient = new Client(
      {
        name: 'churchill-falls-express',
        version: '1.0.0'
      },
      {
        capabilities: {}
      }
    );

    await mcpClient.connect(transport);

    console.log('✓ MCP client connected successfully');

    const tools = await mcpClient.listTools();
    console.log(`✓ Available MCP tools: ${tools.tools.map(t => t.name).join(', ')}`);

    return true;
  } catch (error) {
    console.error('✗ Failed to initialize MCP client:', error);
    return false;
  }
}

/**
 * Prepare text for natural speech (expand acronyms, remove markdown, etc.)
 */
function prepareTextForSpeech(text) {
  let processedText = text;

  // FIRST: Remove all markdown formatting
  processedText = processedText
    // Remove bold/italic markers
    .replace(/\*\*\*(.+?)\*\*\*/g, '$1') // Bold + italic
    .replace(/\*\*(.+?)\*\*/g, '$1') // Bold
    .replace(/\*(.+?)\*/g, '$1') // Italic
    .replace(/__(.+?)__/g, '$1') // Alternative bold
    .replace(/_(.+?)_/g, '$1') // Alternative italic)
    // Remove headers
    .replace(/^#{1,6}\s+/gm, '')
    // Remove bullet points and list markers
    .replace(/^[\s]*[-*+]\s+/gm, '')
    .replace(/^[\s]*\d+\.\s+/gm, '')
    // Remove links but keep text
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
    // Remove blockquotes
    .replace(/^>\s*/gm, '')
    // Remove code blocks
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    // Remove horizontal rules
    .replace(/^[\s]*[-*_]{3,}[\s]*$/gm, '')
    // Clean up extra whitespace
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // SECOND: Fix specific pronunciation issues BEFORE acronym replacement

  // Fix cents/kWh notation (e.g., "1.63¢/kWh" → "1.63 cents per kilowatt hour")
  processedText = processedText
    .replace(/(\d+\.?\d*)\s*¢\s*\/\s*kWh/gi, '$1 cents per kilowatt hour')
    .replace(/(\d+\.?\d*)\s*¢\s*\/\s*kwh/gi, '$1 cents per kilowatt hour');
processedText = processedText
  .replace(/(\d+\.?\d*)\s*c\s*\/\s*kWh/gi, '$1 cents per kilowatt hour')
  .replace(/(\d+\.?\d*)\s*c\s*\/\s*kwh/gi, '$1 cents per kilowatt hour');
processedText = processedText
  .replace(/(\d+\.?\d*)\s*MW\b/gi, '$1 megawatts')
  .replace(/\bMW\b/gi, 'megawatts')
  .replace(/(\d+\.?\d*)\s*MWh\b/gi, '$1 megawatt hours')
  .replace(/\bMWh\b/gi, 'megawatt hours');

  // Fix "30x" style multipliers (e.g., "30x" → "30 times")
  processedText = processedText.replace(/(\d+)\s*x\b/gi, '$1 times');

  // Fix tilde symbol (~ → "approximately" or "to")
  processedText = processedText
    .replace(/~(\d)/g, 'approximately $1')
    .replace(/(\d)~(\d)/g, '$1 to $2')
    .replace(/~/g, 'to');

  // Add pauses between sections and numbered items
  processedText = processedText
    .replace(/\n\n+/g, '. ... ') // Pause between paragraphs
    .replace(/(\d+)\.\s+/g, '. ... $1. '); // Numbered items

  // THIRD: Replace acronyms with speakable versions
  const replacements = {
    // Organizations
    MOU: 'M-O-U',
    NL: 'Newfoundland and Labrador',
    HQ: 'Hydro-Quebec',
    'Hydro-Québec': 'Hydro-Quebec',
    CF: 'Churchill Falls',

    // Energy units
    TWh: 'terawatt hours',
    GWh: 'gigawatt hours',
    kWh: 'kilowatt hours',
    MW: 'megawatts',
    MWh: 'megawatt hours',


    // Financial
    NPV: 'net present value',

    // Common abbreviations
    vs: 'versus',
    'vs.': 'versus',
    'e.g.': 'for example',
    'i.e.': 'that is',
    'etc.': 'et cetera'
  };

  for (const [acronym, spoken] of Object.entries(replacements)) {
    const regex = new RegExp(`\\b${acronym}\\b`, 'gi');
    processedText = processedText.replace(regex, spoken);
  }

  return processedText;
}

/**
 * Convert text to speech using ElevenLabs
 */
async function convertToSpeech(text) {
  if (!ELEVENLABS_API_KEY || !ELEVENLABS_VOICE_ID) {
    throw new Error('ElevenLabs credentials not configured');
  }

  // Check quota
  if (monthlyVoiceUsage >= MONTHLY_VOICE_LIMIT) {
    throw new Error('Monthly voice quota exceeded');
  }

  // Prepare text for speech
  let speechText = prepareTextForSpeech(text);

  // ElevenLabs has a 10,000 character limit per request
  const ELEVENLABS_CHAR_LIMIT = 10000;
  if (speechText.length > ELEVENLABS_CHAR_LIMIT) {
    console.log(
      `Response too long for voice (${speechText.length} chars). Creating summary...`
    );

    // Take first ~8000 chars and finish the sentence
    const summaryLength = 8000;
    const truncated = speechText.substring(0, summaryLength);
    const lastPeriod = truncated.lastIndexOf('.');
    const lastQuestion = truncated.lastIndexOf('?');
    const lastExclamation = truncated.lastIndexOf('!');
    const lastSentenceEnd = Math.max(lastPeriod, lastQuestion, lastExclamation);

    if (lastSentenceEnd > 0) {
      speechText =
        truncated.substring(0, lastSentenceEnd + 1) +
        ' ... This is a summary of the key points. For complete details, please read the full text response.';
    } else {
      const lastSpace = truncated.lastIndexOf(' ');
      speechText =
        truncated.substring(0, lastSpace) +
        ' ... This response has been summarized for voice. Please read the full text for complete details.';
    }

    console.log(`Voice summary created: ${speechText.length} chars`);
  }

  // Track usage
  monthlyVoiceUsage += speechText.length;
  console.log(
    `Voice usage: ${monthlyVoiceUsage}/${MONTHLY_VOICE_LIMIT} chars (${(
      (monthlyVoiceUsage / MONTHLY_VOICE_LIMIT) *
      100
    ).toFixed(1)}%)`
  );

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
    {
      method: 'POST',
      headers: {
        Accept: 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': ELEVENLABS_API_KEY
      },
      body: JSON.stringify({
        text: speechText,
        model_id: 'eleven_monolingual_v1',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true
        }
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
  }

  const audioBuffer = await response.arrayBuffer();
  return Buffer.from(audioBuffer).toString('base64');
}

const systemPrompt = `You are the Churchill Falls Information Assistant, an expert resource on the Churchill Falls hydroelectric project, agreements, and related economic analyses.

# CRITICAL: RESPONSE EFFICIENCY

Respond within 60 seconds by:
- Answering IMMEDIATELY from core documents already in your context (no searching needed)
- Only using MCP search_documents for historical/supplementary content (2021-2022 financials, academic papers, pre-2020 history)
- Writing concisely: aim for 3000-5000 words maximum

# DOCUMENT ACCESS STRATEGY

**CORE DOCUMENTS IN YOUR CONTEXT (Answer Immediately - No Searching):**

You already have immediate access to these complete documents below. Answer questions about these topics DIRECTLY from the text below without using any MCP tools:

1. December 2024 MOU (complete text)
2. Wade Locke's MOU analysis (complete)
3. "Reassessing the Churchill Falls MOU" analysis (complete)
4. Dr. Doug May's complete 6-part video series (all transcripts)
5. Churchill Falls 2023 financial statements (complete)
6. Churchill Falls 2024 financial statements (complete)
7. Lower Churchill Project 2024 financial statements (complete)
8. Hydro-Québec Exports analysis (complete)

**SUPPLEMENTARY DOCUMENTS IN MCP (Use search_documents Only When Needed):**

Only use MCP search_documents tool for:
- 2021-2022 Churchill Falls financial statements
- Historical documents (pre-2020)
- Academic papers (Feehan's research)
- Technical specifications from old contracts
- Older Hydro-Québec reports
- Historical context from 1949-2007

# MCP Tools Available

You have three MCP tools available for supplementary content:
- search_documents: Search historical/supplementary documents
- get_document: Retrieve full supplementary document
- list_documents: List supplementary documents

Use these ONLY when the answer requires historical or supplementary content not in your core documents below.

# ============================================
# CORE DOCUMENTS (ALREADY IN YOUR CONTEXT)
# ============================================

${coreDocumentsText}

# ============================================
# END OF CORE DOCUMENTS
# ============================================

# CRITICAL: MOU Status Language

The December 12, 2024 MOU is a PROPOSED agreement, NOT finalized.

✓ CORRECT: "proposed MOU," "if implemented," "if approved," "would provide"
✗ INCORRECT: "the deal," "was finalized," "will provide"

# Document Citation Requirements

When citing core documents above:
1. Reference the document name
2. Include specific details/quotes
3. For Dr. Doug May videos: use markdown links

# Dr. Doug May's Video Links

When referencing Doug May's videos, always include these links:
- [Video 1: Quebec's Emerging Electricity Shortage](https://youtu.be/QJWWpT7Ip_Q)
- [Video 2A: Assessment of Proposed Prices](https://youtu.be/j2GWirWVg48)
- [Video 2B: Assessment of Proposed Prices (continued)](https://youtu.be/MJ91O1W358E)
- [Video 3A: Hydro-Québec's Electricity Imports](https://youtu.be/ToKebHmN16s)
- [Video 3B: Hydro-Québec's Electricity Imports (continued)](https://youtu.be/ToKebHmN16s)
- [Video 4: Assessment of Proposed Projects](https://youtu.be/OFcA4-SlWTE)

# Communication Style

Adapt to user expertise:
- **Technical users:** Precise terminology, detailed calculations
- **General users:** Plain language, examples, clear definitions

# Formatting Rules

1. **Section headers:** Use **bold** on own line (NOT ##)
2. **Inline emphasis:** Use **bold** within sentences
3. **Lists:** Use hyphens (- Item)
4. **No blockquotes:** NEVER use > symbol
5. **Complete responses:** NEVER leave incomplete

# Response Quality Standards

✓ **FAST** - Answer immediately from core documents in context (10-15 seconds)
✓ **Comprehensive** - Include all relevant details from core documents
✓ **Accurate** - Only cite what's in the documents
✓ **Clear** - Explain complex concepts accessibly
✓ **Cited** - Reference documents, include video links
✓ **Balanced** - Present multiple perspectives when available

# Sources Referenced Section

Include "Sources Referenced" at end when citing documents.

**REMEMBER: The core documents are already in your context above. Answer questions about MOU, Doug May, Wade Locke, 2023-2024 financials, and Hydro-Québec exports IMMEDIATELY without searching. Only use MCP search for historical/supplementary content.**`;

// ============ TEXT CHAT ENDPOINT WITH FAST / DEEP MODES ============

app.post('/api/chat', async (req, res) => {
  try {
    const {
      message,
      conversationHistory = [],
      isVoiceMode = false,
      textMode = 'deep' // 'fast' or 'deep' from front-end
    } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Valid message is required' });
    }

    if (!mcpClient) {
      return res.status(503).json({
        error: 'MCP server not available. Please try again shortly.'
      });
    }

    // Map to internal mode
    let mode = textMode; // 'fast' or 'deep'
    if (isVoiceMode && textMode === 'fast') {
      mode = 'fast-fast'; // optional ultra-short text if needed for voice+fast
    }

    const isFast = mode === 'fast';
    const isFastFast = mode === 'fast-fast';
    const isDeep = mode === 'deep';

    let modeLabel = '📝 TEXT';
    if (isVoiceMode) {
      modeLabel = '🎤 VOICE (Doug)';
    } else if (isFastFast) {
      modeLabel = '⚡ FAST-FAST TEXT';
    } else {
      modeLabel = isFast ? '⚡ FAST TEXT' : '🔍 DEEP TEXT';
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`${modeLabel}: "${message.substring(0, 50)}..."`);
    console.log(`${'='.repeat(60)}`);

const fastFastInstruction = `
You are in FAST-FAST mode:
- Provide an ultra-concise answer.
- Maximum 3 sentences OR about 120 words, whichever is shorter.
- Focus ONLY on the most critical point(s).
- Do NOT call any tools. Use only the core documents already in your context.
- At the end, add a short "Documents consulted" section listing 3–6 key documents you relied on (by title only, one per line).
`;

const fastInstruction = `
You are in FAST SUMMARY mode:
- Use the core documents already in your context (Doug May, the MOU, main analyses, financials, Hydro-Quebec exports).
- Do NOT call MCP tools unless the user explicitly asks for detailed pre-2020 historical background.
- Answer in 3–6 short paragraphs.
- Keep the answer under about 400 words.
- Be concise but complete, especially for short numbered lists (do not stop halfway through a list).
- Focus on the most important numbers, conclusions, and trade-offs.
- At the end, add a short "Documents consulted" section listing 3–8 key documents you relied on (by title only, one per line).
`;

    const deepInstruction = `
You are in DEEP ANALYSIS mode:
- Use all core documents already in your context (Doug May, the MOU, main economic analyses, financials, Hydro-Quebec exports) and MCP tools for supplementary historical material when genuinely needed.
- Present multiple perspectives clearly (e.g., benefits vs. risks, Newfoundland and Labrador vs. Quebec interests, and differences between Doug May, Wade Locke, and James Feehan where relevant).
- Provide structured, well-organized answers with clear sections, and explain key assumptions and uncertainties.
- Include the most important numbers, timeframes, and trade-offs, and briefly note major pros and cons rather than only one side.
- Do not artificially shorten deep responses; be as detailed as necessary while avoiding repetition.
- At the end, add a short "Documents consulted" section listing 3–8 key documents you relied on (by title only, one per line).
`;

    let modeInstruction = fastInstruction;
    let maxTokens = 1024;

    if (isFastFast) {
      modeInstruction = fastFastInstruction;
      maxTokens = 384;
    } else if (isDeep) {
      modeInstruction = deepInstruction;
      maxTokens = 4096;
    }

    const cleanedHistory = (conversationHistory || []).filter(
      msg =>
        msg &&
        msg.content &&
        typeof msg.content === 'string' &&
        msg.content.trim().length > 0
    );

    const messages = [
      ...cleanedHistory,
      {
        role: 'user',
        content: message
      }
    ];

    const toolsList = await mcpClient.listTools();
    const tools = toolsList.tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema
    }));
    const toolsToSend = isDeep ? tools : [];

    console.log(
      `[TIMING] Starting Claude API call (mode=${mode}) at ${new Date().toISOString()}`
    );
    const startTime = Date.now();

    let response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: maxTokens,
      system: systemPrompt + modeInstruction,
      messages,
      tools: toolsToSend
    });

    console.log(
      `[TIMING] Claude initial response received in ${Date.now() - startTime}ms (mode=${mode})`
    );

    let finalText = '';
    let currentMessages = [...messages];
    let toolCallCount = 0;
    const MAX_TOOL_ROUNDS = 2;

    while (
      isDeep &&
      (response.stop_reason === 'tool_use' ||
        (response.content && response.content.some(block => block.type === 'tool_use'))) &&
      toolCallCount < MAX_TOOL_ROUNDS
    ) {
      toolCallCount++;
      const roundStartTime = Date.now();
      console.log(`[TIMING] Tool use round #${toolCallCount} starting`);

      const assistantMessage = {
        role: 'assistant',
        content: response.content
      };
      currentMessages.push(assistantMessage);

      const toolResults = [];

      for (const block of response.content) {
        if (block.type === 'tool_use') {
          console.log(`Executing MCP tool: ${block.name}`, block.input);
          try {
            const result = await mcpClient.callTool({
              name: block.name,
              arguments: block.input
            });
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: result.content[0].text
            });
          } catch (error) {
            console.error(`Error calling tool ${block.name}:`, error);
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: `Error: ${error.message}`,
              is_error: true
            });
          }
        }
      }

      currentMessages.push({
        role: 'user',
        content: toolResults
      });

      console.log(
        `[TIMING] Tool use round #${toolCallCount} completed in ${Date.now() - roundStartTime}ms`
      );

      response = await anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: maxTokens,
        system: systemPrompt + modeInstruction,
        messages: currentMessages,
        tools: toolsToSend
      });
    }

    for (const block of response.content) {
      if (block.type === 'text') {
        finalText += block.text;
      }
    }

    if (isFastFast) {
      const words = finalText.split(/\s+/);
      if (words.length > 130) {
        finalText = words.slice(0, 130).join(' ') + ' …';
      }
    }

    res.json({ response: finalText, mode });
  } catch (error) {
    console.error('Error in /api/chat:', error);
    res.status(500).json({
      error: 'Failed to get response from AI assistant',
      details: error.message
    });
  }
});

// ============ VOICE CHAT ENDPOINT (FAST / DEEP) ============

app.post('/api/voice-chat', async (req, res) => {
  try {
    const {
      message,
      conversationHistory = [],
      requestVoice = true,
      textMode = 'deep'
    } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Valid message is required' });
    }

    if (!mcpClient) {
      return res.status(503).json({
        error: 'MCP server not available. Please try again shortly.'
      });
    }

    let mode = textMode; // 'fast' or 'deep'
    const isFast = mode === 'fast';
    const isDeep = mode === 'deep';

    console.log('\n' + '='.repeat(60));
    console.log(`📝 User Question: "${message}"`);
    console.log(
      `🎤 Voice Mode: ${requestVoice ? 'ON' : 'OFF'} | Text Mode: ${mode.toUpperCase()}`
    );
    console.log('='.repeat(60));

    let responseStyleInstruction = '';

    if (requestVoice) {
      responseStyleInstruction = `
This response will be converted to audio. Please format appropriately:
- Use clear section breaks with blank lines between sections.
- Put section titles like "Main Objectives:" and "Three Development Projects:" on their own line.
- Use numbered or bulleted lists for project details.
- Use clear, natural language suitable for audio narration.
- Avoid excessive markdown formatting.
- Write as if explaining to someone out loud.
- Generate a complete response. The system may create a shorter version for audio, but the full text will be available for reading.
`;
    } else {
      responseStyleInstruction = `
Provide a written response for on-screen reading.
Use headings and lists when helpful.
`;
    }

    const fastInstruction = `
You are in FAST SUMMARY mode:
- Use the core documents already in your context.
- Do NOT call MCP tools unless the user explicitly asks for detailed pre-2020 historical background.
- Answer in 2–5 short paragraphs.
- Keep the answer under about 400 words.
- When space allows, briefly note at least one major benefit and one major concern rather than only one side.
`;

    const deepInstruction = `
You are in DEEP ANALYSIS mode:
- Use all core documents in context and MCP tools for supplementary documents as needed.
- Provide full background, step-by-step reasoning, and multiple perspectives.
`;

    let modeInstruction = isDeep ? deepInstruction : fastInstruction;
    let maxTokens = isDeep ? 4096 : 1600; // bump Fast from 1024 → 1600

    const modifiedSystemPrompt =
      systemPrompt + modeInstruction + responseStyleInstruction;

    const cleanedHistory = (conversationHistory || []).filter(
      msg =>
        msg &&
        msg.content &&
        typeof msg.content === 'string' &&
        msg.content.trim().length > 0
    );

    const messages = [
      ...cleanedHistory,
      {
        role: 'user',
        content: message
      }
    ];

    const toolsList = await mcpClient.listTools();
    const tools = toolsList.tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema
    }));
    const toolsToSend = isDeep ? tools : [];

    let response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: maxTokens,
      system: modifiedSystemPrompt,
      messages,
      tools: toolsToSend
    });

    let finalText = '';
    let currentMessages = [...messages];
    let toolCallCount = 0;
    const MAX_TOOL_ROUNDS = 2;

    while (
      isDeep &&
      (response.stop_reason === 'tool_use' ||
        (response.content && response.content.some(block => block.type === 'tool_use'))) &&
      toolCallCount < MAX_TOOL_ROUNDS
    ) {
      toolCallCount++;

      const assistantMessage = {
        role: 'assistant',
        content: response.content
      };
      currentMessages.push(assistantMessage);

      const toolResults = [];

      for (const block of response.content) {
        if (block.type === 'tool_use') {
          console.log(`Executing MCP tool: ${block.name}`, block.input);
          try {
            const result = await mcpClient.callTool({
              name: block.name,
              arguments: block.input
            });
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: result.content[0].text
            });
          } catch (error) {
            console.error(`Error calling tool ${block.name}:`, error);
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: `Error: ${error.message}`,
              is_error: true
            });
          }
        }
      }

      currentMessages.push({
        role: 'user',
        content: toolResults
      });

      response = await anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: maxTokens,
        system: modifiedSystemPrompt,
        messages: currentMessages,
        tools: toolsToSend
      });
    }

    for (const block of response.content) {
      if (block.type === 'text') {
        finalText += block.text;
      }
    }

    const fullText = finalText;

    if (requestVoice) {
      const sentences = finalText.match(/[^.!?]+[.!?]+/g) || [];
      if (sentences.length > 5) {
        finalText = sentences.slice(0, Math.min(5, sentences.length)).join(' ');
        console.log(
          `🔪 TRUNCATED: Reduced from ${sentences.length} sentences to 5 for voice mode`
        );
      }
    }

    // Voice generation and response
    let audioData = null;
    let voiceAvailable = true;
    let quotaExceeded = false;

    if (requestVoice && monthlyVoiceUsage < MONTHLY_VOICE_LIMIT) {
      try {
        audioData = await convertToSpeech(finalText);
        console.log('✓ Voice generated successfully');
      } catch (error) {
        console.error('✗ Voice generation failed:', error.message);
        voiceAvailable = false;
        if (error.message.includes('quota exceeded')) {
          quotaExceeded = true;
        }
      }
    } else if (requestVoice) {
      voiceAvailable = false;
      quotaExceeded = true;
    }

    res.json({
      text: finalText,
      fullText: requestVoice ? fullText : null,
      audio: audioData,
      voiceAvailable,
      quotaExceeded,
      voiceUsage: {
        used: monthlyVoiceUsage,
        limit: MONTHLY_VOICE_LIMIT,
        remaining: MONTHLY_VOICE_LIMIT - monthlyVoiceUsage,
        percentUsed: ((monthlyVoiceUsage / MONTHLY_VOICE_LIMIT) * 100).toFixed(1)
      },
      mode
    });
  } catch (error) {
    console.error('Error in voice chat:', error);
    res.status(500).json({
      error: 'Failed to get response from AI assistant',
      details: error.message
    });
  }
});

// Generate full audio on-demand endpoint
app.post('/api/generate-full-audio', async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text is required' });
    }

    console.log('\n🔊 Generating FULL audio on-demand');
    console.log(`   Text length: ${text.length} characters`);
    console.log(`   Estimated credits: ~${text.length}`);

    if (monthlyVoiceUsage >= MONTHLY_VOICE_LIMIT) {
      return res.json({
        error: 'Monthly voice quota exceeded',
        audio: null,
        quotaExceeded: true
      });
    }

    try {
      const audioData = await convertToSpeech(text);
      console.log('✓ Full audio generated successfully');

      res.json({
        audio: audioData,
        voiceUsage: {
          used: monthlyVoiceUsage,
          limit: MONTHLY_VOICE_LIMIT,
          remaining: MONTHLY_VOICE_LIMIT - monthlyVoiceUsage,
          percentUsed: ((monthlyVoiceUsage / MONTHLY_VOICE_LIMIT) * 100).toFixed(1)
        }
      });
    } catch (error) {
      console.error('✗ Full audio generation failed:', error.message);
      res.status(500).json({
        error: 'Failed to generate audio',
        details: error.message
      });
    }
  } catch (error) {
    console.error('Error in generate-full-audio:', error);
    res.status(500).json({
      error: 'Failed to generate audio',
      details: error.message
    });
  }
});

// Voice status endpoint
app.get('/api/voice-status', (req, res) => {
  const remaining = MONTHLY_VOICE_LIMIT - monthlyVoiceUsage;
  const percentUsed = (monthlyVoiceUsage / MONTHLY_VOICE_LIMIT) * 100;

  res.json({
    available: remaining > 0,
    used: monthlyVoiceUsage,
    limit: MONTHLY_VOICE_LIMIT,
    remaining,
    percentUsed: percentUsed.toFixed(1),
    estimatedResponsesRemaining: Math.floor(remaining / 800)
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    mcp_connected: mcpClient !== null,
    voice_enabled: !!(ELEVENLABS_API_KEY && ELEVENLABS_VOICE_ID)
  });
});

// Start server
async function startServer() {
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║   Churchill Falls HYBRID Information Assistant ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  const coreLoaded = loadCoreDocuments();
  if (!coreLoaded) {
    console.error('\n✗ FATAL: Failed to load core documents');
    console.error('Cannot start server without core documents\n');
    process.exit(1);
  }

  console.log('Connecting to MCP server for supplementary documents...\n');
  const mcpInitialized = await initializeMCP();

  if (!mcpInitialized) {
    console.error(
      'WARNING: MCP server not available. Historical document search disabled.'
    );
  }

  if (!ELEVENLABS_API_KEY || !ELEVENLABS_VOICE_ID) {
    console.warn('WARNING: ElevenLabs credentials not configured. Voice features disabled.');
  } else {
    console.log('✓ ElevenLabs voice enabled');
  }

  app.listen(port, () => {
    console.log('\n╔════════════════════════════════════════════════╗');
    console.log(`║  Server running on port ${port.toString().padEnd(24)} ║`);
    console.log('╠════════════════════════════════════════════════╣');
    console.log('║  HYBRID SYSTEM STATUS:                         ║');
    console.log('║  • Core docs in context: ✓ (Fast answers)      ║');
    console.log(
      `║  • MCP supplementary: ${mcpInitialized ? '✓' : '✗'}                      ║`
    );
    console.log(
      `║  • Voice (ElevenLabs): ${
        ELEVENLABS_API_KEY && ELEVENLABS_VOICE_ID ? '✓' : '✗'
      }                   ║`
    );
    console.log('╚════════════════════════════════════════════════╝\n');
    console.log('Ready to answer questions!\n');
    console.log('Expected performance:');
    console.log('  • Core doc questions: 10-15 seconds');
    console.log('  • Historical questions: 30-60 seconds\n');
  });
}

startServer();
