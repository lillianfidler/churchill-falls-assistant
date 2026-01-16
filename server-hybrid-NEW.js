// Churchill Falls Information Assistant - Simple Fast Backend
// Voice Mode: 15 core docs loaded directly (fast, 2-3 sec)
// Text Mode: All 36 docs via MCP (comprehensive, 8-12 sec)

const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

const app = express();
const PORT = process.env.PORT || 3000;

// Environment variables
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'nPczCjzI2devNBz1zQrb'; // Doug May's voice

// Voice usage tracking
let monthlyVoiceUsage = 0;
const MONTHLY_VOICE_LIMIT = 100000; // 100k characters per month

if (!ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY environment variable is required');
    process.exit(1);
}

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// Serve main files
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/sources.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'sources.html')));
app.get('/about.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'about.html')));

// ============================================================================
// CORE DOCUMENTS - Loaded directly for Voice Mode (Fast)
// ============================================================================

const CORE_DOCUMENTS = [
    // Essential - The "Must Haves"
    'MOU_Churchill_Falls_Dec_12_2024_clean_text.txt',
    'Doug-video-series-video1.txt',
    'Doug-video-series-video2A.txt',
    'Doug-video-series-video2B.txt',
    'Doug-video-series-video3A.txt',
    'Doug-video-series-video3B.txt',
    'Doug-video-series-video4.txt',
    'LOCKE analysis of MOU CF.txt',
    'Churchill-falls-consolidated-financial-statements-2024.txt',
    
    // High Priority - Very Useful
    'HYDRO-QUEBECS-EXPORTS.txt',
    'Churchill-Falls-2023-financial-statement.txt',
    'Reassessing-the-Churchill-Falls-MOU.txt',
    'Churchill_Falls_Annual_Report_2024.txt',
    'HQ-exports-electricity-price-escalation.txt',
    'Lower-Churchill-Project-Combined-Financial-Statements-2024.txt'
];

// Load core documents at startup
let coreDocumentsContext = '';

function loadCoreDocuments() {
    const contentDir = path.join(__dirname, 'content');
    let totalSize = 0;
    let loadedCount = 0;
    
    console.log('\n📚 Loading core documents for voice mode...');
    
    CORE_DOCUMENTS.forEach(filename => {
        const filepath = path.join(contentDir, filename);
        try {
            if (fs.existsSync(filepath)) {
                const content = fs.readFileSync(filepath, 'utf-8');
                const sizeKB = (Buffer.byteLength(content, 'utf-8') / 1024).toFixed(2);
                console.log(`  ✓ ${filename} (${sizeKB} KB)`);
                
                coreDocumentsContext += `\n\n=== ${filename} ===\n${content}`;
                totalSize += Buffer.byteLength(content, 'utf-8');
                loadedCount++;
            } else {
                console.log(`  ✗ ${filename} (NOT FOUND)`);
            }
        } catch (error) {
            console.error(`  ✗ ${filename} (ERROR: ${error.message})`);
        }
    });
    
    const totalSizeMB = (totalSize / 1024 / 1024).toFixed(2);
    console.log(`\n✅ Loaded ${loadedCount}/${CORE_DOCUMENTS.length} core documents (${totalSizeMB} MB)`);
}

loadCoreDocuments();

// ============================================================================
// MCP CLIENT - For deep research with all 36 documents
// ============================================================================

let mcpClient = null;

async function initializeMCP() {
    console.log('\n🔌 Initializing MCP client for deep research mode...');
    
    try {
        const serverPath = path.join(__dirname, 'mcp-server-hybrid.js');
        
        if (!fs.existsSync(serverPath)) {
            console.error('❌ MCP server file not found:', serverPath);
            return false;
        }

        const transport = new StdioClientTransport({
            command: 'node',
            args: [serverPath]
        });

        mcpClient = new Client({
            name: 'churchill-falls-client',
            version: '1.0.0'
        }, {
            capabilities: {}
        });

        await mcpClient.connect(transport);
        console.log('✅ MCP client connected successfully');
        
        // Test connection
        const tools = await mcpClient.listTools();
        console.log(`✅ MCP tools available: ${tools.tools.length}`);
        
        return true;
    } catch (error) {
        console.error('❌ Failed to initialize MCP:', error.message);
        mcpClient = null;
        return false;
    }
}

// Initialize MCP on startup
initializeMCP();

// ============================================================================
// SYSTEM PROMPTS
// ============================================================================

const VOICE_MODE_SYSTEM_PROMPT = `You are a helpful AI assistant specializing in the Churchill Falls power project and the December 2024 MOU between Newfoundland and Labrador and Quebec.

**YOUR PERSONALITY:**
- Conversational and natural (like talking to Doug May)
- Clear and concise
- Friendly and helpful
- Encourage follow-up questions

**RESPONSE STYLE:**
- Keep responses conversational (2-4 sentences typically)
- Use natural language, not bullet points
- If the topic is complex, summarize key points then offer more detail
- Always end with a helpful suggestion like:
  * "Would you like me to elaborate on any aspect?"
  * "I can explain that in more detail if you'd like."
  * "Feel free to ask follow-up questions!"

**IMPORTANT - FALLBACK BEHAVIOR:**
If you cannot adequately answer the question from the documents in your context:
- Respond with EXACTLY: "Please stand by, I'm researching that. This may take a moment."
- The system will automatically search additional documents and re-ask with more context

**AFTER ANSWERING:**
For substantial answers, naturally suggest:
"This is a summary - would you like the full detailed analysis? I can switch to Deep Research Mode for a comprehensive written response."

The core documents below cover: MOU details, Doug May's analysis, Wade Locke's evaluation, current financials, and export data.

=== CORE DOCUMENTS ===
${coreDocumentsContext}`;

const TEXT_MODE_SYSTEM_PROMPT = `You are a comprehensive research assistant specializing in the Churchill Falls power project and the December 2024 MOU between Newfoundland and Labrador and Quebec.

**YOUR ROLE:**
- Provide detailed, thorough analysis
- Use all available documents for comprehensive answers
- Include specific numbers, dates, and facts
- Cite sources when referencing specific documents
- Structure longer responses with clear organization

**RESPONSE STYLE:**
- Be comprehensive and detailed
- Use paragraphs for readability
- Include relevant context and background
- Reference specific documents when citing facts
- Provide nuanced analysis when appropriate

**AVAILABLE TOOLS:**
You have access to MCP tools that can search through all 36 documents including:
- Historical contracts and development
- All financial statements (2021-2024)
- Academic analyses (Feehan, Locke)
- Quebec energy reports
- Lower Churchill projects
- Economic and fiscal analyses

Use the search_documents tool to find information across all available documents.

**After providing your comprehensive answer, you may suggest:**
"Would you like me to explore any specific aspect in more detail?"`;

// ============================================================================
// VOICE GENERATION
// ============================================================================

async function generateVoice(text) {
    if (!ELEVENLABS_API_KEY || !ELEVENLABS_VOICE_ID) {
        console.log('⚠️ Voice generation skipped: API key or voice ID not configured');
        return null;
    }

    try {
        const charCount = text.length;
        
        if (monthlyVoiceUsage + charCount > MONTHLY_VOICE_LIMIT) {
            console.log('⚠️ Monthly voice limit reached');
            return null;
        }

        console.log(`🎤 Generating voice (${charCount} chars)...`);

        const response = await axios.post(
            `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
            {
                text: text,
                model_id: 'eleven_monolingual_v1',
                voice_settings: {
                    stability: 0.5,
                    similarity_boost: 0.75
                }
            },
            {
                headers: {
                    'xi-api-key': ELEVENLABS_API_KEY,
                    'Content-Type': 'application/json'
                },
                responseType: 'arraybuffer'
            }
        );

        monthlyVoiceUsage += charCount;
        console.log(`✓ Voice generated successfully (${monthlyVoiceUsage}/${MONTHLY_VOICE_LIMIT} chars used)`);

        const audioBase64 = Buffer.from(response.data).toString('base64');
        return `data:audio/mpeg;base64,${audioBase64}`;

    } catch (error) {
        console.error('Voice generation error:', error.response?.data || error.message);
        return null;
    }
}

// ============================================================================
// MAIN CHAT ENDPOINT
// ============================================================================

app.post('/api/chat', async (req, res) => {
    try {
        const { message, conversationHistory = [], isVoiceMode = false } = req.body;

        if (!message || typeof message !== 'string' || message.trim().length === 0) {
            return res.status(400).json({ error: 'Valid message is required' });
        }

        const startTime = Date.now();
        console.log(`\n${'='.repeat(60)}`);
        console.log(`📝 Question: "${message}"`);
        console.log(`🎤 Mode: ${isVoiceMode ? 'VOICE (fast, core docs)' : 'TEXT (comprehensive, all docs)'}`);
        console.log('='.repeat(60));

        // Clean conversation history
        const cleanedHistory = conversationHistory.filter(msg => 
            msg && msg.content && typeof msg.content === 'string' && msg.content.trim().length > 0
        );

        const messages = [
            ...cleanedHistory,
            { role: 'user', content: message }
        ];

        let responseText = '';
        let needsDeepResearch = false;

        // ========================================
        // VOICE MODE - Try core docs first
        // ========================================
        if (isVoiceMode) {
            console.log('🎤 Attempting quick response with core documents...');
            
            const voiceResponse = await anthropic.messages.create({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 2000,
                system: VOICE_MODE_SYSTEM_PROMPT,
                messages: messages
            });

            responseText = voiceResponse.content
                .filter(block => block.type === 'text')
                .map(block => block.text)
                .join('\n');

            // Check if fallback is needed
            if (responseText.includes('Please stand by, I\'m researching that')) {
                needsDeepResearch = true;
                console.log('🔍 Core docs insufficient, switching to deep research...');
            }
        }

        // ========================================
        // TEXT MODE or FALLBACK - Use MCP
        // ========================================
        if (!isVoiceMode || needsDeepResearch) {
            if (!mcpClient) {
                return res.json({
                    text: responseText || 'Deep research mode is temporarily unavailable. Please try voice mode or try again later.',
                    audio: null,
                    voiceAvailable: false
                });
            }

            console.log('📚 Using MCP for comprehensive research...');

            const tools = await mcpClient.listTools();
            const toolsList = tools.tools.map(tool => ({
                name: tool.name,
                description: tool.description,
                input_schema: tool.inputSchema
            }));

            let response = await anthropic.messages.create({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 4096,
                system: TEXT_MODE_SYSTEM_PROMPT,
                messages: messages,
                tools: toolsList
            });

            let currentMessages = [...messages];
            let toolCallCount = 0;
            const MAX_TOOL_CALLS = 10;

            // Handle tool use
            while (response.stop_reason === 'tool_use' && toolCallCount < MAX_TOOL_CALLS) {
                toolCallCount++;
                console.log(`🔧 Tool call ${toolCallCount}/${MAX_TOOL_CALLS}`);

                currentMessages.push({
                    role: 'assistant',
                    content: response.content
                });

                const toolResults = [];

                for (const block of response.content) {
                    if (block.type === 'tool_use') {
                        console.log(`  Calling: ${block.name}`);
                        
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
                            console.error(`  Error in ${block.name}:`, error.message);
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
                    model: 'claude-sonnet-4-20250514',
                    max_tokens: 4096,
                    system: TEXT_MODE_SYSTEM_PROMPT,
                    messages: currentMessages,
                    tools: toolsList
                });
            }

            // Extract final text
            responseText = response.content
                .filter(block => block.type === 'text')
                .map(block => block.text)
                .join('\n');
        }

        // ========================================
        // GENERATE VOICE (Voice Mode Only)
        // ========================================
        let audioData = null;
        
        if (isVoiceMode) {
            audioData = await generateVoice(responseText);
        }

        // ========================================
        // RESPONSE
        // ========================================
        const responseTime = ((Date.now() - startTime) / 1000).toFixed(1);
        const wordCount = responseText.split(/\s+/).length;

        console.log(`⏱️ Response time: ${responseTime}s`);
        console.log(`📊 Response: ${wordCount} words`);
        if (audioData) {
            console.log(`Voice usage: ${monthlyVoiceUsage}/${MONTHLY_VOICE_LIMIT} chars (${((monthlyVoiceUsage/MONTHLY_VOICE_LIMIT)*100).toFixed(1)}%)`);
            console.log('✓ Voice generated successfully');
        }

        res.json({
            text: responseText,
            audio: audioData,
            voiceAvailable: !!(ELEVENLABS_API_KEY && ELEVENLABS_VOICE_ID),
            voiceUsage: {
                used: monthlyVoiceUsage,
                limit: MONTHLY_VOICE_LIMIT,
                remaining: MONTHLY_VOICE_LIMIT - monthlyVoiceUsage
            }
        });

    } catch (error) {
        console.error('❌ Chat error:', error);
        res.status(500).json({ 
            error: 'An error occurred processing your request',
            details: error.message 
        });
    }
});

// ============================================================================
// VOICE STATUS ENDPOINT
// ============================================================================

app.get('/api/voice-status', (req, res) => {
    const available = !!(ELEVENLABS_API_KEY && ELEVENLABS_VOICE_ID);
    const remaining = MONTHLY_VOICE_LIMIT - monthlyVoiceUsage;
    
    res.json({
        available,
        creditsRemaining: remaining,
        creditsUsed: monthlyVoiceUsage,
        monthlyLimit: MONTHLY_VOICE_LIMIT,
        voiceId: available ? ELEVENLABS_VOICE_ID.substring(0, 8) + '...' : null
    });
});

// ============================================================================
// START SERVER
// ============================================================================

app.listen(PORT, () => {
    console.log(`\n${'='.repeat(60)}`);
    console.log('🚀 Churchill Falls Assistant - Simple Fast Backend');
    console.log(`Server running on port ${PORT}`);
    console.log(`Voice mode: ${CORE_DOCUMENTS.length} core documents loaded`);
    console.log(`Text mode: MCP ${mcpClient ? 'connected' : 'disconnected'} (all 36 docs)`);
    console.log(`Voice API: ${ELEVENLABS_API_KEY ? '✓ Configured' : '✗ Not configured'}`);
    console.log('='.repeat(60));
});