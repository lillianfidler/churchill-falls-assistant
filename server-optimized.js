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
const staticDir = path.join(__dirname, 'public');
app.use(express.static(staticDir));


// ============================================================================
// RESPONSE CACHE SYSTEM (Optimization 2)
// ============================================================================

const responseCache = new Map();
const CACHE_DURATION = 3600000; // 1 hour in milliseconds

function getCacheKey(message, mode) {
    // Create a simple hash of the message + mode
    const normalized = message.toLowerCase().trim();
    return `${mode}:${normalized}`;
}

function getCachedResponse(message, mode) {
    const key = getCacheKey(message, mode);
    const cached = responseCache.get(key);
    
    if (!cached) return null;
    
    // Check if cache is still valid (within CACHE_DURATION)
    const age = Date.now() - cached.timestamp;
    if (age > CACHE_DURATION) {
        responseCache.delete(key);
        return null;
    }
    
    console.log(`💾 Cache HIT! (age: ${Math.round(age / 1000)}s)`);
    return cached.response;
}

function cacheResponse(message, mode, response) {
    const key = getCacheKey(message, mode);
    responseCache.set(key, {
        response,
        timestamp: Date.now(),
        mode
    });
    console.log(`💾 Cached response (total cached: ${responseCache.size})`);
}

// Periodically clean expired cache entries
setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, value] of responseCache.entries()) {
        if (now - value.timestamp > CACHE_DURATION) {
            responseCache.delete(key);
            cleaned++;
        }
    }
    if (cleaned > 0) {
        console.log(`🧹 Cleaned ${cleaned} expired cache entries`);
    }
}, 600000); // Clean every 10 minutes

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
// DOUG'S CORE DOCUMENTS - SUMMARIES (Voice Mode Only - OPTIMIZED!)
// Using concise summaries instead of full documents for faster responses
// ============================================================================

const DOUG_DOCUMENTS = [
    // Core MOU and Analysis (summaries)
    'MOU_Churchill_Falls_Dec_12_2024_summary.txt',
    'Doug-video-series-video1-summary.txt',
    'Doug-video-series-video2A-summary.txt',
    'Doug-video-series-video2B-summary.txt',
    'LOCKE analysis of MOU CF-summary.txt',
    
    // Doug's Complete Analysis Collection (17 files total)
    'doug-may-assessment-of-proposed-prices-mou.txt',
    'doug-may-CF-assessment-mou.txt',
    'doug-point-summary-assessment-mou-prices.txt',
    'Doug-Proposed_Prices_Under-MOU.txt',
    'Doug-Proposed_Projects_Under-mou.txt',
    'doug-summary-video.txt',
    'HYDRO-QUEBECS-EXPORTS.txt',
    'HYDRO-QUEBECS-IMPORTS.txt',
    'quebecs-electricity-supply-problem.txt',
    'Proposed-Prices-for-Existing-Power.txt',
    'Understanding-Some-Financial-Concep.txt'
];

const dougDocuments = new Map();

function loadDougDocuments() {
    console.log('\n📚 Loading Dr. Doug May\'s analysis SUMMARIES for voice mode...');
    console.log('   (Using optimized summaries for faster responses)');
    
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
    
    console.log(`\n✅ Loaded ${loadedCount}/${DOUG_DOCUMENTS.length} summary documents`);
    console.log(`   Size: ${totalSizeMB} MB (~${estimatedTokens.toLocaleString()} tokens)`);
    console.log(`   💡 93% smaller than full documents - faster & more efficient!`);
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

// ============================================================================
// ACRONYM EXPANSION FOR VOICE
// ============================================================================

function expandAcronyms(text) {
    // Comprehensive Churchill Falls acronym dictionary
    const acronyms = {
        // Organizations
        'HQ': 'Hydro-Québec',
        'NLH': 'Newfoundland and Labrador Hydro',
        'GNL': 'Government of Newfoundland and Labrador',
        'CF(L)Co': 'Churchill Falls Labrador Corporation',
        'CFLCo': 'Churchill Falls Labrador Corporation',
        
        // Energy Units
        'kWh': 'kilowatt hours',
        'KWh': 'kilowatt hours',
        'kwh': 'kilowatt hours',
        'TWh': 'terawatt hours',
        'MWh': 'megawatt hours',
        'MW': 'megawatts',
        'GW': 'gigawatts',
        
        // Financial & Economic Terms
        'NPV': 'Net Present Value',
        'PV': 'Present Value',
        'GDP': 'Gross Domestic Product',
        'ROI': 'Return on Investment',
        
        // Contracts & Agreements
        'MOU': 'Memorandum of Understanding',
        'GWAC': 'Guaranteed Winter Availability Contract',
        'PPA': 'Power Purchase Agreement',
        
        // Geographic & Projects
        'CF': 'Churchill Falls',
        'NL': 'Newfoundland and Labrador',
        
        // Markets & Systems
        'ISO': 'Independent System Operator',
        'NECEC': 'New England Clean Energy Connect',
        'CHPE': 'Champlain Hudson Power Express',
        
        // Other Common Terms
        'EA': 'Environmental Assessment',
        'PME': 'Profit-Making Enterprise',
        'BATNA': 'Best Alternative to a Negotiated Agreement',
        'YTD': 'Year to Date',
        'Q1': 'first quarter',
        'Q2': 'second quarter',
        'Q3': 'third quarter',
        'Q4': 'fourth quarter'
    };
    
    // Create regex patterns for each acronym
    // Use word boundaries to avoid partial matches
    for (const [acronym, expansion] of Object.entries(acronyms)) {
        // Escape special regex characters in the acronym
        const escapedAcronym = acronym.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        
        // Match the acronym with word boundaries
        // Also match when followed by 's for plurals (e.g., "HQ's" -> "Hydro-Québec's")
        const regex = new RegExp(`\\b${escapedAcronym}('s)?\\b`, 'g');
        
        text = text.replace(regex, (match, possessive) => {
            return expansion + (possessive || '');
        });
    }
    
    return text;
}

function stripMarkdownAndFormat(text) {
    return text
        // Fix currency ranges FIRST (before other processing)
        .replace(/\$(\d+)-(\d+)\s*billion/gi, '$1 to $2 billion dollars')
        .replace(/\$(\d+)-(\d+)\s*million/gi, '$1 to $2 million dollars')
        
        // Remove headers (with or without # symbols)
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/^[A-Z][A-Za-z\s&]+:$/gm, '') // Remove "Title:" style headers including "Key Changes:"
        .replace(/^[A-Z][A-Za-z\s&]+:\s/gm, '') // Remove inline headers like "What It Does: "
        
        // Remove bullet points and list items
        .replace(/^\s*[-*•]\s+/gm, '')
        .replace(/^\s*\d+\.\s+/gm, '')
        
        // Remove bold/italic
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/\*(.+?)\*/g, '$1')
        .replace(/__(.+?)__/g, '$1')
        .replace(/_(.+?)_/g, '$1')
        
        // Remove blockquotes
        .replace(/^>\s+/gm, '')
        
        // Remove multiple consecutive colons (often used in structured lists)
        .replace(/:\s*\n/g, ': ')
        
        // Remove standalone section markers
        .replace(/^By \d{4}.*$/gm, '')
        .replace(/^The [A-Z][a-z]+.*$/gm, (match) => {
            // Only remove if it looks like a header (Title Case, short, ends sentence)
            if (match.length < 50 && match.match(/^The [A-Z]/)) {
                return '';
            }
            return match;
        })
        
        // Collapse multiple newlines to single space
        .replace(/\n\n+/g, ' ')
        .replace(/\n/g, ' ')
        
        // Normalize whitespace
        .replace(/\s+/g, ' ')
        
        // Remove isolated number+unit fragments (MORE AGGRESSIVE)
        // These patterns catch standalone fragments like "63 cents per kilowatt hour"
        .replace(/\.\s+\d+\.?\d*\s+(cents?|dollars?|billion|million|percent|%)\s+per\s+\w+\s+(hour|year|month|day)\s*\./gi, '.')
        .replace(/\.\s+\d+\.?\d*\s+(cents?|dollars?)\s+per\s+\w+\s+\w+\s*\./gi, '.')
        .replace(/\.\s+\d+\.?\d*\s+(billion|million)\s*\./gi, '.')
        .replace(/\.\s+\d+\.?\d*\s+(cents?)\s*\./gi, '.')
        
        // Clean up double periods
        .replace(/\.{2,}/g, '.')
        
        .trim();
}

function truncateAtSentence(text, maxWords = 150) {
    // Clean up text first
    text = text.trim();
    
    // If empty, return empty
    if (!text) return '';
    
    const words = text.split(/\s+/);
    
    // If already short enough, return as-is
    if (words.length <= maxWords) {
        return text;
    }
    
    // Split into sentences - improved regex to handle abbreviations and decimals
    const sentences = text.match(/[^.!?]+[.!?]+(?:\s+|$)/g) || [text];
    
    let result = '';
    let wordCount = 0;
    let sentenceCount = 0;
    
    for (const sentence of sentences) {
        const trimmedSentence = sentence.trim();
        if (!trimmedSentence) continue;
        
        const sentenceWords = trimmedSentence.split(/\s+/).length;
        
        // Always include at least 2 complete sentences for coherent responses
        if (sentenceCount < 2) {
            result += (result ? ' ' : '') + trimmedSentence;
            wordCount += sentenceWords;
            sentenceCount++;
            continue;
        }
        
        // After 2 sentences, only add more if under word limit
        if (wordCount + sentenceWords <= maxWords) {
            result += ' ' + trimmedSentence;
            wordCount += sentenceWords;
            sentenceCount++;
        } else {
            // Stop here - we've reached the limit
            break;
        }
    }
    
    // Ensure we have at least one complete sentence
    if (!result && sentences.length > 0) {
        result = sentences[0].trim();
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

const DOUG_VOICE_PROMPT = `You are Dr. Doug May having a casual conversation. Your response will be read aloud as audio.

Write 2-3 complete sentences in plain English. No structure, no organization, no headers.

CRITICAL: Every sentence must have a subject AND a verb. Never write fragments like:
- "63 cents per kilowatt hour." (WRONG - fragment)
- "17 billion in debt." (WRONG - fragment)
- "The price is 63 cents per kilowatt hour." (RIGHT - complete)

Just answer the question naturally like you're talking to a friend.

WRONG: "He argues the MOU undervalues electricity. 63 cents per kilowatt hour. He says we're leaving value..."
RIGHT: "He argues the MOU undervalues electricity at only 63 cents per kilowatt hour when it should be worth much more, and says we're leaving massive value on the table."

Write in complete sentences only. No fragments.`;

const TEXT_MODE_FAST_PROMPT = `You are an expert AI assistant specializing in the Churchill Falls power project.

Provide CONCISE, factual answers (2-3 paragraphs maximum, 150-250 words).

CRITICAL INSTRUCTIONS:
- Write in direct, factual third person voice
- Start with the direct answer immediately
- NEVER use: "Based on...", "According to...", "The analysis shows..."
- Just state the facts directly
- Include key dates, figures, and names
- Keep it brief but informative
- ALWAYS refer to Doug May as "Dr. Doug May" or "Dr. May"
- ALWAYS refer to Wade Locke as "Dr. Wade Locke" or "Dr. Locke"

Example of what NOT to do:
"Based on the comprehensive analysis of available documents, the Churchill Falls agreement is controversial..."

Example of what TO do:
"The Churchill Falls agreement is controversial for several interconnected reasons..."

Focus on the most essential information. If the user wants more detail, they can use Deep mode.`;

const TEXT_MODE_DEEP_PROMPT = `You are an expert AI assistant specializing in the Churchill Falls power project.

Provide comprehensive, well-researched answers using all available documents.

RESEARCH STRATEGY:
1. Use search_documents with max_results=10-15 to find ALL relevant documents
2. For key documents found, use get_document to retrieve full content
3. Synthesize information from MULTIPLE sources (aim for 5+ sources for complex questions)
4. Present diverse perspectives (Doug May's analysis, Wade Locke's critique, official documents, etc.)

CRITICAL INSTRUCTIONS:
- Write in direct, factual third person voice
- Start responses with the direct answer (e.g., "The Churchill Falls agreement is controversial because...")
- NEVER use: "Based on...", "According to...", "The analysis shows...", "Research indicates..."
- Just state the facts directly
- Include specific details, dates, and figures
- Present multiple perspectives (Doug May, Wade Locke, other economists)
- Structure responses with clear sections
- Provide thorough analysis with supporting evidence
- ALWAYS refer to Doug May as "Dr. Doug May" or "Dr. May"
- ALWAYS refer to Wade Locke as "Dr. Wade Locke" or "Dr. Locke"

WHEN ANSWERING ABOUT DOUG MAY'S ANALYSIS:
- Search for: "Doug video" or "Doug May analysis"
- Retrieve ALL Doug video transcripts (video1, 2A, 2B, 3A, 3B, 4)
- Synthesize his complete perspective across all videos
- Include his economic frameworks, cost comparisons, and strategic analysis

Example of what NOT to do:
"Based on the comprehensive analysis of available documents, the Churchill Falls agreement is controversial..."

Example of what TO do:
"The Churchill Falls agreement is controversial for several interconnected reasons..."

Provide objective research presented as established facts, not as someone's analysis.`;


// ============================================================================
// MAIN CHAT ENDPOINT
// ============================================================================

app.post('/api/chat', async (req, res) => {
    const startTime = Date.now();
    
    try {
        const { 
            message, 
            conversationHistory = [], 
            isVoiceMode = false,
            textMode = 'deep' // 'fast' or 'deep' for text responses
        } = req.body;
        
        if (!message?.trim()) {
            return res.status(400).json({ error: 'Message is required' });
        }
        
        // Determine mode label for logging
        let modeLabel = '📝 TEXT';
        if (isVoiceMode) {
            modeLabel = '🎤 VOICE (Doug)';
        } else {
            modeLabel = textMode === 'fast' ? '⚡ FAST TEXT' : '🔍 DEEP TEXT';
        }
        
        console.log(`\n${'='.repeat(60)}`);
        console.log(`${modeLabel}: "${message.substring(0, 50)}..."`);
        console.log(`${'='.repeat(60)}`);
        
        // ============================================================================
        // CHECK CACHE FIRST (Optimization 2)
        // ============================================================================
        
        const cacheMode = isVoiceMode ? 'voice' : `text-${textMode}`;
        const cachedResponse = getCachedResponse(message, cacheMode);
        
        if (cachedResponse) {
            const responseTime = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`✅ Returned cached response: ${cachedResponse.text?.length || 0} chars`);
            console.log(`⏱️ Cache response time: ${responseTime}s (INSTANT!)`);
            console.log(`${'='.repeat(60)}`);
            
            // Return cached response with updated timestamp
            return res.json({
                ...cachedResponse,
                cached: true,
                responseTime: parseFloat(responseTime)
            });
        }
        
        console.log(`🔍 No cache - generating new response...`);
        
        // ============================================================================
        // GENERATE NEW RESPONSE
        // ============================================================================
        
        const messages = [
            ...conversationHistory,
            { role: 'user', content: message }
        ];
        
        let responseText = '';
        let audioData = null;
        let documentsAccessed = new Set(); // Track which documents were used (for text mode)
        
        // ====================================================================
        // VOICE MODE - Doug May's Analysis
        // ====================================================================
        
        if (isVoiceMode) {
            console.log('📚 Using Doug\'s analysis (17 documents)...');
            
            // Build context from Doug's documents
            let documentContext = '# Dr. Doug May\'s Analysis and Source Materials\n\n';
            
            for (const [filename, content] of dougDocuments.entries()) {
                documentContext += `## ${filename}\n${content}\n\n---\n\n`;
            }
            
            const systemPrompt = DOUG_VOICE_PROMPT + '\n\n' + documentContext;
            
            const response = await anthropic.messages.create({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 800, // Increased from 500 to allow longer responses
                system: systemPrompt,
                messages: messages
            });
            
            responseText = response.content
                .filter(block => block.type === 'text')
                .map(block => block.text)
                .join('\n');
            
            console.log(`📊 Raw response: ${responseText.length} chars`);
            
            // Post-process for natural voice
            responseText = expandAcronyms(responseText);  // Expand acronyms FIRST
            responseText = stripMarkdownAndFormat(responseText);
            responseText = truncateAtSentence(responseText, 150); // Increased from 100 to 150 words
            
            const wordCount = responseText.split(/\s+/).length;
            console.log(`✅ Clean response: ${responseText.length} chars, ${wordCount} words`);
            
            // Generate voice
            audioData = await generateVoice(responseText);
            
            if (audioData) {
                console.log(`🎙️ Voice generated: ${monthlyVoiceUsage.toLocaleString()}/${MONTHLY_VOICE_LIMIT.toLocaleString()} chars used`);
            }
        }
        
        // ====================================================================
        // TEXT MODE - Fast or Deep Research
        // ====================================================================
        
        else {
            if (!mcpClient) {
                return res.status(503).json({
                    error: 'Research mode unavailable. Please try voice mode.',
                    text: 'The research system is currently unavailable. Please use the conversational voice mode, or try again later.',
                    audio: null,
                    voiceAvailable: false
                });
            }

            const isFastMode = textMode === 'fast';
            console.log(`📚 Using MCP for ${isFastMode ? 'quick' : 'comprehensive'} research...`);

            const tools = await mcpClient.listTools();
            const toolsList = tools.tools.map(tool => ({
                name: tool.name,
                description: tool.description,
                input_schema: tool.inputSchema
            }));

            // Choose prompt and token limit based on mode
            const systemPrompt = isFastMode ? TEXT_MODE_FAST_PROMPT : TEXT_MODE_DEEP_PROMPT;
            const maxTokens = isFastMode ? 1024 : 4096; // Fast: ~250 words, Deep: ~1000 words

            let response = await anthropic.messages.create({
                model: 'claude-sonnet-4-20250514',
                max_tokens: maxTokens,
                system: systemPrompt,
                messages: messages,
                tools: toolsList
            });

            let currentMessages = [...messages];
            let toolCallCount = 0;
            const MAX_TOOL_CALLS = 10;
            // documentsAccessed is declared at top level

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
                        
                        // Enhanced logging - show the actual input structure
                        if (block.input) {
                            console.log(`  → Input keys:`, Object.keys(block.input));
                            console.log(`  → Full input:`, JSON.stringify(block.input, null, 2));
                        }
                        
                        // Track document access - try ALL possible field names
                        if (block.name === 'get_document' && block.input) {
                            // Try every possible field that might contain the document name
                            const possibleDocName = 
                                block.input.name || 
                                block.input.document || 
                                block.input.document_name ||
                                block.input.filename || 
                                block.input.file ||
                                block.input.path ||
                                block.input.uri ||
                                block.input.id;
                            
                            if (possibleDocName) {
                                documentsAccessed.add(possibleDocName);
                                console.log(`  ✓ Tracked document: ${possibleDocName}`);
                            } else {
                                console.log(`  ⚠ get_document called but no document name found in:`, block.input);
                            }
                        }
                        
                        try {
                            const result = await mcpClient.callTool({
                                name: block.name,
                                arguments: block.input
                            });

                            // ENHANCED SOURCE TRACKING
                            if (result && result.content && result.content[0]) {
                                const resultText = result.content[0].text || '';
                                
                                // For search_documents: Parse JSON and extract ALL filenames
                                if (block.name === 'search_documents') {
                                    try {
                                        const searchResults = JSON.parse(resultText);
                                        if (Array.isArray(searchResults)) {
                                            console.log(`  📚 Search returned ${searchResults.length} documents:`);
                                            searchResults.forEach(result => {
                                                if (result.filename) {
                                                    documentsAccessed.add(result.filename);
                                                    console.log(`     ✓ ${result.filename} (score: ${result.score})`);
                                                }
                                            });
                                        }
                                    } catch (e) {
                                        console.log(`  ⚠ Could not parse search results as JSON`);
                                    }
                                }
                                
                                // For get_document: Track the specific document requested
                                if (block.name === 'get_document' && block.input && block.input.filename) {
                                    documentsAccessed.add(block.input.filename);
                                    console.log(`  ✓ Retrieved: ${block.input.filename}`);
                                }
                                
                                console.log(`  → Total sources tracked: ${documentsAccessed.size}`);
                            }

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
                    max_tokens: maxTokens,
                    system: systemPrompt,
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
        
        const responseData = {
            text: responseText,
            audio: audioData,
            voiceAvailable: !!(ELEVENLABS_API_KEY && ELEVENLABS_VOICE_ID),
            responseTime: parseFloat(responseTime),
            mode: isVoiceMode ? 'voice' : textMode, // 'voice', 'fast', or 'deep'
            cached: false
        };
        
        // Add sources for text mode (if documents were accessed via MCP)
        if (!isVoiceMode && typeof documentsAccessed !== 'undefined' && documentsAccessed.size > 0) {
            responseData.sources = Array.from(documentsAccessed);
            console.log(`📚 Sources used: ${documentsAccessed.size} documents`);
        }
        
        // ============================================================================
        // CACHE THE RESPONSE (Optimization 2)
        // ============================================================================
        
        cacheResponse(message, cacheMode, responseData);
        
        res.json(responseData);

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
        cache: {
            entries: responseCache.size,
            maxAge: `${CACHE_DURATION / 60000} minutes`
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