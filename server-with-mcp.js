require('dotenv').config();
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const cors = require('cors');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Increased for audio data
app.use(express.static(__dirname));

// Initialize Anthropic client
const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
});

// ElevenLabs Configuration
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID;

// Voice usage tracking
let monthlyVoiceUsage = 0;
const MONTHLY_VOICE_LIMIT = 30000; // Creator tier: 30,000 characters/month

// MCP Client
let mcpClient = null;

/**
 * Initialize MCP client connection
 */
async function initializeMCP() {
    console.log('Initializing MCP client connection...');
    
    try {
        const transport = new StdioClientTransport({
            command: 'node',
            args: ['mcp-server.js'],
        });

        mcpClient = new Client({
            name: 'churchill-falls-express',
            version: '1.0.0',
        }, {
            capabilities: {},
        });

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
 * Prepare text for natural speech (expand acronyms, etc.)
 */
function prepareTextForSpeech(text) {
    const replacements = {
        // Organizations
        'MOU': 'M-O-U',
        'NL': 'Newfoundland and Labrador',
        'HQ': 'Hydro-Quebec',
        'Hydro-Québec': 'Hydro-Quebec',
        'CF': 'Churchill Falls',
        
        // Energy units
        'TWh': 'terawatt hours',
        'GWh': 'gigawatt hours',
        'kWh': 'kilowatt hours',
        'MW': 'megawatts',
        
        // Financial
        'NPV': 'net present value',
        
        // Common abbreviations
        'vs': 'versus',
        'vs.': 'versus',
        'e.g.': 'for example',
        'i.e.': 'that is',
        'etc.': 'et cetera',
    };
    
    let processedText = text;
    
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
    const speechText = prepareTextForSpeech(text);
    
    // Track usage
    monthlyVoiceUsage += speechText.length;
    console.log(`Voice usage: ${monthlyVoiceUsage}/${MONTHLY_VOICE_LIMIT} chars (${((monthlyVoiceUsage/MONTHLY_VOICE_LIMIT)*100).toFixed(1)}%)`);
    
    // Call ElevenLabs API
    const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
        {
            method: 'POST',
            headers: {
                'Accept': 'audio/mpeg',
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

# CRITICAL: You Have MCP Tools Available

You have access to a Model Context Protocol (MCP) server with THREE tools for accessing Churchill Falls documents:

1. **search_documents** - Search for relevant information across all documents
2. **get_document** - Retrieve full content of a specific document
3. **list_documents** - See all available documents

## When to Use MCP Tools

**ALWAYS use search_documents for:**
- Answering questions about Churchill Falls
- Finding specific facts, numbers, or quotes
- Comparing information across documents
- Any query that requires document content

**DO NOT** try to answer from memory - ALWAYS search the documents first.

# Your Knowledge Base (Accessed via MCP)

The MCP server has access to comprehensive information including:
- The December 12, 2024 Memorandum of Understanding (MOU)
- Dr. Doug May's 6-part video analysis series
- Wade Locke's assessment of the MOU
- Historical documents and contracts
- Corporate reports from Hydro-Québec and NL Hydro (2024)
- Academic research by economists
- **Detailed Financial Statements:**
  - Churchill Falls Consolidated Financial Statements (2024, 2023, 2022, 2021)
  - Lower Churchill Project Combined Financial Statements (2024)

# CRITICAL: MOU Status and Language Requirements

**EXTREMELY IMPORTANT - The December 12, 2024 MOU is a PROPOSED agreement, NOT a finalized deal:**

✓ CORRECT language: "proposed MOU," "proposed agreement," "if implemented," "if approved," "would provide," "proposed terms"

✗ INCORRECT language: "the deal," "agreement happened," "was signed and finalized," "will provide" (as if certain)

# CRITICAL: Document Citation Requirements

**When citing ANY document, you MUST include:**
1. **Document title/name**
2. **Date (if document has one)**
3. **For Dr. Doug May's videos: ALWAYS use markdown link format**

# Dr. Doug May's Video Links

- [Video 1: Quebec's Emerging Electricity Shortage](https://youtu.be/QJWWpT7Ip_Q)
- [Video 2A: Assessment of Proposed Prices](https://youtu.be/j2GWirWVg48)
- [Video 2B: Assessment of Proposed Prices (continued)](https://youtu.be/MJ91O1W358E)
- [Video 3A: Hydro-Québec's Electricity Imports](https://youtu.be/ToKebHmN16s)
- [Video 3B: Hydro-Québec's Electricity Imports (continued)](https://youtu.be/ToKebHmN16s)
- [Video 4: Assessment of Proposed Projects](https://youtu.be/OFcA4-SlWTE)

# Sources Referenced Section - REQUIRED

At the end of EVERY response that references documents, include a "Sources Referenced" section.

# Communication Style

**Automatically detect user expertise level and adapt your response accordingly.**

For Technical/Expert Users:
- Use precise technical terminology
- Include detailed calculations and analysis

For General Public Users:
- Explain concepts in plain language
- Use analogies and examples
- Define technical terms

# Formatting Rules

1. **Section headers:** Use **bold** on its own line (NOT markdown ##)
2. **Inline emphasis:** Use **bold** within sentences
3. **Lists:** Use hyphens with space (- Item)
4. **No extra blank lines:** Single line break between sections
5. **NEVER use blockquotes (> symbol)**
6. **Complete all responses:** NEVER leave incomplete

# Response Quality Standards

✓ **Use MCP tools first** - Always search documents before answering
✓ **Accurate** - Only use information from documents
✓ **Cited with dates and links** - Reference specific documents
✓ **Clear** - Explain complex concepts accessibly
✓ **Balanced** - Present multiple perspectives
✓ **Helpful** - Anticipate follow-up questions

Remember: ALWAYS use MCP tools to search documents before answering questions.`;

// Regular chat endpoint (existing)
app.post('/api/chat', async (req, res) => {
    try {
        const { message, conversationHistory = [] } = req.body;

        if (!message || typeof message !== 'string' || message.trim().length === 0) {
            return res.status(400).json({ error: 'Valid message is required' });
        }

        if (!mcpClient) {
            return res.status(503).json({ 
                error: 'MCP server not available. Please try again shortly.' 
            });
        }

        const cleanedHistory = conversationHistory.filter(msg => 
            msg && msg.content && typeof msg.content === 'string' && msg.content.trim().length > 0
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

        let response = await anthropic.messages.create({
            model: 'claude-sonnet-4-5-20250929',
            max_tokens: 4096,
            system: systemPrompt,
            messages: messages,
            tools: tools
        });

        let finalText = '';
        let currentMessages = [...messages];

        while (response.stop_reason === 'tool_use' || 
               (response.content && response.content.some(block => block.type === 'tool_use'))) {
            
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
                max_tokens: 4096,
                system: systemPrompt,
                messages: currentMessages,
                tools: tools
            });
        }

        for (const block of response.content) {
            if (block.type === 'text') {
                finalText += block.text;
            }
        }

        res.json({ response: finalText });

    } catch (error) {
        console.error('Error calling Claude API:', error);
        res.status(500).json({ 
            error: 'Failed to get response from AI assistant',
            details: error.message 
        });
    }
});

// NEW: Voice-enabled chat endpoint
app.post('/api/voice-chat', async (req, res) => {
    try {
        const { message, conversationHistory = [], requestVoice = true } = req.body;

        if (!message || typeof message !== 'string' || message.trim().length === 0) {
            return res.status(400).json({ error: 'Valid message is required' });
        }

        if (!mcpClient) {
            return res.status(503).json({ 
                error: 'MCP server not available. Please try again shortly.' 
            });
        }

        // Get text response (same as /api/chat)
        const cleanedHistory = conversationHistory.filter(msg => 
            msg && msg.content && typeof msg.content === 'string' && msg.content.trim().length > 0
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

        let response = await anthropic.messages.create({
            model: 'claude-sonnet-4-5-20250929',
            max_tokens: 4096,
            system: systemPrompt,
            messages: messages,
            tools: tools
        });

        let finalText = '';
        let currentMessages = [...messages];

        while (response.stop_reason === 'tool_use' || 
               (response.content && response.content.some(block => block.type === 'tool_use'))) {
            
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
                max_tokens: 4096,
                system: systemPrompt,
                messages: currentMessages,
                tools: tools
            });
        }

        for (const block of response.content) {
            if (block.type === 'text') {
                finalText += block.text;
            }
        }

        // Try to convert to voice if requested and quota available
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
            audio: audioData,
            voiceAvailable: voiceAvailable,
            quotaExceeded: quotaExceeded,
            voiceUsage: {
                used: monthlyVoiceUsage,
                limit: MONTHLY_VOICE_LIMIT,
                remaining: MONTHLY_VOICE_LIMIT - monthlyVoiceUsage,
                percentUsed: ((monthlyVoiceUsage / MONTHLY_VOICE_LIMIT) * 100).toFixed(1)
            }
        });

    } catch (error) {
        console.error('Error in voice chat:', error);
        res.status(500).json({ 
            error: 'Failed to get response from AI assistant',
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
        remaining: remaining,
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
    const mcpInitialized = await initializeMCP();
    
    if (!mcpInitialized) {
        console.error('WARNING: MCP server not available. Some features may not work.');
    }
    
    if (!ELEVENLABS_API_KEY || !ELEVENLABS_VOICE_ID) {
        console.warn('WARNING: ElevenLabs credentials not configured. Voice features disabled.');
    } else {
        console.log('✓ ElevenLabs voice enabled');
    }
    
    app.listen(port, () => {
        console.log(`Churchill Falls Information Assistant server running on port ${port}`);
        console.log(`MCP Status: ${mcpInitialized ? 'Connected ✓' : 'Disconnected ✗'}`);
        console.log(`Voice Status: ${(ELEVENLABS_API_KEY && ELEVENLABS_VOICE_ID) ? 'Enabled ✓' : 'Disabled ✗'}`);
    });
}

startServer();