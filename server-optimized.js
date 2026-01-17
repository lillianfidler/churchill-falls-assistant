// ============================================================================
// Churchill Falls Assistant - OPTIMIZED Backend
// ============================================================================
// Voice Mode: Dr. Doug May's analysis only (FAST & AUTHENTIC)
// Text Mode: Full comprehensive research (all 36 docs via MCP)
// ============================================================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(__dirname));

// ============================================================================
// API SETUP
// ============================================================================

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
});

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID;

let monthlyVoiceUsage = 0;
const MONTHLY_VOICE_LIMIT = 500000;

console.log('\n' + '='.repeat(60));
console.log('🚀 Churchill Falls Assistant - OPTIMIZED');
console.log('   Voice: Dr. Doug May\'s Analysis Only');
console.log('   Text: Comprehensive (All Sources)');
console.log('='.repeat(60));

// ============================================================================
// DOUG'S CORE DOCUMENTS (Voice Mode Only - FAST!)
// ============================================================================

const DOUG_DOCUMENTS = [
    'MOU_Churchill_Falls_Dec_12_2024_clean_text.txt',
    'Doug-video-series-video1.txt',
    'Doug-video-series-video2A.txt',
    'Doug-video-series-video2B.txt',
    'Doug-video-series-video3A.txt',
    'Doug-video-series-video3B.txt',
    'Doug-video-series-video4.txt',
    'LOCKE analysis of MOU CF.txt'
];

const dougDocuments = new Map();

function loadDougDocuments() {
    console.log('\n📚 Loading Dr. Doug May\'s analysis for voice mode...');
    
    const contentDir = path.join(__dirname, 'content');
    let loadedCount = 0;
    let totalSize = 0;
    
    for (const filename of DOUG_DOCUMENTS) {
        const filepath = path.join(contentDir, filename);
        
        try {
            if (fs.existsSync(filepath)) {
                const content = fs.readFileSync(filepath, 'utf-8');
                dougDocuments.set(filename, content);
                totalSize += content.length;
                loadedCount++;
                const sizeKB = (content.length / 1024).toFixed(2);
                console.log(`  ✓ ${filename} (${sizeKB} KB)`);
            } else {
                console.log(`  ⚠ Not found: ${filename}`);
            }
        } catch (error) {
            console.error(`  ✗ Error loading ${filename}:`, error.message);
        }
    }
    
    const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(2);
    const estimatedTokens = Math.round(totalSize / 3.5);
    
    console.log(`\n✅ Loaded ${loadedCount}/${DOUG_DOCUMENTS.length} documents`);
    console.log(`   Size: ${totalSizeMB} MB (~${estimatedTokens.toLocaleString()} tokens)`);
}

loadDougDocuments();

// ============================================================================
// MCP CLIENT (For Text Mode - All Documents)
// ============================================================================

let mcpClient = null;

async function initializeMCP() {
    console.log('\n🔌 Initializing MCP for comprehensive text mode...');
    
    try {
        const serverPath = path.join(__dirname, 'mcp-server-hybrid.js');
        
        if (!fs.existsSync(serverPath)) {
            console.error('❌ MCP server not found:', serverPath);
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
        
        const tools = await mcpClient.listTools();
        console.log(`✅ MCP connected: ${tools.tools.length} tools available`);
        
        return true;
    } catch (error) {
        console.error('❌ MCP initialization failed:', error.message);
        mcpClient = null;
        return false;
    }
}

initializeMCP();

// ============================================================================
// POST-PROCESSING (Clean up responses for voice)
// ============================================================================

function stripMarkdownAndFormat(text) {
    return text
        // Remove headers
        .replace(/^#{1,6}\s+/gm, '')
        
        // Remove bullet points
        .replace(/^\s*[-*•]\s+/gm, '')
        .replace(/^\s*\d+\.\s+/gm, '')
        
        // Remove bold/italic
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/\*(.+?)\*/g, '$1')
        
        // Remove blockquotes
        .replace(/^>\s+/gm, '')
        
        // Collapse multiple newlines
        .replace(/\n\n+/g, ' ')
        
        // Normalize whitespace
        .replace(/\s+/g, ' ')
        
        .trim();
}

function truncateAtSentence(text, maxWords = 80) {
    const words = text.split(/\s+/);
    
    if (words.length <= maxWords) {
        return text;
    }
    
    // Split into sentences
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    
    let result = '';
    let wordCount = 0;
    
    for (const sentence of sentences) {
        const sentenceWords = sentence.trim().split(/\s+/).length;
        
        if (wordCount + sentenceWords > maxWords) {
            break;
        }
        
        result += sentence;
        wordCount += sentenceWords;
    }
    
    return result.trim();
}

// ============================================================================
// VOICE GENERATION
// ============================================================================

async function generateVoice(text) {
    if (!ELEVENLABS_API_KEY || !ELEVENLABS_VOICE_ID) {
        console.log('⚠ Voice disabled (no credentials)');
        return null;
    }
    
    try {
        if (text.length > 5000) {
            console.log(`⚠ Text too long (${text.length} chars), truncating...`);
            text = text.substring(0, 5000);
        }
        
        console.log(`🎙️ Generating Doug's voice (${text.length} chars)...`);
        
        const response = await axios({
            method: 'POST',
            url: `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
            headers: {
                'Accept': 'audio/mpeg',
                'Content-Type': 'application/json',
                'xi-api-key': ELEVENLABS_API_KEY
            },
            data: {
                text: text,
                model_id: 'eleven_monolingual_v1',
                voice_settings: {
                    stability: 0.5,
                    similarity_boost: 0.75
                }
            },
            responseType: 'arraybuffer'
        });
        
        monthlyVoiceUsage += text.length;
        
        return Buffer.from(response.data).toString('base64');
    } catch (error) {
        console.error('❌ Voice generation failed:', error.message);
        return null;
    }
}

// ============================================================================
// SYSTEM PROMPTS
// ============================================================================

const DOUG_VOICE_PROMPT = `You are Dr. Doug May, economist and expert on Churchill Falls energy policy.

Answer questions conversationally using YOUR analysis from your video series. Speak naturally as if explaining to a colleague over coffee.

CRITICAL RULES:
- 2-3 sentences maximum
- Natural conversational tone (like your videos)
- NO bullet points, headers, or markdown formatting
- Plain prose only
- If you don't know from your videos, say "I'd need to look deeper into that - try the Deep Research mode for a comprehensive analysis."

Remember: You're Doug May explaining YOUR perspective.`;

const TEXT_MODE_PROMPT = `You are an expert AI assistant specializing in the Churchill Falls power project.

Provide comprehensive, well-researched answers using all available documents. Include:
- Specific details, dates, and figures
- Multiple perspectives (Doug May, Wade Locke, other economists)
- Citations where relevant
- Clear analysis of implications

Structure your responses with appropriate context and nuance.`;

// ============================================================================
// MAIN CHAT ENDPOINT
// ============================================================================

app.post('/api/chat', async (req, res) => {
    const startTime = Date.now();
    
    try {
        const { message, conversationHistory = [], isVoiceMode = false } = req.body;
        
        if (!message?.trim()) {
            return res.status(400).json({ error: 'Message is required' });
        }
        
        console.log(`\n${'='.repeat(60)}`);
        console.log(`${isVoiceMode ? '🎤 VOICE (Doug)' : '📝 TEXT (Comprehensive)'}: "${message.substring(0, 50)}..."`);
        console.log(`${'='.repeat(60)}`);
        
        const messages = [
            ...conversationHistory,
            { role: 'user', content: message }
        ];
        
        let responseText = '';
        let audioData = null;
        
        // ====================================================================
        // VOICE MODE - Doug May's Analysis
        // ====================================================================
        
        if (isVoiceMode) {
            console.log('📚 Using Doug\'s analysis (8 documents)...');
            
            // Build context from Doug's documents
            let documentContext = '# Dr. Doug May\'s Analysis and Source Materials\n\n';
            
            for (const [filename, content] of dougDocuments.entries()) {
                documentContext += `## ${filename}\n${content}\n\n---\n\n`;
            }
            
            const systemPrompt = DOUG_VOICE_PROMPT + '\n\n' + documentContext;
            
            const response = await anthropic.messages.create({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 300,
                system: systemPrompt,
                messages: messages
            });
            
            responseText = response.content
                .filter(block => block.type === 'text')
                .map(block => block.text)
                .join('\n');
            
            console.log(`📊 Raw response: ${responseText.length} chars`);
            
            // Post-process for natural voice
            responseText = stripMarkdownAndFormat(responseText);
            responseText = truncateAtSentence(responseText, 80);
            
            const wordCount = responseText.split(/\s+/).length;
            console.log(`✅ Clean response: ${responseText.length} chars, ${wordCount} words`);
            
            // Generate voice
            audioData = await generateVoice(responseText);
            
            if (audioData) {
                console.log(`🎙️ Voice generated: ${monthlyVoiceUsage.toLocaleString()}/${MONTHLY_VOICE_LIMIT.toLocaleString()} chars used`);
            }
        }
        
        // ====================================================================
        // TEXT MODE - Comprehensive Research
        // ====================================================================
        
        else {
            if (!mcpClient) {
                return res.status(503).json({
                    error: 'Deep research mode unavailable. Please try voice mode.',
                    text: 'The comprehensive research system is currently unavailable. Please use the conversational voice mode, or try again later.',
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
                system: TEXT_MODE_PROMPT,
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
                        console.log(`  → ${block.name}`);
                        
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
                            console.error(`  ✗ ${block.name} error:`, error.message);
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
                    system: TEXT_MODE_PROMPT,
                    messages: currentMessages,
                    tools: toolsList
                });
            }

            responseText = response.content
                .filter(block => block.type === 'text')
                .map(block => block.text)
                .join('\n');

            const wordCount = responseText.split(/\s+/).length;
            console.log(`✅ Comprehensive response: ${wordCount} words`);
        }
        
        // ====================================================================
        // RESPONSE
        // ====================================================================
        
        const responseTime = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`⏱️ Total time: ${responseTime}s`);
        console.log('='.repeat(60));
        
        res.json({
            text: responseText,
            audio: audioData,
            voiceAvailable: !!(ELEVENLABS_API_KEY && ELEVENLABS_VOICE_ID),
            responseTime: parseFloat(responseTime),
            mode: isVoiceMode ? 'voice' : 'text'
        });

    } catch (error) {
        console.error('❌ Error:', error);
        res.status(500).json({ 
            error: 'An error occurred processing your request',
            details: error.message 
        });
    }
});

// ============================================================================
// LEGACY ENDPOINT (For compatibility)
// ============================================================================

app.post('/api/voice-chat', async (req, res) => {
    // Convert old format to new format
    const { message, conversationHistory, requestVoice } = req.body;
    
    req.body = {
        message,
        conversationHistory,
        isVoiceMode: requestVoice
    };
    
    // Forward to main endpoint
    return app._router.handle(
        { ...req, url: '/api/chat', method: 'POST' },
        res,
        () => {}
    );
});

// ============================================================================
// STATUS ENDPOINTS
// ============================================================================

app.get('/api/voice-status', (req, res) => {
    const available = !!(ELEVENLABS_API_KEY && ELEVENLABS_VOICE_ID);
    
    res.json({
        available,
        creditsUsed: monthlyVoiceUsage,
        monthlyLimit: MONTHLY_VOICE_LIMIT,
        percentUsed: ((monthlyVoiceUsage / MONTHLY_VOICE_LIMIT) * 100).toFixed(1),
        documentsLoaded: dougDocuments.size,
        mcpConnected: !!mcpClient
    });
});

app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        voiceMode: {
            documents: dougDocuments.size,
            totalDocs: DOUG_DOCUMENTS.length
        },
        textMode: {
            mcpConnected: !!mcpClient
        },
        timestamp: new Date().toISOString()
    });
});

// ============================================================================
// START SERVER
// ============================================================================

app.listen(PORT, () => {
    console.log('\n' + '='.repeat(60));
    console.log('✅ Churchill Falls Assistant - Ready!');
    console.log('='.repeat(60));
    console.log(`🌐 Server running on port ${PORT}`);
    console.log(`\n📊 System Status:`);
    console.log(`   Voice Mode: ${dougDocuments.size}/${DOUG_DOCUMENTS.length} Doug's documents`);
    console.log(`   Text Mode: ${mcpClient ? 'MCP connected ✓' : 'MCP disconnected ✗'}`);
    console.log(`   ElevenLabs: ${ELEVENLABS_API_KEY ? 'Enabled ✓' : 'Disabled ✗'}`);
    console.log('\n' + '='.repeat(60));
});