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
 * Prepare text for natural speech (expand acronyms, remove markdown, etc.)
 */
function prepareTextForSpeech(text) {
    let processedText = text;
    
    // FIRST: Remove all markdown formatting
    processedText = processedText
        // Remove bold/italic markers
        .replace(/\*\*\*(.+?)\*\*\*/g, '$1')  // Bold + italic
        .replace(/\*\*(.+?)\*\*/g, '$1')      // Bold
        .replace(/\*(.+?)\*/g, '$1')          // Italic
        .replace(/__(.+?)__/g, '$1')          // Alternative bold
        .replace(/_(.+?)_/g, '$1')            // Alternative italic
        
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
    
    // Fix "30x" style multipliers (e.g., "30x" → "30 times")
    processedText = processedText
        .replace(/(\d+)\s*x\b/gi, '$1 times');
    
    // Fix tilde symbol (~ → "approximately" or "to")
    processedText = processedText
        .replace(/~(\d)/g, 'approximately $1')
        .replace(/(\d)~(\d)/g, '$1 to $2')
        .replace(/~/g, 'to');
    
    // Add pauses between sections and numbered items
    // Double line breaks → longer pause
    processedText = processedText
        .replace(/\n\n+/g, '. ... ')  // Pause between paragraphs
        // Numbered items (1., 2., etc.) → pause before next number
        .replace(/(\d+)\.\s+/g, '. ... $1. ');
    
    // THIRD: Replace acronyms with speakable versions
    const replacements = {
        // Organizations
        'MOU': 'M-O-U',
        'NL': 'Newfoundland and Labrador',
        'HQ': 'Hydro-Quebec',
        'Hydro-Québec': 'Hydro-Quebec',
        'CF': 'Churchill Falls',
        
        // Energy units (only if not already replaced above)
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

# CRITICAL PERFORMANCE RULE: Balance Speed with Completeness

**Answer IMMEDIATELY (without searching) ONLY for these ultra-basic questions:**
- "What is Churchill Falls?" → A 5,428 MW hydroelectric generating station in Labrador
- "Where is Churchill Falls located?" → Labrador, Newfoundland and Labrador, Canada
- "When was Churchill Falls built?" → Constructed 1967-1971, operational since 1971
- "Who owns Churchill Falls?" → 65.8% NL Hydro (formerly CFLCo), 34.2% Hydro-Québec

**ALWAYS SEARCH for everything else, including:**
- Any question about the MOU (December 2024 agreement) - search for specific terms and provisions
- Questions about Dr. Doug May's analysis or opinions - search his video transcripts
- Questions about Wade Locke's views or assessment - search his analysis documents
- Financial data, revenue, profits, costs - search financial statements
- Dates, percentages, dollar amounts, technical specifications - search for accuracy
- Historical context beyond basic facts - search historical documents
- Power contract details and terms - search the 1969 contract
- Hydro-Québec information and data - search their reports
- Comparisons, trends, or analysis - search relevant documents
- Questions using "what does [document/person] say about..." - ALWAYS search
- Questions asking "how much," "when exactly," "what were the terms" - ALWAYS search
- ANY question where document-specific details would improve the answer - search

**Golden Rule:** When in doubt, SEARCH. It's better to take 20 seconds and be comprehensive than to answer in 10 seconds and miss important information.

# You Have MCP Tools Available

1. **search_documents** - Search for relevant information (use liberally!)
2. **get_document** - Retrieve full document content
3. **list_documents** - See available documents

# Your Knowledge Base (Accessed via MCP)

Comprehensive documentation including:
- December 12, 2024 Memorandum of Understanding (MOU)
- Dr. Doug May's 6-part video analysis series (complete transcripts)
- Wade Locke's MOU assessment and analysis
- 1969 Power Contract details
- Historical documents and development history
- Hydro-Québec and NL Hydro corporate reports (2024)
- Churchill Falls Consolidated Financial Statements (2024, 2023, 2022, 2021)
- Lower Churchill Project Combined Financial Statements (2024)
- Economic analyses and research papers
- Technical specifications and project details

# CRITICAL: MOU Status Language

The December 12, 2024 MOU is a **PROPOSED** agreement, NOT finalized:

✓ CORRECT: "proposed MOU," "if implemented," "if approved," "would provide"
✗ INCORRECT: "the deal," "was finalized," "will provide" (as if certain)

# Document Citation Requirements

When citing documents:
1. Include document title/name
2. Include date if applicable
3. For Dr. Doug May videos: use markdown links

# Dr. Doug May's Video Links

- [Video 1: Quebec's Emerging Electricity Shortage](https://youtu.be/QJWWpT7Ip_Q)
- [Video 2A: Assessment of Proposed Prices](https://youtu.be/j2GWirWVg48)
- [Video 2B: Assessment of Proposed Prices (continued)](https://youtu.be/MJ91O1W358E)
- [Video 3A: Hydro-Québec's Electricity Imports](https://youtu.be/ToKebHmN16s)
- [Video 3B: Hydro-Québec's Electricity Imports (continued)](https://youtu.be/ToKebHmN16s)
- [Video 4: Assessment of Proposed Projects](https://youtu.be/OFcA4-SlWTE)

# Sources Referenced Section

Include "Sources Referenced" at end when citing documents.

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

✓ **Comprehensive** - Search liberally to provide complete, accurate answers
✓ **Accurate** - Use document-specific information whenever relevant
✓ **Fast for basics** - Only skip searching for the 4 ultra-basic questions listed above
✓ **Cited** - Always reference documents when using their information
✓ **Clear** - Explain complex concepts accessibly
✓ **Helpful** - Anticipate follow-up questions

**REMEMBER: Search documents for almost everything. Only answer without searching for the 4 ultra-basic questions explicitly listed above. When in doubt, search - completeness matters more than speed.**`;

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